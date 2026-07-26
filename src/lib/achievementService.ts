import { prisma } from './prisma';
import { notify } from './notify';
import { evaluateConditions } from './achievementEngine';
import { getQualityLevel } from './qualityLevel';
import type { AchievementContext, AchievementUserStats, Condition } from './types';

// ── UserStats 辅助 ────────────────────────────────────────

export async function getOrCreateStats(userId: string): Promise<AchievementUserStats> {
  const existing = await prisma.userStats.findUnique({ where: { userId } });
  if (existing) return existing as AchievementUserStats;
  return prisma.userStats.create({ data: { userId } }) as Promise<AchievementUserStats>;
}

export async function updateDailyStreak(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const stats = await getOrCreateStats(userId);
  if ((stats as any).lastVisitDate === today) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = (stats as any).lastVisitDate === yesterday
    ? (stats as any).consecutiveDays + 1
    : 1;

  await prisma.userStats.update({
    where: { userId },
    data: { consecutiveDays: newStreak, lastVisitDate: today },
  });
}

// ── Context 构建 ──────────────────────────────────────────

interface TriggerParams {
  type: AchievementContext['triggerType']
  currentItem?: AchievementContext['currentItem']
  currentIceberg?: AchievementContext['currentIceberg']
  currentIcebergReadCount?: number
  isBottomTier?: boolean
  isFirstVisitIceberg?: boolean
  sessionMinutes?: number
}

async function buildContext(userId: string, trigger: TriggerParams): Promise<AchievementContext> {
  const [stats, user, watchlistCount, createdCount, warningCount, unlockedCount, hasUnread,
    projectJoinedCount, projectCreatedCount, ideaSubmittedCount, taskCompletedCount, collabEditCount] =
    await Promise.all([
      getOrCreateStats(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true, qualityScore: true, role: true },
      }),
      prisma.watchlist.count({ where: { userId } }),
      prisma.iceberg.count({ where: { authorId: userId, status: 'PUBLISHED' } }),
      prisma.userWarning.count({ where: { userId, clearedAt: null } }),
      prisma.userAchievement.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, read: false } }),
      prisma.projectMember.count({ where: { userId } }),
      prisma.project.count({ where: { creatorId: userId } }),
      prisma.idea.count({ where: { creatorId: userId } }),
      prisma.projectTask.count({ where: { status: 'COMPLETED', assigneeId: userId } }),
      prisma.projectMember.findMany({ where: { userId }, select: { projectId: true } }).then(members =>
        members.length === 0 ? 0 : prisma.iceberg.count({
          where: { projectId: { in: members.map(m => m.projectId) }, NOT: { authorId: userId } },
        })
      ),
    ]);

  if (!user) throw new Error(`User ${userId} not found`);

  const now = new Date();
  const daysSinceRegister = Math.floor(
    (now.getTime() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  const qualityLevel = getQualityLevel(user.qualityScore, user.role).level;

  return {
    userId,
    triggerType: trigger.type,
    currentHour: now.getHours(),
    currentMinute: now.getMinutes(),
    currentDayOfWeek: now.getDay(),
    currentDayOfMonth: now.getDate(),
    currentMonth: now.getMonth() + 1,
    currentItem: trigger.currentItem,
    currentIceberg: trigger.currentIceberg,
    currentIcebergReadCount: trigger.currentIcebergReadCount ?? 0,
    isBottomTier: trigger.isBottomTier ?? false,
    isFirstVisitIceberg: trigger.isFirstVisitIceberg ?? false,
    sessionMinutes: trigger.sessionMinutes ?? 0,
    stats: stats as AchievementUserStats,
    user: {
      qualityLevel,
      qualityScore: user.qualityScore,
      warningCount,
      createdIcebergCount: createdCount,
      watchlistCount,
      unlockedAchievementCount: unlockedCount,
      daysSinceRegister,
      hasUnreadNotification: hasUnread > 0,
      projectJoinedCount,
      projectCreatedCount,
      ideaSubmittedCount,
      taskCompletedCount,
      collabEditCount,
    },
  };
}

// ── 主检查函数 ────────────────────────────────────────────

export interface UnlockedAchievement {
  key: string;
  icon: string;
  labelZh: string;
  desc: string;
  color: string;
}

// ── 防抖：同一用户 2 秒内只跑一次检查 ─────────────────────
const lastCheck = new Map<string, number>();
const CHECK_COOLDOWN = 2000;

export async function checkAchievements(
  userId: string,
  trigger: TriggerParams,
  opts: { skipPending?: boolean } = {},
): Promise<UnlockedAchievement[]> {
  const now = Date.now();
  const last = lastCheck.get(userId);
  if (last && now - last < CHECK_COOLDOWN) return [];
  lastCheck.set(userId, now);

  try {
    const [ctx, allAchievements, existingRaw] = await Promise.all([
      buildContext(userId, trigger),
      prisma.achievement.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.userAchievement.findMany({
        where: { userId },
        select: { achievementId: true },
      }),
    ]);

    const existingKeys = new Set(existingRaw.map(a => a.achievementId));
    const toUnlock: typeof allAchievements = [];

    for (const ach of allAchievements) {
      if (existingKeys.has(ach.key)) continue;

      let conditions: Condition[] = [];
      try {
        conditions = JSON.parse((ach as any).conditions || '[]');
      } catch {
        continue;
      }

      // 向后兼容旧 triggerType 单条件
      if (conditions.length === 0 && ach.triggerType !== 'manual') {
        conditions = legacyToConditions(ach.triggerType, ach.triggerTarget);
      }

      if (conditions.length > 0 && evaluateConditions(conditions, ctx)) {
        toUnlock.push(ach);
      }
    }

    if (toUnlock.length === 0) return [];

    const keys = toUnlock.map(a => a.key);

    // 写入解锁记录（toUnlock 已去重，无需 skipDuplicates）
    await prisma.userAchievement.createMany({
      data: keys.map(achievementId => ({ userId, achievementId })),
    });

    // 写入 pendingAchievements（供 NavBar 展示）+ 发站内通知（非关键）
    const sideEffects: Promise<unknown>[] = [
      ...toUnlock.map(ach =>
        notify(userId, 'achievement_unlocked', `成就解锁：${ach.labelZh}`, ach.desc),
      ),
    ];
    if (!opts.skipPending) {
      sideEffects.push(
        getOrCreateStats(userId).then(stats => {
          const pending: string[] = JSON.parse((stats as any).pendingAchievements || '[]');
          pending.push(...keys);
          return prisma.userStats.update({
            where: { userId },
            data: { pendingAchievements: JSON.stringify(pending) },
          });
        }),
      );
    }
    Promise.all(sideEffects).catch(err => console.error('[checkAchievements] 非关键步骤失败:', err));

    return toUnlock.map(a => ({ key: a.key, icon: a.icon, labelZh: a.labelZh, desc: a.desc, color: a.color }));
  } catch (err) {
    console.error('[checkAchievements] 检查失败:', err);
    return [];
  }
}

// ── 全量复核：不依赖触发事件，用当前状态检查所有成就 ──────
export async function recheckAllAchievements(
  userId: string,
): Promise<UnlockedAchievement[]> {
  try {
    const ctx = await buildContext(userId, {
      type: 'visit',
    });

    const [allAchievements, existingRaw] = await Promise.all([
      prisma.achievement.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.userAchievement.findMany({
        where: { userId },
        select: { achievementId: true },
      }),
    ]);

    const existingKeys = new Set(existingRaw.map(a => a.achievementId));
    const toUnlock: typeof allAchievements = [];

    for (const ach of allAchievements) {
      if (existingKeys.has(ach.key)) continue;

      let conditions: Condition[] = [];
      try {
        conditions = JSON.parse((ach as any).conditions || '[]');
      } catch { continue; }

      if (conditions.length === 0 && ach.triggerType !== 'manual') {
        conditions = legacyToConditions(ach.triggerType, ach.triggerTarget);
      }

      if (conditions.length > 0 && evaluateConditions(conditions, ctx)) {
        toUnlock.push(ach);
      }
    }

    if (toUnlock.length === 0) return [];

    const keys = toUnlock.map(a => a.key);
    await prisma.userAchievement.createMany({
      data: keys.map(achievementId => ({ userId, achievementId })),
    });

    for (const ach of toUnlock) {
      notify(userId, 'achievement_unlocked', `成就解锁：${ach.labelZh}`, ach.desc).catch(() => {});
    }

    return toUnlock.map(a => ({ key: a.key, icon: a.icon, labelZh: a.labelZh, desc: a.desc, color: a.color }));
  } catch (err) {
    console.error('[recheckAllAchievements] 检查失败:', err);
    return [];
  }
}

// ── 旧格式兼容 ────────────────────────────────────────────

function legacyToConditions(triggerType: string, triggerTarget: number): Condition[] {
  switch (triggerType) {
    case 'read_count':
      return [{ block: 'totalRead', op: '>=', value: triggerTarget }];
    case 'bottom_tier':
      return [{ block: 'isBottomTier', op: '==', value: true }];
    case 'all_clear':
      return [{ block: 'all_clear', op: '==', value: true }];
    default:
      return [];
  }
}
