import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth/index';

// GET /api/icebergs/:id/social
// Returns: { score, userVote, inWatchlist }
export async function GET(event: APIContext) {
  try {
    const { id } = event.params;
    if (!id) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Find iceberg (by id or slug)
    const iceberg = await prisma.iceberg.findFirst({
      where: { OR: [{ id }, { slug: id }], status: 'PUBLISHED' },
      select: { id: true },
    });

    if (!iceberg) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Aggregate vote score
    const agg = await prisma.vote.aggregate({
      where: { icebergId: iceberg.id },
      _sum: { value: true },
    });
    const score = agg._sum.value ?? 0;

    // Session-dependent data
    const session = await getSession(event);
    let userVote = 0;
    let inWatchlist = false;

    if (session) {
      const [vote, wl] = await Promise.all([
        prisma.vote.findUnique({
          where: { userId_icebergId: { userId: session.userId, icebergId: iceberg.id } },
          select: { value: true },
        }),
        prisma.watchlist.findUnique({
          where: { userId_icebergId: { userId: session.userId, icebergId: iceberg.id } },
          select: { id: true },
        }),
      ]);
      userVote = vote?.value ?? 0;
      inWatchlist = !!wl;
    }

    return new Response(JSON.stringify(success({ score, userVote, inWatchlist })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('social GET failed:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '获取失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

