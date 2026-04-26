/**
 * GET  /api/rfa/[id]  — 获取 RfA 详情（含投票列表）
 * DELETE /api/rfa/[id]  — 撤销自己的 OPEN 状态 RfA
 */
import type { APIEvent } from '@astrojs/node';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { success, error, ErrorCodes } from '../../../../lib/api';

const db = prisma;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(event: APIEvent) {
  const id = event.params.id!;
  const rfa = await db.rfaRequest.findUnique({
    where: { id },
    select: {
      id: true, statement: true, status: true,
      createdAt: true, closesAt: true, resolvedAt: true,
      user: { select: { id: true, username: true, nickname: true, qualityScore: true } },
      votes: {
        select: {
          id: true, vote: true, weight: true, comment: true, createdAt: true,
          voter: { select: { id: true, username: true, nickname: true, role: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!rfa) return json(error(ErrorCodes.NOT_FOUND, 'RfA 不存在'), 404);

  // 计算票数汇总
  const approveVotes  = rfa.votes.filter((v: any) => v.vote === 'APPROVE');
  const opposeVotes   = rfa.votes.filter((v: any) => v.vote === 'OPPOSE');
  const abstainVotes  = rfa.votes.filter((v: any) => v.vote === 'ABSTAIN');
  const approveWeight = approveVotes.reduce((s: number, v: any) => s + v.weight, 0);
  const opposeWeight  = opposeVotes.reduce((s: number, v: any) => s + v.weight, 0);

  return json(success({
    rfa: {
      ...rfa,
      summary: {
        approveCount: approveVotes.length,
        opposeCount:  opposeVotes.length,
        abstainCount: abstainVotes.length,
        approveWeight,
        opposeWeight,
        totalWeight: approveWeight + opposeWeight,
      },
    },
  }));
}

export async function DELETE(event: APIEvent) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

  const id = event.params.id!;
  const rfa = await db.rfaRequest.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });

  if (!rfa) return json(error(ErrorCodes.NOT_FOUND, 'RfA 不存在'), 404);
  if (rfa.userId !== session.userId)
    return json(error(ErrorCodes.FORBIDDEN, '只能撤销自己的申请'), 403);
  if (rfa.status !== 'OPEN')
    return json(error(ErrorCodes.CONFLICT, '只能撤销进行中的申请'), 409);

  await db.rfaRequest.update({
    where: { id },
    data: { status: 'CANCELLED', resolvedAt: new Date() },
  });

  return json(success(null));
}
