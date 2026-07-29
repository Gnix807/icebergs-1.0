import { createHash } from 'node:crypto';
import { prisma } from './prisma';
import { hasCapability, type CapabilityUser } from './capabilities';
import {
  CONTRIBUTION_EVENT_TYPES,
  recordContributionEvent,
} from './contributions';

const DAY_MS = 86_400_000;
const ELIGIBILITY_WINDOW_DAYS = 180;
const MIN_ACCOUNT_DAYS = 30;
const MIN_MERGED_PULLS = 5;
const MIN_DISTINCT_ICEBERGS = 3;
const MIN_NON_SELF_REVIEWS = 3;
const TRIAL_DAYS = 30;
const TRIAL_DAILY_LIMIT = 3;
const MIN_TRIAL_DECISIONS = 10;
const MAX_AUDIT_ERROR_RATE = 0.1;

export interface ReviewerMetrics {
  accountDays: number;
  mergedPullRequests: number;
  distinctIcebergs: number;
  nonSelfReviews: number;
  seriousWarnings: number;
  eligible: boolean;
}

export async function evaluateReviewerEligibility(
  userId: string,
  client: any = prisma,
): Promise<{ metrics: ReviewerMetrics; certification: any }> {
  const db = client as any;
  const since = new Date(Date.now() - ELIGIBILITY_WINDOW_DAYS * DAY_MS);
  const [user, events, seriousWarnings] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, status: true },
    }),
    db.contributionEvent.findMany({
      where: {
        userId,
        occurredAt: { gte: since },
        type: {
          in: [
            CONTRIBUTION_EVENT_TYPES.PULL_REQUEST_MERGED,
            CONTRIBUTION_EVENT_TYPES.PULL_REVIEW_SUBMITTED,
          ],
        },
      },
      select: { type: true, icebergId: true },
    }),
    db.userWarning.count({
      where: {
        userId,
        level: 2,
        createdAt: { gte: since },
      },
    }),
  ]);
  if (!user) throw new Error('USER_NOT_FOUND');

  const merged = events.filter((event: any) =>
    event.type === CONTRIBUTION_EVENT_TYPES.PULL_REQUEST_MERGED);
  const reviews = events.filter((event: any) =>
    event.type === CONTRIBUTION_EVENT_TYPES.PULL_REVIEW_SUBMITTED);
  const metrics: ReviewerMetrics = {
    accountDays: Math.floor((Date.now() - new Date(user.createdAt).getTime()) / DAY_MS),
    mergedPullRequests: merged.length,
    distinctIcebergs: new Set(merged.map((event: any) => event.icebergId).filter(Boolean)).size,
    nonSelfReviews: reviews.length,
    seriousWarnings,
    eligible: false,
  };
  metrics.eligible =
    metrics.accountDays >= MIN_ACCOUNT_DAYS
    && metrics.mergedPullRequests >= MIN_MERGED_PULLS
    && metrics.distinctIcebergs >= MIN_DISTINCT_ICEBERGS
    && metrics.nonSelfReviews >= MIN_NON_SELF_REVIEWS
    && metrics.seriousWarnings === 0
    && !['READ_ONLY', 'TEMP_BANNED', 'PERM_BANNED', 'WARNED_2'].includes(user.status);

  const existing = await db.reviewerCertification.findUnique({ where: { userId } });
  let nextStatus = existing?.status ?? (metrics.eligible ? 'ELIGIBLE' : 'INELIGIBLE');
  if (metrics.eligible && (!existing || ['INELIGIBLE', 'ELIGIBLE'].includes(nextStatus))) {
    nextStatus = 'ELIGIBLE';
  }
  if (!metrics.eligible && ['ELIGIBLE', 'TRIAL'].includes(nextStatus)) nextStatus = 'INELIGIBLE';

  const now = new Date();
  const certification = await db.reviewerCertification.upsert({
    where: { userId },
    create: {
      userId,
      status: metrics.eligible ? 'TRIAL' : 'INELIGIBLE',
      certifiedAt: metrics.eligible ? now : null,
      trialEndsAt: metrics.eligible ? new Date(now.getTime() + TRIAL_DAYS * DAY_MS) : null,
      metrics,
      lastEvaluatedAt: now,
    },
    update: {
      status: nextStatus === 'ELIGIBLE' ? 'TRIAL' : nextStatus,
      certifiedAt: nextStatus === 'ELIGIBLE' ? now : undefined,
      trialEndsAt: nextStatus === 'ELIGIBLE'
        ? new Date(now.getTime() + TRIAL_DAYS * DAY_MS)
        : undefined,
      metrics,
      lastEvaluatedAt: now,
    },
  });

  if (metrics.eligible && (!existing || ['INELIGIBLE', 'ELIGIBLE'].includes(existing.status))) {
    await db.userCapability.upsert({
      where: { userId_capability: { userId, capability: 'PUBLICATION_REVIEW' } },
      create: {
        userId,
        capability: 'PUBLICATION_REVIEW',
        status: 'TRIAL',
        source: 'AUTO_CERTIFICATION',
        probationEndsAt: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
        reason: '满足发布审核员自动认证门槛',
        metadata: metrics,
      },
      update: {
        status: 'TRIAL',
        source: 'AUTO_CERTIFICATION',
        probationEndsAt: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
        suspendedUntil: null,
        revokedAt: null,
        reason: '满足发布审核员自动认证门槛',
        metadata: metrics,
      },
    });
  }

  return { metrics, certification };
}

export async function assertReviewerMayDecide(
  user: CapabilityUser & { userId: string },
): Promise<{ isSelfReviewAllowed: true; certification: any | null }> {
  if (!hasCapability(user, 'PUBLICATION_REVIEW')) {
    const error = new Error('CAPABILITY_REQUIRED');
    throw error;
  }
  const certification = await (prisma as any).reviewerCertification.findUnique({
    where: { userId: user.userId },
  }).catch(() => null);
  const state = user.capabilityStates?.find((item) =>
    item.capability === 'PUBLICATION_REVIEW');
  if (state?.status === 'SUSPENDED') throw new Error('CAPABILITY_SUSPENDED');

  if (state?.status === 'TRIAL' || certification?.status === 'TRIAL') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const decisionsToday = await prisma.icebergReview.count({
      where: {
        reviewerId: user.userId,
        reviewedAt: { gte: start },
      },
    });
    if (decisionsToday >= TRIAL_DAILY_LIMIT) throw new Error('DAILY_REVIEW_LIMIT');
  }
  return { isSelfReviewAllowed: true, certification };
}

function deterministicSample(reviewId: string, rate: number): boolean {
  if (rate >= 100) return true;
  const value = createHash('sha256').update(reviewId).digest().readUInt32BE(0) % 100;
  return value < rate;
}

export async function registerReviewDecision(input: {
  decisionKey: string;
  reviewId: string;
  reviewerId: string;
  isSelfReview: boolean;
  certificationStatus?: string | null;
}, client: any = prisma): Promise<void> {
  const db = client as any;
  const status = input.certificationStatus
    ?? (await db.reviewerCertification.findUnique({ where: { userId: input.reviewerId } }))?.status;
  const sampleRate = input.isSelfReview ? 100 : status === 'TRIAL' ? 30 : 10;

  await db.reviewerCertification.updateMany({
    where: { userId: input.reviewerId },
    data: { decisionCount: { increment: 1 } },
  });

  if (deterministicSample(input.decisionKey, sampleRate)) {
    await db.reviewAudit.create({
      data: {
        decisionKey: input.decisionKey,
        reviewId: input.reviewId,
        reviewerId: input.reviewerId,
        sampleRate,
        isSelfReview: input.isSelfReview,
      },
    });
  }
}

export async function resolveReviewAudit(input: {
  auditId: string;
  auditorId: string;
  outcome: 'PASS' | 'ERROR' | 'SERIOUS';
  reason?: string;
}): Promise<any> {
  return prisma.$transaction(async (rawTx) => {
    const tx = rawTx as any;
    const audit = await tx.reviewAudit.findUnique({ where: { id: input.auditId } });
    if (!audit || audit.outcome !== 'PENDING') throw new Error('AUDIT_NOT_PENDING');
    if (audit.reviewerId === input.auditorId) throw new Error('AUDIT_RECUSAL');

    const resolved = await tx.reviewAudit.update({
      where: { id: audit.id },
      data: {
        auditorId: input.auditorId,
        outcome: input.outcome,
        reason: input.reason?.trim() || null,
        resolvedAt: new Date(),
      },
    });
    if (input.outcome === 'SERIOUS') {
      const reviewed = await tx.icebergReview.findUnique({
        where: { id: audit.reviewId },
        select: { icebergId: true },
      });
      if (reviewed) {
        await tx.iceberg.updateMany({
          where: { id: reviewed.icebergId, status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        });
      }
    }
    await tx.reviewerCertification.updateMany({
      where: { userId: audit.reviewerId },
      data: {
        auditedCount: { increment: 1 },
        auditErrorCount: input.outcome === 'PASS' ? undefined : { increment: 1 },
        status: input.outcome === 'SERIOUS' ? 'SUSPENDED' : undefined,
      },
    });
    if (input.outcome === 'PASS') {
      await recordContributionEvent({
        idempotencyKey: `review-audit:${audit.id}:pass`,
        userId: audit.reviewerId,
        type: CONTRIBUTION_EVENT_TYPES.REVIEW_AUDIT_PASSED,
        dimension: 'REVIEW',
        resourceType: 'review-audit',
        resourceId: audit.id,
      }, tx);
    } else {
      await recordContributionEvent({
        idempotencyKey: `review-audit:${audit.id}:failed`,
        userId: audit.reviewerId,
        type: CONTRIBUTION_EVENT_TYPES.REVIEW_AUDIT_FAILED,
        dimension: 'REVIEW',
        resourceType: 'review-audit',
        resourceId: audit.id,
        metadata: { outcome: input.outcome },
      }, tx);
    }

    const certification = await tx.reviewerCertification.findUnique({
      where: { userId: audit.reviewerId },
    });
    if (certification?.status === 'TRIAL'
      && certification.trialEndsAt
      && certification.trialEndsAt <= new Date()
      && certification.decisionCount >= MIN_TRIAL_DECISIONS
      && certification.auditedCount > 0
      && certification.auditErrorCount / certification.auditedCount < MAX_AUDIT_ERROR_RATE) {
      await tx.reviewerCertification.update({
        where: { userId: audit.reviewerId },
        data: { status: 'ACTIVE' },
      });
      await tx.userCapability.updateMany({
        where: {
          userId: audit.reviewerId,
          capability: 'PUBLICATION_REVIEW',
          status: 'TRIAL',
        },
        data: { status: 'ACTIVE', probationEndsAt: null },
      });
    }
    return resolved;
  });
}
