import type { OAuthProvider } from './index';

export type OAuthIntent = 'login' | 'link';

interface OAuthChallenge {
  provider: OAuthProvider;
  codeVerifier?: string;
  intent: OAuthIntent;
  linkUserId: string | null;
  createdAt: number;
}

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const store = new Map<string, OAuthChallenge>();

function cleanupExpired(now: number): void {
  for (const [key, challenge] of store.entries()) {
    if (now - challenge.createdAt > CHALLENGE_TTL_MS) {
      store.delete(key);
    }
  }
}

export function saveOAuthChallenge(state: string, provider: OAuthProvider, codeVerifier?: string): void {
  const now = Date.now();
  cleanupExpired(now);
  store.set(state, {
    provider,
    codeVerifier,
    intent: 'login',
    linkUserId: null,
    createdAt: now,
  });
}

export function saveOAuthChallengeWithIntent(
  state: string,
  payload: {
    provider: OAuthProvider;
    codeVerifier?: string;
    intent: OAuthIntent;
    linkUserId?: string | null;
  }
): void {
  const now = Date.now();
  cleanupExpired(now);
  store.set(state, {
    provider: payload.provider,
    codeVerifier: payload.codeVerifier,
    intent: payload.intent,
    linkUserId: payload.linkUserId ?? null,
    createdAt: now,
  });
}

export function consumeOAuthChallenge(state: string): OAuthChallenge | null {
  const now = Date.now();
  cleanupExpired(now);
  const challenge = store.get(state) || null;
  if (challenge) {
    store.delete(state);
  }
  return challenge;
}
