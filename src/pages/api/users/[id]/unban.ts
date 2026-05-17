/**
 * POST /api/users/[id]/unban
 * ADMIN only — lift any active ban / restriction, restore ACTIVE status.
 * Body: { reason: string }
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { can } from '../../../../lib/permissions';
import { notify } from '../../../../lib/notify';

export async function POST(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'user:ban')) {
      return json(error(ErrorCodes.FORBIDDEN, '需要管理员权限'), 403);
    }

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少用户 ID'), 400);

    const body = await event.request.json() as { reason?: string };
    if (!body.reason || body.reason.trim().length < 3) {
      return json(error(ErrorCodes.BAD_REQUEST, '理由不能为空'), 400);
    }

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!target) return json(error(ErrorCodes.NOT_FOUND, '用户不存在'), 404);

    if (target.status === 'ACTIVE') {
      return json(error(ErrorCodes.BAD_REQUEST, '用户已处于正常状态'), 400);
    }

    await prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE', banUntil: null },
    });

    await notify(id, 'unbanned', '你的账户已恢复正常', '限制已解除，你现在可以正常使用所有功能。', `/user/${id}`);

    return json(success({ unbanned: true, userId: id }), 200);
  } catch (err) {
    console.error('解除封禁失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '操作失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

