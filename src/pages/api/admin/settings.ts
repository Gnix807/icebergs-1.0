/**
 * GET  /api/admin/settings          — ADMIN: fetch all SystemSettings
 * PUT  /api/admin/settings          — ADMIN: bulk upsert { key: value }
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { can } from '../../../lib/permissions';

export async function GET(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'user:ban')) return json(error(ErrorCodes.FORBIDDEN, '需要管理员权限'), 403);

    const settings = await prisma.systemSettings.findMany({ orderBy: { key: 'asc' } });
    return json(success(settings), 200);
  } catch (err) {
    console.error('获取配置失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '获取失败'), 500);
  }
}

export async function PUT(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'user:ban')) return json(error(ErrorCodes.FORBIDDEN, '需要管理员权限'), 403);

    const body = await event.request.json() as Record<string, string>;
    if (!body || typeof body !== 'object') {
      return json(error(ErrorCodes.BAD_REQUEST, '请求体格式错误'), 400);
    }

    await Promise.all(
      Object.entries(body).map(([key, value]) =>
        prisma.systemSettings.upsert({
          where: { key },
          update: { value: String(value), updatedBy: session.userId },
          create: { key, value: String(value), updatedBy: session.userId },
        }),
      ),
    );

    return json(success({ updated: Object.keys(body).length }), 200);
  } catch (err) {
    console.error('更新配置失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '更新失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

