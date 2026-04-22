import type { Role, AccountStatus } from './types';
import { isRestricted } from './types';

// ── Role hierarchy ─────────────────────────────────────────

const ROLE_RANK: Record<Role, number> = {
  USER: 0,
  CONTRIBUTOR: 1,
  EDITOR: 2,
  ADMIN: 3,
};

export function hasRole(userRole: string, required: Role): boolean {
  return (ROLE_RANK[userRole as Role] ?? -1) >= ROLE_RANK[required];
}

// ── Permission definitions ──────────────────────────────────

/**
 * Permissions indexed by action string.
 * Values are the minimum Role required.
 * Special rules (e.g. status checks) are handled in can().
 */
const ACTION_ROLE: Record<string, Role> = {
  // Content
  'content:read':        'USER',
  'content:create':      'USER',
  'content:edit:own':    'USER',
  'content:submit':      'USER',       // submit for review
  'content:suggest':     'CONTRIBUTOR',// suggest item edits
  'content:review':      'EDITOR',     // approve / reject icebergs
  'content:edit:any':    'EDITOR',
  'content:feature':     'EDITOR',
  'content:delete:any':  'ADMIN',
  'content:override':    'ADMIN',      // ADMIN Override on reviews

  // Social
  'social:vote':         'USER',
  'social:watchlist':    'USER',
  'social:rfa:vote:editor': 'CONTRIBUTOR', // qualityScore checked separately
  'social:rfa:vote:admin':  'CONTRIBUTOR',

  // User management
  'user:warn':           'EDITOR',
  'user:restrict':       'ADMIN',
  'user:ban':            'ADMIN',
  'user:role':           'ADMIN',

  // Reports / Appeals
  'report:file':         'USER',
  'report:handle':       'EDITOR',
  'appeal:file':         'USER',
  'appeal:handle':       'ADMIN',
};

// Actions that restricted/banned users CAN still perform
const ALLOWED_WHEN_RESTRICTED = new Set([
  'content:read',
  'report:file',
  'appeal:file',
]);

export interface CanUser {
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

  // FOUNDER bypasses all permission checks unconditionally
  if (user.isFounder) return true;

  const status = user.status as AccountStatus;

  // Banned users get no session (resolved in auth layer), but guard here too
  if (status === 'PERM_BANNED' || status === 'TEMP_BANNED') return false;

  // Restricted users: only allow safe read actions
  if (isRestricted(status) && !ALLOWED_WHEN_RESTRICTED.has(action)) return false;

  const required = ACTION_ROLE[action];
  if (!required) return false; // unknown action → deny

  return hasRole(user.role, required);
}
