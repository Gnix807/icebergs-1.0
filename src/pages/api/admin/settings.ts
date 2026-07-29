/**
 * GET  /api/admin/settings          — ADMIN: fetch all SystemSettings
 * PUT  /api/admin/settings          — ADMIN: bulk upsert { key: value }
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { hasCapability } from '../../../lib/capabilities';
import { clearFeatureCache } from '../../../lib/features';

export async function GET(event: APIContext) {
  const dataParam = event.url.searchParams.get('data');
  if (dataParam) {

    try {
      const session = await getSession(event);
      if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
      if (!hasCapability(session, 'SITE_ADMINISTRATION')) {
        return json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要站点管理能力'), 403);
      }

      const body = JSON.parse(dataParam || '{}') as Record<string, any>;
      if (!body || typeof body !== 'object') {
        return json(error(ErrorCodes.BAD_REQUEST, '请求体格式错误'), 400);
      }

      // 功能开关批量更新：{ features: { key: boolean, ... } }
      const updates: Record<string, string> = {};
      if (body.features && typeof body.features === 'object') {
        Object.entries(body.features).forEach(([k, v]) => {
          updates[k] = String(v);
        });
      } else {
        // 通用 key-value 更新
        Object.entries(body).forEach(([k, v]) => {
          if (k !== 'features') updates[k] = String(v);
        });
      }

      await Promise.all(
        Object.entries(updates).map(([key, value]) =>
          prisma.systemSettings.upsert({
            where: { key },
            update: { value: String(value), updatedBy: session.userId },
            create: { key, value: String(value), updatedBy: session.userId },
          }),
        ),
      );

      if (body.features) clearFeatureCache();

      return json(success({ updated: Object.keys(updates).length }), 200);
    } catch (err) {
      console.error('更新配置失败:', err);
      return json(error(ErrorCodes.INTERNAL_ERROR, '更新失败'), 500);
    }

  }

  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!hasCapability(session, 'SITE_ADMINISTRATION')) {
      return json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要站点管理能力'), 403);
    }

    const settings = await prisma.systemSettings.findMany({ orderBy: { key: 'asc' } });
    return json(success(settings), 200);
  } catch (err) {
    console.error('获取配置失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '获取失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
