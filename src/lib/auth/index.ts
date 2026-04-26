import { GitHub, Google } from 'arctic';
import type { APIEvent } from '@astrojs/node';
import { prisma } from '../prisma';
import type { Role, AccountStatus } from '../types';
import 'dotenv/config';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.REDIRECT_URI
  || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4321/api/auth/callback');
if (!REDIRECT_URI) {
  throw new Error('Missing REDIRECT_URI in production environment');
}
export const github = new GitHub(GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, REDIRECT_URI);
export const google = new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);

export type OAuthProvider = 'github' | 'google';

export const oauthProviderEnabled: Record<OAuthProvider, boolean> = {
  github: Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
  google: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
};

export interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  name: string | null;
  avatar_url: string;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

export async function createSession(userId: string, event: APIEvent): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { id: sessionId, userId, expiresAt },
  });

  event.cookies.set('session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS / 1000,
    path: '/',
  });

  return sessionId;
}

export interface SessionUser {
  userId: string;
  role: Role;
  status: AccountStatus;
  isFounder: boolean;
}

/** Resolve a raw session ID to a SessionUser (Astro pages). */
export async function getSessionById(sessionId: string | undefined): Promise<SessionUser | null> {
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    return null;
  }
  return resolveSessionUser(session.userId);
}

/** Resolve a session from an API request cookie to a SessionUser (API routes). */
export async function getSession(event: APIEvent): Promise<SessionUser | null> {
  const sessionId = event.cookies.get('session')?.value;
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    return null;
  }

  return resolveSessionUser(session.userId);
}

/**
 * Load the user for a session, applying lazy evaluation:
 * - If TEMP_BANNED and banUntil has passed, automatically lift the ban.
 * - If PERM_BANNED, destroy the session and return null.
 */
async function resolveSessionUser(userId: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true, banUntil: true, isFounder: true },
  });
  if (!user) return null;

  const isFounder = Boolean(user.isFounder);
  let status = user.status as AccountStatus;

  // Lazy-lift expired TEMP_BANNED
  if (status === 'TEMP_BANNED' && user.banUntil && user.banUntil < new Date()) {
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', banUntil: null },
    }).catch(() => {});
    status = 'ACTIVE';
  }

  // PERM_BANNED: block session — but FOUNDER is immune
  if (status === 'PERM_BANNED' && !isFounder) return null;

  return { userId, role: user.role as Role, status, isFounder };
}

export async function deleteSession(event: APIEvent): Promise<void> {
  const sessionId = event.cookies.get('session')?.value;
  if (sessionId) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
  }
  event.cookies.delete('session', { path: '/' });
}
