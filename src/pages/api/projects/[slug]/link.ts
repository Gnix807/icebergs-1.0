import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth/index';

async function isProjectMember(userId: string, projectId: string): Promise<boolean> {
  try {
    const m = await prisma.projectMember.findFirst({ where: { projectId, userId } });
    return !!m;
  } catch { return false; }
}

export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

  const isAdmin = session.isFounder || session.role === 'ADMIN';

  const project = await prisma.project.findUnique({ where: { slug: event.params.slug }, select: { id: true } });
  if (!project) return json(error(ErrorCodes.NOT_FOUND, '专题不存在'), 404);

  const inProject = await isProjectMember(session.userId, project.id);
  if (!inProject && !isAdmin) return json(error(ErrorCodes.FORBIDDEN, '你不是该项目成员'), 403);

  let body: { type?: string; id?: string };
  try { body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json(); } catch { return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400); }
  if (!body.type || !body.id) return json(error(ErrorCodes.BAD_REQUEST, '缺少参数'), 400);

  if (body.type === 'iceberg') {
    const existing = await prisma.iceberg.findUnique({ where: { id: body.id }, select: { projectId: true, authorId: true } });
    if (!existing) return json(error(ErrorCodes.NOT_FOUND, '冰山图不存在'), 404);
    if (existing.authorId !== session.userId && !isAdmin) {
      return json(error(ErrorCodes.FORBIDDEN, '只有作者才能将此冰山图关联到项目'), 403);
    }
    const newProjectId = existing.projectId === project.id ? null : project.id;
    await prisma.iceberg.update({ where: { id: body.id }, data: { projectId: newProjectId } });
    return json(success({ linked: !!newProjectId }), 200);
  }
  if (body.type === 'idea') {
    const existing = await prisma.idea.findUnique({ where: { id: body.id }, select: { projectId: true } });
    if (!existing) return json(error(ErrorCodes.NOT_FOUND, '创意不存在'), 404);
    const newProjectId = existing.projectId === project.id ? null : project.id;
    await prisma.idea.update({ where: { id: body.id }, data: { projectId: newProjectId } });
    return json(success({ linked: !!newProjectId }), 200);
  }
  return json(error(ErrorCodes.BAD_REQUEST, '未知类型'), 400);
}

function json(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
