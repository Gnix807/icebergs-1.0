import type { APIEvent } from '@astrojs/node';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';
import { createSession, getSession, github, google, oauthProviderEnabled, type OAuthProvider } from '../../../lib/auth';
import { saveOAuthChallengeWithIntent, type OAuthIntent } from '../../../lib/auth/oauthChallenge';
import { generateCodeVerifier } from 'arctic';
import { pbkdf2 } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

function isOAuthProvider(value: string): value is OAuthProvider {
  return value === 'github' || value === 'google';
}

function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

// GET /api/auth/login?provider=github|google - OAuth 登录入口
export async function GET(event: APIEvent) {
  const rawProvider = event.url.searchParams.get('provider');
  const rawIntent = event.url.searchParams.get('intent');
  if (!rawProvider) {
    return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 provider 参数')), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isOAuthProvider(rawProvider)) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?error=unsupported_oauth_provider' },
    });
  }
  if (!oauthProviderEnabled[rawProvider]) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?error=oauth_provider_not_configured' },
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

  // 把 provider 编进 state，回调时即使 provider cookie 丢失也可回退识别
  const state = `${rawProvider}:${intent}:${crypto.randomUUID()}`;
  event.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });
  event.cookies.set('oauth_provider', rawProvider, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });
  event.cookies.set('oauth_intent', intent, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });
  if (linkUserId) {
    event.cookies.set('oauth_link_user', linkUserId, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      maxAge: 60 * 10,
      path: '/',
    });
  } else {
    event.cookies.delete('oauth_link_user', { path: '/' });
  }

  let authUrl: URL;
  let codeVerifier: string | undefined;
  if (rawProvider === 'github') {
    const scopes = ['read:user', 'user:email'];
    authUrl = github.createAuthorizationURL(state, scopes);
  } else {
    codeVerifier = generateCodeVerifier();
    event.cookies.set('oauth_code_verifier', codeVerifier, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      maxAge: 60 * 10,
      path: '/',
    });
    const scopes = ['openid', 'profile', 'email'];
    authUrl = google.createAuthorizationURL(state, codeVerifier, scopes);
  }
  saveOAuthChallengeWithIntent(state, {
    provider: rawProvider,
    codeVerifier,
    intent,
    linkUserId,
  });

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl.toString() },
  });
}

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
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '邮箱和密码不能为空')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
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
