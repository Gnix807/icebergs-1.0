import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession, type OAuthProvider } from '../../../lib/auth';
import { success, error, ErrorCodes } from '../../../lib/api';
import {
  getLinkedOAuthProviders,
  unlinkOAuthIdentity,
} from '../../../lib/auth/oauthIdentity';
import { enforceAuthRateLimit, getClientIp } from '../../../lib/auth/rateLimit';

function isOAuthProvider(value: string): value is OAuthProvider {
  return value === 'github' || value === 'google';
}

// POST /api/auth/unlink-provider
// body: { provider: 'github' | 'google' }
export async function ALL(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json().catch(() => ({}));
    const provider = typeof body.provider === 'string' ? body.provider : '';
    if (!isOAuthProvider(provider)) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, 'provider 仅支持 github 或 google')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const clientIp = getClientIp(event) || 'unknown';
    const rateResult = await enforceAuthRateLimit([
      {
        action: 'auth_unlink_provider_user',
        key: session.userId,
        limit: 20,
        windowSec: 10 * 60,
        message: '操作过于频繁，请稍后再试',
      },
      {
        action: 'auth_unlink_provider_ip',
        key: clientIp,
        limit: 30,
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

    const [linked, user] = await Promise.all([
      getLinkedOAuthProviders(session.userId),
      prisma.user.findUnique({
        where: { id: session.userId },
        select: { passwordHash: true },
      }),
    ]);

    if (!linked[provider]) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, `当前未绑定 ${provider}`)), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const linkedCount = Number(linked.github) + Number(linked.google);
    const hasEmailPassword = Boolean(user?.passwordHash);
    if (!hasEmailPassword && linkedCount <= 1) {
      return new Response(JSON.stringify(error(
        ErrorCodes.BAD_REQUEST,
        '至少保留一种登录方式，请先设置邮箱密码后再解绑最后一个第三方账号'
      )), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await unlinkOAuthIdentity(session.userId, provider);
    const latestLinked = await getLinkedOAuthProviders(session.userId);

    return new Response(JSON.stringify(success({
      unlinked: provider,
      authMethods: {
        email: hasEmailPassword,
        github: latestLinked.github,
        google: latestLinked.google,
      },
    })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('解绑第三方失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '解绑失败，请稍后重试')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

