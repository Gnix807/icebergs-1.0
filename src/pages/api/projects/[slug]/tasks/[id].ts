import type { APIContext } from 'astro';
import { prisma } from '../../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../../lib/api';
import { getSession } from '../../../../../lib/auth/index';
import {
  CONTRIBUTION_EVENT_TYPES,
  recordContributionEvent,
} from '../../../../../lib/contributions';
import { checkAchievements } from '../../../../../lib/achievementService';

export async function GET(event: APIContext) {
  const dataParam = event.url.searchParams.get('data');
  if (dataParam) {

    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    try {
      let body: { content?: string };
      try { body = JSON.parse(dataParam || '{}') } catch { return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400); }
      const content = (body.content ?? '').trim();
      if (!content || content.length > 2000) return json(error(ErrorCodes.BAD_REQUEST, '1-2000 字'), 400);
      const comment = await prisma.taskComment.create({
        data: { taskId: event.params.id!, userId: session.userId, content },
        select: { id: true, content: true, createdAt: true, user: { select: { id: true, nickname: true, username: true, avatar: true } } },
      });
      return json(success({ comment }), 201);
    } catch (err) { return json(error(ErrorCodes.INTERNAL_ERROR, '发送失败'), 500); }

  }

  const { id } = event.params;
  if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少 ID'), 400);
  try {
    const [task, comments] = await Promise.all([
      prisma.projectTask.findUnique({
        where: { id },
        select: { id: true, title: true, description: true, status: true, priority: true, dueDate: true, createdAt: true, updatedAt: true, assignee: { select: { id: true, nickname: true, username: true } }, creator: { select: { id: true, nickname: true, username: true } } },
      }),
      prisma.taskComment.findMany({
        where: { taskId: id }, orderBy: { createdAt: 'asc' },
        select: { id: true, content: true, createdAt: true, user: { select: { id: true, nickname: true, username: true, avatar: true } } },
      }),
    ]);
    if (!task) return json(error(ErrorCodes.NOT_FOUND, '任务不存在'), 404);
    return json(success({ task, comments }), 200);
  } catch (err) { return json(error(ErrorCodes.INTERNAL_ERROR, '加载失败'), 500); }
}

export async function PATCH(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  const { id, slug } = event.params;
  if (!id || !slug) return json(error(ErrorCodes.BAD_REQUEST, '缺少任务信息'), 400);
  const body = await event.request.json().catch(() => null) as { status?: string } | null;
  const status = String(body?.status || '');
  if (!['OPEN', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
    return json(error(ErrorCodes.VALIDATION_ERROR, '任务状态无效'), 400);
  }
  const task = await prisma.projectTask.findFirst({
    where: { id, project: { slug } },
    select: {
      id: true,
      status: true,
      assigneeId: true,
      projectId: true,
      project: {
        select: {
          creatorId: true,
          members: {
            where: { userId: session.userId },
            select: { role: true },
          },
        },
      },
    },
  });
  if (!task) return json(error(ErrorCodes.NOT_FOUND, '任务不存在'), 404);
  const isProjectMaintainer = task.project.creatorId === session.userId
    || task.project.members.some((member) => member.role === 'MODERATOR');
  if (!isProjectMaintainer && task.assigneeId !== session.userId) {
    return json(error(ErrorCodes.FORBIDDEN, '只有任务负责人或项目维护者可以更新状态'), 403);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.projectTask.update({
      where: { id: task.id },
      data: { status },
      select: { id: true, title: true, status: true, assigneeId: true, updatedAt: true },
    });
    if (status === 'COMPLETED' && task.status !== 'COMPLETED' && row.assigneeId) {
      await recordContributionEvent({
        idempotencyKey: `project-task-completed:${row.id}`,
        userId: row.assigneeId,
        type: CONTRIBUTION_EVENT_TYPES.PROJECT_TASK_COMPLETED,
        dimension: 'SERVICE',
        resourceType: 'project-task',
        resourceId: row.id,
        projectId: task.projectId,
        occurredAt: row.updatedAt,
      }, tx);
    }
    return row;
  });
  if (status === 'COMPLETED' && task.status !== 'COMPLETED' && updated.assigneeId) {
    checkAchievements(updated.assigneeId, { type: 'service' }).catch(() => {});
  }
  return json(success({ task: updated }), 200);
}

function json(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
