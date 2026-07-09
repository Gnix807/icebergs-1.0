import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth/index';

export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  const project = await prisma.project.findUnique({ where: { slug: event.params.slug }, select: { id: true, creatorId: true } });
  if (!project) return json(error(ErrorCodes.NOT_FOUND, '专题不存在'), 404);

  const dataParam = event.url.searchParams.get('data');

  // 管理操作（?data=）
  if (dataParam) {
    const mod = await prisma.projectMember.findFirst({ where: { projectId: project.id, userId: session.userId, role: 'MODERATOR' } });
    if (!mod && project.creatorId !== session.userId && !session.isFounder && session.role !== 'ADMIN') return json(error(ErrorCodes.FORBIDDEN, '无权限'), 403);
    let body: { userId?: string; action?: string };
    try { body = JSON.parse(dataParam); } catch { return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400); }
    if (!body.userId || !body.action) return json(error(ErrorCodes.BAD_REQUEST, '缺少参数'), 400);
    const member = await prisma.projectMember.findFirst({ where: { projectId: project.id, userId: body.userId } });
    if (!member) return json(error(ErrorCodes.NOT_FOUND, '成员不存在'), 404);
    if (body.action === 'kick') { await prisma.projectMember.delete({ where: { id: member.id } }); return json(success({ kicked: true }), 200); }
    if (body.action === 'promote') { await prisma.projectMember.update({ where: { id: member.id }, data: { role: 'MODERATOR' } }); return json(success({ promoted: true }), 200); }
    if (body.action === 'demote') { if (member.userId === project.creatorId) return json(error(ErrorCodes.FORBIDDEN, '不能降级创建者'), 403); await prisma.projectMember.update({ where: { id: member.id }, data: { role: 'MEMBER' } }); return json(success({ demoted: true }), 200); }
    if (body.action === 'transfer') { if (!session.isFounder && session.role !== 'ADMIN' && project.creatorId !== session.userId) return json(error(ErrorCodes.FORBIDDEN, '只有创建者可转移'), 403); await prisma.project.update({ where: { id: project.id }, data: { creatorId: body.userId } }); return json(success({ transferred: true }), 200); }
    return json(error(ErrorCodes.BAD_REQUEST, '未知操作'), 400);
  }

  // 加入/退出（无 data 参数的 GET）
  const existing = await prisma.projectMember.findFirst({ where: { projectId: project.id, userId: session.userId } });
  if (existing) { await prisma.projectMember.delete({ where: { id: existing.id } }); }
  else { await prisma.projectMember.create({ data: { projectId: project.id, userId: session.userId } }); }
  return json(success({ joined: !existing }), 200);
}

function json(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
