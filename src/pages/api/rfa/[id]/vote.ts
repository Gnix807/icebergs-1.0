/**
 * POST /api/rfa/[id]/vote  — 对 RfA 投票（CONTRIBUTOR+）
 * body: { vote: 'APPROVE' | 'OPPOSE' | 'ABSTAIN', comment?: string }
 * 重复投票视为修改；申请人不能给自己投票
 */
import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getRfaWeight } from '../../../../lib/rfa';
import { hasRole } from '../../../../lib/permissions';
import { notify } from '../../../../lib/notify';

const db = prisma;

const VALID_VOTES = new Set(['APPROVE', 'OPPOSE', 'ABSTAIN']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

  // 至少 CONTRIBUTOR 才能投票
  if (!hasRole(session.role, 'CONTRIBUTOR')) {
    return json(error(ErrorCodes.FORBIDDEN, '仅 CONTRIBUTOR 及以上可以投票'), 403);
  }
  if (['READ_ONLY', 'TEMP_BANNED', 'PERM_BANNED', 'WARNED_2'].includes(session.status)) {
    return json(error(ErrorCodes.FORBIDDEN, '当前账号状态不允许投票'), 403);
  }

  const id = event.params.id!;
  const rfa = await db.rfaRequest.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });

  if (!rfa) return json(error(ErrorCodes.NOT_FOUND, 'RfA 不存在'), 404);
  if (rfa.status !== 'OPEN') return json(error(ErrorCodes.FORBIDDEN, 'RfA 已关闭，无法投票'), 409);
  if (rfa.userId === session.userId)
    return json(error(ErrorCodes.FORBIDDEN, '不能给自己的申请投票'), 403);

  const body = await event.request.json().catch(() => ({}));
  const vote    = typeof body.vote    === 'string' ? body.vote.trim().toUpperCase()   : '';
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 300) : undefined;

  if (!VALID_VOTES.has(vote))
    return json(error(ErrorCodes.VALIDATION_ERROR, '无效的投票选项，可选：APPROVE / OPPOSE / ABSTAIN'), 400);

  const weight = getRfaWeight(session.role, session.isFounder ?? false);

  // upsert — 投过了就修改
  const existing = await db.rfaVote.findUnique({
    where: { requestId_voterId: { requestId: id, voterId: session.userId } },
    select: { id: true },
  });

  if (existing) {
    await db.rfaVote.update({
      where: { id: existing.id },
      data: { vote, weight, comment: comment ?? null },
    });
  } else {
    await db.rfaVote.create({
      data: {
        requestId: id,
        voterId:   session.userId,
        vote, weight,
        comment:   comment ?? null,
      },
    });
    // 首次投票时通知申请人（ABSTAIN 也通知，低噪声）
    const voter = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { username: true, nickname: true },
    });
    const voterName = voter?.nickname ?? voter?.username ?? '某用户';
    const voteLabel = vote === 'APPROVE' ? '支持' : vote === 'OPPOSE' ? '反对' : '弃权';
    notify(rfa.userId, 'rfa_vote', '你的 RfA 收到了一票', `${voterName} 投了${voteLabel}票`, `/rfa/${id}`);
  }

  return json(success({ vote, weight }), existing ? 200 : 201);
}

