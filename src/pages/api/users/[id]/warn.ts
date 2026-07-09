/**
 * POST /api/users/[id]/warn
 * EDITOR / ADMIN — issue a warning (level 1 or 2).
 * Body: { level: 1 | 2, reason: string }
 *
 * Level 1 (WARNED_1): note only, auto-clears in 90 days.
 * Level 2 (WARNED_2): visible badge, requires manual/appeal clearance.
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
    if (!can(session, 'user:warn')) {
      return json(error(ErrorCodes.FORBIDDEN, '需要编辑或管理员权限'), 403);
    }

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少用户 ID'), 400);
    if (id === session.userId) {
      return json(error(ErrorCodes.FORBIDDEN, '不能对自己发出警告'), 403);
    }

    const targetCheck = await prisma.user.findUnique({ where: { id }, select: { isFounder: true } });
    if (targetCheck?.isFounder) return json(error(ErrorCodes.FORBIDDEN, '无法对创始人执行此操作'), 403);

    const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json() as { level?: number; reason?: string };
    const { level, reason } = body;

    if (level !== 1 && level !== 2) {
      return json(error(ErrorCodes.BAD_REQUEST, 'level 必须为 1 或 2'), 400);
    }
    if (!reason || reason.trim().length < 5) {
      return json(error(ErrorCodes.BAD_REQUEST, '理由不能为空（至少 5 字）'), 400);
    }

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, status: true } });
    if (!target) return json(error(ErrorCodes.NOT_FOUND, '用户不存在'), 404);

    // EDITOR cannot warn another EDITOR or ADMIN
    if (session.role === 'EDITOR' && (target.role === 'EDITOR' || target.role === 'ADMIN')) {
      return json(error(ErrorCodes.FORBIDDEN, '编辑无权警告同级或更高级用户'), 403);
    }

    const now = new Date();
    const autoClears = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const newStatus = level === 1 ? 'WARNED_1' : 'WARNED_2';

    await prisma.$transaction([
      prisma.userWarning.create({
        data: {
          userId: id,
          issuedBy: session.userId,
          level,
          reason: reason.trim(),
          autoClears,
        },
      }),
      prisma.user.update({
        where: { id },
        data: { status: newStatus },
      }),
    ]);

    await notify(
      id,
      'warned',
      `你收到了一条 WARNED_${level} 警告`,
      `原因：${reason.trim()}${level === 1 ? ' · 90 天内无新违规将自动清除' : ' · 需申诉或管理员手动解除'}`,
      `/user/${id}`,
    );

    return json(success({ warned: true, level, userId: id }), 200);
  } catch (err) {
    console.error('发出警告失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '操作失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

