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

let ensurePromise: Promise<void> | null = null;

async function ensureOAuthIdentityTable(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS oauth_identities (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          provider_user_id TEXT NOT NULL,
          email TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_identity_unique
        ON oauth_identities(provider, provider_user_id)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_identity_user_provider
        ON oauth_identities(user_id, provider)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_oauth_identity_user
        ON oauth_identities(user_id)
      `);
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }

  await ensurePromise;
}

export async function findOAuthIdentityUserId(provider: OAuthProvider, providerUserId: string): Promise<string | null> {
  await ensureOAuthIdentityTable();
  const rows = await prisma.$queryRaw<OAuthIdentityRow[]>`
    SELECT user_id, provider, provider_user_id
    FROM oauth_identities
    WHERE provider = ${provider} AND provider_user_id = ${providerUserId}
    LIMIT 1
  `;
  return rows[0]?.user_id ?? null;
}

export async function getLinkedOAuthProviders(userId: string): Promise<Record<OAuthProvider, boolean>> {
  await ensureOAuthIdentityTable();
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
  await ensureOAuthIdentityTable();

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
