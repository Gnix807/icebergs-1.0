import type { APIContext } from 'astro';
import { prisma } from '../../../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../../../lib/api';
import { getSession } from '../../../../../../lib/auth/index';

export async function GET(event: APIContext) {
  const { id } = event.params;
  if (!id) return json(error(ErrorCodes.BAD_REQUEST, 'missing id'), 400);
  const task = await prisma.projectTask.findUnique({
    where: { id },
    select: { id: true, title: true, description: true, status: true, priority: true, dueDate: true, createdAt: true, updatedAt: true, assignee: { select: { id: true, nickname: true, username: true } }, creator: { select: { id: true, nickname: true, username: true } } } });
  if (!task) return json(error(ErrorCodes.NOT_FOUND, 'not found'), 404);
  const comments = await prisma.taskComment.findMany({
    where: { taskId: id }, orderBy: { createdAt: 'asc' },
    select: { id: true, content: true, createdAt: true, user: { select: { id: true, nickname: true, username: true, avatar: true } } } });
  return json(success({ task, comments }), 200);
}

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, 'login'), 401);
  let body: any;
  try { body = await event.request.json(); } catch { return json(error(ErrorCodes.BAD_REQUEST, 'bad'), 400); }
  const content = (body.content || '').trim();
  if (!content || content.length > 2000) return json(error(ErrorCodes.BAD_REQUEST, '1-2000'), 400);
  const comment = await prisma.taskComment.create({
    data: { taskId: event.params.id, userId: session.userId, content },
    select: { id: true, content: true, createdAt: true, user: { select: { id: true, nickname: true, username: true, avatar: true } } } });
  return json(success({ comment }), 201);
}

function json(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
