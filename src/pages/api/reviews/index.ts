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

    const canOverride = can(session, 'content:override'); // ADMIN / FOUNDER

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

    // Regular queue: exclude own icebergs (recusal)
    const reviews = await prisma.icebergReview.findMany({
      where: {
        status: 'PENDING',
        iceberg: { authorId: { not: session.userId } },
      },
      orderBy: { createdAt: 'asc' },
      include,
    });

    // Self-authored: only visible to ADMIN/FOUNDER who can override
    const selfReviews = canOverride
      ? await prisma.icebergReview.findMany({
          where: {
            status: 'PENDING',
            iceberg: { authorId: session.userId },
          },
          orderBy: { createdAt: 'asc' },
          include,
        })
      : [];

    const enrich = (r: (typeof reviews)[0], self: boolean) => ({
      ...r,
      overdue: r.createdAt < overdueThreshold,
      selfAuthored: self,
    });

    const enriched = [
      ...reviews.map(r => enrich(r, false)),
      ...selfReviews.map(r => enrich(r, true)),
    ];

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

