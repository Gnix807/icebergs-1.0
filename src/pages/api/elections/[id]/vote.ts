/**
 * POST /api/elections/[id]/vote
 * 加权投票，每次选举每用户只能投一票（可换票）
 * body: { candidateId: string }
 *
 * 投票权重：USER=1 CONTRIBUTOR=2 EDITOR=3 MODERATOR=5 ADMIN=7
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

const VOTE_WEIGHTS: Record<string, number> = {
  USER: 1, CONTRIBUTOR: 2, EDITOR: 3, MODERATOR: 5, ADMIN: 7,
};

export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

  const { id: electionId } = event.params;
  const election = await prisma.election.findUnique({ where: { id: electionId } });
  if (!election) return json(error(ErrorCodes.NOT_FOUND, '选举不存在'), 404);
  if (election.status !== 'VOTING') {
    return json(error(ErrorCodes.BAD_REQUEST, '当前不在投票阶段'), 400);
  }
  // 懒检查截止时间
  if (new Date() >= election.voteDeadline) {
    await prisma.election.update({ where: { id: electionId }, data: { status: 'CLOSED' } });
    return json(error(ErrorCodes.BAD_REQUEST, '投票已截止'), 400);
  }

  // 投票者资格
  const voter = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { status: true, createdAt: true },
  });
  if (!voter || voter.status !== 'ACTIVE') {
    return json(error(ErrorCodes.FORBIDDEN, '账户受限，无法投票'), 403);
  }

  const minDaySetting = await prisma.systemSettings.findUnique({ where: { key: 'election_vote_min_days' } });
  const minDays = parseInt(minDaySetting?.value ?? '3', 10);
  const ageDays = (Date.now() - voter.createdAt.getTime()) / 86400_000;
  if (ageDays < minDays) {
    return json(error(ErrorCodes.FORBIDDEN, `账号注册不足 ${minDays} 天，暂无投票资格`), 403);
  }

  const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json().catch(() => ({})) as { candidateId?: string };
  const { candidateId } = body;
  if (!candidateId) return json(error(ErrorCodes.BAD_REQUEST, '缺少 candidateId'), 400);

  // 验证候选人
  const candidate = await prisma.electionCandidate.findUnique({ where: { id: candidateId } });
  if (!candidate || candidate.electionId !== electionId || candidate.status !== 'RUNNING') {
    return json(error(ErrorCodes.NOT_FOUND, '候选人不存在或已退选'), 404);
  }
  // 不能给自己投票
  if (candidate.userId === session.userId) {
    return json(error(ErrorCodes.BAD_REQUEST, '不能给自己投票'), 400);
  }

  const weight = VOTE_WEIGHTS[session.role] ?? 1;

  await prisma.electionVote.upsert({
    where: { electionId_voterId: { electionId: electionId!, voterId: session.userId } },
    create: { electionId: electionId!, voterId: session.userId, candidateId, weight },
    update: { candidateId, weight },
  });

  return json(success({ message: '投票成功', weight }));
}

