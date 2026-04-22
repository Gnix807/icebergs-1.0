import { prisma } from './prisma';

/**
 * 创建一条站内通知（fire-and-forget，失败时静默记录错误）
 */
export async function notify(
  userId: string,
  type: string,
  title: string,
  body?: string,
  link?: string,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId, type, title, body: body ?? null, link: link ?? null },
    });
  } catch (err) {
    console.error('[notify] 创建通知失败:', err);
  }
}
