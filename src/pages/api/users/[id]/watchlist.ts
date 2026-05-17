import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth/index';

// GET /api/users/:id/watchlist
// Requires session; only the owner may view their own watchlist
export async function GET(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { id } = event.params;
    if (session.userId !== id) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权访问')), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const entries = await prisma.watchlist.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        iceberg: {
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            status: true,
            viewCount: true,
            createdAt: true,
            author: { select: { id: true, username: true, nickname: true } },
            _count: { select: { tiers: true } },
          },
        },
      },
    });

    const icebergs = entries.map(e => e.iceberg);

    return new Response(JSON.stringify(success(icebergs)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('watchlist GET failed:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '获取失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

