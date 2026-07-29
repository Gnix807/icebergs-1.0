/**
 * GET  /api/impeach  — 列出所有 OPEN 弹劾案（公开）
 * POST /api/impeach  — 发起弹劾（ADMIN/FOUNDER 对 MODERATOR；FOUNDER 对 ADMIN）
 */
import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { success, error, ErrorCodes } from '../../../lib/api';
import { getImpeachSettings } from '../../../lib/impeach';
import { notify } from '../../../lib/notify';
import { legacyGovernanceWritesEnabled } from '../../../lib/governance';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(event: APIContext) {
  const dataParam = event.url.searchParams.get('data');
  if (dataParam) {
    if (!await legacyGovernanceWritesEnabled()) {
      return json(error(ErrorCodes.LEGACY_GOVERNANCE_RETIRED, '角色弹劾已转为证据化能力复核'), 409);
    }

    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

    const body = JSON.parse(dataParam || '{}');
    const targetUserId: string = body.targetUserId?.trim() ?? '';
    const reason: string       = (typeof body.reason === 'string' ? body.reason.trim() : '').slice(0, 1000);

    if (!targetUserId) return json(error(ErrorCodes.BAD_REQUEST, '缺少 targetUserId'), 400);
    if (!reason)       return json(error(ErrorCodes.BAD_REQUEST, '弹劾理由不能为空'), 400);

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, username: true, nickname: true, isFounder: true },
    });
    if (!target) return json(error(ErrorCodes.NOT_FOUND, '目标用户不存在'), 404);
    if (target.isFounder) return json(error(ErrorCodes.FORBIDDEN, 'FOUNDER 不可被弹劾'), 403);

    const targetRole = target.role;

    // 权限检查
    if (targetRole === 'ADMIN') {
      if (!session.isFounder) return json(error(ErrorCodes.FORBIDDEN, '仅 FOUNDER 可发起对 ADMIN 的弹劾'), 403);
    } else if (targetRole === 'MODERATOR') {
      if (!session.isFounder && session.role !== 'ADMIN') {
        return json(error(ErrorCodes.FORBIDDEN, '仅 ADMIN 或 FOUNDER 可发起对 MODERATOR 的弹劾'), 403);
      }
    } else {
      return json(error(ErrorCodes.BAD_REQUEST, '只能弹劾 MODERATOR 或 ADMIN'), 400);
    }

    // 不能弹劾自己
    if (targetUserId === session.userId) return json(error(ErrorCodes.BAD_REQUEST, '不能弹劾自己'), 400);

    // 检查是否已有 OPEN 的弹劾
    const existing = await prisma.impeachRequest.findFirst({
      where: { targetUserId, status: 'OPEN' },
      select: { id: true },
    });
    if (existing) return json(error(ErrorCodes.FORBIDDEN, '该用户已有进行中的弹劾案'), 409);

    const settings = await getImpeachSettings();
    const closesAt = new Date(Date.now() + settings.voteDays * 86400_000);

    const req = await prisma.impeachRequest.create({
      data: { targetUserId, targetRole, initiatedBy: session.userId, reason, closesAt },
      select: { id: true, closesAt: true },
    });

    const targetDisplay = target.nickname ?? target.username;
    notify(
      targetUserId,
      'impeach_initiated',
      '你被发起弹劾',
      `弹劾理由：${reason.slice(0, 100)}${reason.length > 100 ? '…' : ''}`,
      `/impeach/${req.id}`,
    );

    return json(success({ request: req }), 201);

  }

  const requests = await prisma.impeachRequest.findMany({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, targetRole: true, reason: true,
      status: true, createdAt: true, closesAt: true,
      target:    { select: { id: true, username: true, nickname: true, role: true } },
      initiator: { select: { id: true, username: true, nickname: true } },
      _count: { select: { votes: true } },
    },
  });
  return json(success({ requests }));
}
