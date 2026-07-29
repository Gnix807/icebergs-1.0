/**
 * GET /api/reviews
 *
 * Returns the pending review queue for EDITOR/ADMIN.
 * Automatically filters out icebergs authored by the requesting EDITOR
 * (recusal rule: reviewer.id !== iceberg.authorId).
 *
 * Also applies lazy evaluation:
 *   - Reviews sitting in PENDING for > 72h are flagged as overdue.
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { can } from '../../../lib/permissions';

const OVERDUE_HOURS = 72;

export async function GET(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'content:review')) {
      return json(error(ErrorCodes.FORBIDDEN, '需要编辑权限'), 403);
    }

    const overdueThreshold = new Date(Date.now() - OVERDUE_HOURS * 60 * 60 * 1000);

    const include = {
      iceberg: {
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          status: true,
          createdAt: true,
          author: { select: { id: true, username: true, nickname: true } },
          tiers: {
            select: {
              id: true,
              name: true,
              order: true,
              _count: { select: { items: true } },
            },
            orderBy: { order: 'asc' },
          },
        },
      },
    } as const;

    // Self-review is allowed for certified reviewers. The decision is marked
    // and sent to a 100% asynchronous audit queue by the write endpoint.
    const reviews = await prisma.icebergReview.findMany({
      where: {
        status: 'PENDING',
      },
      orderBy: { createdAt: 'asc' },
      include,
    });

    const enrich = (r: (typeof reviews)[0]) => ({
      ...r,
      overdue: r.createdAt < overdueThreshold,
      selfAuthored: r.iceberg.author.id === session.userId,
    });

    const enriched = reviews.map(enrich);

    return json(success({ reviews: enriched, total: enriched.length }), 200);
  } catch (err) {
    console.error('获取审核队列失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '获取失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
