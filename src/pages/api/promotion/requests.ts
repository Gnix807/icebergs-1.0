/**
 * GET  /api/promotion/requests        EDITOR/ADMIN — list pending requests (lazy-expire)
 * PUT  /api/promotion/requests/[id]   EDITOR/ADMIN — approve or reject
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { can } from '../../../lib/permissions';
import { logScore } from '../../../lib/scoreLog';
import { legacyGovernanceWritesEnabled } from '../../../lib/governance';

export async function GET(event: APIContext) {
  const dataParam = event.url.searchParams.get('data');
  if (dataParam) {
    if (!await legacyGovernanceWritesEnabled()) {
      return json(error(ErrorCodes.LEGACY_GOVERNANCE_RETIRED, '角色晋升流程已转为只读历史'), 409);
    }

    try {
      const session = await getSession(event);
      if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
      if (!can(session, 'user:warn')) return json(error(ErrorCodes.FORBIDDEN, '需要编辑权限'), 403);

      const url = new URL(event.request.url);
      const id = url.pathname.split('/').pop();
      if (!id || id === 'requests') return json(error(ErrorCodes.BAD_REQUEST, '缺少申请 ID'), 400);

      const body = JSON.parse(dataParam || '{}') as { action?: string; note?: string };
      const { action, note } = body;
      if (action !== 'approve' && action !== 'reject') {
        return json(error(ErrorCodes.BAD_REQUEST, 'action 必须为 approve 或 reject'), 400);
      }
      if (action === 'reject' && (!note || note.trim().length < 3)) {
        return json(error(ErrorCodes.BAD_REQUEST, '拒绝时必须填写理由'), 400);
      }

      const req = await prisma.promotionRequest.findUnique({
        where: { id },
        include: { user: { select: { id: true, role: true } } },
      });
      if (!req) return json(error(ErrorCodes.NOT_FOUND, '申请不存在'), 404);
      if (req.status !== 'PENDING') {
        return json(error(ErrorCodes.BAD_REQUEST, `申请状态为「${req.status}」，无法操作`), 400);
      }

      const now = new Date();

      if (action === 'approve') {
        await prisma.$transaction([
          prisma.promotionRequest.update({
            where: { id },
            data: { status: 'APPROVED', reviewedBy: session.userId, reviewedAt: now },
          }),
          prisma.user.update({
            where: { id: req.userId },
            data: { role: req.targetRole, qualityScore: { increment: 10 } },
          }),
        ]);
        logScore(req.userId, 10, 'promoted', `晋升至 ${req.targetRole}`);
      } else {
        await prisma.promotionRequest.update({
          where: { id },
          data: { status: 'REJECTED', reviewedBy: session.userId, reviewNote: note!.trim(), reviewedAt: now },
        });
      }

      return json(success({ action, requestId: id }), 200);
    } catch (err) {
      console.error('审批晋升申请失败:', err);
      return json(error(ErrorCodes.INTERNAL_ERROR, '操作失败'), 500);
    }

  }

  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'user:warn')) return json(error(ErrorCodes.FORBIDDEN, '需要编辑权限'), 403);

    const now = new Date();

    // Lazy-expire: mark overdue PENDING requests as EXPIRED
    await prisma.promotionRequest.updateMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      data:  { status: 'EXPIRED' },
    });

    const requests = await prisma.promotionRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true, username: true, nickname: true,
            qualityScore: true, createdAt: true, role: true, status: true,
            _count: { select: { icebergs: true } },
          },
        },
      },
    });

    return json(success({ requests, total: requests.length }), 200);
  } catch (err) {
    console.error('获取晋升申请失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '获取失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
