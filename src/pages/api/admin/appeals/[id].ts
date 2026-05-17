/**
 * PUT /api/admin/appeals/[id]
 * ADMIN only — approve or reject an appeal.
 * Body: { action: 'approve' | 'reject', note: string }
 *
 * On approve:
 *   WARNED_2_CLEAR → user.status = ACTIVE, warning.clearedByAppeal = true
 *   READ_ONLY       → user.status = ACTIVE
 *   TEMP_BAN / PERM_BAN → user.status = ACTIVE, banUntil = null
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { can } from '../../../../lib/permissions';
import { notify } from '../../../../lib/notify';

export async function PUT(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'appeal:handle')) {
      return json(error(ErrorCodes.FORBIDDEN, '需要管理员权限'), 403);
    }

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少 ID'), 400);

    const body = await event.request.json() as { action?: string; note?: string };
    const { action, note } = body;

    if (action !== 'approve' && action !== 'reject') {
      return json(error(ErrorCodes.BAD_REQUEST, 'action 必须为 approve 或 reject'), 400);
    }
    if (!note || note.trim().length < 3) {
      return json(error(ErrorCodes.BAD_REQUEST, '处理意见不能为空'), 400);
    }

    const appeal = await prisma.appeal.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!appeal) return json(error(ErrorCodes.NOT_FOUND, '申诉记录不存在'), 404);
    if (appeal.status !== 'PENDING') {
      return json(error(ErrorCodes.BAD_REQUEST, '该申诉已处理'), 400);
    }

    const now = new Date();

    if (action === 'approve') {
      const userUpdate: Record<string, unknown> = { status: 'ACTIVE', banUntil: null };

      if (appeal.type === 'WARNED_2_CLEAR') {
        // Mark the active WARNED_2 warning as cleared by appeal
        await prisma.userWarning.updateMany({
          where: { userId: appeal.userId, level: 2, clearedAt: null },
          data: { clearedAt: now, clearedByAppeal: true },
        });
      }

      await prisma.$transaction([
        prisma.appeal.update({
          where: { id },
          data: { status: 'APPROVED', reviewerId: session.userId, reviewNote: note.trim(), reviewedAt: now },
        }),
        prisma.user.update({
          where: { id: appeal.userId },
          data: userUpdate,
        }),
      ]);
    } else {
      await prisma.appeal.update({
        where: { id },
        data: { status: 'REJECTED', reviewerId: session.userId, reviewNote: note.trim(), reviewedAt: now },
      });
    }

    if (action === 'approve') {
      await notify(
        appeal.userId,
        'appeal_approved',
        '你的申诉已通过',
        `处理结果：${note.trim()} · 账户已恢复正常状态。`,
        `/user/${appeal.userId}`,
      );
    } else {
      await notify(
        appeal.userId,
        'appeal_rejected',
        '你的申诉未通过',
        `处理意见：${note.trim()}`,
        `/user/${appeal.userId}`,
      );
    }

    return json(success({ action, appealId: id }), 200);
  } catch (err) {
    console.error('处理申诉失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '操作失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

