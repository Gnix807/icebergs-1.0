import { prisma } from './prisma';

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
 * 聚合通知：原子 INSERT ... ON CONFLICT DO UPDATE，消除竞态条件。
 */
export async function notifyAggregated(
  userId: string,
  type: string,
  aggregateKey: string,
  titleFn: (count: number) => string,
  link?: string,
): Promise<void> {
  try {
    const id = generateId();
    // PostgreSQL atomic upsert: 如果同 userId+type+aggregateKey+read=false 已存在，则 count+1
    await prisma.$executeRawUnsafe(
      `INSERT INTO notifications ("id", "userId", "type", "title", "link", "aggregateKey", "count", "read", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 1, false, NOW(), NOW())
       ON CONFLICT ("userId", "type", "aggregateKey", "read")
       WHERE "read" = false
       DO UPDATE SET "count" = notifications."count" + 1,
                     "title" = CASE
                       WHEN notifications."count" = $7 THEN $4
                       ELSE $4
                     END,
                     "updatedAt" = NOW()`,
      id, userId, type, titleFn(1), link ?? null, aggregateKey, 1,
    );
  } catch (err) {
    console.error('[notifyAggregated] 通知失败:', err);
  }
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
