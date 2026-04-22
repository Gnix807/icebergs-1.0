/**
 * POST /api/icebergs/[id]/submit
 *
 * Submit an iceberg for editorial review.
 * Runs the 6-point pre-submission checklist; blocks if any non-NSFW check fails.
 * On success creates (or reuses) an IcebergReview record and sets status → PENDING_REVIEW.
 */
import type { APIEvent } from '@astrojs/node';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { can } from '../../../../lib/permissions';
import { runChecklist } from '../../../../lib/checklist';

export async function POST(event: APIEvent) {
  try {
    const session = await getSession(event);
    if (!session) {
      return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    }
    if (!can(session, 'content:submit')) {
      return json(error(ErrorCodes.FORBIDDEN, '账户受限，无法提交'), 403);
    }

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少 ID'), 400);

    // Parse body — nsfwConfirmed is optional
    let nsfwConfirmed = false;
    try {
      const body = await event.request.json();
      nsfwConfirmed = Boolean(body?.nsfwConfirmed);
    } catch { /* body is optional */ }

    // Load iceberg with full tier/item data for checklist
    const iceberg = await prisma.iceberg.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        tiers: {
          orderBy: { order: 'asc' },
          include: { items: { orderBy: { order: 'asc' } } },
        },
        review: true,
      },
    });

    if (!iceberg) return json(error(ErrorCodes.NOT_FOUND, '冰山图不存在'), 404);

    // Only the author can submit
    if (iceberg.authorId !== session.userId) {
      return json(error(ErrorCodes.FORBIDDEN, '无权操作'), 403);
    }

    // Only DRAFT or REJECTED icebergs can be re-submitted
    if (iceberg.status !== 'DRAFT' && iceberg.status !== 'REJECTED') {
      return json(
        error(ErrorCodes.BAD_REQUEST, `当前状态「${iceberg.status}」不可提交`),
        400,
      );
    }

    // Run checklist
    const checklist = runChecklist(iceberg, nsfwConfirmed);
    if (!checklist.passed) {
      return json(
        error(ErrorCodes.VALIDATION_ERROR, '自查清单未全部通过', checklist.items),
        422,
      );
    }

    const isNsfw = iceberg.tiers
      .flatMap(t => t.items)
      .some(i => {
        try { return (JSON.parse(i.labels) as string[]).some(l => l.toLowerCase() === 'nsfw'); }
        catch { return false; }
      });

    // Upsert IcebergReview record
    await prisma.$transaction([
      prisma.icebergReview.upsert({
        where: { icebergId: iceberg.id },
        create: {
          icebergId: iceberg.id,
          status: 'PENDING',
        },
        update: {
          status: 'PENDING',
          reviewerId: null,
          note: null,
          overriddenBy: null,
          overrideReason: null,
          reviewedAt: null,
        },
      }),
      prisma.iceberg.update({
        where: { id: iceberg.id },
        data: { status: 'PENDING_REVIEW' },
      }),
    ]);

    return json(success({
      submitted: true,
      isNsfw,
      message: isNsfw
        ? '已提交，含 NSFW 内容将进入专项审核队列'
        : '已提交，等待编辑审核',
      checklist: checklist.items,
    }), 200);

  } catch (err) {
    console.error('提交审核失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '提交失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
