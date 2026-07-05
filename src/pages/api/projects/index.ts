import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';
import { getSession } from '../../../lib/auth/index';

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

  try {
    let body: { name?: string; description?: string; topic?: string };
    try { body = await event.request.json(); } catch { return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400); }
    const name = (body.name ?? '').trim();
    const topic = (body.topic ?? 'general').trim();
    if (!name || name.length < 2) return json(error(ErrorCodes.BAD_REQUEST, '名称至少 2 个字'), 400);

    const slug = name.replace(/[<>:"/\\|?*\s]+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '').slice(0, 50).toLowerCase() || Date.now().toString(36);

    const existing = await prisma.project.findUnique({ where: { slug } });
    const finalSlug = existing ? slug + '-' + Date.now().toString(36).slice(-4) : slug;

    const project = await prisma.project.create({
      data: { name, slug: finalSlug, description: body.description?.trim() || null, topic, creatorId: session.userId },
      select: { id: true, slug: true, name: true },
    });

    // Auto-join as member
    await prisma.projectMember.create({ data: { projectId: project.id, userId: session.userId, role: 'MODERATOR' } });

    return json(success({ project }), 201);
  } catch (err) { console.error('创建专题失败:', err); return json(error(ErrorCodes.INTERNAL_ERROR, '创建失败'), 500); }
}

export async function DELETE(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  try {
    let body: { slug?: string };
    try { body = await event.request.json(); } catch { return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400); }
    const project = await prisma.project.findUnique({ where: { slug: body.slug }, select: { id: true, creatorId: true } });
    if (!project) return json(error(ErrorCodes.NOT_FOUND, '专题不存在'), 404);
    if (project.creatorId !== session.userId && !session.isFounder && session.role !== 'ADMIN') return json(error(ErrorCodes.FORBIDDEN, '无权限'), 403);
    await prisma.project.delete({ where: { id: project.id } });
    return json(success({ deleted: true }), 200);
  } catch (err) { return json(error(ErrorCodes.INTERNAL_ERROR, '删除失败'), 500); }
}

export async function PATCH(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  try {
    let body: { slug?: string; name?: string; description?: string };
    try { body = await event.request.json(); } catch { return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400); }
    const project = await prisma.project.findUnique({ where: { slug: body.slug }, select: { id: true, creatorId: true } });
    if (!project) return json(error(ErrorCodes.NOT_FOUND, '专题不存在'), 404);
    const mod = await prisma.projectMember.findFirst({ where: { projectId: project.id, userId: session.userId, role: 'MODERATOR' } });
    if (!mod && project.creatorId !== session.userId && !session.isFounder && session.role !== 'ADMIN') return json(error(ErrorCodes.FORBIDDEN, '无权限'), 403);
    const data: any = {};
    if (body.name?.trim()) data.name = body.name.trim();
    if (body.description !== undefined) data.description = body.description.trim() || null;
    const updated = await prisma.project.update({ where: { id: project.id }, data, select: { id: true, name: true, description: true } });
    return json(success({ project: updated }), 200);
  } catch (err) { return json(error(ErrorCodes.INTERNAL_ERROR, '更新失败'), 500); }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
