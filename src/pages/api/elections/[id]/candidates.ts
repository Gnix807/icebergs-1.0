/**
 * POST   /api/elections/[id]/candidates  — 报名参选（EDITOR / MODERATOR）
 *   body: { statement? }
 * DELETE /api/elections/[id]/candidates  — 撤回参选（本人或 ADMIN/FOUNDER）
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { notify } from '../../../../lib/notify';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

  const { id: electionId } = event.params;
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) return json(error(ErrorCodes.NOT_FOUND, '选举不存在'), 404);
  if (election.status !== 'OPEN_APPLY') {
    return json(error(ErrorCodes.BAD_REQUEST, '申请期已结束'), 400);
  }

  // 候选人资格：EDITOR 或 MODERATOR，账号 ACTIVE
  if (!['EDITOR', 'MODERATOR'].includes(session.role)) {
    return json(error(ErrorCodes.FORBIDDEN, '仅 EDITOR / MODERATOR 可参选'), 403);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { status: true, createdAt: true },
  });
  if (!user || user.status !== 'ACTIVE') {
    return json(error(ErrorCodes.FORBIDDEN, '账户受限，无法参选'), 403);
  }

  // 账龄检查
  const minDaySetting = await prisma.systemSettings.findUnique({ where: { key: 'election_candidate_min_days' } });
  const minDays = parseInt(minDaySetting?.value ?? '30', 10);
  const ageDays = (Date.now() - user.createdAt.getTime()) / 86400_000;
  if (ageDays < minDays) {
    return json(error(ErrorCodes.FORBIDDEN, `注册时间不足（需 ${minDays} 天，还差 ${Math.ceil(minDays - ageDays)} 天）`), 403);
  }

  // 重复检查
  const existing = await prisma.electionCandidate.findUnique({
    where: { electionId_userId: { electionId: electionId!, userId: session.userId } },
  });
  if (existing) {
    if (existing.status === 'WITHDRAWN') {
      // 重新激活
      await prisma.electionCandidate.update({
        where: { id: existing.id },
        data: { status: 'RUNNING' },
      });
      return json(success({ message: '已重新报名' }), 200);
    }
    return json(error(ErrorCodes.BAD_REQUEST, '你已经报名了'), 400);
  }

  const body = await event.request.json().catch(() => ({})) as { statement?: string };
  const statement = body.statement?.trim().slice(0, 500) || null;

  const candidate = await prisma.electionCandidate.create({
    data: { electionId: electionId!, userId: session.userId, statement },
  });

  notify(
    session.userId,
    'election_candidate_registered',
    '报名参选成功',
    '你已成功报名参选，等待报名期结束后进入投票阶段。',
    `/elections/${electionId}`,
  );

  return json(success({ candidate }), 201);
}

export async function DELETE(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

  const { id: electionId } = event.params;
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) return json(error(ErrorCodes.NOT_FOUND, '选举不存在'), 404);
  if (election.status !== 'OPEN_APPLY') {
    return json(error(ErrorCodes.BAD_REQUEST, '申请期已结束，无法撤回'), 400);
  }

  const body = await event.request.json().catch(() => ({})) as { userId?: string };
  // 管理员可以撤销任意候选人；普通用户只能撤自己
  const targetUserId = (session.role === 'ADMIN' || session.isFounder)
    ? (body.userId ?? session.userId)
    : session.userId;

  const candidate = await prisma.electionCandidate.findUnique({
    where: { electionId_userId: { electionId: electionId!, userId: targetUserId } },
  });
  if (!candidate) return json(error(ErrorCodes.NOT_FOUND, '未找到该候选人'), 404);

  await prisma.electionCandidate.update({
    where: { id: candidate.id },
    data: { status: 'WITHDRAWN' },
  });

  notify(
    targetUserId,
    'election_candidate_withdrawn',
    '参选已撤回',
    '你已撤回本次选举的参选资格。',
    `/elections/${electionId}`,
  );

  return json(success({ message: '已撤回参选' }));
}

