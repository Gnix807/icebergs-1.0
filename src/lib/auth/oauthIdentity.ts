import { prisma } from '../prisma';
import type { OAuthProvider } from './index';

interface OAuthIdentityRow {
  user_id: string;
  provider: string;
  provider_user_id: string;
}

export class OAuthIdentityError extends Error {
  code: 'IDENTITY_TAKEN' | 'PROVIDER_ALREADY_LINKED';

  constructor(code: 'IDENTITY_TAKEN' | 'PROVIDER_ALREADY_LINKED', message: string) {
    super(message);
    this.code = code;
  }
}

export async function findOAuthIdentityUserId(provider: OAuthProvider, providerUserId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<OAuthIdentityRow[]>`
    SELECT user_id, provider, provider_user_id
    FROM oauth_identities
    WHERE provider = ${provider} AND provider_user_id = ${providerUserId}
    LIMIT 1
  `;
  return rows[0]?.user_id ?? null;
}

export async function getLinkedOAuthProviders(userId: string): Promise<Record<OAuthProvider, boolean>> {
  const rows = await prisma.$queryRaw<OAuthIdentityRow[]>`
    SELECT user_id, provider, provider_user_id
    FROM oauth_identities
    WHERE user_id = ${userId}
  `;

  const providers: Record<OAuthProvider, boolean> = { github: false, google: false };
  for (const row of rows) {
    if (row.provider === 'github') providers.github = true;
    if (row.provider === 'google') providers.google = true;
  }
  return providers;
}

export async function linkOAuthIdentity(
  userId: string,
  provider: OAuthProvider,
  providerUserId: string,
  email: string | null
): Promise<'linked' | 'already_linked'> {

  const byIdentity = await prisma.$queryRaw<OAuthIdentityRow[]>`
    SELECT user_id, provider, provider_user_id
    FROM oauth_identities
    WHERE provider = ${provider} AND provider_user_id = ${providerUserId}
    LIMIT 1
  `;
  if (byIdentity[0] && byIdentity[0].user_id !== userId) {
    throw new OAuthIdentityError('IDENTITY_TAKEN', '该第三方账号已绑定到其他用户');
  }
  if (byIdentity[0] && byIdentity[0].user_id === userId) {
    return 'already_linked';
  }

  const byUserAndProvider = await prisma.$queryRaw<OAuthIdentityRow[]>`
    SELECT user_id, provider, provider_user_id
    FROM oauth_identities
    WHERE user_id = ${userId} AND provider = ${provider}
    LIMIT 1
  `;
  if (byUserAndProvider[0] && byUserAndProvider[0].provider_user_id !== providerUserId) {
    throw new OAuthIdentityError('PROVIDER_ALREADY_LINKED', `当前账号已绑定 ${provider}`);
  }
  if (byUserAndProvider[0] && byUserAndProvider[0].provider_user_id === providerUserId) {
    return 'already_linked';
  }

  const now = new Date().toISOString();
  await prisma.$executeRaw`
    INSERT INTO oauth_identities (id, user_id, provider, provider_user_id, email, created_at)
    VALUES (${crypto.randomUUID()}, ${userId}, ${provider}, ${providerUserId}, ${email}, ${now})
  `;
  return 'linked';
}

export async function unlinkOAuthIdentity(userId: string, provider: OAuthProvider): Promise<number> {
  const affected = await prisma.$executeRaw`
    DELETE FROM oauth_identities
    WHERE user_id = ${userId} AND provider = ${provider}
  `;
  return Number(affected ?? 0);
}
