import type { APIEvent } from '@astrojs/node';
import { github, createSession, getSession, deleteSession, type OAuthProvider } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';

// 登录发起
async function handleLogin(event: APIEvent, provider: OAuthProvider) {
  const state = crypto.randomUUID();

  event.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });

  // 保存 provider 到 cookie 以便回调时识别
  event.cookies.set('oauth_provider', provider, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });

  let authUrl: URL;

  if (provider === 'github') {
    const scopes = ['read:user', 'user:email'];
    authUrl = github.createAuthorizationURL(state, scopes);
  } else {
    throw new Error('不支持的登录方式');
  }

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl.toString() },
  });
}

// OAuth 回调处理
async function handleCallback(event: APIEvent) {
  const code = event.url.searchParams.get('code');
  const state = event.url.searchParams.get('state');
  const storedState = event.cookies.get('oauth_state')?.value;
  const provider = event.cookies.get('oauth_provider')?.value as OAuthProvider;

  event.cookies.delete('oauth_state', { path: '/' });
  event.cookies.delete('oauth_provider', { path: '/' });

  if (!code || !state) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?error=invalid_oauth' },
    });
  }

  if (state !== storedState) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?error=invalid_oauth' },
    });
  }

  if (!provider) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?error=invalid_oauth' },
    });
  }

  try {
    let userId: string;
    let email: string;
    let username: string;
    let nickname: string;

    if (provider === 'github') {
      const tokens = await github.validateAuthorizationCode(code);
      const accessToken = tokens.accessToken();

      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'IcebergApp',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get GitHub user info');
      }

      const githubUser = await response.json();

      // 获取邮箱（GitHub 可能不公开）
      email = githubUser.email;
      if (!email) {
        const emailRes = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'IcebergApp',
            Accept: 'application/json',
          },
        });
        if (emailRes.ok) {
          const emails = await emailRes.json();
          const primaryEmail = emails.find((e: any) => e.primary) || emails[0];
          email = primaryEmail?.email;
        }
      }

      userId = 'github_' + githubUser.id;
      username = githubUser.login;
      nickname = githubUser.name || githubUser.login;
    } else {
      throw new Error('不支持的登录方式');
    }

    // 查找或创建用户
    const user = await prisma.user.upsert({
      where: { id: userId },
      update: {
        nickname,
      },
      create: {
        id: userId,
        email: email || `${userId}@local`,
        username,
        nickname,
      },
    });
    await createSession(user.id, event);

    return new Response(null, {
      status: 302,
      headers: { Location: '/' },
    });
  } catch (err) {
    console.error('OAuth callback error:', err instanceof Error ? err.message : String(err));
    return new Response(null, {
      status: 302,
      headers: { Location: '/?error=oauth_failed' },
    });
  }
}

export async function GET(event: APIEvent) {
  const pathname = event.url.pathname;
  const action = pathname.split('/').pop();

  // 登录发起 - 支持 ?provider=github 或 ?provider=google
  if (action === 'login') {
    const url = new URL(event.request.url);
    const provider = (url.searchParams.get('provider') || 'github') as OAuthProvider;

    try {
      return await handleLogin(event, provider);
    } catch (err) {
      console.error('Login error:', err);
      return new Response('Login failed', { status: 500 });
    }
  }

  // OAuth 回调
  if (action === 'callback') {
    return await handleCallback(event);
  }

  // 登出
  if (action === 'logout') {
    await deleteSession(event);
    return new Response(null, {
      status: 302,
      headers: { Location: '/' },
    });
  }

  // 获取当前登录用户信息
  if (action === 'me') {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '未登录')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        nickname: true,
        email: true,
        role: true,
        isFounder: true,
        createdAt: true,
        stats: { select: { pendingAchievements: true } },
      },
    });

    if (!user) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '用户不存在')), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 取 pendingAchievements 对应的成就详情
    const pending: string[] = JSON.parse((user as any).stats?.pendingAchievements || '[]');
    let pendingAchievements: { key: string; icon: string; labelZh: string; desc: string; color: string }[] = [];
    if (pending.length > 0) {
      const defs = await prisma.achievement.findMany({
        where: { key: { in: pending } },
        select: { key: true, icon: true, labelZh: true, desc: true, color: true },
      });
      pendingAchievements = defs;
    }

    const { stats: _stats, ...userOut } = user as any;

    return new Response(JSON.stringify(success({ ...userOut, pendingAchievements })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Not Found', { status: 404 });
}
