import type { APIEvent } from '@astrojs/node';
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

function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

function getClientIp(event: APIEvent): string | null {
  const xForwardedFor = event.request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0]?.trim() || null;
  }
  const xRealIp = event.request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();

  const addr = (event as unknown as { clientAddress?: string }).clientAddress;
  return typeof addr === 'string' && addr.trim() ? addr.trim() : null;
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  if (name.length <= 2) return `${name[0] ?? '*'}*@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}

// POST /api/auth/email/send-code
export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const purpose: EmailVerificationPurpose = body.purpose === 'register' ? 'register' : 'register';

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

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '该邮箱已被注册')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sendIp = getClientIp(event);
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
    const ttlMinutes = getEmailCodeTtlMinutes();
    await sendVerificationEmail({ to: email, code, ttlMinutes });
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
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '验证码发送失败，请稍后重试')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
