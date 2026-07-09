/**
 * POST /api/impeach/:id/vote
 * body: { vote: "SUPPORT" | "OPPOSE" | "ABSTAIN", comment?: string }
 * 支持改票（upsert）
 */
import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getImpeachWeight, canVoteOnImpeach } from '../../../../lib/impeach';
import { notify } from '../../../../lib/notify';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

  const { id } = event.params;
  if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少弹劾案 ID'), 400);
  const requestId = id;
  const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json().catch(() => ({}));
  const vote: string    = body.vote ?? '';
  const comment: string = (typeof body.comment === 'string' ? body.comment.trim() : '').slice(0, 300);

  if (!['SUPPORT', 'OPPOSE', 'ABSTAIN'].includes(vote)) {
    return json(error(ErrorCodes.BAD_REQUEST, 'vote 必须为 SUPPORT / OPPOSE / ABSTAIN'), 400);
  }

  const req = await prisma.impeachRequest.findUnique({
    where: { id },
    select: { id: true, status: true, targetUserId: true, targetRole: true, initiatedBy: true },
  });
  if (!req) return json(error(ErrorCodes.NOT_FOUND, '弹劾案不存在'), 404);
  if (req.status !== 'OPEN') return json(error(ErrorCodes.FORBIDDEN, '该弹劾案已结束'), 403);

  // 被弹劾人不可投票
  if (req.targetUserId === session.userId) {
    return json(error(ErrorCodes.FORBIDDEN, '被弹劾人不可投票'), 403);
  }

  // 权限检查
  if (!canVoteOnImpeach(session.role, session.isFounder, req.targetRole)) {
    return json(error(ErrorCodes.FORBIDDEN, '你没有对此弹劾案的投票资格'), 403);
  }

  const weight = getImpeachWeight(session.role, session.isFounder);

  // 查询投票者信息（用于通知）
  const voter = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { username: true, nickname: true },
  });

  const existing = await prisma.impeachVote.findUnique({
    where: { requestId_voterId: { requestId, voterId: session.userId } },
    select: { id: true },
  });

  await prisma.impeachVote.upsert({
    where: { requestId_voterId: { requestId, voterId: session.userId } },
    create: { requestId, voterId: session.userId, vote, weight, comment: comment || null },
    update: { vote, comment: comment || null },
  });

  // 首次投票时通知被弹劾人
  if (!existing) {
    const voterDisplay = voter?.nickname ?? voter?.username ?? '某用户';
    const VOTE_ZH: Record<string, string> = { SUPPORT: '支持', OPPOSE: '反对', ABSTAIN: '弃权' };
    notify(
      req.targetUserId,
      'impeach_vote',
      '弹劾案收到新投票',
      `${voterDisplay} 投了${VOTE_ZH[vote]}票`,
      `/impeach/${requestId}`,
    );
  }

  return json(success({ vote, weight }));
}

