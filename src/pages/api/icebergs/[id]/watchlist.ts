import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth/index';
import { notify } from '../../../../lib/notify';

// POST /api/icebergs/:id/watchlist — toggle (add if absent, remove if present)
export async function POST(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { id } = event.params;
    if (!id) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const iceberg = await prisma.iceberg.findFirst({
      where: { OR: [{ id }, { slug: id }], status: 'PUBLISHED' },
      select: { id: true, title: true, authorId: true, slug: true },
    });
    if (!iceberg) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const key = { userId: session.userId, icebergId: iceberg.id };
    const existing = await prisma.watchlist.findUnique({ where: { userId_icebergId: key } });

    let inWatchlist: boolean;
    if (existing) {
      await prisma.watchlist.delete({ where: { userId_icebergId: key } });
      inWatchlist = false;
    } else {
      await prisma.watchlist.create({ data: { userId: session.userId, icebergId: iceberg.id } });
      inWatchlist = true;
      // 里程碑通知：1 / 5 / 10 / 50 / 100 / 每 100 的倍数
      if (iceberg.authorId !== session.userId) {
        const count = await prisma.watchlist.count({ where: { icebergId: iceberg.id } });
        const milestones = [1, 5, 10, 50, 100];
        const isMilestone = milestones.includes(count) || (count >= 100 && count % 100 === 0);
        if (isMilestone) {
          notify(
            iceberg.authorId,
            'iceberg_watchlisted',
            `你的冰山图已被 ${count} 人收藏`,
            `《${iceberg.title}》达成收藏里程碑 🎉`,
            `/iceberg/${iceberg.slug ?? iceberg.id}`,
          );
        }
      }
    }

    return new Response(JSON.stringify(success({ inWatchlist })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('watchlist POST failed:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '操作失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

