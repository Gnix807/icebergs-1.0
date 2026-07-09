import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';
import { createSession, getSession } from '../../../lib/auth';
import type { OAuthIntent } from '../../../lib/auth/oauthChallenge';
import { enforceAuthRateLimit, getClientIp } from '../../../lib/auth/rateLimit';
import { isOAuthProvider, startOAuthLogin } from '../../../lib/auth/oauthStart';
import { pbkdf2 } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

// ALL /api/auth/login — OAuth 入口 + 邮箱登录（支持 GET，兼容 OpenResty WAF）
export async function ALL(event: APIContext) {
  // OAuth 入口
  const rawProvider = event.url.searchParams.get('provider');
  if (rawProvider) {
    const rawIntent = event.url.searchParams.get('intent');
    if (!isOAuthProvider(rawProvider)) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/?error=unsupported_oauth_provider' },
      });
    }
    const intent: OAuthIntent = rawIntent === 'link' ? 'link' : 'login';
    let linkUserId: string | null = null;
    if (intent === 'link') {
      const session = await getSession(event);
      if (!session) {
        return new Response(null, {
          status: 302,
          headers: { Location: '/?error=link_requires_login' },
        });
      }
      linkUserId = session.userId;
    }
    return await startOAuthLogin(event, {
      provider: rawProvider,
      intent,
      linkUserId,
    });
  }

  // 邮箱登录
  try {
    const body = event.request.method === 'GET'
      ? Object.fromEntries(event.url.searchParams)
      : await event.request.json();
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '邮箱和密码不能为空')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const loginClientIp = getClientIp(event) || 'unknown';
    const loginRate = await enforceAuthRateLimit([
      {
        action: 'auth_login_ip',
        key: loginClientIp,
        limit: 30,
        windowSec: 10 * 60,
        message: '登录请求过于频繁，请稍后再试',
      },
      {
        action: 'auth_login_email',
        key: email,
        limit: 12,
        windowSec: 10 * 60,
        message: '该邮箱登录尝试过多，请稍后再试',
      },
    ]);
    if (!loginRate.ok) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, loginRate.message)), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(loginRate.retryAfterSec),
        },
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // 用户不存在
    if (!user) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '邮箱或密码错误')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // OAuth 用户（无密码）
    if (!user.passwordHash) {
      return new Response(JSON.stringify(error(
        ErrorCodes.UNAUTHORIZED,
        '该账号仅绑定第三方登录，请使用 Google / GitHub 登录'
      )), {
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

