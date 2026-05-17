/**
 * GET    /api/impeach/:id  — 弹劾案详情（含票数汇总）
 * DELETE /api/impeach/:id  — 撤销（仅发起人或 FOUNDER，OPEN 状态）
 */
import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { success, error, ErrorCodes } from '../../../../lib/api';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(event: APIContext) {
  const { id } = event.params;
  const req = await prisma.impeachRequest.findUnique({
    where: { id },
    select: {
      id: true, targetRole: true, reason: true,
      status: true, createdAt: true, closesAt: true, resolvedAt: true,
      targetUserId: true,
      target:    { select: { id: true, username: true, nickname: true, role: true, qualityScore: true } },
      initiator: { select: { id: true, username: true, nickname: true } },
      votes: {
        select: {
          id: true, vote: true, weight: true, comment: true, createdAt: true,
          voter: { select: { id: true, username: true, nickname: true, role: true, isFounder: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!req) return json(error(ErrorCodes.NOT_FOUND, '弹劾案不存在'), 404);

  const supportVotes  = req.votes.filter((v: any) => v.vote === 'SUPPORT');
  const opposeVotes   = req.votes.filter((v: any) => v.vote === 'OPPOSE');
  const abstainVotes  = req.votes.filter((v: any) => v.vote === 'ABSTAIN');
  const supportWeight = supportVotes.reduce((s: number, v: any) => s + v.weight, 0);
  const opposeWeight  = opposeVotes.reduce((s: number, v: any) => s + v.weight, 0);

  const summary = {
    supportCount: supportVotes.length,
    opposeCount:  opposeVotes.length,
    abstainCount: abstainVotes.length,
    supportWeight,
    opposeWeight,
    totalWeight: supportWeight + opposeWeight,
  };

  return json(success({ request: req, summary }));
}

export async function DELETE(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

  const { id } = event.params;
  const req = await prisma.impeachRequest.findUnique({
    where: { id },
    select: { id: true, status: true, initiatedBy: true },
  });
  if (!req) return json(error(ErrorCodes.NOT_FOUND, '弹劾案不存在'), 404);
  if (req.status !== 'OPEN') return json(error(ErrorCodes.FORBIDDEN, '只能撤销 OPEN 状态的弹劾案'), 403);
  if (req.initiatedBy !== session.userId && !session.isFounder) {
    return json(error(ErrorCodes.FORBIDDEN, '无权撤销'), 403);
  }

  await prisma.impeachRequest.update({
    where: { id },
    data: { status: 'CANCELLED', resolvedAt: new Date() },
  });

  return json(success({ cancelled: true }));
}

