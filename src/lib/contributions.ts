import { prisma } from './prisma';

export const CONTRIBUTION_DIMENSIONS = [
  'CREATION',
  'COLLABORATION',
  'REVIEW',
  'SERVICE',
] as const;

export type ContributionDimension = (typeof CONTRIBUTION_DIMENSIONS)[number];

export const CONTRIBUTION_EVENT_TYPES = {
  ICEBERG_PUBLISHED: 'ICEBERG_PUBLISHED',
  PULL_REQUEST_MERGED: 'PULL_REQUEST_MERGED',
  PULL_REVIEW_SUBMITTED: 'PULL_REVIEW_SUBMITTED',
  REVIEW_AUDIT_PASSED: 'REVIEW_AUDIT_PASSED',
  REVIEW_AUDIT_FAILED: 'REVIEW_AUDIT_FAILED',
  PROJECT_TASK_COMPLETED: 'PROJECT_TASK_COMPLETED',
  MODERATION_CASE_RESOLVED: 'MODERATION_CASE_RESOLVED',
} as const;

export type ContributionEventType =
  (typeof CONTRIBUTION_EVENT_TYPES)[keyof typeof CONTRIBUTION_EVENT_TYPES];

export interface ContributionProfile {
  userId: string;
  creationCount: number;
  collaborationCount: number;
  reviewCount: number;
  serviceCount: number;
  publishedIcebergCount: number;
  mergedPullRequestCount: number;
  distinctCollabIcebergCount: number;
  nonSelfReviewCount: number;
  validReviewCount: number;
  completedTaskCount: number;
  updatedAt?: Date | string;
}

export async function refreshContributionProfile(
  userId: string,
  client: any = prisma,
): Promise<ContributionProfile> {
  const db = client as any;
  const events = await db.contributionEvent.findMany({
    where: { userId },
    select: { type: true, dimension: true, icebergId: true },
  });
  const distinctCollabIcebergs = new Set(
    events
      .filter((event: any) =>
        event.type === CONTRIBUTION_EVENT_TYPES.PULL_REQUEST_MERGED && event.icebergId)
      .map((event: any) => event.icebergId),
  );
  const countDimension = (dimension: ContributionDimension) =>
    events.filter((event: any) => event.dimension === dimension).length;
  const countType = (type: ContributionEventType) =>
    events.filter((event: any) => event.type === type).length;

  return db.userContributionProfile.upsert({
    where: { userId },
    create: {
      userId,
      creationCount: countDimension('CREATION'),
      collaborationCount: countDimension('COLLABORATION'),
      reviewCount: countDimension('REVIEW'),
      serviceCount: countDimension('SERVICE'),
      publishedIcebergCount: countType(CONTRIBUTION_EVENT_TYPES.ICEBERG_PUBLISHED),
      mergedPullRequestCount: countType(CONTRIBUTION_EVENT_TYPES.PULL_REQUEST_MERGED),
      distinctCollabIcebergCount: distinctCollabIcebergs.size,
      nonSelfReviewCount: countType(CONTRIBUTION_EVENT_TYPES.PULL_REVIEW_SUBMITTED),
      validReviewCount: countType(CONTRIBUTION_EVENT_TYPES.REVIEW_AUDIT_PASSED),
      completedTaskCount: countType(CONTRIBUTION_EVENT_TYPES.PROJECT_TASK_COMPLETED),
    },
    update: {
      creationCount: countDimension('CREATION'),
      collaborationCount: countDimension('COLLABORATION'),
      reviewCount: countDimension('REVIEW'),
      serviceCount: countDimension('SERVICE'),
      publishedIcebergCount: countType(CONTRIBUTION_EVENT_TYPES.ICEBERG_PUBLISHED),
      mergedPullRequestCount: countType(CONTRIBUTION_EVENT_TYPES.PULL_REQUEST_MERGED),
      distinctCollabIcebergCount: distinctCollabIcebergs.size,
      nonSelfReviewCount: countType(CONTRIBUTION_EVENT_TYPES.PULL_REVIEW_SUBMITTED),
      validReviewCount: countType(CONTRIBUTION_EVENT_TYPES.REVIEW_AUDIT_PASSED),
      completedTaskCount: countType(CONTRIBUTION_EVENT_TYPES.PROJECT_TASK_COMPLETED),
    },
  });
}

export async function recordContributionEvent(input: {
  idempotencyKey: string;
  userId: string;
  type: ContributionEventType;
  dimension: ContributionDimension;
  resourceType: string;
  resourceId: string;
  icebergId?: string | null;
  projectId?: string | null;
  metadata?: unknown;
  occurredAt?: Date;
}, client: any = prisma): Promise<{ created: boolean }> {
  const db = client as any;
  const existing = await db.contributionEvent.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true },
  });
  if (existing) return { created: false };

  try {
    await db.contributionEvent.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        userId: input.userId,
        type: input.type,
        dimension: input.dimension,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        icebergId: input.icebergId ?? null,
        projectId: input.projectId ?? null,
        metadata: input.metadata ?? undefined,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return { created: false };
    }
    throw error;
  }
  await refreshContributionProfile(input.userId, db);
  return { created: true };
}

export async function getContributionProfile(userId: string): Promise<ContributionProfile> {
  try {
    const profile = await (prisma as any).userContributionProfile.findUnique({ where: { userId } });
    if (profile) return profile;
    return await refreshContributionProfile(userId);
  } catch {
    return {
      userId,
      creationCount: 0,
      collaborationCount: 0,
      reviewCount: 0,
      serviceCount: 0,
      publishedIcebergCount: 0,
      mergedPullRequestCount: 0,
      distinctCollabIcebergCount: 0,
      nonSelfReviewCount: 0,
      validReviewCount: 0,
      completedTaskCount: 0,
    };
  }
}
