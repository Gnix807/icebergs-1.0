import type { APIEvent } from '@astrojs/node';
import { generateCodeVerifier } from 'arctic';
import { github, google, oauthProviderEnabled, createSession, getSession, deleteSession, type OAuthProvider } from '../../../lib/auth';
import { saveOAuthChallengeWithIntent, consumeOAuthChallenge, type OAuthIntent } from '../../../lib/auth/oauthChallenge';
import {
  findOAuthIdentityUserId,
  getLinkedOAuthProviders,
  linkOAuthIdentity,
  OAuthIdentityError,
} from '../../../lib/auth/oauthIdentity';
import { prisma } from '../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../lib/api';

function isOAuthProvider(value: string): value is OAuthProvider {
  return value === 'github' || value === 'google';
}

function parseProviderFromState(rawState: string | null | undefined): OAuthProvider | null {
  if (!rawState) return null;
  const idx = rawState.indexOf(':');
  if (idx <= 0) return null;
  const maybe = rawState.slice(0, idx);
  return isOAuthProvider(maybe) ? maybe : null;
}

function parseIntentFromState(rawState: string | null | undefined): OAuthIntent | null {
  if (!rawState) return null;
  const parts = rawState.split(':');
  if (parts.length < 2) return null;
  return parts[1] === 'link' ? 'link' : parts[1] === 'login' ? 'login' : null;
}

function sanitizeUsername(raw: string): string {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) return 'user';
  if (cleaned.length < 3) return (cleaned + '___').slice(0, 3);
  return cleaned.slice(0, 20);
}

async function buildUniqueUsername(baseRaw: string): Promise<string> {
  const base = sanitizeUsername(baseRaw);
  let candidate = base;
  let i = 0;
  while (true) {
    const exists = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
    i += 1;
    const suffix = `_${i}`;
    const headLen = Math.max(1, 20 - suffix.length);
    candidate = `${base.slice(0, headLen)}${suffix}`;
  }
}

interface OAuthProfile {
  provider: OAuthProvider;
  externalId: string;
  email: string;
  usernameHint: string;
  nickname: string;
  avatar: string | null;
}

async function resolveOrCreateOAuthUser(profile: OAuthProfile): Promise<string> {
  const patchIfNeeded = async (userId: string): Promise<void> => {
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { nickname: true, avatar: true },
    });
    if (!current) return;
    const patch: { nickname?: string; avatar?: string | null } = {};
    if (!current.nickname && profile.nickname) patch.nickname = profile.nickname;
    if (!current.avatar && profile.avatar) patch.avatar = profile.avatar;
    if (Object.keys(patch).length > 0) {
      await prisma.user.update({ where: { id: userId }, data: patch }).catch(() => {});
    }
  };

  // 1) 首选：OAuth 身份映射表
  const mappedUserId = await findOAuthIdentityUserId(profile.provider, profile.externalId);
  if (mappedUserId) {
    await patchIfNeeded(mappedUserId);
    return mappedUserId;
  }

  // 2) 兼容历史数据：旧版本把 externalId 直接写在 user.id
  const legacyByExternalId = await prisma.user.findUnique({
    where: { id: profile.externalId },
    select: { id: true },
  });
  if (legacyByExternalId) {
    await linkOAuthIdentity(legacyByExternalId.id, profile.provider, profile.externalId, profile.email).catch(() => {});
    await patchIfNeeded(legacyByExternalId.id);
    return legacyByExternalId.id;
  }

  // 3) 邮箱已存在：自动关联到现有账号（让站内注册用户可直接走第三方登录）
  const byEmail = await prisma.user.findUnique({
    where: { email: profile.email },
    select: { id: true },
  });
  if (byEmail) {
    await linkOAuthIdentity(byEmail.id, profile.provider, profile.externalId, profile.email);
    await patchIfNeeded(byEmail.id);
    return byEmail.id;
  }

  // 4) 全新账号
  const username = await buildUniqueUsername(profile.usernameHint || profile.email.split('@')[0] || `${profile.provider}_user`);
  const created = await prisma.user.create({
    data: {
      email: profile.email,
      username,
      nickname: profile.nickname || username,
      avatar: profile.avatar,
    },
    select: { id: true },
  });
  await linkOAuthIdentity(created.id, profile.provider, profile.externalId, profile.email);
  return created.id;
}

// 登录发起（或已登录态绑定）
async function handleLogin(
  event: APIEvent,
  provider: OAuthProvider,
  intent: OAuthIntent = 'login',
  linkUserId: string | null = null
) {
  const state = `${provider}:${intent}:${crypto.randomUUID()}`;

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
  if (provider === 'github') {
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
    provider,
    codeVerifier,
    intent,
    linkUserId,
  });

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl.toString() },
  });
}

// OAuth 回调处理
async function handleCallback(event: APIEvent) {
  const oauthError = event.url.searchParams.get('error');
  if (oauthError) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/?error=oauth_${encodeURIComponent(oauthError)}` },
    });
  }

  const code = event.url.searchParams.get('code');
  const state = event.url.searchParams.get('state');
  const storedState = event.cookies.get('oauth_state')?.value;
  const providerCookie = event.cookies.get('oauth_provider')?.value;
  const intentCookie = event.cookies.get('oauth_intent')?.value;
  const codeVerifier = event.cookies.get('oauth_code_verifier')?.value;

  event.cookies.delete('oauth_state', { path: '/' });
  event.cookies.delete('oauth_provider', { path: '/' });
  event.cookies.delete('oauth_intent', { path: '/' });
  event.cookies.delete('oauth_link_user', { path: '/' });
  event.cookies.delete('oauth_code_verifier', { path: '/' });

  if (!code) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?error=invalid_oauth_missing_code' },
    });
  }

  if (!state) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?error=invalid_oauth_missing_state' },
    });
  }

  const challenge = consumeOAuthChallenge(state);

  if (!storedState && !challenge) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?error=invalid_oauth_state_cookie_missing' },
    });
  }

  if (storedState && state !== storedState && !challenge) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?error=invalid_oauth_state_mismatch' },
    });
  }

  const providerFromCookie = providerCookie && isOAuthProvider(providerCookie) ? providerCookie : null;
  const providerFromChallenge = challenge?.provider || null;
  const providerFromState = parseProviderFromState(state) || parseProviderFromState(storedState);
  const provider = providerFromCookie || providerFromChallenge || providerFromState;
  const finalCodeVerifier = codeVerifier || challenge?.codeVerifier;
  const intentFromCookie: OAuthIntent | null = intentCookie === 'link' || intentCookie === 'login' ? intentCookie : null;
  const intentFromState = parseIntentFromState(state) || parseIntentFromState(storedState);
  const intent: OAuthIntent = intentFromCookie || challenge?.intent || intentFromState || 'login';

  if (!provider) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?error=invalid_oauth_provider_missing' },
    });
  }
  if (provider === 'google' && !finalCodeVerifier) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?error=invalid_oauth_pkce_missing' },
    });
  }

  try {
    let profile: OAuthProfile;

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
      let email = githubUser.email;
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
      const externalId = 'github_' + githubUser.id;
      const finalEmail = email || `${externalId}@local`;
      profile = {
        provider: 'github',
        externalId,
        email: finalEmail,
        usernameHint: githubUser.login || finalEmail.split('@')[0],
        nickname: githubUser.name || githubUser.login || finalEmail.split('@')[0],
        avatar: typeof githubUser.avatar_url === 'string' ? githubUser.avatar_url : null,
      };
    } else {
      const tokens = await google.validateAuthorizationCode(code, finalCodeVerifier!);
      const accessToken = tokens.accessToken();
      const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to get Google user info');
      }
      const googleUser = await response.json();
      const sub = String(googleUser.sub || '');
      if (!sub) throw new Error('Google user info missing sub');
      const externalId = `google_${sub}`;
      const email = (typeof googleUser.email === 'string' && googleUser.email) ? googleUser.email : `${externalId}@local`;
      profile = {
        provider: 'google',
        externalId,
        email,
        usernameHint: email.includes('@') ? email.split('@')[0] : externalId,
        nickname: (typeof googleUser.name === 'string' && googleUser.name)
          ? googleUser.name
          : (email.includes('@') ? email.split('@')[0] : 'Google用户'),
        avatar: typeof googleUser.picture === 'string' ? googleUser.picture : null,
      };
    }

    if (intent === 'link') {
      const currentSession = await getSession(event);
      const targetUserId = currentSession?.userId;
      if (!targetUserId) {
        return new Response(null, {
          status: 302,
          headers: { Location: '/?error=link_requires_login' },
        });
      }

      try {
        await linkOAuthIdentity(targetUserId, provider, profile.externalId, profile.email);
      } catch (linkErr) {
        if (linkErr instanceof OAuthIdentityError) {
          if (linkErr.code === 'IDENTITY_TAKEN') {
            return new Response(null, {
              status: 302,
              headers: { Location: '/?error=oauth_linked_to_other_account' },
            });
          }
          if (linkErr.code === 'PROVIDER_ALREADY_LINKED') {
            return new Response(null, {
              status: 302,
              headers: { Location: `/user/${targetUserId}?error=oauth_provider_already_linked` },
            });
          }
        }
        throw linkErr;
      }

      const current = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { nickname: true, avatar: true },
      });
      if (current) {
        const patch: { nickname?: string; avatar?: string | null } = {};
        if (!current.nickname && profile.nickname) patch.nickname = profile.nickname;
        if (!current.avatar && profile.avatar) patch.avatar = profile.avatar;
        if (Object.keys(patch).length > 0) {
          await prisma.user.update({ where: { id: targetUserId }, data: patch }).catch(() => {});
        }
      }

      return new Response(null, {
        status: 302,
        headers: { Location: `/user/${targetUserId}?linked=${provider}` },
      });
    }

    const userId = await resolveOrCreateOAuthUser(profile);
    await createSession(userId, event);

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
    const rawProvider = url.searchParams.get('provider') || 'github';
    const rawIntent = url.searchParams.get('intent');
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

    try {
      return await handleLogin(event, rawProvider, intent, linkUserId);
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

  // 获取当前用户绑定的第三方账号
  if (action === 'providers') {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '未登录')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const linkedProviders = await getLinkedOAuthProviders(session.userId);
    return new Response(JSON.stringify(success({
      linkedProviders,
    })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
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
        passwordHash: true,
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

    const { stats: _stats, passwordHash: _passwordHash, ...userOut } = user as any;
    const linkedProviders = await getLinkedOAuthProviders(user.id);

    return new Response(JSON.stringify(success({
      ...userOut,
      authMethods: {
        email: Boolean(_passwordHash),
        github: linkedProviders.github,
        google: linkedProviders.google,
      },
      pendingAchievements,
    })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Not Found', { status: 404 });
}
