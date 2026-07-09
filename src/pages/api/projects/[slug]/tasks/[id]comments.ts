import type { APIContext } from 'astro';
import { prisma } from '../../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../../lib/api';
import { getSession } from '../../../../../lib/auth/index';

export async function GET(event: APIContext) {
  const dataParam = event.url.searchParams.get('data');
  if (dataParam) {

    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    let body: { content?: string };
    try { body = JSON.parse(dataParam || '{}') } catch { return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400); }
    const content = (body.content ?? '').trim();
    if (!content || content.length > 2000) return json(error(ErrorCodes.BAD_REQUEST, '内容 1-2000 字'), 400);
    const comment = await prisma.taskComment.create({
      data: { taskId: event.params.id!, userId: session.userId, content },
      select: { id: true, content: true, createdAt: true, user: { select: { id: true, nickname: true, username: true, avatar: true } } },
    });
    return json(success({ comment }), 201);

  }

  const task = await prisma.projectTask.findUnique({ where: { id: event.params.id }, select: { id: true } });
  if (!task) return json(error(ErrorCodes.NOT_FOUND, '任务不存在'), 404);
  const comments = await prisma.taskComment.findMany({
    where: { taskId: task.id }, orderBy: { createdAt: 'asc' },
    select: { id: true, content: true, createdAt: true, user: { select: { id: true, nickname: true, username: true, avatar: true } } },
  });
  return json(success({ comments }), 200);
}

function json(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
