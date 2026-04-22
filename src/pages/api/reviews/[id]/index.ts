/**
 * PUT /api/reviews/[id]
 *
 * Approve or reject a pending iceberg review.
 * Body: { action: 'approve' | 'reject', reason?: string }
 *
 * Rules:
 *   - Requires EDITOR or ADMIN role.
 *   - Recusal enforced: reviewer must not be the iceberg's author.
 *   - approve → iceberg.status = PUBLISHED, review.status = APPROVED
 *   - reject  → iceberg.status = REJECTED (→ DRAFT), review.status = REJECTED
 *               reason is required on rejection.
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
    if (!can(session, 'content:review')) {
      return json(error(ErrorCodes.FORBIDDEN, '需要编辑权限'), 403);
    }

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少 ID'), 400);

    const body = await event.request.json();
    const { action, reason } = body as { action?: string; reason?: string };

    if (action !== 'approve' && action !== 'reject') {
      return json(error(ErrorCodes.BAD_REQUEST, 'action 必须为 approve 或 reject'), 400);
    }
    if (action === 'reject' && (!reason || reason.trim().length < 5)) {
      return json(error(ErrorCodes.BAD_REQUEST, '拒绝时必须填写理由（至少 5 字）'), 400);
    }

    const review = await prisma.icebergReview.findUnique({
      where: { id },
      include: { iceberg: { select: { id: true, slug: true, title: true, authorId: true, status: true } } },
    });

    if (!review) return json(error(ErrorCodes.NOT_FOUND, '审核记录不存在'), 404);
    if (review.status !== 'PENDING') {
      return json(error(ErrorCodes.BAD_REQUEST, `审核记录状态为「${review.status}」，无法操作`), 400);
    }

    // Recusal: reviewer must not be the author
    if (review.iceberg.authorId === session.userId) {
      return json(error(ErrorCodes.FORBIDDEN, '回避制度：不能审核自己的冰山图'), 403);
    }

    const now = new Date();

    const icebergLink = `/iceberg/${review.iceberg.slug || review.iceberg.id}`;

    if (action === 'approve') {
      await prisma.$transaction([
        prisma.icebergReview.update({
          where: { id },
          data: { status: 'APPROVED', reviewerId: session.userId, reviewedAt: now },
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
        '恭喜！你的冰山图已发布，现在所有人都可以看到它。',
        icebergLink,
      );
    } else {
      // reject → send back to DRAFT
      await prisma.$transaction([
        prisma.icebergReview.update({
          where: { id },
          data: {
            status: 'REJECTED',
            reviewerId: session.userId,
            note: reason!.trim(),
            reviewedAt: now,
          },
        }),
        prisma.iceberg.update({
          where: { id: review.iceberg.id },
          data: { status: 'DRAFT' },
        }),
      ]);
      await notify(
        review.iceberg.authorId,
        'iceberg_rejected',
        `冰山图《${review.iceberg.title}》未通过审核`,
        `审核意见：${reason!.trim()}`,
        icebergLink,
      );
    }

    return json(success({ action, reviewId: id }), 200);
  } catch (err) {
    console.error('审核操作失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '操作失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
