import type { APIEvent } from '@astrojs/node';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';
import { createSession } from '../../../lib/auth';
import { verifyAndConsumeEmailCode } from '../../../lib/auth/emailVerification';
import { pbkdf2, randomBytes } from 'crypto';
import { promisify } from 'util';

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

function normalizeUsername(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

// POST /api/auth/register - 邮箱注册
export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    const username = normalizeUsername(body.username);
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
    const verificationCode = typeof body.verificationCode === 'string' ? body.verificationCode.trim() : '';

    if (!email || !password || !username) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '邮箱、密码、用户名不能为空')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!verificationCode) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '请先填写邮箱验证码')), {
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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '邮箱格式不正确')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '密码至少6位')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '用户名需3-20位字母、数字或下划线')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (nickname.length > 50) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '昵称不能超过50字')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const [existingEmail, existingUsername] = await Promise.all([
      prisma.user.findUnique({
        where: { email },
        select: { id: true, passwordHash: true },
      }),
      prisma.user.findUnique({ where: { username } }),
    ]);

    if (existingEmail) {
      if (!existingEmail.passwordHash) {
        return new Response(JSON.stringify(error(
          ErrorCodes.VALIDATION_ERROR,
          '该邮箱已绑定第三方登录，请使用 Google 或 GitHub 登录'
        )), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '邮箱已被注册')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (existingUsername) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '用户名已被占用')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const verifyResult = await verifyAndConsumeEmailCode(email, 'register', verificationCode);
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

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        nickname: nickname || username,
        passwordHash,
        role: 'USER',
      },
    });

    await createSession(user.id, event);

    return new Response(JSON.stringify(success({
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email,
    })), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '邮箱或用户名已被占用')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.error('注册失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '注册失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
