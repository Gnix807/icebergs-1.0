/**
 * POST /api/users/[id]/restrict
 * ADMIN only — set user to READ_ONLY.
 * Body: { reason: string }
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { can } from '../../../../lib/permissions';
import { notify } from '../../../../lib/notify';

export async function ALL(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'user:restrict')) {
      return json(error(ErrorCodes.FORBIDDEN, '需要管理员权限'), 403);
    }

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少用户 ID'), 400);
    if (id === session.userId) return json(error(ErrorCodes.FORBIDDEN, '不能限制自己'), 403);

    const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json() as { reason?: string };
    const { reason } = body;
    if (!reason || reason.trim().length < 5) {
      return json(error(ErrorCodes.BAD_REQUEST, '理由不能为空（至少 5 字）'), 400);
    }

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, isFounder: true } });
    if (!target) return json(error(ErrorCodes.NOT_FOUND, '用户不存在'), 404);
    if (target.isFounder) return json(error(ErrorCodes.FORBIDDEN, '无法对创始人执行此操作'), 403);
    if (target.role === 'ADMIN') {
      return json(error(ErrorCodes.FORBIDDEN, '无法限制其他管理员'), 403);
    }

    await prisma.user.update({ where: { id }, data: { status: 'READ_ONLY' } });

    await notify(
      id,
      'restricted',
      '你的账户已被设为只读状态',
      `原因：${reason.trim()} · 你可以在个人主页提交申诉。`,
      `/user/${id}`,
    );

    return json(success({ restricted: true, userId: id }), 200);
  } catch (err) {
    console.error('限制用户失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '操作失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

