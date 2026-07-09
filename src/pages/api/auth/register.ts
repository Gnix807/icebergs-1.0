import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';
import { createSession } from '../../../lib/auth';
import { enforceAuthRateLimit, getClientIp } from '../../../lib/auth/rateLimit';
import { pbkdf2, randomBytes } from 'crypto';
import { promisify } from 'util';
import { notify } from '../../../lib/notify';

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

// ALL /api/auth/register - 邮箱注册
export async function ALL(event: APIContext) {
  try {
    const body = event.request.method === 'GET'
      ? Object.fromEntries(event.url.searchParams)
      : await event.request.json();
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    const username = normalizeUsername(body.username);
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';

    if (!email || !password || !username) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '邮箱、密码、用户名不能为空')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const clientIp = getClientIp(event) || 'unknown';
    const authRate = await enforceAuthRateLimit([
      {
        action: 'auth_register_ip',
        key: clientIp,
        limit: 20,
        windowSec: 10 * 60,
        message: '注册请求过于频繁，请稍后再试',
      },
      {
        action: 'auth_register_email',
        key: email,
        limit: 6,
        windowSec: 60 * 60,
        message: '该邮箱注册尝试过多，请稍后再试',
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

    notify(user.id, 'welcome', '欢迎来到冰山图宇宙',
      '注册成功！你可以开始创建第一张冰山图，或浏览冰山广场发现有趣的内容。',
      '/guide');

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

