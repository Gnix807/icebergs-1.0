import type { APIContext } from 'astro';
import { pbkdf2, randomBytes } from 'crypto';
import { promisify } from 'util';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';
import { enforceAuthRateLimit, getClientIp } from '../../../lib/auth/rateLimit';

const pbkdf2Async = promisify(pbkdf2);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await pbkdf2Async(password, salt, 100_000, 32, 'sha256');
  return `${salt}:${hash.toString('hex')}`;
}

function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

// GET /api/auth/reset-password（GET 兼容 WAF）
export async function GET(event: APIContext) {
  try {
    const body = event.request.method === 'GET'
      ? Object.fromEntries(event.url.searchParams)
      : await event.request.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!email || !newPassword) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '邮箱和新密码不能为空')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '邮箱格式不正确')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (newPassword.length < 6) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '新密码至少6位')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const clientIp = getClientIp(event) || 'unknown';
    const authRate = await enforceAuthRateLimit([
      {
        action: 'auth_password_reset_ip',
        key: clientIp,
        limit: 12,
        windowSec: 10 * 60,
        message: '重置请求过于频繁，请稍后再试',
      },
      {
        action: 'auth_password_reset_email',
        key: email,
        limit: 6,
        windowSec: 60 * 60,
        message: '该邮箱重置请求过于频繁，请稍后再试',
      },
    ]);
    if (!authRate.ok) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, authRate.message)), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(authRate.retryAfterSec),
        },
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '该邮箱未注册')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!user.passwordHash) {
      return new Response(JSON.stringify(error(
        ErrorCodes.VALIDATION_ERROR,
        '该账号使用 GitHub / Google 登录，无需密码。请直接用第三方登录。',
      )), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return new Response(JSON.stringify(success({ message: '密码已重置，请重新登录' })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('重置密码失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '重置失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
