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
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { can } from '../../../../lib/permissions';
import { notify } from '../../../../lib/notify';
import {
  DEFAULT_BRANCH_NAME,
  ensureRepository,
  getSnapshotForCommit,
  isRepositoryFeatureEnabled,
  snapshotSearchText,
} from '../../../../lib/icebergRepository';
import { renderMarkdownWithMath } from '../../../../lib/markdown';
import {
  assertReviewerMayDecide,
  registerReviewDecision,
} from '../../../../lib/reviewerCertification';
import {
  CONTRIBUTION_EVENT_TYPES,
  recordContributionEvent,
} from '../../../../lib/contributions';
import { checkAchievements } from '../../../../lib/achievementService';

export async function ALL(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'content:review')) {
      return json(error(ErrorCodes.FORBIDDEN, '需要编辑权限'), 403);
    }

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少 ID'), 400);

    const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json();
    const { action, reason } = body as { action?: string; reason?: string };

    if (action !== 'approve' && action !== 'reject') {
      return json(error(ErrorCodes.BAD_REQUEST, 'action 必须为 approve 或 reject'), 400);
    }
    if (action === 'reject' && (!reason || reason.trim().length < 5)) {
      return json(error(ErrorCodes.BAD_REQUEST, '拒绝时必须填写理由（至少 5 字）'), 400);
    }

    const review = await (prisma as any).icebergReview.findUnique({
      where: { id },
      include: { iceberg: { select: { id: true, slug: true, title: true, authorId: true, status: true } } },
    });

    if (!review) return json(error(ErrorCodes.NOT_FOUND, '审核记录不存在'), 404);
    if (review.status !== 'PENDING') {
      return json(error(ErrorCodes.BAD_REQUEST, `审核记录状态为「${review.status}」，无法操作`), 400);
    }

    const isSelfReview = review.iceberg.authorId === session.userId;
    let certification: any = null;
    try {
      ({ certification } = await assertReviewerMayDecide(session));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      if (message === 'DAILY_REVIEW_LIMIT') {
        return json(error(ErrorCodes.DAILY_REVIEW_LIMIT, '试用审核员今日已达到 3 次审核上限'), 429);
      }
      if (message === 'CAPABILITY_SUSPENDED') {
        return json(error(ErrorCodes.CAPABILITY_SUSPENDED, '发布审核能力当前处于暂停状态'), 403);
      }
      return json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要有效的发布审核能力'), 403);
    }

    const now = new Date();

    const icebergLink = `/iceberg/${review.iceberg.slug || review.iceberg.id}`;

    if (action === 'approve') {
      let publicationSnapshot = null;
      let publicationCommitId = review.commitId as string | null;
      if (await isRepositoryFeatureEnabled()) {
        if (!publicationCommitId) {
          await ensureRepository(review.iceberg.id, session.userId);
          const main = await (prisma as any).icebergBranch.findFirst({
            where: {
              icebergId: review.iceberg.id,
              normalizedName: DEFAULT_BRANCH_NAME,
              archivedAt: null,
            },
            select: { headCommitId: true },
          });
          publicationCommitId = main?.headCommitId ?? null;
        }
        if (publicationCommitId) publicationSnapshot = await getSnapshotForCommit(publicationCommitId);
      }

      await prisma.$transaction(async (rawTx) => {
        const tx = rawTx as any;
        await tx.icebergReview.update({
          where: { id },
          data: {
            status: 'APPROVED',
            reviewerId: session.userId,
            reviewedAt: now,
            commitId: publicationCommitId,
          },
        });
        await tx.iceberg.update({
          where: { id: review.iceberg.id },
          data: { status: 'PUBLISHED' },
        });
        if (publicationSnapshot && publicationCommitId) {
          await tx.icebergPublication.upsert({
          where: { icebergId: review.iceberg.id },
          create: {
            icebergId: review.iceberg.id,
            commitId: publicationCommitId,
            title: publicationSnapshot.metadata.title,
            description: publicationSnapshot.metadata.description,
            renderedDescription: publicationSnapshot.metadata.description
              ? renderMarkdownWithMath(publicationSnapshot.metadata.description) : null,
            topic: publicationSnapshot.metadata.topic,
            snapshot: publicationSnapshot,
            searchText: snapshotSearchText(publicationSnapshot),
            publishedAt: now,
          },
          update: {
            commitId: publicationCommitId,
            title: publicationSnapshot.metadata.title,
            description: publicationSnapshot.metadata.description,
            renderedDescription: publicationSnapshot.metadata.description
              ? renderMarkdownWithMath(publicationSnapshot.metadata.description) : null,
            topic: publicationSnapshot.metadata.topic,
            snapshot: publicationSnapshot,
            searchText: snapshotSearchText(publicationSnapshot),
            publishedAt: now,
          },
          });
        }
        await recordContributionEvent({
          idempotencyKey: `publication-review:${id}`,
          userId: review.iceberg.authorId,
          type: CONTRIBUTION_EVENT_TYPES.ICEBERG_PUBLISHED,
          dimension: 'CREATION',
          resourceType: 'iceberg-review',
          resourceId: id,
          icebergId: review.iceberg.id,
          occurredAt: now,
          metadata: {
            commitId: publicationCommitId,
            reviewerId: session.userId,
            selfReview: isSelfReview,
          },
        }, tx);
        await registerReviewDecision({
          decisionKey: `${id}:${now.toISOString()}:approve`,
          reviewId: id,
          reviewerId: session.userId,
          isSelfReview,
          certificationStatus: certification?.status,
        }, tx);
      });
      await notify(
        review.iceberg.authorId,
        'iceberg_approved',
        `冰山图《${review.iceberg.title}》已通过审核`,
        '恭喜！你的冰山图已发布，现在所有人都可以看到它。',
        icebergLink,
      );
      checkAchievements(review.iceberg.authorId, { type: 'contribution' }).catch(() => {});
    } else {
      // reject → send back to DRAFT
      await prisma.$transaction(async (rawTx) => {
        const tx = rawTx as any;
        await tx.icebergReview.update({
          where: { id },
          data: {
            status: 'REJECTED',
            reviewerId: session.userId,
            note: reason!.trim(),
            reviewedAt: now,
          },
        });
        await tx.iceberg.update({
          where: { id: review.iceberg.id },
          data: { status: 'DRAFT' },
        });
        await registerReviewDecision({
          decisionKey: `${id}:${now.toISOString()}:reject`,
          reviewId: id,
          reviewerId: session.userId,
          isSelfReview,
          certificationStatus: certification?.status,
        }, tx);
      });
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
    const message = err instanceof Error ? err.message : '';
    if (message === 'CAPABILITY_REQUIRED') {
      return json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要发布审核能力'), 403);
    }
    if (message === 'CAPABILITY_SUSPENDED') {
      return json(error(ErrorCodes.CAPABILITY_SUSPENDED, '发布审核能力已暂停'), 403);
    }
    if (message === 'DAILY_REVIEW_LIMIT') {
      return json(error(ErrorCodes.DAILY_REVIEW_LIMIT, '试用期今日审核次数已达上限'), 429);
    }
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
