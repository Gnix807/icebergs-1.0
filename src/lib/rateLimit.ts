import { prisma } from './prisma';

const WINDOW_MS = 60_000; // 1 minute window

/**
 * 检查某类操作是否超频。超频返回 true。
 * @param action 操作标识，如 "search", "item_read", "vote", "iceberg_create"
 * @param rateKey 限流键（通常为 userId 或 IP）
 * @param maxPerWindow 窗口内最大请求数
 */
export async function isRateLimited(
  action: string,
  rateKey: string,
  maxPerWindow: number = 30,
): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO auth_rate_limit_events ("id", "action", "rate_key", "createdAt")
       VALUES ($1, $2, $3, NOW())`,
      generateId(), action, rateKey,
    );

    const result: any = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as cnt FROM auth_rate_limit_events
       WHERE "action" = $1 AND "rate_key" = $2 AND "createdAt" > $3`,
      action, rateKey, since,
    );
    return (result?.[0]?.cnt ?? 0) > maxPerWindow;
  } catch {
    return false; // 限流检查失败时不阻塞请求
  }
}

/**
 * 定期清理过期的限流事件（可在 cron 中调用）
 */
export async function cleanupRateLimitEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - WINDOW_MS * 2);
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM auth_rate_limit_events WHERE "createdAt" < $1`,
      cutoff,
    );
  } catch {}
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
