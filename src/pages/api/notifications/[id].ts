/**
 * PUT /api/notifications/[id]   将单条通知标为已读
 */
import type { APIEvent } from '@astrojs/node';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PUT(event: APIEvent) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少通知 ID'), 400);

    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.userId !== session.userId) {
      return json(error(ErrorCodes.NOT_FOUND, '通知不存在'), 404);
    }

    await prisma.notification.update({ where: { id }, data: { read: true } });
    return json(success({ id }));
  } catch (err) {
    console.error('标记已读失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '操作失败'), 500);
  }
}
