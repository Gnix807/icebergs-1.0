import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth/index';

export async function GET(event: APIContext) {
  const taskId = event.url.searchParams.get('taskId');
  if (!taskId) return json(error(ErrorCodes.BAD_REQUEST, '缂哄皯 taskId'), 400);
  const comments = await prisma.taskComment.findMany({
    where: { taskId }, orderBy: { createdAt: 'asc' },
    select: { id: true, content: true, createdAt: true, user: { select: { id: true, nickname: true, username: true, avatar: true } } },
  });
  return json(success({ comments }), 200);
}

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '璇峰厛鐧诲綍'), 401);
  let body: any;
  try { body = await event.request.json(); } catch { return json(error(ErrorCodes.BAD_REQUEST, '璇锋眰鏍煎紡閿欒'), 400); }
  const taskId = body.taskId;
  const content = (body.content || '').trim();
  if (!taskId || !content || content.length > 2000) return json(error(ErrorCodes.BAD_REQUEST, '鍙傛暟閿欒'), 400);
  const comment = await prisma.taskComment.create({
    data: { taskId, userId: session.userId, content },
    select: { id: true, content: true, createdAt: true, user: { select: { id: true, nickname: true, username: true, avatar: true } } },
  });
  return json(success({ comment }), 201);
}

function json(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
