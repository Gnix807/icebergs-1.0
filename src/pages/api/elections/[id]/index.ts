/**
 * GET   /api/elections/[id]  — 选举详情（公开）
 *   返回候选人列表 + 各候选人加权票数（投票期结束后可见明细）
 *
 * PATCH /api/elections/[id]  — 推进状态（ADMIN/FOUNDER）
 *   body: { action: 'start_voting' | 'close' }
 *   OPEN_APPLY → VOTING → CLOSED
 *   自动懒判断：若截止时间已过自动推进
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

/** 懒推进：若截止时间已过，自动更新 status */
async function maybeAdvance(election: { id: string; status: string; applyDeadline: Date; voteDeadline: Date }) {
  const now = new Date();
  if (election.status === 'OPEN_APPLY' && now >= election.applyDeadline) {
    await prisma.election.update({ where: { id: election.id }, data: { status: 'VOTING' } });
    return 'VOTING';
  }
  if (election.status === 'VOTING' && now >= election.voteDeadline) {
    await prisma.election.update({ where: { id: election.id }, data: { status: 'CLOSED' } });
    return 'CLOSED';
  }
  return election.status;
}

export async function GET(event: APIContext) {
  const { id } = event.params;
  const election = await prisma.election.findUnique({
    where: { id },
    include: {
      candidates: {
        include: { user: { select: { id: true, username: true, nickname: true, role: true } } },
      },
      votes: { select: { candidateId: true, weight: true } },
    },
  });
  if (!election) return json(error(ErrorCodes.NOT_FOUND, '选举不存在'), 404);

  const status = await maybeAdvance(election);

  // 候选人票数汇总
  const voteSums: Record<string, number> = {};
  for (const v of election.votes) {
    voteSums[v.candidateId] = (voteSums[v.candidateId] ?? 0) + v.weight;
  }

  // 投票期结束前不暴露票数（仅 CLOSED/CONFIRMED 后可见）
  const showVotes = status === 'CLOSED' || status === 'CONFIRMED';

  const candidates = election.candidates.map(c => ({
    id:        c.id,
    userId:    c.userId,
    username:  c.user.username,
    nickname:  c.user.nickname,
    role:      c.user.role,
    statement: c.statement,
    status:    c.status,
    votes:     showVotes ? (voteSums[c.id] ?? 0) : null,
    createdAt: c.createdAt,
  }));

  // 获取当前用户投票状态（需要 session，但不强制）
  const session = await getSession(event).catch(() => null);
  let myVote: string | null = null;
  if (session && (status === 'VOTING' || status === 'CLOSED' || status === 'CONFIRMED')) {
    const v = await prisma.electionVote.findUnique({
      where: { electionId_voterId: { electionId: id!, voterId: session.userId } },
    });
    myVote = v?.candidateId ?? null;
  }

  return json(success({
    election: {
      id:           election.id,
      title:        election.title,
      description:  election.description,
      status,
      applyDeadline: election.applyDeadline,
      voteDeadline:  election.voteDeadline,
      confirmedAt:   election.confirmedAt,
      winnerId:      election.winnerId,
      createdAt:     election.createdAt,
      totalVotes:    showVotes ? election.votes.length : null,
    },
    candidates,
    myVote,
  }));
}

export async function PATCH(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  if (session.role !== 'ADMIN' && !session.isFounder) {
    return json(error(ErrorCodes.FORBIDDEN, '需要管理员权限'), 403);
  }

  const { id } = event.params;
  const election = await prisma.election.findUnique({ where: { id } });
  if (!election) return json(error(ErrorCodes.NOT_FOUND, '选举不存在'), 404);

  const body = await event.request.json() as { action?: string };
  const { action } = body;

  let newStatus: string | null = null;
  if (action === 'start_voting') {
    if (election.status !== 'OPEN_APPLY') return json(error(ErrorCodes.BAD_REQUEST, '当前阶段无法开始投票'), 400);
    newStatus = 'VOTING';
  } else if (action === 'close') {
    if (election.status !== 'VOTING') return json(error(ErrorCodes.BAD_REQUEST, '当前阶段无法关闭投票'), 400);
    newStatus = 'CLOSED';
  } else {
    return json(error(ErrorCodes.BAD_REQUEST, '无效操作，可选：start_voting / close'), 400);
  }

  await prisma.election.update({ where: { id }, data: { status: newStatus } });
  return json(success({ id, status: newStatus }));
}

