import type { OAuthProvider } from './index';
import { prisma } from '../prisma';
import { createHash } from 'crypto';

export type OAuthIntent = 'login' | 'link';

export interface OAuthChallenge {
  provider: OAuthProvider;
  codeVerifier?: string;
  intent: OAuthIntent;
  linkUserId: string | null;
  createdAt: number;
}

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

interface OAuthChallengeRow {
  id: string;
  provider: string;
  intent: string;
  code_verifier: string | null;
  link_user_id: string | null;
  created_at: string;
}

function hashState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

async function cleanupExpired(nowIso: string): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM oauth_challenges
    WHERE expires_at <= ${nowIso}::TIMESTAMPTZ
  `;
}

export async function saveOAuthChallenge(state: string, provider: OAuthProvider, codeVerifier?: string): Promise<void> {
  await saveOAuthChallengeWithIntent(state, {
    provider,
    codeVerifier,
    intent: 'login',
    linkUserId: null,
  });
}

export async function saveOAuthChallengeWithIntent(
  state: string,
  payload: {
    provider: OAuthProvider;
    codeVerifier?: string;
    intent: OAuthIntent;
    linkUserId?: string | null;
  }
): Promise<void> {

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresIso = new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString();
  const stateHash = hashState(state);

  await cleanupExpired(nowIso);
  await prisma.$executeRaw`
    DELETE FROM oauth_challenges
    WHERE state_hash = ${stateHash}
  `;
  await prisma.$executeRaw`
    INSERT INTO oauth_challenges (
      id, state_hash, provider, intent, code_verifier, link_user_id, expires_at, consumed_at, created_at
    ) VALUES (
      ${crypto.randomUUID()},
      ${stateHash},
      ${payload.provider},
      ${payload.intent},
      ${payload.codeVerifier ?? null},
      ${payload.linkUserId ?? null},
      ${expiresIso}::TIMESTAMPTZ,
      ${null},
      ${nowIso}::TIMESTAMPTZ
    )
  `;
}

export async function consumeOAuthChallenge(state: string): Promise<OAuthChallenge | null> {

  const nowIso = new Date().toISOString();
  const stateHash = hashState(state);
  await cleanupExpired(nowIso);

  const rows = await prisma.$queryRaw<OAuthChallengeRow[]>`
    SELECT id, provider, intent, code_verifier, link_user_id, created_at
    FROM oauth_challenges
    WHERE state_hash = ${stateHash}
      AND consumed_at IS NULL
      AND expires_at > ${nowIso}::TIMESTAMPTZ
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;

  const consumedIso = new Date().toISOString();
  const affected = await prisma.$executeRaw`
    UPDATE oauth_challenges
    SET consumed_at = ${consumedIso}::TIMESTAMPTZ
    WHERE id = ${row.id} AND consumed_at IS NULL
  `;
  if (Number(affected) < 1) {
    return null;
  }

  const provider = row.provider === 'google' ? 'google' : row.provider === 'github' ? 'github' : null;
  const intent = row.intent === 'link' ? 'link' : row.intent === 'login' ? 'login' : null;
  if (!provider || !intent) return null;

  return {
    provider,
    codeVerifier: row.code_verifier ?? undefined,
    intent,
    linkUserId: row.link_user_id ?? null,
    createdAt: new Date(row.created_at).getTime(),
  };
}
