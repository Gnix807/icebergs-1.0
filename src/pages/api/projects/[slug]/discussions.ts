import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth/index';

export async function GET(event: APIContext) {
  const project = await prisma.project.findUnique({ where: { slug: event.params.slug }, select: { id: true } });
  if (!project) return json(error(ErrorCodes.NOT_FOUND, '专题不存在'), 404);
  const discussions = await prisma.projectDiscussion.findMany({
    where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, take: 50,
    select: { id: true, content: true, createdAt: true, user: { select: { id: true, nickname: true, username: true, avatar: true } } },
  });
  return json(success({ discussions }), 200);
}

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  const project = await prisma.project.findUnique({ where: { slug: event.params.slug }, select: { id: true } });
  if (!project) return json(error(ErrorCodes.NOT_FOUND, '专题不存在'), 404);
  let body: { content?: string };
  try { body = await event.request.json(); } catch { return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400); }
  const content = (body.content ?? '').trim();
  if (!content || content.length > 2000) return json(error(ErrorCodes.BAD_REQUEST, '内容 1-2000 字'), 400);
  const msg = await prisma.projectDiscussion.create({
    data: { projectId: project.id, userId: session.userId, content },
    select: { id: true, content: true, createdAt: true, user: { select: { id: true, nickname: true, username: true, avatar: true } } },
  });
  return json(success({ discussion: msg }), 201);
}

function json(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
