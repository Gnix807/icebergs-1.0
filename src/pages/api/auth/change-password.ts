import type { APIContext } from 'astro';
import { pbkdf2, randomBytes } from 'crypto';
import { promisify } from 'util';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { success, error, ErrorCodes } from '../../../lib/api';
import { enforceAuthRateLimit, getClientIp } from '../../../lib/auth/rateLimit';

const pbkdf2Async = promisify(pbkdf2);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await pbkdf2Async(password, salt, 100_000, 32, 'sha256');
  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = await pbkdf2Async(password, salt, 100_000, 32, 'sha256');
  return derived.toString('hex') === hash;
}

// POST /api/auth/change-password
export async function POST(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await event.request.json().catch(() => ({}));
    const oldPassword = typeof body.oldPassword === 'string' ? body.oldPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    const currentSessionId = event.cookies.get('session')?.value || null;
    const clientIp = getClientIp(event) || 'unknown';

    if (!newPassword) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '新密码不能为空')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (newPassword.length < 6) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '新密码至少 6 位')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rateResult = await enforceAuthRateLimit([
      {
        action: 'auth_change_password_user',
        key: session.userId,
        limit: 8,
        windowSec: 10 * 60,
        message: '修改密码过于频繁，请稍后再试',
      },
      {
        action: 'auth_change_password_ip',
        key: clientIp,
        limit: 15,
        windowSec: 10 * 60,
        message: '请求过于频繁，请稍后再试',
      },
    ]);
    if (!rateResult.ok) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, rateResult.message)), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rateResult.retryAfterSec),
        },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '用户不存在')), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (user.passwordHash) {
      if (!oldPassword) {
        return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '请输入当前密码')), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const valid = await verifyPassword(oldPassword, user.passwordHash);
      if (!valid) {
        return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '当前密码错误')), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const passwordHash = await hashPassword(newPassword);
    const deleteWhere = currentSessionId
      ? { userId: session.userId, NOT: { id: currentSessionId } }
      : { userId: session.userId };

    const [, deleted] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      prisma.session.deleteMany({ where: deleteWhere }),
    ]);

    return new Response(JSON.stringify(success({
      changed: true,
      hasPassword: true,
      loggedOutSessions: deleted.count,
      message: user.passwordHash ? '密码已更新，其他设备已下线' : '已设置邮箱密码，可用于登录',
    })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('修改密码失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '修改密码失败，请稍后重试')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

