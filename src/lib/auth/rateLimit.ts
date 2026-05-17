import type { APIContext } from 'astro';
import { prisma } from '../prisma';

export interface AuthRateLimitRule {
  action: string;
  key: string;
  limit: number;
  windowSec: number;
  message?: string;
}

export type AuthRateLimitResult =
  | { ok: true }
  | { ok: false; message: string; retryAfterSec: number };

interface AuthRateLimitRow {
  count: number | bigint;
  oldest: string | null;
}

let ensurePromise: Promise<void> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function toMs(isoLike: string): number {
  return new Date(isoLike).getTime();
}

function normalizeKey(raw: string): string {
  const value = raw.trim().toLowerCase();
  return value || 'unknown';
}

async function ensureRateLimitTable(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS auth_rate_limit_events (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          rate_key TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_action_key_created
        ON auth_rate_limit_events(action, rate_key, created_at)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_created
        ON auth_rate_limit_events(created_at)
      `);
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }

  await ensurePromise;
}

async function consumeRule(rule: AuthRateLimitRule): Promise<AuthRateLimitResult> {
  await ensureRateLimitTable();

  const now = Date.now();
  const currentIso = nowIso();
  const key = normalizeKey(rule.key);
  const sinceIso = new Date(now - rule.windowSec * 1000).toISOString();

  // 仅保留当前 action 窗口内数据，避免限流事件表无限增长。
  await prisma.$executeRaw`
    DELETE FROM auth_rate_limit_events
    WHERE action = ${rule.action}
      AND created_at < ${sinceIso}
  `;

  await prisma.$executeRaw`
    INSERT INTO auth_rate_limit_events (id, action, rate_key, created_at)
    VALUES (${crypto.randomUUID()}, ${rule.action}, ${key}, ${currentIso})
  `;

  const rows = await prisma.$queryRaw<AuthRateLimitRow[]>`
    SELECT COUNT(1) AS count, MIN(created_at) AS oldest
    FROM auth_rate_limit_events
    WHERE action = ${rule.action}
      AND rate_key = ${key}
      AND created_at >= ${sinceIso}
  `;

  const count = Number(rows[0]?.count ?? 0);
  if (count <= rule.limit) {
    return { ok: true };
  }

  const oldestMs = rows[0]?.oldest ? toMs(rows[0].oldest) : now;
  const retryAfterSec = Math.max(1, Math.ceil((oldestMs + rule.windowSec * 1000 - now) / 1000));

  return {
    ok: false,
    message: rule.message || '请求过于频繁，请稍后重试',
    retryAfterSec,
  };
}

export async function enforceAuthRateLimit(rules: AuthRateLimitRule[]): Promise<AuthRateLimitResult> {
  for (const rule of rules) {
    const result = await consumeRule(rule);
    if (!result.ok) return result;
  }

  return { ok: true };
}

export function getClientIp(event: APIContext): string | null {
  const xForwardedFor = event.request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0]?.trim() || null;
  }

  const xRealIp = event.request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();

  const addr = (event as unknown as { clientAddress?: string }).clientAddress;
  return typeof addr === 'string' && addr.trim() ? addr.trim() : null;
}

