import { prisma } from './prisma';
import type { AccountStatus, Role } from './types';

export const CAPABILITIES = [
  'PUBLICATION_REVIEW',
  'CONTENT_CURATION',
  'COMMUNITY_MODERATION',
  'SITE_ADMINISTRATION',
] as const;

export type Capability = (typeof CAPABILITIES)[number];
export type CapabilityStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface CapabilityState {
  id?: string;
  capability: Capability;
  status: CapabilityStatus;
  source: string;
  probationEndsAt?: string | null;
  suspendedUntil?: string | null;
}

export interface CapabilityUser {
  userId?: string;
  role?: string;
  status: string;
  isFounder?: boolean;
  capabilities?: Capability[];
  capabilityStates?: CapabilityState[];
}

export const CAPABILITY_META: Record<Capability, { label: string; description: string; tone: string }> = {
  PUBLICATION_REVIEW: {
    label: '发布审核员',
    description: '审核待发布版本，并对审核结果负责',
    tone: '#22c55e',
  },
  CONTENT_CURATION: {
    label: '内容策展员',
    description: '维护精选、主题入口与内容组织',
    tone: '#38bdf8',
  },
  COMMUNITY_MODERATION: {
    label: '社区管理',
    description: '处理举报、警告、下架与申诉协作',
    tone: '#f59e0b',
  },
  SITE_ADMINISTRATION: {
    label: '站点管理',
    description: '管理系统配置、能力授权与紧急处置',
    tone: '#ef4444',
  },
};

const LEGACY_ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  USER: [],
  CONTRIBUTOR: [],
  EDITOR: ['PUBLICATION_REVIEW', 'CONTENT_CURATION', 'COMMUNITY_MODERATION'],
  MODERATOR: ['PUBLICATION_REVIEW', 'CONTENT_CURATION', 'COMMUNITY_MODERATION'],
  ADMIN: [...CAPABILITIES],
};

export function legacyCapabilitiesForRole(role: string, isFounder = false): Capability[] {
  if (isFounder) return [...CAPABILITIES];
  return [...(LEGACY_ROLE_CAPABILITIES[role as Role] ?? [])];
}

export function hasCapability(
  user: Pick<CapabilityUser, 'capabilities' | 'isFounder'> | null | undefined,
  capability: Capability,
): boolean {
  if (!user) return false;
  if (user.isFounder) return true;
  return user.capabilities?.includes(capability) ?? false;
}

export async function isCapabilityAuthEnabled(): Promise<boolean> {
  const env = process.env.CAPABILITY_AUTH_ENABLED;
  if (env === 'true') return true;
  if (env === 'false') return false;
  try {
    const setting = await prisma.systemSettings.findUnique({
      where: { key: 'feature_capability_auth' },
      select: { value: true },
    });
    return setting?.value === 'true';
  } catch {
    return false;
  }
}

/**
 * Resolve effective site capabilities for a session.
 *
 * Before the strict feature flag is enabled, database capabilities and the
 * legacy-role translation are unioned. This is the shadow/migration mode and
 * prevents an incomplete production backfill from removing access.
 */
export async function resolveUserCapabilities(
  userId: string,
  role: string,
  isFounder: boolean,
): Promise<{ capabilities: Capability[]; states: CapabilityState[] }> {
  const legacy = legacyCapabilitiesForRole(role, isFounder);
  const now = new Date();
  let rows: any[] = [];

  try {
    rows = await (prisma as any).userCapability.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    const expired = rows.filter((row) =>
      row.status === 'SUSPENDED'
      && row.suspendedUntil
      && new Date(row.suspendedUntil) <= now);
    if (expired.length) {
      await (prisma as any).userCapability.updateMany({
        where: { id: { in: expired.map((row) => row.id) }, status: 'SUSPENDED' },
        data: {
          status: 'ACTIVE',
          suspendedAt: null,
          suspendedUntil: null,
          reason: '紧急暂停到期，自动恢复',
        },
      });
      await (prisma as any).capabilityAuditLog.createMany({
        data: expired.map((row) => ({
          subjectUserId: userId,
          capability: row.capability,
          action: 'AUTO_RESTORE',
          result: 'RESTORED',
          reason: '72 小时紧急暂停到期且未获第二人确认',
        })),
      });
      rows = rows.map((row) => expired.some((item) => item.id === row.id)
        ? { ...row, status: 'ACTIVE', suspendedUntil: null }
        : row);
    }
  } catch {
    // New tables may not exist during the additive rollout. Legacy shadow
    // resolution is intentionally the safe fallback until migration finishes.
    rows = [];
  }

  const states: CapabilityState[] = rows
    .filter((row) => CAPABILITIES.includes(row.capability))
    .map((row) => ({
      id: row.id,
      capability: row.capability as Capability,
      status: row.status as CapabilityStatus,
      source: row.source,
      probationEndsAt: row.probationEndsAt?.toISOString?.() ?? row.probationEndsAt ?? null,
      suspendedUntil: row.suspendedUntil?.toISOString?.() ?? row.suspendedUntil ?? null,
    }));

  const active = states
    .filter((row) => row.status === 'ACTIVE' || row.status === 'TRIAL')
    .map((row) => row.capability);
  const strict = await isCapabilityAuthEnabled();
  if (!strict) {
    const legacySet = new Set(legacy);
    const activeSet = new Set(active);
    const legacyOnly = legacy.filter((capability) => !activeSet.has(capability));
    const capabilityOnly = active.filter((capability) => !legacySet.has(capability));

    if (legacyOnly.length > 0 || capabilityOnly.length > 0) {
      try {
        const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const recent = await (prisma as any).capabilityAuditLog.findFirst({
          where: {
            subjectUserId: userId,
            action: 'SHADOW_AUTH_DIFF',
            createdAt: { gte: since },
          },
          select: { id: true },
        });
        if (!recent) {
          await (prisma as any).capabilityAuditLog.create({
            data: {
              subjectUserId: userId,
              action: 'SHADOW_AUTH_DIFF',
              result: 'OBSERVED',
              reason: '影子模式检测到旧角色权限与能力授权存在差异',
              metadata: { role, legacyOnly, capabilityOnly },
            },
          });
        }
      } catch {
        // Shadow auditing must never prevent sign-in during an additive rollout.
      }
    }
  }
  const effective = new Set<Capability>(strict ? active : [...legacy, ...active]);
  if (isFounder) for (const capability of CAPABILITIES) effective.add(capability);

  return { capabilities: [...effective], states };
}

export async function writeCapabilityAudit(input: {
  actorId?: string | null;
  subjectUserId?: string | null;
  capability?: Capability | null;
  action: string;
  result: string;
  resourceType?: string | null;
  resourceId?: string | null;
  reason?: string | null;
  breakGlass?: boolean;
  metadata?: unknown;
}, client: any = prisma): Promise<void> {
  await (client as any).capabilityAuditLog.create({
    data: {
      actorId: input.actorId ?? null,
      subjectUserId: input.subjectUserId ?? null,
      capability: input.capability ?? null,
      action: input.action,
      result: input.result,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      reason: input.reason ?? null,
      breakGlass: input.breakGlass ?? false,
      metadata: input.metadata ?? undefined,
    },
  });
}

export function accountMayAct(status: AccountStatus | string): boolean {
  return !['READ_ONLY', 'TEMP_BANNED', 'PERM_BANNED'].includes(status);
}
