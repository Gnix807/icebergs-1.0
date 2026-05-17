/**
 * PUT /api/promotion/[id]   EDITOR/ADMIN — approve or reject a request
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { can } from '../../../lib/permissions';
import { notify } from '../../../lib/notify';
import { logScore } from '../../../lib/scoreLog';

export async function PUT(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'user:warn')) return json(error(ErrorCodes.FORBIDDEN, '需要编辑权限'), 403);

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少申请 ID'), 400);

    const body = await event.request.json() as { action?: string; note?: string };
    const { action, note } = body;

    if (action !== 'approve' && action !== 'reject') {
      return json(error(ErrorCodes.BAD_REQUEST, 'action 必须为 approve 或 reject'), 400);
    }
    if (action === 'reject' && (!note || note.trim().length < 3)) {
      return json(error(ErrorCodes.BAD_REQUEST, '拒绝时必须填写理由'), 400);
    }

    const req = await prisma.promotionRequest.findUnique({ where: { id } });
    if (!req) return json(error(ErrorCodes.NOT_FOUND, '申请不存在'), 404);
    if (req.status !== 'PENDING') {
      return json(error(ErrorCodes.BAD_REQUEST, `状态「${req.status}」，无法操作`), 400);
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
      await notify(
        req.userId,
        'promotion_approved',
        '晋升申请已通过，你现在是 CONTRIBUTOR',
        '感谢你对社区的贡献！你现在可以提交词条改进建议。',
      );
    } else {
      await prisma.promotionRequest.update({
        where: { id },
        data: { status: 'REJECTED', reviewedBy: session.userId, reviewNote: note!.trim(), reviewedAt: now },
      });
      await notify(
        req.userId,
        'promotion_rejected',
        '晋升申请未通过',
        `审核意见：${note!.trim()}`,
      );
    }

    return json(success({ action, requestId: id }), 200);
  } catch (err) {
    console.error('审批失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '操作失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

