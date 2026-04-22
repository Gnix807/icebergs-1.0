/**
 * GET /api/admin/appeals?status=PENDING
 * ADMIN only — list appeals.
 */
import type { APIEvent } from '@astrojs/node';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { can } from '../../../../lib/permissions';

export async function GET(event: APIEvent) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'appeal:handle')) {
      return json(error(ErrorCodes.FORBIDDEN, '需要管理员权限'), 403);
    }

    const url = new URL(event.request.url);
    const statusFilter = url.searchParams.get('status') ?? 'PENDING';

    const appeals = await prisma.appeal.findMany({
      where: { status: statusFilter },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            status: true,
            role: true,
          },
        },
      },
    });

    return json(success({ appeals, total: appeals.length }), 200);
  } catch (err) {
    console.error('获取申诉列表失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '获取失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
