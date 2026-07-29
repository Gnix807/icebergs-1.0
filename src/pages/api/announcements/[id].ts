/**
 * PATCH  /api/announcements/[id]  — ADMIN：编辑公告
 * DELETE /api/announcements/[id]  — ADMIN：删除公告
 */
import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { success, error, ErrorCodes } from '../../../lib/api';
import { hasCapability } from '../../../lib/capabilities';

const db = prisma;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

async function requireAdmin(event: APIContext) {
  const session = await getSession(event);
  if (!session) return { session: null, resp: json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401) };
  if (!hasCapability(session, 'SITE_ADMINISTRATION')) {
    return {
      session: null,
      resp: json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要站点管理能力'), 403),
    };
  }
  return { session, resp: null };
}

// ALL /api/announcements/[id] — 编辑或删除公告（GET 兼容 WAF）
export async function ALL(event: APIContext) {
  const { resp } = await requireAdmin(event);
  if (resp) return resp;

  const id = event.params.id!;
  const exists = await db.announcement.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return json(error(ErrorCodes.NOT_FOUND, '公告不存在'), 404);

  // 删除
  if (event.url.searchParams.get('action') === 'delete') {
    await db.announcement.delete({ where: { id } });
    return json(success(null), 200);
  }

  // 编辑
  const body = event.request.method === 'GET'
    ? JSON.parse(event.url.searchParams.get('data') || '{}')
    : await event.request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t) return json(error(ErrorCodes.VALIDATION_ERROR, '标题不能为空'), 400);
    if (t.length > 100) return json(error(ErrorCodes.VALIDATION_ERROR, '标题不超过 100 字'), 400);
    data.title = t;
  }
  if (typeof body.content === 'string') {
    const c = body.content.trim();
    if (!c) return json(error(ErrorCodes.VALIDATION_ERROR, '内容不能为空'), 400);
    if (c.length > 10000) return json(error(ErrorCodes.VALIDATION_ERROR, '内容不超过 10000 字'), 400);
    data.content = c;
  }
  if (['info', 'warning', 'maintenance', 'update'].includes(body.type)) {
    data.type = body.type;
  }
  if (typeof body.pinned === 'boolean') {
    data.pinned = body.pinned;
  }
  if (typeof body.banner === 'boolean') {
    data.banner = body.banner;
  }

  const announcement = await db.$transaction(async (tx) => {
    if (data.banner === true) {
      await tx.announcement.updateMany({
        where: { banner: true, id: { not: id } },
        data: { banner: false },
      });
    }

    return tx.announcement.update({
      where: { id },
      data,
      select: {
        id: true, title: true, content: true, type: true,
        pinned: true, banner: true, createdAt: true, updatedAt: true,
        author: { select: { id: true, username: true, nickname: true } },
      },
    });
  });

  return json(success({ announcement }), 200);
}
