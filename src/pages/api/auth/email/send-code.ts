import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import {
  canSendEmailCode,
  generateEmailCode,
  getEmailCodeTtlMinutes,
  saveEmailCode,
  type EmailVerificationPurpose,
} from '../../../../lib/auth/emailVerification';
import { sendVerificationEmail } from '../../../../lib/auth/emailSender';
import { enforceAuthRateLimit, getClientIp } from '../../../../lib/auth/rateLimit';

function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  if (name.length <= 2) return `${name[0] ?? '*'}*@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}

// POST /api/auth/email/send-code
export async function ALL(event: APIContext) {
  try {
    const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const purpose: EmailVerificationPurpose = body.purpose === 'password_reset' ? 'password_reset' : 'register';
    const sendIp = getClientIp(event) || 'unknown';
    const ttlMinutes = getEmailCodeTtlMinutes();

    if (!email) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '邮箱不能为空')), {
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

    const authRate = await enforceAuthRateLimit([
      {
        action: 'auth_email_code_send_ip',
        key: sendIp,
        limit: 12,
        windowSec: 10 * 60,
        message: '验证码请求过于频繁，请稍后再试',
      },
      {
        action: 'auth_email_code_send_email',
        key: email,
        limit: 6,
        windowSec: 10 * 60,
        message: '该邮箱请求过于频繁，请稍后再试',
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

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    if (purpose === 'register' && existing) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '该邮箱已被注册')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (purpose === 'password_reset' && (!existing || !existing.passwordHash)) {
      // 不暴露账号是否存在，统一返回成功文案
      return new Response(JSON.stringify(success({
        sent: true,
        ttlMinutes,
        emailHint: maskEmail(email),
      })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const allow = await canSendEmailCode(email, purpose, sendIp);
    if (!allow.ok) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, allow.message)), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...(allow.retryAfterSec ? { 'Retry-After': String(allow.retryAfterSec) } : {}),
        },
      });
    }

    const code = generateEmailCode();
    await sendVerificationEmail({ to: email, code, ttlMinutes, purpose });
    await saveEmailCode(email, purpose, code, sendIp);

    return new Response(JSON.stringify(success({
      sent: true,
      ttlMinutes,
      emailHint: maskEmail(email),
    })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('发送邮箱验证码失败:', err);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('EMAIL_VERIFICATION_SECRET')) {
      return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '服务端邮箱验证配置缺失，请联系管理员')), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '验证码发送失败，请稍后重试')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

