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

/**
 * 聚合通知：同一 userId + type + aggregateKey 的未读通知合并为一条，
 * 递增 count 并更新 title。适用于点赞、回复等高频场景。
 *
 * titleFn(count) 根据最新计数返回标题文本，例如：
 *   (n) => n === 1 ? '有人点赞了你的评论' : `${n} 人点赞了你的评论`
 */
export async function notifyAggregated(
  userId: string,
  type: string,
  aggregateKey: string,
  titleFn: (count: number) => string,
  link?: string,
): Promise<void> {
  try {
    // 查找同类型、同目标、未读的已有通知
    const existing = await prisma.notification.findFirst({
      where: { userId, type, aggregateKey, read: false },
      select: { id: true, count: true },
    });

    if (existing) {
      const newCount = existing.count + 1;
      await prisma.notification.update({
        where: { id: existing.id },
        data: {
          count: newCount,
          title: titleFn(newCount),
          // updatedAt 由 @updatedAt 自动维护
        },
      });
    } else {
      await prisma.notification.create({
        data: {
          userId,
          type,
          aggregateKey,
          title: titleFn(1),
          link: link ?? null,
          count: 1,
        },
      });
    }
  } catch (err) {
    console.error('[notifyAggregated] 通知失败:', err);
  }
}
