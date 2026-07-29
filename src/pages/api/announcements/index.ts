/**
 * GET  /api/announcements        — 公开列表（pinned 优先 + 时间倒序）
 * POST /api/announcements        — ADMIN：新建公告
 */
import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { success, error, ErrorCodes } from '../../../lib/api';
import { hasCapability } from '../../../lib/capabilities';

const db = prisma;

export async function GET(event: APIContext) {
  // 创建公告（GET 兼容 WAF）
  const dataParam = event.url.searchParams.get('data');
  if (dataParam) {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!hasCapability(session, 'SITE_ADMINISTRATION')) {
      return json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要站点管理能力'), 403);
    }

    const body = JSON.parse(dataParam);
    const title: string = typeof body.title === 'string' ? body.title.trim() : '';
    const content: string = typeof body.content === 'string' ? body.content.trim() : '';
    const type: string = ['info', 'warning', 'maintenance', 'update'].includes(body.type) ? body.type : 'info';
    const pinned: boolean = body.pinned === true;
    const banner: boolean = body.banner === true;

    if (!title) return json(error(ErrorCodes.VALIDATION_ERROR, '标题不能为空'), 400);
    if (title.length > 100) return json(error(ErrorCodes.VALIDATION_ERROR, '标题不超过 100 字'), 400);
    if (!content) return json(error(ErrorCodes.VALIDATION_ERROR, '内容不能为空'), 400);
    if (content.length > 10000) return json(error(ErrorCodes.VALIDATION_ERROR, '内容不超过 10000 字'), 400);

    const announcement = await db.$transaction(async (tx) => {
      if (banner) await tx.announcement.updateMany({ where: { banner: true }, data: { banner: false } });
      return tx.announcement.create({
        data: { title, content, type, pinned, banner, authorId: session.userId },
        select: {
          id: true, title: true, content: true, type: true,
          pinned: true, banner: true, createdAt: true, updatedAt: true,
          author: { select: { id: true, username: true, nickname: true } },
        },
      });
    });
    return new Response(JSON.stringify(success({ announcement })), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 公开列表
  const announcements = await db.announcement.findMany({
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true, title: true, content: true, type: true,
      pinned: true, banner: true, createdAt: true, updatedAt: true,
      author: { select: { id: true, username: true, nickname: true } },
    },
  });
  return new Response(JSON.stringify(success({ announcements })), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
