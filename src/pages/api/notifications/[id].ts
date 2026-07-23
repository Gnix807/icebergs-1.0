/**
 * PUT /api/notifications/[id]   将单条通知标为已读
 */
import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function ALL(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少通知 ID'), 400);

    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.userId !== session.userId) {
      return json(error(ErrorCodes.NOT_FOUND, '通知不存在'), 404);
    }

    // 检查是否已存在同 aggregateKey 的 read=true 记录，避免唯一约束冲突
    if (notif.aggregateKey) {
      const existingRead = await prisma.notification.findFirst({
        where: { userId: session.userId, type: notif.type, aggregateKey: notif.aggregateKey, read: true },
        select: { id: true },
      });
      if (existingRead) {
        await prisma.notification.delete({ where: { id } });
        return json(success({ id }));
      }
    }

    await prisma.notification.update({ where: { id }, data: { read: true } });
    return json(success({ id }));
  } catch (err) {
    console.error('标记已读失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '操作失败'), 500);
  }
}

