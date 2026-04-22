import type { APIEvent } from '@astrojs/node';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';
import { createSession } from '../../../lib/auth';
import { pbkdf2, randomBytes } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await pbkdf2Async(password, salt, 100_000, 32, 'sha256');
  return `${salt}:${hash.toString('hex')}`;
}

// POST /api/auth/register - 邮箱注册
export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { email, password, username, nickname } = body;

    if (!email || !password || !username) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '邮箱、密码、用户名不能为空')), {
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

    const [existingEmail, existingUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.user.findUnique({ where: { username } }),
    ]);

    if (existingEmail) {
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
        id: username,
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
    console.error('注册失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '注册失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
