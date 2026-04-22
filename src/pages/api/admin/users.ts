/**
 * GET /api/admin/users?q=&role=&status=&page=&limit=
 * ADMIN only — search / list users with pagination.
 */
import type { APIEvent } from '@astrojs/node';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { can } from '../../../lib/permissions';

export async function GET(event: APIEvent) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'user:restrict')) {
      return json(error(ErrorCodes.FORBIDDEN, '需要管理员权限'), 403);
    }

    const url = new URL(event.request.url);
    const q      = url.searchParams.get('q')?.trim() ?? '';
    const role   = url.searchParams.get('role') ?? '';
    const status = url.searchParams.get('status') ?? '';
    const page   = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const limit  = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
    const skip   = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (q) {
      where.OR = [
        { username: { contains: q } },
        { nickname:  { contains: q } },
        { email:     { contains: q } },
      ];
    }
    if (role)   where.role   = role;
    if (status) where.status = status;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          nickname: true,
          email: true,
          role: true,
          status: true,
          qualityScore: true,
          createdAt: true,
          banUntil: true,
          isFounder: true,
          _count: { select: { icebergs: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return json(success({ users, total, page, limit }), 200);
  } catch (err) {
    console.error('获取用户列表失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '获取失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
