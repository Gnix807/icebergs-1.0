import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { notify } from '../../../../lib/notify';
import {
  DEFAULT_BRANCH_NAME,
  applyMergeResolutions,
  createRepositoryCommit,
  diffSnapshots,
  editorIcebergFromSnapshot,
  ensureRepository,
  findCommonAncestor,
  getRepositoryRole,
  getSnapshotForCommit,
  isRepositoryFeatureEnabled,
  mergeSnapshots,
  normalizeSnapshot,
  type RepositoryRole,
} from '../../../../lib/icebergRepository';
import {
  CONTRIBUTION_EVENT_TYPES,
  recordContributionEvent,
} from '../../../../lib/contributions';
import { accountMayAct } from '../../../../lib/capabilities';
import { evaluateReviewerEligibility } from '../../../../lib/reviewerCertification';
import { checkAchievements } from '../../../../lib/achievementService';

const db = prisma as any;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function apiError(code: string, message: string, status: number, details?: unknown) {
  return json(error(code as any, message, details), status);
}

async function loadIceberg(id: string) {
  return prisma.iceberg.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: {
      author: { select: { id: true, username: true, nickname: true } },
      review: true,
      publication: true,
    },
  });
}

async function userMap(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, username: true, nickname: true, avatar: true, role: true, isFounder: true },
  });
  return Object.fromEntries(users.map((user) => [user.id, user]));
}

async function isMaintainerUser(iceberg: any, userId: string): Promise<boolean> {
  if (iceberg.authorId === userId) return true;
  const collaborator = await db.icebergCollaborator.findFirst({
    where: { icebergId: iceberg.id, userId, status: 'ACTIVE', role: 'MAINTAINER' },
  });
  if (collaborator) return true;
  if (!iceberg.projectId) return false;
  const project = await prisma.project.findUnique({
    where: { id: iceberg.projectId },
    select: {
      creatorId: true,
      members: {
        where: { userId, role: 'MODERATOR' },
        select: { userId: true },
        take: 1,
      },
    },
  });
  return project?.creatorId === userId || !!project?.members[0];
}

async function mayActOnIssues(icebergId: string, session: any): Promise<boolean> {
  if (!session || !accountMayAct(session.status)) return false;
  const blocked = await db.icebergCollaborator.findFirst({
    where: { icebergId, userId: session.userId, status: 'BLOCKED' },
    select: { id: true },
  }).catch(() => null);
  return !blocked;
}

function publicPullAllowed(iceberg: any, pull: any): boolean {
  if (pull.status !== 'MERGED' || !iceberg.publication) return false;
  return !!pull.mergedAt && new Date(pull.mergedAt) <= new Date(iceberg.publication.publishedAt);
}

function normalizeBranchName(input: unknown, username: string): { name: string; normalized: string } {
  const raw = typeof input === 'string' ? input.trim() : '';
  const compact = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/[-/]{2,}/g, '-')
    .replace(/^[-/.]+|[-/.]+$/g, '')
    .slice(0, 42);
  const userPart = username.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 18) || 'user';
  const suffix = compact || `change-${Date.now().toString(36)}`;
  const normalized = `${userPart}/${suffix}`.slice(0, 64);
  return { name: normalized, normalized };
}

async function repositoryState(iceberg: any, session: any, role: RepositoryRole, branchId?: string | null) {
  const main = await ensureRepository(iceberg.id, session?.userId);
  const allBranches = await db.icebergBranch.findMany({
    where: { icebergId: iceberg.id, archivedAt: null },
    orderBy: [{ protected: 'desc' }, { updatedAt: 'desc' }],
  });
  const branches = role === 'PROPOSER'
    ? allBranches.filter((candidate: any) =>
      candidate.protected || candidate.createdById === session?.userId)
    : allBranches;
  const branch = branches.find((candidate: any) => candidate.id === branchId)
    ?? branches.find((candidate: any) => candidate.id === main.id)
    ?? branches[0];
  const headCommit = await db.icebergCommit.findUnique({ where: { id: branch.headCommitId } });
  const headSnapshot = await getSnapshotForCommit(branch.headCommitId);
  const workingCopy = session ? await db.icebergWorkingCopy.findUnique({
    where: { branchId_userId: { branchId: branch.id, userId: session.userId } },
  }) : null;
  const workspaceSnapshot = normalizeSnapshot(workingCopy?.snapshot) ?? headSnapshot;
  const mainBranch = branches.find((candidate: any) => candidate.normalizedName === DEFAULT_BRANCH_NAME) ?? main;
  const mainHead = await db.icebergCommit.findUnique({ where: { id: mainBranch.headCommitId } });
  const openPull = await db.icebergPullRequest.findFirst({
    where: { icebergId: iceberg.id, headBranchId: branch.id, status: 'OPEN' },
    orderBy: { number: 'desc' },
  });
  return {
    enabled: true,
    role,
    isAuthenticated: !!session,
    canCreateIssue: await mayActOnIssues(iceberg.id, session),
    repository: {
      icebergId: iceberg.id,
      defaultBranchId: mainBranch.id,
      branches: branches.map((item: any) => ({
        id: item.id,
        name: item.name,
        title: item.title,
        protected: item.protected,
        headCommitId: item.headCommitId,
        isCurrent: item.id === branch.id,
      })),
      currentBranch: branch,
      headCommit: headCommit ? { ...headCommit, shortHash: headCommit.hash.slice(0, 8) } : null,
      mainHeadCommitId: mainBranch.headCommitId,
      aheadOfMain: branch.id !== mainBranch.id && branch.headCommitId !== mainBranch.headCommitId,
      openPull,
    },
    workingCopy: {
      revision: workingCopy?.revision ?? 0,
      baseCommitId: workingCopy?.baseCommitId ?? branch.headCommitId,
      dirty: !!workingCopy && JSON.stringify(workspaceSnapshot) !== JSON.stringify(headSnapshot),
    },
    iceberg: editorIcebergFromSnapshot(iceberg, workspaceSnapshot),
    snapshot: workspaceSnapshot,
    mainShortHash: mainHead?.hash?.slice(0, 8) ?? null,
  };
}

export async function GET(event: APIContext) {
  try {
    const id = event.params.id;
    if (!id) return apiError(ErrorCodes.BAD_REQUEST, '缺少 ID', 400);
    const session = await getSession(event);
    const sessionUserId = session?.userId ?? null;
    const iceberg = await loadIceberg(id);
    if (!iceberg) return apiError(ErrorCodes.NOT_FOUND, '冰山图不存在', 404);
    const role = await getRepositoryRole(session, iceberg);
    if (role === 'NONE') {
      const invitation = session ? await db.icebergCollaborator.findFirst({
        where: { icebergId: iceberg.id, userId: session.userId, status: 'PENDING' },
      }).catch(() => null) : null;
      if (invitation) {
        return json(success({
          enabled: await isRepositoryFeatureEnabled(),
          role,
          invitation,
          iceberg: { id: iceberg.id, slug: iceberg.slug, title: iceberg.title },
        }), 200);
      }
      return apiError(ErrorCodes.NOT_FOUND, '冰山图不存在', 404);
    }

    const enabled = await isRepositoryFeatureEnabled();
    if (!enabled) return json(success({ enabled: false, role }), 200);
    if (!iceberg.repositoryInitializedAt && role === 'VIEWER') {
      return json(success({ enabled: true, role, repository: null }), 200);
    }
    await ensureRepository(iceberg.id, session?.userId);
    const view = event.url.searchParams.get('view') || 'state';

    if (view === 'state') {
    if (role === 'VIEWER') {
        const publication = iceberg.publication;
        if (!publication) return apiError(ErrorCodes.NOT_FOUND, '冰山图不存在', 404);
        const publishedCommit = await db.icebergCommit.findFirst({
          where: { id: publication.commitId, icebergId: iceberg.id },
        });
        return json(success({
          enabled: true,
          role,
          isAuthenticated: !!session,
          canCreateIssue: await mayActOnIssues(iceberg.id, session),
          repository: {
            icebergId: iceberg.id,
            defaultBranchId: null,
            branches: [],
            currentBranch: null,
            headCommit: publishedCommit ? {
              id: publishedCommit.id,
              hash: publishedCommit.hash,
              shortHash: publishedCommit.hash.slice(0, 8),
            } : null,
            mainHeadCommitId: publication.commitId,
            aheadOfMain: false,
            openPull: null,
          },
          workingCopy: null,
          iceberg: {
            id: iceberg.id,
            slug: iceberg.slug,
            title: publication.title,
            description: publication.description,
            topic: publication.topic,
          },
          mainShortHash: publishedCommit?.hash?.slice(0, 8) ?? null,
        }), 200);
      }
      return json(success(await repositoryState(
        iceberg,
        session,
        role,
        event.url.searchParams.get('branch'),
      )), 200);
    }

    if (view === 'issues') {
      const issues = await db.icebergIssue.findMany({
        where: { icebergId: iceberg.id },
        include: { _count: { select: { comments: true } } },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        take: 100,
      });
      const users = await userMap(issues.map((issue: any) => issue.authorId));
      return json(success(issues.map((issue: any) => ({
        ...issue,
        author: users[issue.authorId] ?? null,
      }))), 200);
    }

    if (view === 'issue') {
      const number = Number(event.url.searchParams.get('number'));
      const issue = await db.icebergIssue.findUnique({
        where: { icebergId_number: { icebergId: iceberg.id, number } },
        include: { comments: { orderBy: { createdAt: 'asc' } } },
      });
      if (!issue) return apiError(ErrorCodes.NOT_FOUND, 'Issue 不存在', 404);
      const users = await userMap([
        issue.authorId,
        ...issue.comments.map((comment: any) => comment.authorId),
      ]);
      return json(success({
        ...issue,
        author: users[issue.authorId] ?? null,
        comments: issue.comments.map((comment: any) => ({
          ...comment,
          author: users[comment.authorId] ?? null,
        })),
        canManage: role === 'MAINTAINER' || issue.authorId === sessionUserId,
      }), 200);
    }

    if (view === 'history') {
      const where = (role === 'VIEWER' || role === 'PROPOSER') && iceberg.publication
        ? { icebergId: iceberg.id, createdAt: { lte: iceberg.publication.publishedAt } }
        : { icebergId: iceberg.id };
      const commits = await db.icebergCommit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(100, Math.max(1, Number(event.url.searchParams.get('limit')) || 50)),
      });
      const users = await userMap(commits.map((commit: any) => commit.authorId));
      return json(success(commits.map((commit: any) => ({
        ...commit,
        shortHash: commit.hash.slice(0, 8),
        author: users[commit.authorId] ?? null,
      }))), 200);
    }

    if (view === 'diff') {
      const baseId = event.url.searchParams.get('base');
      const headId = event.url.searchParams.get('head');
      if (!baseId || !headId) return apiError(ErrorCodes.BAD_REQUEST, '缺少比较版本', 400);
      const [baseCommit, headCommit] = await Promise.all([
        db.icebergCommit.findFirst({ where: { id: baseId, icebergId: iceberg.id } }),
        db.icebergCommit.findFirst({ where: { id: headId, icebergId: iceberg.id } }),
      ]);
      if (!baseCommit || !headCommit) return apiError(ErrorCodes.NOT_FOUND, '提交不存在', 404);
      if ((role === 'VIEWER' || role === 'PROPOSER') && iceberg.publication
        && (baseCommit.createdAt > iceberg.publication.publishedAt
          || headCommit.createdAt > iceberg.publication.publishedAt)) {
        return apiError(ErrorCodes.NOT_FOUND, '提交不存在', 404);
      }
      const [base, head] = await Promise.all([
        getSnapshotForCommit(baseId),
        getSnapshotForCommit(headId),
      ]);
      return json(success({ base: baseId, head: headId, changes: diffSnapshots(base, head) }), 200);
    }

    if (view === 'pulls') {
      const where: any = { icebergId: iceberg.id };
      if (role === 'VIEWER') where.status = 'MERGED';
      if (role === 'PROPOSER') {
        where.OR = [
          { authorId: sessionUserId },
          { status: 'MERGED' },
        ];
      }
      const pulls = await db.icebergPullRequest.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });
      const visible = role === 'VIEWER'
        ? pulls.filter((pull: any) => publicPullAllowed(iceberg, pull))
        : role === 'PROPOSER'
          ? pulls.filter((pull: any) =>
            pull.authorId === sessionUserId || publicPullAllowed(iceberg, pull))
          : pulls;
      const users = await userMap(visible.map((pull: any) => pull.authorId));
      return json(success(visible.map((pull: any) => ({
        ...pull,
        author: users[pull.authorId] ?? null,
      }))), 200);
    }

    if (view === 'pull') {
      const number = Number(event.url.searchParams.get('number'));
      const pull = await db.icebergPullRequest.findUnique({
        where: { icebergId_number: { icebergId: iceberg.id, number } },
        include: {
          reviews: { orderBy: { createdAt: 'asc' } },
          comments: { orderBy: { createdAt: 'asc' } },
        },
      });
      const proposerMayView = role === 'PROPOSER'
        && (pull?.authorId === sessionUserId || publicPullAllowed(iceberg, pull));
      if (!pull
        || (role === 'VIEWER' && !publicPullAllowed(iceberg, pull))
        || (role === 'PROPOSER' && !proposerMayView)) {
        return apiError(ErrorCodes.NOT_FOUND, '合并请求不存在', 404);
      }
      const [base, head] = await Promise.all([
        getSnapshotForCommit(pull.baseCommitId),
        getSnapshotForCommit(pull.headCommitId),
      ]);
      const users = await userMap([
        pull.authorId,
        ...pull.reviews.map((review: any) => review.reviewerId),
        ...pull.comments.map((comment: any) => comment.authorId),
      ]);
      const currentUserReview = sessionUserId
        ? [...pull.reviews].reverse().find((review: any) =>
          review.reviewerId === sessionUserId
          && review.headCommitId === pull.headCommitId
          && !review.dismissedAt
          && (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED'))
        : null;
      return json(success({
        ...pull,
        author: users[pull.authorId] ?? null,
        reviews: pull.reviews.map((review: any) => ({ ...review, reviewer: users[review.reviewerId] ?? null })),
        currentUserReview: currentUserReview
          ? { ...currentUserReview, reviewer: users[currentUserReview.reviewerId] ?? null }
          : null,
        comments: pull.comments.map((comment: any) => ({ ...comment, author: users[comment.authorId] ?? null })),
        changes: diffSnapshots(base, head),
      }), 200);
    }

    if (view === 'collaborators') {
      if (role === 'VIEWER' || role === 'PROPOSER') {
        return apiError(ErrorCodes.FORBIDDEN, '无权查看协作者', 403);
      }
      const rows = await db.icebergCollaborator.findMany({
        where: { icebergId: iceberg.id, status: { not: 'DECLINED' } },
        orderBy: { createdAt: 'asc' },
      });
      const users = await userMap(rows.map((row: any) => row.userId));
      return json(success(rows.map((row: any) => ({ ...row, user: users[row.userId] ?? null }))), 200);
    }

    return apiError(ErrorCodes.BAD_REQUEST, '未知视图', 400);
  } catch (err) {
    console.error('[repository:get]', err);
    return apiError(ErrorCodes.INTERNAL_ERROR, '版本库读取失败', 500);
  }
}

export async function POST(event: APIContext) {
  try {
    const id = event.params.id;
    const session = await getSession(event);
    if (!session) return apiError(ErrorCodes.UNAUTHORIZED, '请先登录', 401);
    if (!id) return apiError(ErrorCodes.BAD_REQUEST, '缺少 ID', 400);
    const body = await event.request.json().catch(() => null) as Record<string, any> | null;
    if (!body || typeof body.action !== 'string') return apiError(ErrorCodes.BAD_REQUEST, '请求格式错误', 400);
    const iceberg = await loadIceberg(id);
    if (!iceberg) return apiError(ErrorCodes.NOT_FOUND, '冰山图不存在', 404);

    if (body.action === 'respond-invite') {
      const invitation = await db.icebergCollaborator.findFirst({
        where: { icebergId: iceberg.id, userId: session.userId, status: 'PENDING' },
      });
      if (!invitation) return apiError(ErrorCodes.NOT_FOUND, '邀请不存在', 404);
      const accepted = body.accept === true;
      await db.icebergCollaborator.update({
        where: { id: invitation.id },
        data: { status: accepted ? 'ACTIVE' : 'DECLINED', acceptedAt: accepted ? new Date() : null },
      });
      return json(success({ accepted }), 200);
    }

    const enabled = await isRepositoryFeatureEnabled();
    if (!enabled) return apiError('FEATURE_DISABLED', '版本控制功能尚未启用', 409);
    const role = await getRepositoryRole(session, iceberg);
    if (role === 'NONE') {
      return apiError(ErrorCodes.FORBIDDEN, '无权操作版本库', 403);
    }
    const canActOnIssues = await mayActOnIssues(iceberg.id, session);

    if (body.action === 'create-issue') {
      if (!canActOnIssues) {
        return apiError(ErrorCodes.FORBIDDEN, '当前账号只能浏览，无法提交 Issue', 403);
      }
      const title = String(body.title || '').trim().slice(0, 160);
      const issueBody = String(body.body || '').trim().slice(0, 20_000) || null;
      const kind = ['CONTENT', 'BUG', 'SUGGESTION', 'OTHER'].includes(String(body.kind))
        ? String(body.kind)
        : 'CONTENT';
      if (title.length < 2) {
        return apiError(ErrorCodes.VALIDATION_ERROR, 'Issue 标题至少需要 2 个字', 400);
      }

      const dailySince = new Date(Date.now() - 86_400_000);
      const [openCount, dailyCount] = await Promise.all([
        db.icebergIssue.count({
          where: { icebergId: iceberg.id, authorId: session.userId, status: 'OPEN' },
        }),
        db.icebergIssue.count({
          where: { authorId: session.userId, createdAt: { gte: dailySince } },
        }),
      ]);
      if (openCount >= 10 || dailyCount >= 20) {
        return apiError(ErrorCodes.RATE_LIMITED, 'Issue 数量已达上限，请先整理已有问题', 429);
      }

      const issue = await prisma.$transaction(async (rawTx) => {
        const tx = rawTx as any;
        const counter = await tx.iceberg.update({
          where: { id: iceberg.id },
          data: { nextIssueNumber: { increment: 1 } },
          select: { nextIssueNumber: true },
        });
        return tx.icebergIssue.create({
          data: {
            icebergId: iceberg.id,
            number: counter.nextIssueNumber - 1,
            title,
            body: issueBody,
            kind,
            authorId: session.userId,
          },
        });
      });
      if (iceberg.authorId !== session.userId) {
        await notify(iceberg.authorId, 'iceberg_issue_opened',
          `《${iceberg.title}》收到新的 Issue #${issue.number}`,
          issue.title, `/iceberg/${iceberg.slug}/collaboration?issue=${issue.number}`);
      }
      return json(success(issue), 201);
    }

    if (body.action === 'comment-issue') {
      if (!canActOnIssues) {
        return apiError(ErrorCodes.FORBIDDEN, '当前账号只能浏览，无法参与讨论', 403);
      }
      const issue = await db.icebergIssue.findUnique({
        where: {
          icebergId_number: {
            icebergId: iceberg.id,
            number: Number(body.number),
          },
        },
      });
      if (!issue) return apiError(ErrorCodes.NOT_FOUND, 'Issue 不存在', 404);
      if (issue.status !== 'OPEN') {
        return apiError(ErrorCodes.CONFLICT, 'Issue 已关闭，请先重新打开', 409);
      }
      const commentBody = String(body.body || '').trim();
      if (!commentBody) {
        return apiError(ErrorCodes.VALIDATION_ERROR, '评论不能为空', 400);
      }
      const comment = await prisma.$transaction(async (rawTx) => {
        const tx = rawTx as any;
        const created = await tx.icebergIssueComment.create({
          data: {
            issueId: issue.id,
            authorId: session.userId,
            body: commentBody.slice(0, 20_000),
          },
        });
        await tx.icebergIssue.update({
          where: { id: issue.id },
          data: { updatedAt: new Date() },
        });
        return created;
      });
      const recipientId = issue.authorId !== session.userId
        ? issue.authorId
        : iceberg.authorId !== session.userId
          ? iceberg.authorId
          : null;
      if (recipientId) {
        await notify(recipientId, 'iceberg_issue_comment',
          `Issue #${issue.number} 有新回复`,
          comment.body, `/iceberg/${iceberg.slug}/collaboration?issue=${issue.number}`);
      }
      return json(success(comment), 201);
    }

    if (body.action === 'set-issue-status') {
      if (!canActOnIssues) {
        return apiError(ErrorCodes.FORBIDDEN, '当前账号只能浏览，无法修改 Issue', 403);
      }
      const issue = await db.icebergIssue.findUnique({
        where: {
          icebergId_number: {
            icebergId: iceberg.id,
            number: Number(body.number),
          },
        },
      });
      if (!issue) return apiError(ErrorCodes.NOT_FOUND, 'Issue 不存在', 404);
      const canManage = issue.authorId === session.userId
        || await isMaintainerUser(iceberg, session.userId);
      if (!canManage) return apiError(ErrorCodes.FORBIDDEN, '无权关闭或重新打开该 Issue', 403);
      const status = body.status === 'OPEN' ? 'OPEN' : body.status === 'CLOSED' ? 'CLOSED' : null;
      if (!status) return apiError(ErrorCodes.BAD_REQUEST, 'Issue 状态无效', 400);
      if (issue.status === status) return json(success(issue), 200);
      const updated = await db.icebergIssue.update({
        where: { id: issue.id },
        data: status === 'CLOSED'
          ? { status, closedAt: new Date(), closedById: session.userId }
          : { status, closedAt: null, closedById: null },
      });
      if (issue.authorId !== session.userId) {
        await notify(issue.authorId, 'iceberg_issue_status',
          `Issue #${issue.number} 已${status === 'CLOSED' ? '关闭' : '重新打开'}`,
          issue.title, `/iceberg/${iceberg.slug}/collaboration?issue=${issue.number}`);
      }
      return json(success(updated), 200);
    }

    if (role === 'VIEWER') {
      return apiError(ErrorCodes.FORBIDDEN, '无权修改版本库', 403);
    }
    const main = await ensureRepository(iceberg.id, session.userId);

    if (body.action === 'create-branch') {
      const base = await db.icebergBranch.findFirst({
        where: { id: body.baseBranchId || main.id, icebergId: iceberg.id, archivedAt: null },
      });
      if (!base) return apiError(ErrorCodes.NOT_FOUND, '基础分支不存在', 404);
      if (role === 'PROPOSER' && !base.protected) {
        return apiError(ErrorCodes.FORBIDDEN, '提案者只能从主版本创建分支', 403);
      }
      const title = String(body.title || '').trim().slice(0, 120);
      if (title.length < 2) return apiError(ErrorCodes.VALIDATION_ERROR, '改动标题至少需要 2 个字', 400);
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { username: true },
      });
      const branchName = normalizeBranchName(body.name || title, user?.username || 'user');
      const branch = await db.icebergBranch.create({
        data: {
          icebergId: iceberg.id,
          name: branchName.name,
          normalizedName: branchName.normalized,
          title,
          headCommitId: base.headCommitId,
          createdById: session.userId,
        },
      }).catch(() => null);
      if (!branch) return apiError(ErrorCodes.CONFLICT, '分支名称已存在，请换一个标题', 409);
      return json(success(branch), 201);
    }

    if (body.action === 'save-workspace') {
      const branch = await db.icebergBranch.findFirst({
        where: { id: body.branchId, icebergId: iceberg.id, archivedAt: null },
      });
      if (!branch) return apiError(ErrorCodes.NOT_FOUND, '分支不存在', 404);
      if (role === 'PROPOSER' && branch.createdById !== session.userId) {
        return apiError(ErrorCodes.FORBIDDEN, '提案者只能修改自己的分支', 403);
      }
      if (branch.protected && role !== 'MAINTAINER') {
        return apiError(ErrorCodes.FORBIDDEN, '贡献者不能直接修改主版本，请创建改动分支', 403);
      }
      const snapshot = normalizeSnapshot(body.snapshot);
      if (!snapshot) return apiError(ErrorCodes.VALIDATION_ERROR, '工作副本内容无效', 400);
      const existing = await db.icebergWorkingCopy.findUnique({
        where: { branchId_userId: { branchId: branch.id, userId: session.userId } },
      });
      if (existing && Number(body.revision) !== existing.revision) {
        return apiError('WORKSPACE_CONFLICT', '另一个标签页已经保存了更新的工作副本', 409, {
          revision: existing.revision,
          snapshot: existing.snapshot,
          baseCommitId: existing.baseCommitId,
        });
      }
      let initialBaseCommitId = branch.headCommitId;
      if (!existing && typeof body.baseCommitId === 'string') {
        const requestedBase = await db.icebergCommit.findFirst({
          where: { id: body.baseCommitId, icebergId: iceberg.id },
          select: { id: true },
        });
        if (requestedBase) initialBaseCommitId = requestedBase.id;
      }
      const workingCopy = existing
        ? await db.icebergWorkingCopy.update({
          where: { id: existing.id },
          data: { snapshot, revision: { increment: 1 } },
        })
        : await db.icebergWorkingCopy.create({
          data: {
            icebergId: iceberg.id,
            branchId: branch.id,
            userId: session.userId,
            baseCommitId: initialBaseCommitId,
            snapshot,
            revision: 1,
          },
        });
      return json(success({
        revision: workingCopy.revision,
        baseCommitId: workingCopy.baseCommitId,
        updatedAt: workingCopy.updatedAt,
      }), 200);
    }

    if (body.action === 'resolve-conflicts') {
      const branch = await db.icebergBranch.findFirst({
        where: { id: body.branchId, icebergId: iceberg.id, archivedAt: null },
      });
      if (!branch) return apiError(ErrorCodes.NOT_FOUND, '分支不存在', 404);
      if (role === 'PROPOSER' && branch.createdById !== session.userId) {
        return apiError(ErrorCodes.FORBIDDEN, '提案者只能提交自己的分支', 403);
      }
      if (branch.protected && role !== 'MAINTAINER') {
        return apiError(ErrorCodes.FORBIDDEN, '贡献者不能直接提交主版本', 403);
      }
      if (branch.headCommitId !== body.expectedHeadCommitId) {
        return apiError('BRANCH_BEHIND', '分支在解决冲突期间又有了新提交，请重新比较', 409);
      }
      const workingCopy = await db.icebergWorkingCopy.findUnique({
        where: { branchId_userId: { branchId: branch.id, userId: session.userId } },
      });
      if (!workingCopy || Number(body.revision) !== workingCopy.revision) {
        return apiError('WORKSPACE_CONFLICT', '工作副本已变化，请重新载入冲突', 409);
      }
      const workspaceSnapshot = normalizeSnapshot(workingCopy.snapshot);
      if (!workspaceSnapshot) return apiError(ErrorCodes.VALIDATION_ERROR, '工作副本内容无效', 400);
      const [workspaceBase, branchHead] = await Promise.all([
        getSnapshotForCommit(workingCopy.baseCommitId),
        getSnapshotForCommit(branch.headCommitId),
      ]);
      const merged = mergeSnapshots(workspaceBase, branchHead, workspaceSnapshot);
      const resolutions = Array.isArray(body.resolutions) ? body.resolutions : [];
      const resolvedSnapshot = applyMergeResolutions(merged.snapshot, merged.conflicts, resolutions);
      if (!resolvedSnapshot) {
        return apiError(ErrorCodes.VALIDATION_ERROR, '请为每一处冲突选择保留内容', 400, {
          conflicts: merged.conflicts,
        });
      }
      const message = String(body.message || '').trim();
      if (message.length < 2) return apiError(ErrorCodes.VALIDATION_ERROR, '请填写提交说明', 400);
      try {
        const commit = await createRepositoryCommit({
          icebergId: iceberg.id,
          branchId: branch.id,
          expectedHeadCommitId: branch.headCommitId,
          snapshot: resolvedSnapshot,
          authorId: session.userId,
          message,
          source: 'MANUAL',
          afterCommit: async (tx, createdCommit) => {
            await tx.icebergPullRequest.updateMany({
              where: { icebergId: iceberg.id, headBranchId: branch.id, status: 'OPEN' },
              data: { headCommitId: createdCommit.id },
            });
          },
        });
        return json(success({ ...commit, shortHash: commit.hash.slice(0, 8) }), 201);
      } catch (err) {
        if (err instanceof Error && err.message === 'BRANCH_BEHIND') {
          return apiError('BRANCH_BEHIND', '分支在解决冲突期间又有了新提交，请重新比较', 409);
        }
        throw err;
      }
    }

    if (body.action === 'commit' || body.action === 'revert') {
      const branch = await db.icebergBranch.findFirst({
        where: { id: body.branchId, icebergId: iceberg.id, archivedAt: null },
      });
      if (!branch) return apiError(ErrorCodes.NOT_FOUND, '分支不存在', 404);
      if (role === 'PROPOSER' && branch.createdById !== session.userId) {
        return apiError(ErrorCodes.FORBIDDEN, '提案者只能提交自己的分支', 403);
      }
      if (branch.protected && role !== 'MAINTAINER') {
        return apiError(ErrorCodes.FORBIDDEN, '贡献者不能直接提交主版本', 403);
      }
      let snapshot;
      let workspaceBaseCommitId: string | null = null;
      let automaticallyMerged = false;
      if (body.action === 'revert') {
        const target = await db.icebergCommit.findFirst({
          where: { id: body.commitId, icebergId: iceberg.id },
        });
        if (!target) return apiError(ErrorCodes.NOT_FOUND, '待恢复提交不存在', 404);
        snapshot = await getSnapshotForCommit(target.id);
      } else {
        const workingCopy = await db.icebergWorkingCopy.findUnique({
          where: { branchId_userId: { branchId: branch.id, userId: session.userId } },
        });
        if (!workingCopy) return apiError(ErrorCodes.BAD_REQUEST, '当前分支没有待提交改动', 400);
        if (Number(body.revision) !== workingCopy.revision) {
          return apiError('WORKSPACE_CONFLICT', '工作副本已更新，请重新载入后提交', 409);
        }
        snapshot = normalizeSnapshot(workingCopy.snapshot);
        workspaceBaseCommitId = workingCopy.baseCommitId;
      }
      if (!snapshot) return apiError(ErrorCodes.VALIDATION_ERROR, '提交内容无效', 400);
      let expectedHeadCommitId = String(body.expectedHeadCommitId || branch.headCommitId);
      if (body.action === 'commit' && workspaceBaseCommitId !== branch.headCommitId) {
        const [workspaceBase, branchHead] = await Promise.all([
          getSnapshotForCommit(workspaceBaseCommitId!),
          getSnapshotForCommit(branch.headCommitId),
        ]);
        const merged = mergeSnapshots(workspaceBase, branchHead, snapshot);
        if (merged.conflicts.length) {
          return apiError('MERGE_CONFLICT', '分支已有新提交，并且自动合并发现冲突', 409, {
            conflicts: merged.conflicts,
            preview: merged.snapshot,
            baseCommitId: workspaceBaseCommitId,
            headCommitId: branch.headCommitId,
          });
        }
        snapshot = merged.snapshot;
        expectedHeadCommitId = branch.headCommitId;
        automaticallyMerged = true;
      }
      const message = String(body.message || (body.action === 'revert' ? '恢复历史版本' : '')).trim();
      if (message.length < 2) return apiError(ErrorCodes.VALIDATION_ERROR, '请填写提交说明', 400);
      try {
        const commit = await createRepositoryCommit({
          icebergId: iceberg.id,
          branchId: branch.id,
          expectedHeadCommitId,
          snapshot,
          authorId: session.userId,
          message,
          source: body.action === 'revert' ? 'REVERT' : (body.source === 'IMPORT' ? 'IMPORT' : 'MANUAL'),
          afterCommit: async (tx, createdCommit) => {
            await tx.icebergPullRequest.updateMany({
              where: { icebergId: iceberg.id, headBranchId: branch.id, status: 'OPEN' },
              data: { headCommitId: createdCommit.id },
            });
          },
        });
        return json(success({
          ...commit,
          shortHash: commit.hash.slice(0, 8),
          automaticallyMerged,
        }), 201);
      } catch (err) {
        if (err instanceof Error && err.message === 'BRANCH_BEHIND') {
          return apiError('BRANCH_BEHIND', '分支已有新提交，请先合并或载入最新版本', 409);
        }
        throw err;
      }
    }

    if (body.action === 'create-pull') {
      const head = await db.icebergBranch.findFirst({
        where: { id: body.headBranchId, icebergId: iceberg.id, archivedAt: null },
      });
      const base = await db.icebergBranch.findFirst({
        where: { id: body.baseBranchId || main.id, icebergId: iceberg.id, archivedAt: null },
      });
      if (!head || !base || head.id === base.id) return apiError(ErrorCodes.BAD_REQUEST, '分支选择无效', 400);
      if (role !== 'MAINTAINER' && head.createdById !== session.userId) {
        return apiError(ErrorCodes.FORBIDDEN, '只能提交自己创建的分支', 403);
      }
      if (role === 'PROPOSER') {
        if (!base.protected) {
          return apiError(ErrorCodes.FORBIDDEN, '外部提案只能合并到主版本', 403);
        }
        const settings = await prisma.systemSettings.findMany({
          where: {
            key: {
              in: [
                'external_pr_per_iceberg_limit',
                'external_pr_global_limit',
                'external_pr_daily_limit',
              ],
            },
          },
          select: { key: true, value: true },
        });
        const limits = Object.fromEntries(settings.map((setting) =>
          [setting.key, Math.max(1, Number(setting.value) || 1)]));
        const dailySince = new Date(Date.now() - 86_400_000);
        const [openHere, openGlobal, createdToday] = await Promise.all([
          db.icebergPullRequest.count({
            where: { icebergId: iceberg.id, authorId: session.userId, status: 'OPEN' },
          }),
          db.icebergPullRequest.count({
            where: { authorId: session.userId, status: 'OPEN' },
          }),
          db.icebergPullRequest.count({
            where: { authorId: session.userId, createdAt: { gte: dailySince } },
          }),
        ]);
        if (openHere >= (limits.external_pr_per_iceberg_limit ?? 3)
          || openGlobal >= (limits.external_pr_global_limit ?? 10)
          || createdToday >= (limits.external_pr_daily_limit ?? 10)) {
          return apiError(ErrorCodes.RATE_LIMITED, '外部提案数量已达上限，请先处理已有合并请求', 429);
        }
      }
      const duplicate = await db.icebergPullRequest.findFirst({
        where: { icebergId: iceberg.id, headBranchId: head.id, status: 'OPEN' },
      });
      if (duplicate) return apiError(ErrorCodes.CONFLICT, '该分支已有开放的合并请求', 409, { number: duplicate.number });
      const pull = await prisma.$transaction(async (rawTx) => {
        const tx = rawTx as any;
        const counter = await tx.iceberg.update({
          where: { id: iceberg.id },
          data: { nextPullNumber: { increment: 1 } },
          select: { nextPullNumber: true },
        });
        return tx.icebergPullRequest.create({
          data: {
            icebergId: iceberg.id,
            number: counter.nextPullNumber - 1,
            title: String(body.title || head.title).trim().slice(0, 160),
            body: String(body.body || '').trim().slice(0, 20_000) || null,
            baseBranchId: base.id,
            headBranchId: head.id,
            baseCommitId: base.headCommitId,
            headCommitId: head.headCommitId,
            authorId: session.userId,
          },
        });
      });
      await notify(iceberg.authorId, 'iceberg_pull_opened',
        `《${iceberg.title}》收到新的合并请求 #${pull.number}`,
        pull.title, `/iceberg/${iceberg.slug}/collaboration?pull=${pull.number}`);
      return json(success(pull), 201);
    }

    if (body.action === 'review') {
      if (role !== 'MAINTAINER') return apiError(ErrorCodes.FORBIDDEN, '只有维护者可以审阅', 403);
      const pull = await db.icebergPullRequest.findUnique({
        where: { icebergId_number: { icebergId: iceberg.id, number: Number(body.number) } },
      });
      if (!pull || pull.status !== 'OPEN') return apiError(ErrorCodes.NOT_FOUND, '开放的合并请求不存在', 404);
      const state = String(body.state);
      if (!['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED'].includes(state)) {
        return apiError(ErrorCodes.BAD_REQUEST, '审阅状态无效', 400);
      }
      if (state === 'DISMISSED') {
        const reason = String(body.body || '').trim();
        if (reason.length < 2) {
          return apiError(ErrorCodes.VALIDATION_ERROR, '解除“要求修改”时必须填写理由', 400);
        }
        const targetReview = await db.icebergPullReview.findFirst({
          where: {
            id: body.reviewId,
            pullRequestId: pull.id,
            state: 'CHANGES_REQUESTED',
            dismissedAt: null,
          },
        });
        if (!targetReview) return apiError(ErrorCodes.NOT_FOUND, '待解除的审阅不存在', 404);
        const dismissed = await db.icebergPullReview.update({
          where: { id: targetReview.id },
          data: {
            dismissedById: session.userId,
            dismissedAt: new Date(),
            dismissReason: reason.slice(0, 20_000),
          },
        });
        await notify(pull.authorId, 'iceberg_pull_review_dismissed',
          `合并请求 #${pull.number} 的“要求修改”已解除`,
          reason, `/iceberg/${iceberg.slug}/collaboration?pull=${pull.number}`);
        return json(success(dismissed), 200);
      }
      const reviewBody = String(body.body || '').trim().slice(0, 20_000) || null;
      const reviewResult = await db.$transaction(async (tx: any) => {
        // Serialize decisions for one PR so a double-click or two tabs cannot
        // create two approvals before either request sees the other.
        await tx.$queryRaw`
          SELECT "id"
          FROM "iceberg_pull_requests"
          WHERE "id" = ${pull.id}
          FOR UPDATE
        `;
        const lockedPull = await tx.icebergPullRequest.findUnique({
          where: { id: pull.id },
        });
        if (!lockedPull || lockedPull.status !== 'OPEN') return null;

        if (state === 'APPROVED' || state === 'CHANGES_REQUESTED') {
          const currentDecisions = await tx.icebergPullReview.findMany({
            where: {
              pullRequestId: lockedPull.id,
              reviewerId: session.userId,
              headCommitId: lockedPull.headCommitId,
              state: { in: ['APPROVED', 'CHANGES_REQUESTED'] },
              dismissedAt: null,
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          });
          const latestDecision = currentDecisions[0];

          if (latestDecision?.state === state) {
            // Repair duplicate active decisions produced by older versions,
            // while keeping the newest record as the effective decision.
            if (currentDecisions.length > 1) {
              await tx.icebergPullReview.updateMany({
                where: { id: { in: currentDecisions.slice(1).map((item: any) => item.id) } },
                data: {
                  dismissedById: session.userId,
                  dismissedAt: new Date(),
                  dismissReason: '重复审阅已由系统合并',
                },
              });
            }
            return { review: latestDecision, alreadyReviewed: true };
          }

          if (currentDecisions.length) {
            await tx.icebergPullReview.updateMany({
              where: { id: { in: currentDecisions.map((item: any) => item.id) } },
              data: {
                dismissedById: session.userId,
                dismissedAt: new Date(),
                dismissReason: state === 'APPROVED'
                  ? '审阅者已改为批准当前版本'
                  : '审阅者已改为要求修改当前版本',
              },
            });
          }
        }

        const review = await tx.icebergPullReview.create({
          data: {
            pullRequestId: lockedPull.id,
            reviewerId: session.userId,
            state,
            body: reviewBody,
            headCommitId: lockedPull.headCommitId,
          },
        });
        return { review, alreadyReviewed: false };
      });
      if (!reviewResult) return apiError(ErrorCodes.NOT_FOUND, '开放的合并请求不存在', 404);
      const { review, alreadyReviewed } = reviewResult;
      if (alreadyReviewed) {
        return json(success({ ...review, alreadyReviewed: true }), 200);
      }
      if (pull.authorId !== session.userId) {
        await recordContributionEvent({
          idempotencyKey: `pull-review:${review.id}`,
          userId: session.userId,
          type: CONTRIBUTION_EVENT_TYPES.PULL_REVIEW_SUBMITTED,
          dimension: 'REVIEW',
          resourceType: 'pull-review',
          resourceId: review.id,
          icebergId: iceberg.id,
          projectId: iceberg.projectId,
          metadata: { pullRequestId: pull.id, state },
        });
        evaluateReviewerEligibility(session.userId).catch(() => {});
        checkAchievements(session.userId, { type: 'review' }).catch(() => {});
      }
      await notify(pull.authorId, state === 'APPROVED' ? 'iceberg_pull_approved' : 'iceberg_pull_reviewed',
        `合并请求 #${pull.number}${state === 'APPROVED' ? ' 已获批准' : ' 有新的审阅意见'}`,
        review.body || undefined, `/iceberg/${iceberg.slug}/collaboration?pull=${pull.number}`);
      return json(success({ ...review, alreadyReviewed: false }), 201);
    }

    if (body.action === 'comment') {
      const pull = await db.icebergPullRequest.findUnique({
        where: { icebergId_number: { icebergId: iceberg.id, number: Number(body.number) } },
      });
      if (!pull || pull.status !== 'OPEN') return apiError(ErrorCodes.NOT_FOUND, '开放的合并请求不存在', 404);
      if (role === 'PROPOSER' && pull.authorId !== session.userId) {
        return apiError(ErrorCodes.FORBIDDEN, '提案者只能参与自己的合并请求', 403);
      }
      const commentBody = String(body.body || '').trim();
      if (!commentBody) return apiError(ErrorCodes.VALIDATION_ERROR, '评论不能为空', 400);
      const comment = await db.icebergPullComment.create({
        data: {
          pullRequestId: pull.id,
          authorId: session.userId,
          commitId: pull.headCommitId,
          path: typeof body.path === 'string' ? body.path.slice(0, 300) : null,
          entityId: typeof body.entityId === 'string' ? body.entityId.slice(0, 160) : null,
          field: typeof body.field === 'string' ? body.field.slice(0, 80) : null,
          body: commentBody.slice(0, 20_000),
        },
      });
      if (pull.authorId !== session.userId) {
        await notify(pull.authorId, 'iceberg_pull_comment',
          `合并请求 #${pull.number} 有新评论`, comment.body,
          `/iceberg/${iceberg.slug}/collaboration?pull=${pull.number}`);
      }
      return json(success(comment), 201);
    }

    if (body.action === 'resolve-comment') {
      const comment = await db.icebergPullComment.findUnique({
        where: { id: body.commentId },
        include: { pullRequest: true },
      });
      if (!comment || comment.pullRequest.icebergId !== iceberg.id) {
        return apiError(ErrorCodes.NOT_FOUND, '评论不存在', 404);
      }
      if (role !== 'MAINTAINER' && comment.authorId !== session.userId) {
        return apiError(ErrorCodes.FORBIDDEN, '无权解决该讨论', 403);
      }
      const updated = await db.icebergPullComment.update({
        where: { id: comment.id },
        data: { resolvedAt: new Date(), resolvedById: session.userId },
      });
      return json(success(updated), 200);
    }

    if (body.action === 'merge') {
      if (role !== 'MAINTAINER') return apiError(ErrorCodes.FORBIDDEN, '只有维护者可以合并', 403);
      const pull = await db.icebergPullRequest.findUnique({
        where: { icebergId_number: { icebergId: iceberg.id, number: Number(body.number) } },
      });
      if (!pull || pull.status !== 'OPEN') return apiError(ErrorCodes.NOT_FOUND, '开放的合并请求不存在', 404);
      const [baseBranch, headBranch] = await Promise.all([
        db.icebergBranch.findUnique({ where: { id: pull.baseBranchId } }),
        db.icebergBranch.findUnique({ where: { id: pull.headBranchId } }),
      ]);
      if (!baseBranch || !headBranch || headBranch.archivedAt) {
        return apiError(ErrorCodes.CONFLICT, '合并分支已失效', 409);
      }
      const activeReviews = await db.icebergPullReview.findMany({
        where: { pullRequestId: pull.id, dismissedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      const latestByReviewer = new Map<string, any>();
      for (const review of activeReviews) if (!latestByReviewer.has(review.reviewerId)) {
        latestByReviewer.set(review.reviewerId, review);
      }
      const latestReviews = [...latestByReviewer.values()];
      if (latestReviews.some((review) => review.state === 'CHANGES_REQUESTED')) {
        return apiError('REVIEW_REQUIRED', '仍有维护者要求修改，暂时不能合并', 409);
      }
      const authorMaintainer = await isMaintainerUser(iceberg, pull.authorId);
      if (!authorMaintainer) {
        let approved = false;
        for (const review of latestReviews.filter((item) =>
          item.state === 'APPROVED' && item.headCommitId === headBranch.headCommitId)) {
          if (await isMaintainerUser(iceberg, review.reviewerId)) { approved = true; break; }
        }
        if (!approved) return apiError('REVIEW_REQUIRED', '贡献者的合并请求需要一名维护者批准', 409);
      }
      const ancestorId = await findCommonAncestor(baseBranch.headCommitId, headBranch.headCommitId);
      if (!ancestorId) return apiError('MERGE_CONFLICT', '找不到共同版本，无法自动合并', 409);
      const [ancestor, baseSnapshot, headSnapshot] = await Promise.all([
        getSnapshotForCommit(ancestorId),
        getSnapshotForCommit(baseBranch.headCommitId),
        getSnapshotForCommit(headBranch.headCommitId),
      ]);
      const merged = mergeSnapshots(ancestor, baseSnapshot, headSnapshot);
      if (merged.conflicts.length) {
        return apiError('MERGE_CONFLICT', '存在需要人工处理的内容冲突', 409, {
          conflicts: merged.conflicts,
          preview: merged.snapshot,
          baseHeadCommitId: baseBranch.headCommitId,
          headCommitId: headBranch.headCommitId,
        });
      }
      try {
        const commit = await createRepositoryCommit({
          icebergId: iceberg.id,
          branchId: baseBranch.id,
          expectedHeadCommitId: baseBranch.headCommitId,
          snapshot: merged.snapshot,
          authorId: session.userId,
          message: `合并 #${pull.number}：${pull.title}`,
          source: 'MERGE',
          secondParentId: headBranch.headCommitId,
          materializeMain: baseBranch.normalizedName === DEFAULT_BRANCH_NAME,
          afterCommit: async (tx, createdCommit) => {
            const claimedPull = await tx.icebergPullRequest.updateMany({
              where: {
                id: pull.id,
                status: 'OPEN',
                headCommitId: headBranch.headCommitId,
              },
              data: {
                status: 'MERGED',
                mergeCommitId: createdCommit.id,
                mergedById: session.userId,
                mergedAt: new Date(),
              },
            });
            if (claimedPull.count !== 1) throw new Error('PULL_CHANGED');
            await tx.icebergBranch.update({
              where: { id: headBranch.id },
              data: { archivedAt: new Date() },
            });
            await recordContributionEvent({
              idempotencyKey: `pull-merged:${pull.id}`,
              userId: pull.authorId,
              type: CONTRIBUTION_EVENT_TYPES.PULL_REQUEST_MERGED,
              dimension: 'COLLABORATION',
              resourceType: 'pull-request',
              resourceId: pull.id,
              icebergId: iceberg.id,
              projectId: iceberg.projectId,
              metadata: {
                pullNumber: pull.number,
                mergeCommitId: createdCommit.id,
                mergedById: session.userId,
              },
            }, tx);
          },
        });
        evaluateReviewerEligibility(pull.authorId).catch(() => {});
        checkAchievements(pull.authorId, { type: 'contribution' }).catch(() => {});
        await notify(pull.authorId, 'iceberg_pull_merged',
          `合并请求 #${pull.number} 已合并`, pull.title,
          `/iceberg/${iceberg.slug}/collaboration?pull=${pull.number}`);
        return json(success({ commit, pullNumber: pull.number }), 200);
      } catch (err) {
        if (err instanceof Error && err.message === 'BRANCH_BEHIND') {
          return apiError('BRANCH_BEHIND', '主版本刚刚有新提交，请重新检查后合并', 409);
        }
        if (err instanceof Error && err.message === 'PULL_CHANGED') {
          return apiError(ErrorCodes.CONFLICT, '合并请求刚刚发生变化，请刷新后重试', 409);
        }
        throw err;
      }
    }

    if (body.action === 'invite') {
      if (role !== 'MAINTAINER') return apiError(ErrorCodes.FORBIDDEN, '只有维护者可以邀请协作者', 403);
      const target = await prisma.user.findFirst({
        where: { username: { equals: String(body.username || '').trim(), mode: 'insensitive' } },
        select: { id: true, username: true, nickname: true },
      });
      if (!target) return apiError(ErrorCodes.NOT_FOUND, '未找到该用户', 404);
      if (target.id === iceberg.authorId) return apiError(ErrorCodes.BAD_REQUEST, '作者已经是维护者', 400);
      const collaboratorRole = body.role === 'MAINTAINER' ? 'MAINTAINER' : 'CONTRIBUTOR';
      const invitation = await db.icebergCollaborator.upsert({
        where: { icebergId_userId: { icebergId: iceberg.id, userId: target.id } },
        create: {
          icebergId: iceberg.id,
          userId: target.id,
          role: collaboratorRole,
          status: 'PENDING',
          invitedById: session.userId,
        },
        update: {
          role: collaboratorRole,
          status: 'PENDING',
          invitedById: session.userId,
          acceptedAt: null,
        },
      });
      await notify(target.id, 'iceberg_collaboration_invite',
        `你收到《${iceberg.title}》的协作邀请`,
        `角色：${collaboratorRole === 'MAINTAINER' ? '维护者' : '贡献者'}`,
        `/iceberg/${iceberg.slug}/collaboration`);
      return json(success({ ...invitation, user: target }), 201);
    }

    if (body.action === 'update-collaborator') {
      if (role !== 'MAINTAINER') return apiError(ErrorCodes.FORBIDDEN, '只有维护者可以管理协作者', 403);
      const collaborator = await db.icebergCollaborator.findFirst({
        where: { id: body.collaboratorId, icebergId: iceberg.id },
      });
      if (!collaborator) return apiError(ErrorCodes.NOT_FOUND, '协作者不存在', 404);
      if (body.block === true) {
        const blocked = await db.icebergCollaborator.update({
          where: { id: collaborator.id },
          data: { status: 'BLOCKED', acceptedAt: null },
        });
        return json(success(blocked), 200);
      }
      if (body.remove === true) {
        await db.icebergCollaborator.update({
          where: { id: collaborator.id },
          data: { status: 'DECLINED', acceptedAt: null },
        });
        return json(success({ removed: true }), 200);
      }
      const updated = await db.icebergCollaborator.update({
        where: { id: collaborator.id },
        data: { role: body.role === 'MAINTAINER' ? 'MAINTAINER' : 'CONTRIBUTOR' },
      });
      return json(success(updated), 200);
    }

    if (body.action === 'set-contribution-mode') {
      if (role !== 'MAINTAINER') {
        return apiError(ErrorCodes.FORBIDDEN, '只有维护者可以调整提案模式', 403);
      }
      const contributionMode = ['DEFAULT', 'OPEN', 'INVITE_ONLY'].includes(String(body.mode))
        ? String(body.mode)
        : null;
      if (!contributionMode) return apiError(ErrorCodes.VALIDATION_ERROR, '提案模式无效', 400);
      const updated = await prisma.iceberg.update({
        where: { id: iceberg.id },
        data: { contributionMode },
        select: { contributionMode: true },
      });
      return json(success(updated), 200);
    }

    if (body.action === 'archive-branch') {
      const branch = await db.icebergBranch.findFirst({
        where: { id: body.branchId, icebergId: iceberg.id, archivedAt: null },
      });
      if (!branch || branch.protected) return apiError(ErrorCodes.BAD_REQUEST, '该分支不能归档', 400);
      if (role === 'PROPOSER' && branch.createdById !== session.userId) {
        return apiError(ErrorCodes.FORBIDDEN, '提案者只能归档自己的分支', 403);
      }
      if (role !== 'MAINTAINER' && branch.createdById !== session.userId) {
        return apiError(ErrorCodes.FORBIDDEN, '无权归档该分支', 403);
      }
      await db.icebergBranch.update({ where: { id: branch.id }, data: { archivedAt: new Date() } });
      return json(success({ archived: true }), 200);
    }

    return apiError(ErrorCodes.BAD_REQUEST, '未知操作', 400);
  } catch (err) {
    console.error('[repository:post]', err);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Unique constraint')) return apiError(ErrorCodes.CONFLICT, '操作与其他请求冲突，请重试', 409);
    return apiError(ErrorCodes.INTERNAL_ERROR, '版本库操作失败', 500);
  }
}
