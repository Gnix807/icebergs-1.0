import type { APIContext } from 'astro';
import { generateCodeVerifier } from 'arctic';
import { github, google, oauthProviderEnabled, type OAuthProvider } from './index';
import { saveOAuthChallengeWithIntent, type OAuthIntent } from './oauthChallenge';
import { enforceAuthRateLimit, getClientIp } from './rateLimit';

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === 'github' || value === 'google';
}

interface StartOAuthOptions {
  provider: OAuthProvider;
  intent?: OAuthIntent;
  linkUserId?: string | null;
}

export async function startOAuthLogin(event: APIContext, options: StartOAuthOptions): Promise<Response> {
  const { provider } = options;
  const intent: OAuthIntent = options.intent ?? 'login';
  const linkUserId = options.linkUserId ?? null;

  if (!oauthProviderEnabled[provider]) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/?error=oauth_provider_not_configured' },
    });
  }

  const oauthClientIp = getClientIp(event) || 'unknown';
  const oauthRate = await enforceAuthRateLimit([
    {
      action: 'auth_oauth_start_ip',
      key: `${provider}:${oauthClientIp}`,
      limit: 20,
      windowSec: 10 * 60,
      message: '第三方登录请求过于频繁，请稍后重试',
    },
  ]);
  if (!oauthRate.ok) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/?error=oauth_rate_limited&retry=${oauthRate.retryAfterSec}` },
    });
  }

  const state = `${provider}:${intent}:${crypto.randomUUID()}`;

  event.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });
  event.cookies.set('oauth_provider', provider, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });
  event.cookies.set('oauth_intent', intent, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });

  if (linkUserId) {
    event.cookies.set('oauth_link_user', linkUserId, {
      httpOnly: true,
      secure: false,
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
    authUrl = github.createAuthorizationURL(state, ['read:user', 'user:email']);
  } else {
    codeVerifier = generateCodeVerifier();
    event.cookies.set('oauth_code_verifier', codeVerifier, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 10,
      path: '/',
    });
    authUrl = google.createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email']);
  }

  await saveOAuthChallengeWithIntent(state, {
    provider,
    intent,
    linkUserId,
    codeVerifier,
  });

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl.toString() },
  });
}
