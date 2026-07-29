/**
 * POST /api/icebergs/[id]/submit
 *
 * Submit an iceberg for editorial review.
 * Runs the 6-point pre-submission checklist; blocks if any non-NSFW check fails.
 * On success creates (or reuses) an IcebergReview record and sets status → PENDING_REVIEW.
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { can } from '../../../../lib/permissions';
import { runChecklist } from '../../../../lib/checklist';
import {
  DEFAULT_BRANCH_NAME,
  ensureRepository,
  getRepositoryRole,
  isRepositoryFeatureEnabled,
} from '../../../../lib/icebergRepository';

async function isProjectMember(userId: string, projectId: string | null): Promise<boolean> {
  if (!projectId) return false;
  try {
    const m = await prisma.projectMember.findFirst({
      where: { projectId, userId },
    });
    return !!m;
  } catch { return false; }
}

export async function ALL(event: APIContext) {
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
      const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json();
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

    // Only the author or project members can submit
    const inProject = await isProjectMember(session.userId, iceberg.projectId);
    const repositoryRole = await getRepositoryRole(session, iceberg);
    if (iceberg.authorId !== session.userId && !inProject && repositoryRole !== 'MAINTAINER') {
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

    let reviewCommitId: string | null = null;
    if (await isRepositoryFeatureEnabled()) {
      await ensureRepository(iceberg.id, session.userId);
      const mainBranch = await (prisma as any).icebergBranch.findFirst({
        where: {
          icebergId: iceberg.id,
          normalizedName: DEFAULT_BRANCH_NAME,
          archivedAt: null,
        },
        select: { headCommitId: true },
      });
      reviewCommitId = mainBranch?.headCommitId ?? null;
    }

    let alreadyInPendingQueue = false;
    let blockedByStatus: string | null = null;

    // 状态迁移 + 审核记录。旧质量分已经冻结，不再产生奖励写入。
    await prisma.$transaction(async (tx) => {
      const fromDraft = await tx.iceberg.updateMany({
        where: { id: iceberg.id, status: 'DRAFT' },
        data: { status: 'PENDING_REVIEW' },
      });

      if (fromDraft.count === 0) {
        const fromRejected = await tx.iceberg.updateMany({
          where: { id: iceberg.id, status: 'REJECTED' },
          data: { status: 'PENDING_REVIEW' },
        });

        if (fromRejected.count === 0) {
          const latest = await tx.iceberg.findUnique({
            where: { id: iceberg.id },
            select: { status: true },
          });
          if (latest?.status === 'PENDING_REVIEW') {
            alreadyInPendingQueue = true;
            return;
          }
          blockedByStatus = latest?.status ?? 'UNKNOWN';
          return;
        }
      }

      await tx.icebergReview.upsert({
        where: { icebergId: iceberg.id },
        create: {
          icebergId: iceberg.id,
          status: 'PENDING',
          commitId: reviewCommitId,
        },
        update: {
          status: 'PENDING',
          commitId: reviewCommitId,
          reviewerId: null,
          note: null,
          overriddenBy: null,
          overrideReason: null,
          reviewedAt: null,
        },
      });

    });

    if (blockedByStatus) {
      return json(
        error(ErrorCodes.BAD_REQUEST, `当前状态「${blockedByStatus}」不可提交`),
        400,
      );
    }

    if (alreadyInPendingQueue) {
      return json(success({
        submitted: true,
        isNsfw,
        message: isNsfw
          ? '该冰山图已在 NSFW 专项审核队列中'
          : '该冰山图已在审核队列中',
        scoreRewarded: false,
        checklist: checklist.items,
      }), 200);
    }

    return json(success({
      submitted: true,
      isNsfw,
      message: isNsfw
        ? '已提交，含 NSFW 内容将进入专项审核队列'
        : '已提交，等待发布审核',
      scoreRewarded: false,
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
