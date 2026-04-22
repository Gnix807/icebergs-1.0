import type { APIEvent } from '@astrojs/node';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';
import { createSession } from '../../../lib/auth';
import { pbkdf2 } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = await pbkdf2Async(password, salt, 100_000, 32, 'sha256');
  return derived.toString('hex') === hash;
}

// POST /api/auth/login - 邮箱密码登录
export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { email, password } = body;

    if (!email || !password) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '邮箱和密码不能为空')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // 用户不存在或是 OAuth 用户（无密码）
    if (!user || !user.passwordHash) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '邮箱或密码错误')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '邮箱或密码错误')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await createSession(user.id, event);

    return new Response(JSON.stringify(success({
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email,
    })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('登录失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '登录失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
