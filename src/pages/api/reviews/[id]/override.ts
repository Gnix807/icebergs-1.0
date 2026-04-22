/**
 * PUT /api/reviews/[id]/override
 *
 * ADMIN Override: force-publish an iceberg that is stuck due to recusal
 * (e.g. the only available reviewer is the author themselves).
 *
 * This is a last-resort escape hatch for early-stage operation when the
 * team is small. The override is permanently recorded in the review audit trail.
 *
 * Body: { reason: string }  — mandatory justification
 */
import type { APIEvent } from '@astrojs/node';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { can } from '../../../../lib/permissions';
import { notify } from '../../../../lib/notify';

export async function PUT(event: APIEvent) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'content:override')) {
      return json(error(ErrorCodes.FORBIDDEN, '需要管理员权限'), 403);
    }

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少 ID'), 400);

    const body = await event.request.json();
    const { reason } = body as { reason?: string };

    if (!reason || reason.trim().length < 5) {
      return json(error(ErrorCodes.BAD_REQUEST, 'Override 必须填写理由（至少 5 字）'), 400);
    }

    const review = await prisma.icebergReview.findUnique({
      where: { id },
      include: { iceberg: { select: { id: true, slug: true, title: true, authorId: true, status: true } } },
    });

    if (!review) return json(error(ErrorCodes.NOT_FOUND, '审核记录不存在'), 404);
    if (review.status !== 'PENDING') {
      return json(error(ErrorCodes.BAD_REQUEST, `审核记录状态为「${review.status}」，无需 Override`), 400);
    }

    const now = new Date();

    await prisma.$transaction([
      prisma.icebergReview.update({
        where: { id },
        data: {
          status: 'OVERRIDDEN',
          reviewerId: session.userId,
          overriddenBy: session.userId,
          overrideReason: reason.trim(),
          reviewedAt: now,
        },
      }),
      prisma.iceberg.update({
        where: { id: review.iceberg.id },
        data: { status: 'PUBLISHED' },
      }),
    ]);

    await notify(
      review.iceberg.authorId,
      'iceberg_approved',
      `冰山图《${review.iceberg.title}》已通过审核`,
      '你的冰山图已由管理员直接发布。',
      `/iceberg/${review.iceberg.slug || review.iceberg.id}`,
    );

    return json(success({
      overridden: true,
      reviewId: id,
      message: 'Override 已记录并永久保留，冰山图已发布',
    }), 200);
  } catch (err) {
    console.error('Override 操作失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '操作失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
