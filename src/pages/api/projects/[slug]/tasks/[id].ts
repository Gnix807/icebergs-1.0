import type { APIContext } from 'astro';
import { prisma } from '../../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../../lib/api';
import { getSession } from '../../../../../lib/auth/index';

export async function GET(event: APIContext) {
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

export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  try {
    let body: { content?: string };
    try { body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json(); } catch { return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400); }
    const content = (body.content ?? '').trim();
    if (!content || content.length > 2000) return json(error(ErrorCodes.BAD_REQUEST, '1-2000 字'), 400);
    const comment = await prisma.taskComment.create({
      data: { taskId: event.params.id!, userId: session.userId, content },
      select: { id: true, content: true, createdAt: true, user: { select: { id: true, nickname: true, username: true, avatar: true } } },
    });
    return json(success({ comment }), 201);
  } catch (err) { return json(error(ErrorCodes.INTERNAL_ERROR, '发送失败'), 500); }
}

function json(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
