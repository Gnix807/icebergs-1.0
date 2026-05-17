/**
 * GET /api/users/:id/score-log
 *
 * 返回该用户的质量分流水记录（分页）。
 * 仅本人或 ADMIN/FOUNDER 可查看。
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth/index';

export async function GET(event: APIContext) {
  try {
    const { id } = event.params;
    if (!id) {
      return json(error(ErrorCodes.BAD_REQUEST, '缺少用户 ID'), 400);
    }

    const session = await getSession(event);
    const isOwner = session?.userId === id;
    const isAdmin = session && (session.role === 'ADMIN' || session.isFounder);
    if (!isOwner && !isAdmin) {
      return json(error(ErrorCodes.FORBIDDEN, '无权查看'), 403);
    }

    const url = new URL(event.request.url);
    const page  = Math.max(1, parseInt(url.searchParams.get('page')  || '1'));
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

    const [logs, total] = await Promise.all([
      prisma.scoreLog.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, delta: true, reason: true, note: true, createdAt: true },
      }),
      prisma.scoreLog.count({ where: { userId: id } }),
    ]);

    return json(success({
      items: logs,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }), 200);
  } catch (err) {
    console.error('score-log GET failed:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '查询失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

