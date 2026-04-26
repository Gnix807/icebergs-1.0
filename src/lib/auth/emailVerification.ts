import { createHash, randomInt } from 'crypto';
import { prisma } from '../prisma';

export type EmailVerificationPurpose = 'register';

export type VerifyEmailCodeResult =
  | 'valid'
  | 'missing'
  | 'expired'
  | 'invalid'
  | 'too_many_attempts';

interface EmailVerificationRow {
  id: string;
  email: string;
  purpose: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
  created_at: string;
}

const CODE_TTL_MINUTES = Math.max(1, Number(process.env.EMAIL_CODE_TTL_MINUTES || 10));
const SEND_COOLDOWN_SECONDS = Math.max(10, Number(process.env.EMAIL_SEND_COOLDOWN_SECONDS || 60));
const MAX_SEND_PER_EMAIL_DAY = Math.max(1, Number(process.env.EMAIL_MAX_SEND_PER_EMAIL_DAY || 20));
const MAX_SEND_PER_IP_DAY = Math.max(1, Number(process.env.EMAIL_MAX_SEND_PER_IP_DAY || 60));
const MAX_VERIFY_ATTEMPTS = Math.max(1, Number(process.env.EMAIL_CODE_MAX_ATTEMPTS || 5));

let ensurePromise: Promise<void> | null = null;

function getSecret(): string {
  return process.env.EMAIL_VERIFICATION_SECRET || 'dev-email-secret-change-me';
}

function hashCode(email: string, purpose: EmailVerificationPurpose, code: string): string {
  return createHash('sha256')
    .update(`${email}|${purpose}|${code}|${getSecret()}`)
    .digest('hex');
}

async function ensureEmailVerificationTable(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS email_verification_codes (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          purpose TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          consumed_at TEXT,
          send_ip TEXT,
          created_at TEXT NOT NULL
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_email_verify_email_purpose_created
        ON email_verification_codes(email, purpose, created_at)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_email_verify_ip_created
        ON email_verification_codes(send_ip, created_at)
      `);
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }

  await ensurePromise;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function toMs(isoLike: string): number {
  return new Date(isoLike).getTime();
}

export function getEmailCodeTtlMinutes(): number {
  return CODE_TTL_MINUTES;
}

export function generateEmailCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function canSendEmailCode(
  emailRaw: string,
  purpose: EmailVerificationPurpose,
  sendIp: string | null
): Promise<{ ok: true } | { ok: false; message: string; retryAfterSec?: number }> {
  await ensureEmailVerificationTable();
  const email = normalizeEmail(emailRaw);
  const now = Date.now();
  const since24hIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const latestRows = await prisma.$queryRaw<Pick<EmailVerificationRow, 'created_at'>[]>`
    SELECT created_at
    FROM email_verification_codes
    WHERE email = ${email} AND purpose = ${purpose}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const latestAt = latestRows[0]?.created_at ? toMs(latestRows[0].created_at) : 0;
  if (latestAt > 0) {
    const deltaSec = Math.floor((now - latestAt) / 1000);
    if (deltaSec < SEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        message: `发送过于频繁，请 ${SEND_COOLDOWN_SECONDS - deltaSec} 秒后重试`,
        retryAfterSec: SEND_COOLDOWN_SECONDS - deltaSec,
      };
    }
  }

  const emailCountRows = await prisma.$queryRaw<Array<{ count: number | bigint }>>`
    SELECT COUNT(1) AS count
    FROM email_verification_codes
    WHERE email = ${email} AND purpose = ${purpose} AND created_at >= ${since24hIso}
  `;
  const emailCount = Number(emailCountRows[0]?.count ?? 0);
  if (emailCount >= MAX_SEND_PER_EMAIL_DAY) {
    return { ok: false, message: '该邮箱今日验证码发送次数已达上限，请明天再试' };
  }

  if (sendIp) {
    const ipCountRows = await prisma.$queryRaw<Array<{ count: number | bigint }>>`
      SELECT COUNT(1) AS count
      FROM email_verification_codes
      WHERE send_ip = ${sendIp} AND created_at >= ${since24hIso}
    `;
    const ipCount = Number(ipCountRows[0]?.count ?? 0);
    if (ipCount >= MAX_SEND_PER_IP_DAY) {
      return { ok: false, message: '当前网络今日验证码请求次数过多，请稍后再试' };
    }
  }

  return { ok: true };
}

export async function saveEmailCode(
  emailRaw: string,
  purpose: EmailVerificationPurpose,
  code: string,
  sendIp: string | null
): Promise<void> {
  await ensureEmailVerificationTable();
  const email = normalizeEmail(emailRaw);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();
  const codeHash = hashCode(email, purpose, code);

  await prisma.$executeRaw`
    UPDATE email_verification_codes
    SET consumed_at = ${createdAt}
    WHERE email = ${email} AND purpose = ${purpose} AND consumed_at IS NULL
  `;

  await prisma.$executeRaw`
    INSERT INTO email_verification_codes
      (id, email, purpose, code_hash, expires_at, attempts, consumed_at, send_ip, created_at)
    VALUES
      (${crypto.randomUUID()}, ${email}, ${purpose}, ${codeHash}, ${expiresAt}, 0, ${null}, ${sendIp}, ${createdAt})
  `;
}

export async function verifyAndConsumeEmailCode(
  emailRaw: string,
  purpose: EmailVerificationPurpose,
  codeRaw: string
): Promise<VerifyEmailCodeResult> {
  await ensureEmailVerificationTable();
  const email = normalizeEmail(emailRaw);
  const code = codeRaw.trim();
  if (!code) return 'invalid';

  const rows = await prisma.$queryRaw<EmailVerificationRow[]>`
    SELECT id, email, purpose, code_hash, expires_at, attempts, consumed_at, created_at
    FROM email_verification_codes
    WHERE email = ${email} AND purpose = ${purpose} AND consumed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return 'missing';

  const now = nowIso();
  if (toMs(row.expires_at) < Date.now()) {
    await prisma.$executeRaw`
      UPDATE email_verification_codes
      SET consumed_at = ${now}
      WHERE id = ${row.id}
    `;
    return 'expired';
  }

  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    return 'too_many_attempts';
  }

  const inputHash = hashCode(email, purpose, code);
  if (inputHash !== row.code_hash) {
    await prisma.$executeRaw`
      UPDATE email_verification_codes
      SET attempts = attempts + 1
      WHERE id = ${row.id}
    `;
    return row.attempts + 1 >= MAX_VERIFY_ATTEMPTS ? 'too_many_attempts' : 'invalid';
  }

  await prisma.$executeRaw`
    UPDATE email_verification_codes
    SET consumed_at = ${now}
    WHERE id = ${row.id}
  `;
  return 'valid';
}
