import type { Role, AccountStatus } from './types';
import { isRestricted } from './types';
import {
  hasCapability,
  type Capability,
  type CapabilityUser,
} from './capabilities';

// ── Role hierarchy ─────────────────────────────────────────

const ROLE_RANK: Record<Role, number> = {
  USER: 0,
  CONTRIBUTOR: 1,
  EDITOR: 2,
  MODERATOR: 3,
  ADMIN: 4,
};

export function hasRole(userRole: string, required: Role): boolean {
  return (ROLE_RANK[userRole as Role] ?? -1) >= ROLE_RANK[required];
}

// ── Permission definitions ──────────────────────────────────

const ACTION_CAPABILITY: Record<string, Capability> = {
  'content:review': 'PUBLICATION_REVIEW',
  'content:feature': 'CONTENT_CURATION',
  'content:delete:any': 'SITE_ADMINISTRATION',
  'content:override': 'SITE_ADMINISTRATION',
  'user:warn': 'COMMUNITY_MODERATION',
  'user:restrict': 'COMMUNITY_MODERATION',
  'user:ban': 'COMMUNITY_MODERATION',
  'user:role': 'SITE_ADMINISTRATION',
  'report:handle': 'COMMUNITY_MODERATION',
  'appeal:handle': 'COMMUNITY_MODERATION',
};

const AUTHENTICATED_ACTIONS = new Set([
  'content:read',
  'content:create',
  'content:edit:own',
  'content:submit',
  'content:suggest',
  'social:vote',
  'social:watchlist',
  'report:file',
  'appeal:file',
]);

// Actions that restricted/banned users CAN still perform
const ALLOWED_WHEN_RESTRICTED = new Set([
  'content:read',
  'report:file',
  'appeal:file',
]);

export interface CanUser extends Partial<CapabilityUser> {
  role: string;
  status: string;
  isFounder?: boolean;
}

/**
 * Check whether a user can perform an action.
 * Pass null/undefined to get the guest (unauthenticated) result.
 */
export function can(user: CanUser | null | undefined, action: string): boolean {
  if (!user) {
    // Guests can only read
    return action === 'content:read';
  }

  const status = user.status as AccountStatus;

  // Banned users get no session (resolved in auth layer), but guard here too
  if (status === 'PERM_BANNED' || status === 'TEMP_BANNED') return false;

  // Restricted users: only allow safe read actions
  if (isRestricted(status) && !ALLOWED_WHEN_RESTRICTED.has(action)) return false;

  const capability = ACTION_CAPABILITY[action];
  if (capability) return hasCapability(user, capability);

  // Direct edits of somebody else's repository are intentionally retired.
  // Site staff submit a PR or use an audited break-glass workflow instead.
  if (action === 'content:edit:any') return false;
  if (action.startsWith('social:rfa:')) return false;
  if (AUTHENTICATED_ACTIONS.has(action)) return true;

  // New actions must be explicitly classified above. Falling back to a role
  // comparison would silently reconnect legacy rank to authorization.
  return false;
}
