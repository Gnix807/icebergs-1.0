/**
 * PATCH /api/users/[id]/role
 * ADMIN / FOUNDER only — directly appoint a user to a new role.
 * Body: { role: 'USER' | 'CONTRIBUTOR' | 'EDITOR' | 'MODERATOR', reason?: string }
 *
 * Rules:
 * - Cannot target FOUNDER
 * - Cannot set role to ADMIN (election only)
 * - Setting to MODERATOR checks moderator_max cap
 */
import type { APIEvent } from '@astrojs/node';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { notify } from '../../../../lib/notify';

const ALLOWED_ROLES         = ['USER', 'CONTRIBUTOR', 'EDITOR', 'MODERATOR'] as const;
const FOUNDER_ALLOWED_ROLES = ['USER', 'CONTRIBUTOR', 'EDITOR', 'MODERATOR', 'ADMIN'] as const;
type AllowedRole = typeof FOUNDER_ALLOWED_ROLES[number];

const ROLE_LABELS: Record<AllowedRole, string> = {
  USER:        '普通用户',
  CONTRIBUTOR: '贡献者',
  EDITOR:      '编辑',
  MODERATOR:   '版主',
  ADMIN:       '管理员',
};

export async function PATCH(event: APIEvent) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (session.role !== 'ADMIN' && !session.isFounder) {
      return json(error(ErrorCodes.FORBIDDEN, '需要管理员权限'), 403);
    }

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少用户 ID'), 400);

    const body = await event.request.json() as { role?: string; reason?: string };
    const { role, reason } = body;

    const effectiveAllowed = session.isFounder ? FOUNDER_ALLOWED_ROLES : ALLOWED_ROLES;
    if (!role || !effectiveAllowed.includes(role as AllowedRole)) {
      const hint = session.isFounder
        ? 'USER / CONTRIBUTOR / EDITOR / MODERATOR / ADMIN'
        : 'USER / CONTRIBUTOR / EDITOR / MODERATOR';
      return json(error(ErrorCodes.BAD_REQUEST, `无效角色，可选：${hint}`), 400);
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isFounder: true, username: true },
    });
    if (!target) return json(error(ErrorCodes.NOT_FOUND, '用户不存在'), 404);
    if (target.isFounder) return json(error(ErrorCodes.FORBIDDEN, '无法修改创始人角色'), 403);
    if (target.role === role) return json(error(ErrorCodes.BAD_REQUEST, '角色未发生变化'), 400);

    // 上限检查（MODERATOR / ADMIN）
    if (role === 'MODERATOR') {
      const capSetting = await prisma.systemSettings.findUnique({ where: { key: 'moderator_max' } });
      const cap = parseInt(capSetting?.value ?? '5', 10);
      const currentCount = await prisma.user.count({ where: { role: 'MODERATOR' } });
      if (currentCount >= cap) {
        return json(error(ErrorCodes.FORBIDDEN, `版主已达上限（${cap} 人），请先在系统配置中调整 moderator_max`), 403);
      }
    }
    if (role === 'ADMIN') {
      const capSetting = await prisma.systemSettings.findUnique({ where: { key: 'admin_max' } });
      const cap = parseInt(capSetting?.value ?? '3', 10);
      const currentCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (currentCount >= cap) {
        return json(error(ErrorCodes.FORBIDDEN, `管理员已达上限（${cap} 人），请先在系统配置中调整 admin_max`), 403);
      }
    }

    const oldRole = target.role;
    await prisma.user.update({ where: { id }, data: { role } });

    const isPromotion = ['USER','CONTRIBUTOR','EDITOR','MODERATOR'].indexOf(role) >
                        ['USER','CONTRIBUTOR','EDITOR','MODERATOR'].indexOf(oldRole);

    const notifyTitle = isPromotion
      ? `你的角色已晋升为 ${ROLE_LABELS[role as AllowedRole]}`
      : `你的角色已调整为 ${ROLE_LABELS[role as AllowedRole]}`;
    const notifyBody = reason?.trim()
      ? `管理员备注：${reason.trim()}`
      : `由管理员 @${session.userId} 直接操作。`;

    await notify(id, isPromotion ? 'promotion_approved' : 'warned', notifyTitle, notifyBody, `/user/${id}`);

    return json(success({ userId: id, oldRole, newRole: role }), 200);
  } catch (err) {
    console.error('角色变更失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '操作失败'), 500);
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
