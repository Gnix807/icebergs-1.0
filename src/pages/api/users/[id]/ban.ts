/**
 * POST /api/users/[id]/ban
 * ADMIN only — temp or perm ban.
 * Body: { type: 'TEMP' | 'PERM', days?: number, reason: string }
 *
 * POST /api/users/[id]/unban  (same file, different export)
 * ADMIN only — lift any active ban or restriction.
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
    if (id === session.userId) return json(error(ErrorCodes.FORBIDDEN, '不能封禁自己'), 403);

    const targetCheck = await prisma.user.findUnique({ where: { id }, select: { isFounder: true } });
    if (targetCheck?.isFounder) return json(error(ErrorCodes.FORBIDDEN, '无法对创始人执行此操作'), 403);

    const body = await event.request.json() as { type?: string; days?: number; reason?: string };
    const { type, days, reason } = body;

    if (type !== 'TEMP' && type !== 'PERM') {
      return json(error(ErrorCodes.BAD_REQUEST, 'type 必须为 TEMP 或 PERM'), 400);
    }
    if (type === 'TEMP' && (!days || days < 1)) {
      return json(error(ErrorCodes.BAD_REQUEST, 'TEMP 封禁需要指定天数（≥1）'), 400);
    }
    if (!reason || reason.trim().length < 5) {
      return json(error(ErrorCodes.BAD_REQUEST, '理由不能为空（至少 5 字）'), 400);
    }

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!target) return json(error(ErrorCodes.NOT_FOUND, '用户不存在'), 404);
    if (target.role === 'ADMIN') {
      return json(error(ErrorCodes.FORBIDDEN, '无法封禁其他管理员'), 403);
    }

    const banUntil = type === 'TEMP'
      ? new Date(Date.now() + days! * 24 * 60 * 60 * 1000)
      : null;

    await prisma.user.update({
      where: { id },
      data: {
        status: type === 'TEMP' ? 'TEMP_BANNED' : 'PERM_BANNED',
        banUntil,
      },
    });

    const banBody = type === 'TEMP'
      ? `临时封禁 ${days} 天，解封时间：${banUntil!.toLocaleDateString('zh-CN')}。原因：${reason.trim()}`
      : `账户已被永久封禁。原因：${reason.trim()}`;

    await notify(id, 'banned', type === 'TEMP' ? '你的账户已被临时封禁' : '你的账户已被永久封禁', banBody);

    return json(success({ banned: true, type, userId: id, banUntil }), 200);
  } catch (err) {
    console.error('封禁用户失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '操作失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

