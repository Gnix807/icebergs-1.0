/**
 * POST /api/elections/[id]/confirm
 * ADMIN/FOUNDER 确认选举结果，将票数最高的候选人晋升为 ADMIN
 * 同时将其余 RUNNING 候选人标为 DEFEATED，当选者标为 ELECTED
 *
 * body: { winnerId?: string }  — 可手动指定胜者；省略则取票数最高者
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

export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  if (session.role !== 'ADMIN' && !session.isFounder) {
    return json(error(ErrorCodes.FORBIDDEN, '需要管理员权限'), 403);
  }

  const { id: electionId } = event.params;
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    include: {
      candidates: { where: { status: 'RUNNING' } },
      votes: { select: { candidateId: true, weight: true } },
    },
  });
  if (!election) return json(error(ErrorCodes.NOT_FOUND, '选举不存在'), 404);
  if (election.status !== 'CLOSED') {
    return json(error(ErrorCodes.BAD_REQUEST, '只有已关闭的选举才可确认结果'), 400);
  }
  if (election.candidates.length === 0) {
    return json(error(ErrorCodes.BAD_REQUEST, '没有有效候选人'), 400);
  }

  const voteSums: Record<string, number> = {};
  for (const v of election.votes) {
    voteSums[v.candidateId] = (voteSums[v.candidateId] ?? 0) + v.weight;
  }

  let winnerCandidateId: string;
  const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json().catch(() => ({})) as { winnerId?: string };

  if (body.winnerId) {
    // 手动指定：验证该用户是 RUNNING 候选人
    const found = election.candidates.find(c => c.userId === body.winnerId);
    if (!found) return json(error(ErrorCodes.BAD_REQUEST, '指定用户不在候选人列表中'), 400);
    winnerCandidateId = found.id;
  } else {
    // 自动取票数最高者（并列取最早报名）
    const sorted = election.candidates
      .map(c => ({ ...c, votes: voteSums[c.id] ?? 0 }))
      .sort((a, b) => b.votes - a.votes || a.createdAt.getTime() - b.createdAt.getTime());
    winnerCandidateId = sorted[0].id;
  }

  const winnerCandidate = election.candidates.find(c => c.id === winnerCandidateId)!;
  const winnerId = winnerCandidate.userId;

  // ADMIN 席位上限检查
  const capSetting = await prisma.systemSettings.findUnique({ where: { key: 'admin_max' } });
  const cap = parseInt(capSetting?.value ?? '3', 10);
  const currentAdmins = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (currentAdmins >= cap) {
    return json(error(ErrorCodes.FORBIDDEN, `管理员席位已满（${cap} 人），请先在系统配置中调整 admin_max`), 403);
  }

  // 事务：更新选举 + 候选人状态 + 用户角色
  await prisma.$transaction([
    prisma.election.update({
      where: { id: electionId },
      data: { status: 'CONFIRMED', winnerId, confirmedAt: new Date() },
    }),
    prisma.electionCandidate.update({
      where: { id: winnerCandidateId },
      data: { status: 'ELECTED' },
    }),
    prisma.electionCandidate.updateMany({
      where: { electionId: electionId!, status: 'RUNNING', id: { not: winnerCandidateId } },
      data: { status: 'DEFEATED' },
    }),
    prisma.user.update({
      where: { id: winnerId },
      data: { role: 'ADMIN' },
    }),
  ]);

  // 通知当选者
  await notify(winnerId, 'promotion_approved',
    `恭喜！你在「${election.title}」中当选，已晋升为管理员`,
    `由 @${session.userId} 确认结果。`,
    `/elections/${electionId}`,
  );
  // 通知落选者
  for (const c of election.candidates) {
    if (c.id !== winnerCandidateId) {
      await notify(c.userId, 'warned',
        `「${election.title}」结果已公布`,
        `本次选举已由管理员确认结果，感谢参与。`,
        `/elections/${electionId}`,
      );
    }
  }

  return json(success({ electionId, winnerId }));
}

