/**
 * GET /api/notifications   获取当前用户通知列表（最近 50 条）+ 未读数
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

export async function GET(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

    if (event.url.searchParams.get('action') === 'read-all') {
      // 先清理已有 read=true 同 aggregateKey 的 unread 记录，避免唯一约束冲突
      await prisma.$executeRaw`
        DELETE FROM notifications
        WHERE "userId" = ${session.userId} AND "read" = false
        AND "aggregateKey" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM notifications n2
          WHERE n2."userId" = ${session.userId}
          AND n2."aggregateKey" = notifications."aggregateKey"
          AND n2."read" = true
        )
      `;
      const { count } = await prisma.notification.updateMany({
        where: { userId: session.userId, read: false },
        data: { read: true },
      });
      return json(success({ updated: count }));
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, type: true, title: true, body: true, link: true, read: true, createdAt: true },
      }),
      prisma.notification.count({
        where: { userId: session.userId, read: false },
      }),
    ]);

    return json(success({ notifications, unreadCount }));
  } catch (err) {
    console.error('获取通知失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '获取失败'), 500);
  }
}

