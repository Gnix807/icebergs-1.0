import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth/index';

export async function GET(event: APIContext) {
  const dataParam = event.url.searchParams.get('data');
  if (dataParam) {

    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    const project = await prisma.project.findUnique({ where: { slug: event.params.slug }, select: { id: true } });
    if (!project) return json(error(ErrorCodes.NOT_FOUND, '专题不存在'), 404);

    const body = JSON.parse(dataParam || '{}');

    const title = (body.title ?? '').trim();
    if (!title || title.length > 200) return json(error(ErrorCodes.BAD_REQUEST, '标题 1-200 字'), 400);
    const task = await prisma.projectTask.create({
      data: { projectId: project.id, title, description: body.description?.trim() || null, assigneeId: body.assigneeId || null, creatorId: session.userId, priority: body.priority || null, dueDate: body.dueDate ? new Date(body.dueDate) : null },
      select: { id: true, title: true, status: true },
    });
    return json(success({ task }), 201);

  }

  const project = await prisma.project.findUnique({ where: { slug: event.params.slug }, select: { id: true } });
  if (!project) return json(error(ErrorCodes.NOT_FOUND, '专题不存在'), 404);
  const tasks = await prisma.projectTask.findMany({
    where: { projectId: project.id },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, title: true, description: true, status: true, createdAt: true, creator: { select: { id: true, nickname: true, username: true } }, assignee: { select: { id: true, nickname: true, username: true } } },
  });
  return json(success({ tasks }), 200);
}

function json(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
