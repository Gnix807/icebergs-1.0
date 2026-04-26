/**
 * Application-level type definitions.
 * SQLite does not support Prisma enums, so these TypeScript union types
 * provide equivalent type-safety at the application layer.
 */

// User role (stored as String in DB)
export type Role = 'USER' | 'CONTRIBUTOR' | 'EDITOR' | 'MODERATOR' | 'ADMIN';

// Account status (stored as String in DB)
export type AccountStatus =
  | 'ACTIVE'
  | 'WARNED_1'
  | 'WARNED_2'
  | 'READ_ONLY'
  | 'TEMP_BANNED'
  | 'PERM_BANNED';

// Iceberg publication status (stored as String in DB)
export type IcebergStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'ARCHIVED';

// IcebergReview status
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'OVERRIDDEN';

// Appeal type
export type AppealType = 'WARNED_2_CLEAR' | 'READ_ONLY' | 'TEMP_BAN' | 'PERM_BAN';

// Appeal status
export type AppealStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

// Report type
export type ReportType = 'iceberg' | 'user' | 'rfa_candidate';

// Report status
export type ReportStatus = 'PENDING' | 'RESOLVED_ACTION' | 'RESOLVED_DISMISSED';

// ── Permission helpers ──────────────────────────────────────

/** Returns true if the role can perform editorial actions */
export function isEditor(role: string): role is 'EDITOR' | 'MODERATOR' | 'ADMIN' {
  return role === 'EDITOR' || role === 'MODERATOR' || role === 'ADMIN';
}

/** Returns true if the role is ADMIN */
export function isAdmin(role: string): role is 'ADMIN' {
  return role === 'ADMIN';
}

/** Returns true if the account is in any restricted state */
export function isRestricted(status: string): boolean {
  return status === 'READ_ONLY' || status === 'TEMP_BANNED' || status === 'PERM_BANNED';
}

/** Returns true if the account is banned (cannot log in) */
export function isBanned(status: string): boolean {
  return status === 'TEMP_BANNED' || status === 'PERM_BANNED';
}

// ── Checklist ──────────────────────────────────────────────

export interface ChecklistItem {
  key: string;
  label: string;
  pass: boolean;
  hint?: string;
}

export interface ChecklistResult {
  passed: boolean;
  items: ChecklistItem[];
}

// ── 成就条件积木 ──────────────────────────────────────────────

export type ConditionOp = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains'

export type BlockCondition = {
  block: string
  op: ConditionOp
  value: string | number | boolean
  varA?: string  // 用于 varDiff / varEqual
  varB?: string
}

export type LogicNode = { logic: 'AND' | 'OR' }

export type Condition = BlockCondition | LogicNode

// ── 成就检查上下文 ────────────────────────────────────────────

export interface AchievementUserStats {
  totalRead: number
  searchCount: number
  randomCount: number
  nightReadCount: number
  visitedIcebergCount: number
  consecutiveDays: number
  totalVotesCast: number
  totalSessionMinutes: number
  pendingAchievements: string   // JSON string[]
}

export interface AchievementContext {
  userId: string
  triggerType: 'read' | 'search' | 'random' | 'vote' | 'visit'
  currentHour: number
  currentMinute: number
  currentDayOfWeek: number    // 0=Sunday
  currentDayOfMonth: number
  currentMonth: number        // 1–12
  currentItem?: {
    id: string
    title: string
    desc: string
    labels: string[]
    tierOrder: number         // 0-based
    icebergId: string
  }
  currentIceberg?: {
    id: string
    tierCount: number
    itemCount: number
  }
  currentIcebergReadCount: number
  isBottomTier: boolean
  isFirstVisitIceberg: boolean
  sessionMinutes: number
  stats: AchievementUserStats
  user: {
    qualityLevel: number
    warningCount: number
    createdIcebergCount: number
    watchlistCount: number
    unlockedAchievementCount: number
    daysSinceRegister: number
    hasUnreadNotification: boolean
  }
}
