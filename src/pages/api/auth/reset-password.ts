import type { APIContext } from 'astro';
import { pbkdf2, randomBytes } from 'crypto';
import { promisify } from 'util';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';
import { verifyAndConsumeEmailCode } from '../../../lib/auth/emailVerification';
import { enforceAuthRateLimit, getClientIp } from '../../../lib/auth/rateLimit';

const pbkdf2Async = promisify(pbkdf2);

function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await pbkdf2Async(password, salt, 100_000, 32, 'sha256');
  return `${salt}:${hash.toString('hex')}`;
}

// POST /api/auth/reset-password
export async function POST(event: APIContext) {
  try {
    const body = await event.request.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const verificationCode = typeof body.verificationCode === 'string' ? body.verificationCode.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!email || !verificationCode || !newPassword) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '邮箱、验证码、新密码不能为空')), {
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
    if (!/^\d{6}$/.test(verificationCode)) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '验证码应为6位数字')), {
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
        limit: 8,
        windowSec: 10 * 60,
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

    const verifyResult = await verifyAndConsumeEmailCode(email, 'password_reset', verificationCode);
    if (verifyResult !== 'valid') {
      const messageMap: Record<string, string> = {
        missing: '请先发送邮箱验证码',
        expired: '验证码已过期，请重新发送',
        invalid: '验证码错误',
        too_many_attempts: '验证码错误次数过多，请重新发送',
      };
      return new Response(JSON.stringify(error(
        ErrorCodes.VALIDATION_ERROR,
        messageMap[verifyResult] || '验证码校验失败'
      )), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
    if (!user || !user.passwordHash) {
      return new Response(JSON.stringify(error(
        ErrorCodes.BAD_REQUEST,
        '该账号未设置邮箱密码，请使用第三方登录'
      )), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);

    return new Response(JSON.stringify(success({
      reset: true,
      message: '密码重置成功，请使用新密码登录',
    })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('重置密码失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '重置密码失败，请稍后重试')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

