# Achievement System + Production Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完整实现可视化条件积木成就系统 + 修复全部生产环境问题。

**Architecture:** UserStats 表持久化行为数据；achievementEngine.ts 纯函数求值；服务端异步检查成就并写入 pendingAchievements；前端通过 /api/auth/me 轮询获取并展示 Steam 风格 Toast。

**Tech Stack:** Prisma 5 + SQLite, Astro 5, React 19, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-15-achievement-system-production-fixes-design.md`

---

## 文件清单

### 新建
- `src/lib/achievementEngine.ts` — 纯函数条件求值引擎
- `src/lib/achievementService.ts` — checkAchievements + updateUserStats 服务层
- `src/components/ui/AchievementToast.tsx` — Steam 风格 Toast 组件
- `src/pages/api/auth/achievements/ack.ts` — POST 清空 pendingAchievements
- `prisma/seed-achievements.mjs` — 47 个原版成就迁移脚本

### 修改
- `prisma/schema.prisma` — 新增 UserStats 表 + Achievement.conditions 字段
- `src/lib/types.ts` — 新增 Condition、AchievementContext 类型
- `src/pages/api/items/read.ts` — 接入新引擎 + UserStats
- `src/pages/api/search.ts` — 更新 UserStats + 触发检查
- `src/pages/api/icebergs/[id]/vote.ts` — 更新 UserStats + 触发检查
- `src/pages/api/icebergs/[id]/index.ts` — 追踪 visitedIceberg + 删除 viewCount++
- `src/pages/iceberg/random.astro` — 追踪 randomCount
- `src/pages/api/auth/[...auth].ts` — /me 附带 pendingAchievements
- `src/pages/api/admin/achievements/index.ts` — 支持 conditions 字段
- `src/pages/api/admin/achievements/[id].ts` — 支持 conditions 字段
- `src/pages/api/tiers/[id].ts` — 修复 String(err) 暴露
- `src/components/admin/AdminAchievements.tsx` — 可视化条件积木 UI
- `src/components/NavBar.tsx` — 处理 pendingAchievements + 定时轮询
- `src/layouts/Layout.astro` — 挂载 AchievementToast
- `src/pages/iceberg/[slug].astro` — 接入 ExportButton
- `src/components/iceberg/ExportButton.tsx` — targetRef → targetId

### 删除
- `src/lib/supabase.ts`

---

## Task 1: 生产修复 — 死代码 + String(err) + viewCount

**Files:**
- Delete: `src/lib/supabase.ts`
- Modify: `src/pages/api/tiers/[id].ts:37`
- Modify: `src/pages/api/icebergs/[id]/index.ts`

- [ ] **Step 1: 删除 supabase.ts**

```bash
rm "frontend/src/lib/supabase.ts"
```

- [ ] **Step 2: 修复 tiers/[id].ts String(err) 暴露**

打开 `src/pages/api/tiers/[id].ts`，找到第 37 行附近的 catch 块，将：
```ts
return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, String(err))), {
```
改为：
```ts
console.error('[tiers] 操作失败:', err);
return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '服务器内部错误')), {
```

- [ ] **Step 3: 删除 icebergs/[id]/index.ts 的 viewCount++ (API GET)**

在 `src/pages/api/icebergs/[id]/index.ts` 的 GET 方法里，找到并删除：
```ts
await prisma.iceberg.update({
  where: { id: iceberg.id },
  data: { viewCount: { increment: 1 } },
});
```
以及相关的 ViewLog 写入（若存在于 GET 里）。保留 SSR 页面 `[slug].astro` 里的计数不动。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: remove dead code, fix error exposure, fix viewCount double-counting"
```

---

## Task 2: 生产修复 — ExportButton 接入详情页

**Files:**
- Modify: `src/components/iceberg/ExportButton.tsx`
- Modify: `src/pages/iceberg/[slug].astro`

- [ ] **Step 1: 修改 ExportButton 接受 targetId 字符串**

在 `src/components/iceberg/ExportButton.tsx` 中，将 Props 改为：

```tsx
interface ExportButtonProps {
  targetId: string;       // 改为 id 字符串，避免 SSR hydration 问题
  icebergUrl: string;
}

export function ExportButton({ targetId, icebergUrl }: ExportButtonProps) {
  const handleExport = async () => {
    const target = document.getElementById(targetId);
    if (!target) return;
    // 其余代码不变，将原来的 targetRef.current 全部替换为 target
```

- [ ] **Step 2: 在 [slug].astro 冰山内容区加 id**

在详情页冰山内容主容器上加 `id="iceberg-export-content"`（找到渲染 tiers 的最外层 div）。

- [ ] **Step 3: 导入并挂载 ExportButton**

在 `[slug].astro` frontmatter 加：
```astro
import { ExportButton } from '../../components/iceberg/ExportButton';
```

在详情页标题区工具栏（SocialBar 旁边）加：
```astro
{iceberg.status === 'PUBLISHED' && (
  <ExportButton
    client:load
    targetId="iceberg-export-content"
    icebergUrl={`${Astro.url.origin}/iceberg/${iceberg.slug}`}
  />
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/iceberg/ExportButton.tsx src/pages/iceberg/[slug].astro
git commit -m "feat: wire ExportButton to iceberg detail page"
```

---

## Task 3: Schema 变更 — UserStats + Achievement.conditions

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 在 schema.prisma 末尾添加 UserStats 模型**

```prisma
model UserStats {
  userId              String   @id
  user                User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  totalRead           Int      @default(0)
  searchCount         Int      @default(0)
  randomCount         Int      @default(0)
  nightReadCount      Int      @default(0)
  visitedIcebergCount Int      @default(0)
  consecutiveDays     Int      @default(0)
  lastVisitDate       String?
  totalVotesCast      Int      @default(0)
  totalSessionMinutes Int      @default(0)
  pendingAchievements String   @default("[]")

  updatedAt           DateTime @updatedAt

  @@map("user_stats")
}
```

- [ ] **Step 2: 在 User 模型添加反向关联**

在 User 模型的关联字段列表末尾加：
```prisma
stats              UserStats?
```

- [ ] **Step 3: 在 Achievement 模型添加 conditions 字段**

在 Achievement 模型的 `updatedAt` 行之前加：
```prisma
conditions   String   @default("[]")
```

- [ ] **Step 4: 停止 dev server，执行 db push，重启**

```bash
# 停止 dev server（Ctrl+C），然后：
cd frontend
npx prisma db push
npx prisma generate
npm run dev
```

期望输出包含：`✓ Generated Prisma Client`，无 error。

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add UserStats table and Achievement.conditions field"
```

---

## Task 4: 类型定义

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: 在 types.ts 末尾追加以下类型**

```ts
// ── 成就条件积木 ──────────────────────────────────────────

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

// ── 成就检查上下文 ────────────────────────────────────────

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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add Condition and AchievementContext types"
```

---

## Task 5: 求值引擎 achievementEngine.ts

**Files:**
- Create: `src/lib/achievementEngine.ts`

- [ ] **Step 1: 创建文件**

```ts
import type { Condition, BlockCondition, ConditionOp, AchievementContext } from './types';

// ── 辅助函数 ──────────────────────────────────────────────

function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i <= Math.sqrt(n); i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

function applyOp(left: unknown, op: ConditionOp, right: unknown): boolean {
  const l = typeof left === 'string' ? left : Number(left);
  const r = typeof right === 'string' ? right : Number(right);
  switch (op) {
    case '==':       return l == r;
    case '!=':       return l != r;
    case '>':        return Number(l) > Number(r);
    case '>=':       return Number(l) >= Number(r);
    case '<':        return Number(l) < Number(r);
    case '<=':       return Number(l) <= Number(r);
    case 'contains': return String(l).includes(String(r));
    default:         return false;
  }
}

const VAR_MAP: Record<string, (ctx: AchievementContext) => number> = {
  totalRead:           ctx => ctx.stats.totalRead,
  searchCount:         ctx => ctx.stats.searchCount,
  randomCount:         ctx => ctx.stats.randomCount,
  nightReadCount:      ctx => ctx.stats.nightReadCount,
  visitedIcebergCount: ctx => ctx.stats.visitedIcebergCount,
  consecutiveDays:     ctx => ctx.stats.consecutiveDays,
  totalVotesCast:      ctx => ctx.stats.totalVotesCast,
  currentIcebergReadCount: ctx => ctx.currentIcebergReadCount,
  currentHour:         ctx => ctx.currentHour,
  currentMinute:       ctx => ctx.currentMinute,
  currentDayOfWeek:    ctx => ctx.currentDayOfWeek,
  currentDayOfMonth:   ctx => ctx.currentDayOfMonth,
  currentMonth:        ctx => ctx.currentMonth,
};

function getVarNum(name: string, ctx: AchievementContext): number {
  return VAR_MAP[name]?.(ctx) ?? 0;
}

// ── 单条件求值 ────────────────────────────────────────────

function evaluateBlock(cond: BlockCondition, ctx: AchievementContext): boolean {
  const { block, op, value } = cond;

  // 特殊块
  if (block === 'isPrime')      return isPrime(ctx.stats.totalRead);
  if (block === 'isDivisibleBy') return ctx.stats.totalRead % Number(value) === 0;
  if (block === 'all_clear') {
    return ctx.currentIceberg != null &&
           ctx.currentIceberg.itemCount > 0 &&
           ctx.currentIcebergReadCount >= ctx.currentIceberg.itemCount;
  }
  if (block === 'varEqual') {
    return getVarNum(cond.varA ?? '', ctx) === getVarNum(cond.varB ?? '', ctx);
  }
  if (block === 'varDiff') {
    const diff = Math.abs(getVarNum(cond.varA ?? '', ctx) - getVarNum(cond.varB ?? '', ctx));
    return applyOp(diff, op, value);
  }

  // 标准块 — 从 context 取值
  let ctxValue: unknown;
  switch (block) {
    case 'currentHour':            ctxValue = ctx.currentHour; break;
    case 'currentMinute':          ctxValue = ctx.currentMinute; break;
    case 'currentDayOfWeek':       ctxValue = ctx.currentDayOfWeek; break;
    case 'currentDayOfMonth':      ctxValue = ctx.currentDayOfMonth; break;
    case 'currentMonth':           ctxValue = ctx.currentMonth; break;
    case 'daysSinceRegister':      ctxValue = ctx.user.daysSinceRegister; break;
    case 'visitedIcebergCount':    ctxValue = ctx.stats.visitedIcebergCount; break;
    case 'consecutiveDays':        ctxValue = ctx.stats.consecutiveDays; break;
    case 'sessionMinutes':         ctxValue = ctx.sessionMinutes; break;
    case 'currentTierOrder':       ctxValue = ctx.currentItem?.tierOrder ?? -1; break;
    case 'currentIcebergTierCount': ctxValue = ctx.currentIceberg?.tierCount ?? 0; break;
    case 'currentIcebergItemCount': ctxValue = ctx.currentIceberg?.itemCount ?? 0; break;
    case 'currentItemDescContains': ctxValue = ctx.currentItem?.desc ?? ''; break;
    case 'currentItemDescLength':  ctxValue = (ctx.currentItem?.desc ?? '').trim().length; break;
    case 'currentItemTitleContains': ctxValue = ctx.currentItem?.title ?? ''; break;
    case 'currentItemLabelContains': ctxValue = ctx.currentItem?.labels.join(',') ?? ''; break;
    case 'currentItemLabelCount':  ctxValue = ctx.currentItem?.labels.length ?? 0; break;
    case 'currentItemIsEmpty':     ctxValue = !(ctx.currentItem?.desc ?? '').trim(); break;
    case 'currentIcebergReadCount': ctxValue = ctx.currentIcebergReadCount; break;
    case 'isBottomTier':           ctxValue = ctx.isBottomTier; break;
    case 'isFirstVisitIceberg':    ctxValue = ctx.isFirstVisitIceberg; break;
    case 'totalRead':              ctxValue = ctx.stats.totalRead; break;
    case 'watchlistCount':         ctxValue = ctx.user.watchlistCount; break;
    case 'totalVotesCast':         ctxValue = ctx.stats.totalVotesCast; break;
    case 'createdIcebergCount':    ctxValue = ctx.user.createdIcebergCount; break;
    case 'qualityLevel':           ctxValue = ctx.user.qualityLevel; break;
    case 'unlockedAchievementCount': ctxValue = ctx.user.unlockedAchievementCount; break;
    case 'warningCount':           ctxValue = ctx.user.warningCount; break;
    case 'hasUnreadNotification':  ctxValue = ctx.user.hasUnreadNotification; break;
    case 'hasEverSearched':        ctxValue = ctx.stats.searchCount > 0; break;
    case 'searchCount':            ctxValue = ctx.stats.searchCount; break;
    case 'randomCount':            ctxValue = ctx.stats.randomCount; break;
    case 'nightReadCount':         ctxValue = ctx.stats.nightReadCount; break;
    case 'triggerType':            ctxValue = ctx.triggerType; break;
    default:                       return false;
  }

  return applyOp(ctxValue, op, value);
}

// ── 主入口 ────────────────────────────────────────────────

export function evaluateConditions(
  conditions: Condition[],
  ctx: AchievementContext,
): boolean {
  if (!conditions || conditions.length === 0) return false;

  const results: boolean[] = [];
  const logics: ('AND' | 'OR')[] = [];

  for (const node of conditions) {
    if ('logic' in node) {
      logics.push(node.logic);
    } else {
      results.push(evaluateBlock(node, ctx));
    }
  }

  if (results.length === 0) return false;

  let final = results[0];
  for (let i = 0; i < logics.length; i++) {
    const next = results[i + 1] ?? false;
    final = logics[i] === 'AND' ? final && next : final || next;
  }
  return final;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/achievementEngine.ts
git commit -m "feat: add achievement condition evaluation engine"
```

---

## Task 6: 成就检查服务 achievementService.ts

**Files:**
- Create: `src/lib/achievementService.ts`

- [ ] **Step 1: 创建文件**

```ts
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
  if (stats.lastVisitDate === today) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = stats.lastVisitDate === yesterday ? stats.consecutiveDays + 1 : 1;

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
  const [stats, user, watchlistCount, createdCount, warningCount, unlockedCount, hasUnread] =
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
      warningCount,
      createdIcebergCount: createdCount,
      watchlistCount,
      unlockedAchievementCount: unlockedCount,
      daysSinceRegister,
      hasUnreadNotification: hasUnread > 0,
    },
  };
}

// ── 主检查函数 ────────────────────────────────────────────

export async function checkAchievements(
  userId: string,
  trigger: TriggerParams,
): Promise<void> {
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
    const toUnlock: string[] = [];

    for (const ach of allAchievements) {
      if (existingKeys.has(ach.key)) continue;

      let conditions: Condition[] = [];
      try {
        conditions = JSON.parse(ach.conditions || '[]');
      } catch {
        continue;
      }

      // 向后兼容旧 triggerType 单条件
      if (conditions.length === 0 && ach.triggerType !== 'manual') {
        conditions = legacyToConditions(ach.triggerType, ach.triggerTarget);
      }

      if (conditions.length > 0 && evaluateConditions(conditions, ctx)) {
        toUnlock.push(ach.key);
      }
    }

    if (toUnlock.length === 0) return;

    // 写入解锁记录
    await prisma.userAchievement.createMany({
      data: toUnlock.map(achievementId => ({ userId, achievementId })),
      skipDuplicates: true,
    });

    // 写入 pendingAchievements（供 /me 带回给前端）
    const stats = await getOrCreateStats(userId);
    const pending: string[] = JSON.parse(stats.pendingAchievements || '[]');
    pending.push(...toUnlock);
    await prisma.userStats.update({
      where: { userId },
      data: { pendingAchievements: JSON.stringify(pending) },
    });

    // 站内通知
    const achDefs = allAchievements.filter(a => toUnlock.includes(a.key));
    for (const ach of achDefs) {
      await notify(userId, 'achievement_unlocked', `成就解锁：${ach.labelZh}`, ach.desc);
    }
  } catch (err) {
    console.error('[checkAchievements] 检查失败:', err);
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/achievementService.ts
git commit -m "feat: add achievement check service with context building"
```

---

## Task 7: 更新 read.ts 接入新引擎

**Files:**
- Modify: `src/pages/api/items/read.ts`

- [ ] **Step 1: 替换 read.ts 全部内容**

```ts
import type { APIEvent } from '@astrojs/node';
import { getSession } from '../../../lib/auth/index';
import { prisma } from '../../../lib/prisma';
import { checkAchievements, getOrCreateStats, updateDailyStreak } from '../../../lib/achievementService';

export async function POST(event: APIEvent) {
  const session = await getSession(event);
  if (!session) {
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: {
    itemId?: string; icebergId?: string; isLastTier?: boolean; sessionMinutes?: number;
  };
  try { body = await event.request.json(); }
  catch {
    return new Response(JSON.stringify({ success: false, error: { message: '请求格式错误' } }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { itemId, icebergId, isLastTier, sessionMinutes } = body;
  if (!itemId || !icebergId) {
    return new Response(JSON.stringify({ success: false, error: { message: '缺少参数' } }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const userId = session.userId;

  // 1. 记录阅读（重复忽略）
  const isNew = await prisma.itemRead.upsert({
    where: { userId_itemId: { userId, itemId } },
    create: { userId, itemId, icebergId },
    update: {},
  }).then(() => true).catch(() => false);

  if (!isNew) {
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. 更新 UserStats
  const now = new Date();
  const isNight = now.getHours() >= 0 && now.getHours() < 5;

  await updateDailyStreak(userId);

  await prisma.userStats.upsert({
    where: { userId },
    create: {
      userId,
      totalRead: 1,
      nightReadCount: isNight ? 1 : 0,
      totalSessionMinutes: sessionMinutes ?? 0,
    },
    update: {
      totalRead: { increment: 1 },
      ...(isNight && { nightReadCount: { increment: 1 } }),
      ...(sessionMinutes != null && {
        totalSessionMinutes: { set: Math.max(sessionMinutes) },
      }),
    },
  });

  // 3. 获取当前图已读数 + 图信息（用于成就上下文）
  const [icebergReadCount, item, iceberg] = await Promise.all([
    prisma.itemRead.count({ where: { userId, icebergId } }),
    prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true, title: true, desc: true, labels: true,
        tier: { select: { order: true, iceberg: { select: { id: true } } } },
      },
    }),
    prisma.iceberg.findUnique({
      where: { id: icebergId },
      select: {
        id: true,
        _count: { select: { tiers: true } },
        tiers: { select: { _count: { select: { items: true } } } },
      },
    }),
  ]);

  const totalItems = iceberg?.tiers.reduce((s, t) => s + t._count.items, 0) ?? 0;
  const tierOrder = item?.tier?.order ?? 0;

  // 判断是否最底层
  const maxTierOrder = iceberg ? iceberg._count.tiers - 1 : 0;
  const isBottomTier = tierOrder === maxTierOrder;

  // 4. 异步检查成就（不 await）
  checkAchievements(userId, {
    type: 'read',
    currentItem: item ? {
      id: item.id,
      title: item.title,
      desc: item.desc,
      labels: (() => { try { return JSON.parse(item.labels || '[]'); } catch { return []; } })(),
      tierOrder,
      icebergId,
    } : undefined,
    currentIceberg: iceberg ? {
      id: iceberg.id,
      tierCount: iceberg._count.tiers,
      itemCount: totalItems,
    } : undefined,
    currentIcebergReadCount: icebergReadCount,
    isBottomTier: isLastTier ?? isBottomTier,
    sessionMinutes: sessionMinutes ?? 0,
  });

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/items/read.ts
git commit -m "feat: upgrade read.ts to use new achievement engine and UserStats"
```

---

## Task 8: 更新 search.ts + vote.ts + icebergs/[id]/index.ts + random.astro

**Files:**
- Modify: `src/pages/api/search.ts`
- Modify: `src/pages/api/icebergs/[id]/vote.ts`
- Modify: `src/pages/api/icebergs/[id]/index.ts`
- Modify: `src/pages/iceberg/random.astro`

- [ ] **Step 1: 在 search.ts 末尾返回前，更新 UserStats + 触发检查**

在 `search.ts` 的 GET 函数里，找到 `const items = await prisma.iceberg.findMany(...)` 之后，在 `return new Response(...)` 之前插入：

```ts
  // 更新搜索统计 + 检查成就（仅登录用户）
  const session = await getSession(event);
  if (session && q.length >= 2) {
    await updateDailyStreak(session.userId);
    await prisma.userStats.upsert({
      where: { userId: session.userId },
      create: { userId: session.userId, searchCount: 1 },
      update: { searchCount: { increment: 1 } },
    });
    checkAchievements(session.userId, { type: 'search' });
  }
```

同时在文件顶部添加导入：
```ts
import { getSession } from '../../lib/auth/index';
import { checkAchievements, updateDailyStreak } from '../../lib/achievementService';
```

- [ ] **Step 2: 在 vote.ts 成功投票后，更新 UserStats + 触发检查**

在 vote.ts 的 POST 函数里，找到最终 `return new Response(JSON.stringify(success(...)))` 之前，插入：

```ts
    // 更新投票统计 + 检查成就
    await updateDailyStreak(session.userId);
    await prisma.userStats.upsert({
      where: { userId: session.userId },
      create: { userId: session.userId, totalVotesCast: 1 },
      update: { totalVotesCast: { increment: 1 } },
    });
    checkAchievements(session.userId, { type: 'vote' });
```

同时在文件顶部添加：
```ts
import { checkAchievements, updateDailyStreak } from '../../../../lib/achievementService';
```

- [ ] **Step 3: 在 icebergs/[id]/index.ts GET 里追踪首次访问**

在 GET 函数的 session 获取之后（已有 `const session = await getSession(event)` 或需要加），插入：

```ts
  // 追踪 visitedIcebergCount（首次访问该图）
  if (session) {
    const alreadyRead = await prisma.itemRead.findFirst({
      where: { userId: session.userId, icebergId: iceberg.id },
    });
    const isFirst = !alreadyRead;
    if (isFirst) {
      await updateDailyStreak(session.userId);
      await prisma.userStats.upsert({
        where: { userId: session.userId },
        create: { userId: session.userId, visitedIcebergCount: 1 },
        update: { visitedIcebergCount: { increment: 1 } },
      });
      checkAchievements(session.userId, {
        type: 'visit',
        currentIceberg: { id: iceberg.id, tierCount: 0, itemCount: 0 },
        isFirstVisitIceberg: true,
      });
    }
  }
```

同时添加导入：
```ts
import { checkAchievements, updateDailyStreak } from '../../../../lib/achievementService';
```

- [ ] **Step 4: 在 random.astro 追踪 randomCount**

在 `random.astro` 的 frontmatter 里，在 `return Astro.redirect(...)` 之前插入：

```ts
import { getSessionById } from '../../lib/auth/index';
import { checkAchievements, updateDailyStreak } from '../../lib/achievementService';
import { prisma as db } from '../../lib/prisma';

const sessionId = Astro.cookies.get('session')?.value;
const session   = await getSessionById(sessionId);
if (session) {
  await updateDailyStreak(session.userId);
  await db.userStats.upsert({
    where: { userId: session.userId },
    create: { userId: session.userId, randomCount: 1 },
    update: { randomCount: { increment: 1 } },
  });
  checkAchievements(session.userId, { type: 'random' });
}
```

注意：`random.astro` 已经 `import { prisma }` — 用已有的 prisma 实例，不要重复导入。

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/search.ts src/pages/api/icebergs/[id]/vote.ts \
        src/pages/api/icebergs/[id]/index.ts src/pages/iceberg/random.astro
git commit -m "feat: add UserStats tracking and achievement triggers to search/vote/visit/random"
```

---

## Task 9: 更新 /me 端点 + 新增 /ack 端点

**Files:**
- Modify: `src/pages/api/auth/[...auth].ts`
- Create: `src/pages/api/auth/achievements/ack.ts`

- [ ] **Step 1: 在 /me 的 select 里加 stats，并附带 pendingAchievements**

找到 `if (action === 'me')` 块，将 `prisma.user.findUnique` 的 select 改为：

```ts
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true, username: true, nickname: true,
        role: true, status: true, createdAt: true,
        stats: { select: { pendingAchievements: true } },
      },
    });
```

然后在返回前，从 DB 取成就定义并附带：

```ts
    // 取 pendingAchievements 对应的成就详情
    const pending: string[] = JSON.parse(user.stats?.pendingAchievements || '[]');
    let pendingAchievements: { key: string; icon: string; labelZh: string; desc: string; color: string }[] = [];
    if (pending.length > 0) {
      const defs = await prisma.achievement.findMany({
        where: { key: { in: pending } },
        select: { key: true, icon: true, labelZh: true, desc: true, color: true },
      });
      pendingAchievements = defs;
    }

    return new Response(JSON.stringify(success({
      id: user.id, username: user.username, nickname: user.nickname,
      role: user.role, status: user.status, createdAt: user.createdAt,
      pendingAchievements,
    })), { status: 200, headers: { 'Content-Type': 'application/json' } });
```

- [ ] **Step 2: 创建 /api/auth/achievements/ack.ts**

```ts
import type { APIEvent } from '@astrojs/node';
import { getSession } from '../../../../lib/auth/index';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

// POST /api/auth/achievements/ack — 清空当前用户的 pendingAchievements
export async function POST(event: APIEvent) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

  await prisma.userStats.upsert({
    where: { userId: session.userId },
    create: { userId: session.userId, pendingAchievements: '[]' },
    update: { pendingAchievements: '[]' },
  });

  return json(success({ cleared: true }));
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/auth/[...auth].ts src/pages/api/auth/achievements/ack.ts
git commit -m "feat: attach pendingAchievements to /me and add /ack endpoint"
```

---

## Task 10: AchievementToast 组件

**Files:**
- Create: `src/components/ui/AchievementToast.tsx`

- [ ] **Step 1: 创建文件**

```tsx
import { useState, useEffect, useCallback } from 'react';

interface AchievementItem {
  key: string;
  icon: string;
  labelZh: string;
  desc: string;
  color: string;
}

// 全局队列，由 NavBar 推入
const queue: AchievementItem[] = [];
let globalEnqueue: ((items: AchievementItem[]) => void) | null = null;

export function enqueueAchievements(items: AchievementItem[]) {
  if (globalEnqueue) {
    globalEnqueue(items);
  } else {
    queue.push(...items);
  }
}

export function AchievementToast() {
  const [current, setCurrent] = useState<AchievementItem | null>(null);
  const [visible, setVisible]   = useState(false);
  const [internalQueue, setInternalQueue] = useState<AchievementItem[]>([]);

  globalEnqueue = useCallback((items: AchievementItem[]) => {
    setInternalQueue(q => [...q, ...items]);
  }, []);

  // 启动时消费启动前入队的项目
  useEffect(() => {
    if (queue.length > 0) {
      setInternalQueue([...queue]);
      queue.length = 0;
    }
  }, []);

  // 队列消费器
  useEffect(() => {
    if (current || internalQueue.length === 0) return;
    const [next, ...rest] = internalQueue;
    setInternalQueue(rest);
    setCurrent(next);
    setTimeout(() => setVisible(true), 50);

    const hideTimer = setTimeout(() => setVisible(false), 4000);
    const removeTimer = setTimeout(() => setCurrent(null), 4300);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [current, internalQueue]);

  if (!current) return null;

  return (
    <div
      className="fixed top-6 right-6 z-[9999] w-80 transition-all duration-300 ease-out"
      style={{
        transform: visible ? 'translateX(0)' : 'translateX(110%)',
        opacity: visible ? 1 : 0,
      }}
    >
      <div
        className="bg-[#050505] border border-[#1f2937] overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.8)]"
        style={{ borderLeftColor: current.color, borderLeftWidth: '4px' }}
      >
        {/* 顶部标签 */}
        <div className="px-3 py-1.5 bg-[#0a0a0a] border-b border-[#1f2937]">
          <span className="text-[10px] font-mono text-[#00FF41] tracking-widest animate-pulse">
            ▶ 隐藏权限已解锁 // ACHIEVEMENT UNLOCKED
          </span>
        </div>
        {/* 内容 */}
        <div className="flex items-start gap-3 px-3 py-3">
          <span className="text-2xl mt-0.5 flex-shrink-0">{current.icon}</span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#e5e7eb] font-mono truncate">
              {current.labelZh}
            </div>
            <div className="text-xs text-[#6b7280] mt-0.5 leading-relaxed line-clamp-2">
              {current.desc}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/AchievementToast.tsx
git commit -m "feat: add Steam-style AchievementToast component"
```

---

## Task 11: NavBar 处理 pendingAchievements + 挂载 Toast

**Files:**
- Modify: `src/components/NavBar.tsx`
- Modify: `src/layouts/Layout.astro`

- [ ] **Step 1: 在 NavBar 导入 enqueueAchievements**

在 NavBar.tsx 顶部添加：
```ts
import { enqueueAchievements } from './ui/AchievementToast';
```

- [ ] **Step 2: 在 fetchUser 里处理 pendingAchievements**

找到 `fetchUser` 函数中的 `if (d.success) { setUser(d.data); ...}` 行，改为：

```ts
      if (d.success) {
        setUser(d.data);
        fetchUnreadCount();
        // 处理待展示的成就
        if (d.data.pendingAchievements?.length > 0) {
          enqueueAchievements(d.data.pendingAchievements);
          // 清空服务端缓存
          fetch('/api/auth/achievements/ack', { method: 'POST' }).catch(() => {});
        }
      }
```

- [ ] **Step 3: 添加 15s 定时轮询**

在 NavBar 的第一个 `useEffect`（mount 时调用 `fetchUser()` 的那个）里，加定时器：

```ts
  useEffect(() => {
    fetchUser();
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (saved === 'light') {
      setTheme('light');
      document.documentElement.classList.add('light');
    }
    // 定时轮询（含成就检查）
    const timer = setInterval(fetchUser, 15000);
    return () => clearInterval(timer);
  }, []);
```

- [ ] **Step 4: 在 Layout.astro 挂载 AchievementToast**

找到 `<Toast client:load />` 这行，在其后加：

```astro
import { AchievementToast } from '../components/ui/AchievementToast';
<!-- 紧接 Toast 之后 -->
<AchievementToast client:load />
```

注意 import 要加到 frontmatter 的 import 区。

- [ ] **Step 5: Commit**

```bash
git add src/components/NavBar.tsx src/layouts/Layout.astro
git commit -m "feat: wire AchievementToast to NavBar polling and mount globally"
```

---

## Task 12: 更新管理后台成就 API 支持 conditions

**Files:**
- Modify: `src/pages/api/admin/achievements/index.ts`
- Modify: `src/pages/api/admin/achievements/[id].ts`

- [ ] **Step 1: 在 index.ts POST 里接受并存储 conditions**

在 POST handler 的 `body` 类型定义里加 `conditions?: string`，在 `prisma.achievement.create` 的 `data` 里加：

```ts
conditions: body.conditions ?? '[]',
```

同时移除 `VALID_TRIGGER_TYPES` 校验（新成就用 conditions，triggerType 保留作兼容但不强校验），或把 `triggerType` 默认为 `'manual'`：

```ts
triggerType:   body.triggerType  ?? 'manual',
triggerTarget: body.triggerTarget ?? 0,
```

- [ ] **Step 2: 在 [id].ts PUT 里接受并更新 conditions**

在 `body` 类型里加 `conditions?: string`，在 `prisma.achievement.update` 的 `data` 里加：

```ts
...(body.conditions != null && { conditions: body.conditions }),
```

同时移除 `VALID_TRIGGER_TYPES` 校验。

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/achievements/index.ts src/pages/api/admin/achievements/[id].ts
git commit -m "feat: admin achievement API accepts conditions field"
```

---

## Task 13: AdminAchievements 可视化条件积木 UI

**Files:**
- Modify: `src/components/admin/AdminAchievements.tsx`（完整替换）

- [ ] **Step 1: 替换为新版组件（完整内容）**

```tsx
import { useState, useEffect } from 'react';
import { toast } from '../ui/Toast';
import type { Condition, BlockCondition, ConditionOp } from '../../lib/types';

// ── 积木定义 ─────────────────────────────────────────────

interface BlockDef {
  key: string;
  label: string;
  ops: ConditionOp[];
  valueType: 'number' | 'boolean' | 'text' | 'triggerType' | 'dayOfWeek' | 'month' | 'varPair';
}

const BLOCK_CATEGORIES: { label: string; blocks: BlockDef[] }[] = [
  {
    label: '① 时间 / 日历',
    blocks: [
      { key: 'currentHour',       label: '当前小时',       ops: ['==','!=','>','>=','<','<='], valueType: 'number' },
      { key: 'currentMinute',     label: '当前分钟',       ops: ['=='],                        valueType: 'number' },
      { key: 'currentDayOfWeek',  label: '星期几',         ops: ['==','!='],                   valueType: 'dayOfWeek' },
      { key: 'currentDayOfMonth', label: '几号',           ops: ['=='],                        valueType: 'number' },
      { key: 'currentMonth',      label: '月份',           ops: ['=='],                        valueType: 'month' },
      { key: 'daysSinceRegister', label: '距注册天数',     ops: ['>=','=='],                   valueType: 'number' },
    ],
  },
  {
    label: '② 跨图探索',
    blocks: [
      { key: 'visitedIcebergCount', label: '探索冰山图数',   ops: ['>=','=='],  valueType: 'number' },
      { key: 'consecutiveDays',     label: '连续访问天数',   ops: ['>=','=='],  valueType: 'number' },
      { key: 'sessionMinutes',      label: '本次会话时长(分)',ops: ['>='],       valueType: 'number' },
    ],
  },
  {
    label: '③ 词条深度',
    blocks: [
      { key: 'currentTierOrder',       label: '词条所在第几层',    ops: ['==','>=','<='], valueType: 'number' },
      { key: 'currentIcebergTierCount',label: '当前图共几层',      ops: ['==','>=','<='], valueType: 'number' },
      { key: 'currentIcebergItemCount',label: '当前图总词条数',    ops: ['>=','=='],      valueType: 'number' },
      { key: 'currentIcebergReadCount',label: '当前图已读词条数',  ops: ['>=','=='],      valueType: 'number' },
      { key: 'currentItemDescContains',label: '词条描述含文字',    ops: ['contains'],     valueType: 'text' },
      { key: 'currentItemDescLength',  label: '词条描述长度',      ops: ['==','>=','<='], valueType: 'number' },
      { key: 'currentItemTitleContains',label:'词条标题含文字',    ops: ['contains'],     valueType: 'text' },
      { key: 'currentItemLabelContains',label:'词条标签含',        ops: ['contains'],     valueType: 'text' },
      { key: 'currentItemLabelCount',  label: '词条标签数量',      ops: ['>=','=='],      valueType: 'number' },
      { key: 'currentItemIsEmpty',     label: '词条描述是否为空',  ops: ['=='],           valueType: 'boolean' },
      { key: 'isBottomTier',           label: '是否最底层',        ops: ['=='],           valueType: 'boolean' },
      { key: 'isFirstVisitIceberg',    label: '是否首次访问该图',  ops: ['=='],           valueType: 'boolean' },
      { key: 'all_clear',              label: '当前图全部读完',    ops: ['=='],           valueType: 'boolean' },
    ],
  },
  {
    label: '④ 用户成长',
    blocks: [
      { key: 'totalRead',              label: '累计阅读词条数',  ops: ['==','>=','<='], valueType: 'number' },
      { key: 'watchlistCount',         label: '收藏冰山图数',    ops: ['>=','=='],      valueType: 'number' },
      { key: 'totalVotesCast',         label: '累计投票次数',    ops: ['>=','=='],      valueType: 'number' },
      { key: 'createdIcebergCount',    label: '已发布冰山图数',  ops: ['>=','=='],      valueType: 'number' },
      { key: 'qualityLevel',           label: '质量等级(0-3)',   ops: ['>=','=='],      valueType: 'number' },
      { key: 'unlockedAchievementCount',label:'已解锁成就数',    ops: ['<=','>=','=='], valueType: 'number' },
      { key: 'warningCount',           label: '已收到警告次数',  ops: ['>=','=='],      valueType: 'number' },
      { key: 'hasUnreadNotification',  label: '是否有未读通知',  ops: ['=='],           valueType: 'boolean' },
      { key: 'hasEverSearched',        label: '是否曾使用搜索',  ops: ['=='],           valueType: 'boolean' },
    ],
  },
  {
    label: '⑤ 数学彩蛋',
    blocks: [
      { key: 'searchCount',   label: '搜索次数',      ops: ['==','>=','<='], valueType: 'number' },
      { key: 'randomCount',   label: '随机跳转次数',  ops: ['==','>=','<='], valueType: 'number' },
      { key: 'nightReadCount',label: '深夜阅读次数',  ops: ['>=','=='],      valueType: 'number' },
      { key: 'isDivisibleBy', label: '总阅读量能被N整除', ops: ['=='],       valueType: 'number' },
      { key: 'isPrime',       label: '总阅读量是质数', ops: ['=='],          valueType: 'boolean' },
      { key: 'triggerType',   label: '触发方式',       ops: ['=='],          valueType: 'triggerType' },
      { key: 'varDiff',       label: '两变量之差绝对值', ops: ['<=','=='],   valueType: 'varPair' },
    ],
  },
  {
    label: '⑥ 行为反转',
    blocks: [
      { key: 'varEqual', label: '变量A 等于 变量B', ops: ['=='], valueType: 'varPair' },
    ],
  },
];

const ALL_BLOCKS = BLOCK_CATEGORIES.flatMap(c => c.blocks);
const BLOCK_BY_KEY = Object.fromEntries(ALL_BLOCKS.map(b => [b.key, b]));

const VAR_OPTIONS = [
  'totalRead','searchCount','randomCount','nightReadCount',
  'visitedIcebergCount','consecutiveDays','totalVotesCast','currentIcebergReadCount',
];

const DAY_OPTIONS = ['周日','周一','周二','周三','周四','周五','周六'];
const MONTH_OPTIONS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

// ── 单条积木编辑器 ────────────────────────────────────────

function BlockRow({
  cond, onChange, onRemove,
}: {
  cond: BlockCondition;
  onChange: (c: BlockCondition) => void;
  onRemove: () => void;
}) {
  const def = BLOCK_BY_KEY[cond.block];

  const renderValueInput = () => {
    if (!def) return null;
    switch (def.valueType) {
      case 'boolean':
        return (
          <select
            value={String(cond.value)}
            onChange={e => onChange({ ...cond, value: e.target.value === 'true' })}
            className="bg-[#0a0a0a] border border-[#374151] text-[#e5e7eb] text-xs px-2 py-1 font-mono w-20"
          >
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
        );
      case 'dayOfWeek':
        return (
          <select
            value={Number(cond.value)}
            onChange={e => onChange({ ...cond, value: Number(e.target.value) })}
            className="bg-[#0a0a0a] border border-[#374151] text-[#e5e7eb] text-xs px-2 py-1 font-mono"
          >
            {DAY_OPTIONS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        );
      case 'month':
        return (
          <select
            value={Number(cond.value)}
            onChange={e => onChange({ ...cond, value: Number(e.target.value) })}
            className="bg-[#0a0a0a] border border-[#374151] text-[#e5e7eb] text-xs px-2 py-1 font-mono"
          >
            {MONTH_OPTIONS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        );
      case 'triggerType':
        return (
          <select
            value={String(cond.value)}
            onChange={e => onChange({ ...cond, value: e.target.value })}
            className="bg-[#0a0a0a] border border-[#374151] text-[#e5e7eb] text-xs px-2 py-1 font-mono"
          >
            {['read','search','random','vote','visit'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        );
      case 'varPair':
        return (
          <>
            <select
              value={cond.varA ?? ''}
              onChange={e => onChange({ ...cond, varA: e.target.value })}
              className="bg-[#0a0a0a] border border-[#374151] text-[#e5e7eb] text-xs px-2 py-1 font-mono"
            >
              <option value="">变量A</option>
              {VAR_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            {cond.block === 'varDiff' && (
              <>
                <select
                  value={cond.varB ?? ''}
                  onChange={e => onChange({ ...cond, varB: e.target.value })}
                  className="bg-[#0a0a0a] border border-[#374151] text-[#e5e7eb] text-xs px-2 py-1 font-mono"
                >
                  <option value="">变量B</option>
                  {VAR_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <input
                  type="number"
                  value={Number(cond.value)}
                  onChange={e => onChange({ ...cond, value: Number(e.target.value) })}
                  className="bg-[#0a0a0a] border border-[#374151] text-[#e5e7eb] text-xs px-2 py-1 font-mono w-16"
                  placeholder="阈值"
                />
              </>
            )}
            {cond.block === 'varEqual' && (
              <select
                value={cond.varB ?? ''}
                onChange={e => onChange({ ...cond, varB: e.target.value })}
                className="bg-[#0a0a0a] border border-[#374151] text-[#e5e7eb] text-xs px-2 py-1 font-mono"
              >
                <option value="">变量B</option>
                {VAR_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
          </>
        );
      case 'text':
        return (
          <input
            type="text"
            value={String(cond.value)}
            onChange={e => onChange({ ...cond, value: e.target.value })}
            className="bg-[#0a0a0a] border border-[#374151] text-[#e5e7eb] text-xs px-2 py-1 font-mono w-32"
            placeholder="文字"
          />
        );
      default:
        return (
          <input
            type="number"
            value={Number(cond.value)}
            onChange={e => onChange({ ...cond, value: Number(e.target.value) })}
            className="bg-[#0a0a0a] border border-[#374151] text-[#e5e7eb] text-xs px-2 py-1 font-mono w-20"
          />
        );
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* 积木选择 */}
      <select
        value={cond.block}
        onChange={e => {
          const newDef = BLOCK_BY_KEY[e.target.value];
          onChange({
            block: e.target.value,
            op: newDef?.ops[0] ?? '==',
            value: newDef?.valueType === 'boolean' ? true : newDef?.valueType === 'text' ? '' : 0,
          });
        }}
        className="bg-[#0a0a0a] border border-[#00FF41]/40 text-[#00FF41] text-xs px-2 py-1 font-mono"
      >
        {BLOCK_CATEGORIES.map(cat => (
          <optgroup key={cat.label} label={cat.label}>
            {cat.blocks.map(b => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* 运算符（varEqual / isPrime / isDivisibleBy / all_clear 不显示）*/}
      {def && !['varEqual','isPrime','all_clear'].includes(cond.block) && (
        <select
          value={cond.op}
          onChange={e => onChange({ ...cond, op: e.target.value as ConditionOp })}
          className="bg-[#0a0a0a] border border-[#374151] text-[#9ca3af] text-xs px-2 py-1 font-mono"
        >
          {def.ops.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}

      {/* 值输入 */}
      {renderValueInput()}

      {/* 删除 */}
      <button
        onClick={onRemove}
        className="text-[#4b5563] hover:text-[#ef4444] text-xs px-1 font-mono transition-colors"
      >
        🗑
      </button>
    </div>
  );
}

// ── 自然语言预览 ──────────────────────────────────────────

function ConditionPreview({ conditions }: { conditions: Condition[] }) {
  const parts: string[] = [];
  for (const c of conditions) {
    if ('logic' in c) {
      parts.push(c.logic === 'AND' ? '且' : '或');
    } else {
      const def = BLOCK_BY_KEY[c.block];
      const label = def?.label ?? c.block;
      const opLabel = c.op === 'contains' ? '包含' : c.op;
      if (['isPrime','all_clear'].includes(c.block)) {
        parts.push(`「${label}」`);
      } else if (c.block === 'varEqual') {
        parts.push(`「${c.varA} 等于 ${c.varB}」`);
      } else if (c.block === 'varDiff') {
        parts.push(`「|${c.varA} - ${c.varB}| ${opLabel} ${c.value}」`);
      } else {
        parts.push(`「${label} ${opLabel} ${c.value}」`);
      }
    }
  }
  if (parts.length === 0) return <span className="text-[#4b5563] text-xs">（未设置条件）</span>;
  return <span className="text-[#9ca3af] text-xs font-mono">当 {parts.join(' ')} 时解锁</span>;
}

// ── 条件积木编辑器 ────────────────────────────────────────

function ConditionBuilder({
  conditions, onChange,
}: {
  conditions: Condition[];
  onChange: (c: Condition[]) => void;
}) {
  const blocks = conditions.filter((c): c is BlockCondition => !('logic' in c));
  const logics = conditions.filter((c): c is { logic: 'AND' | 'OR' } => 'logic' in c);

  // 重建完整 conditions 数组（block logic block logic block ...）
  const rebuild = (newBlocks: BlockCondition[], newLogics: { logic: 'AND' | 'OR' }[]) => {
    const result: Condition[] = [];
    for (let i = 0; i < newBlocks.length; i++) {
      result.push(newBlocks[i]);
      if (i < newBlocks.length - 1) result.push(newLogics[i] ?? { logic: 'AND' });
    }
    onChange(result);
  };

  const addBlock = () => {
    const newBlock: BlockCondition = { block: 'totalRead', op: '>=', value: 1 };
    const newBlocks = [...blocks, newBlock];
    const newLogics = [...logics, { logic: 'AND' as const }];
    rebuild(newBlocks, newLogics);
  };

  const updateBlock = (i: number, updated: BlockCondition) => {
    const newBlocks = blocks.map((b, idx) => idx === i ? updated : b);
    rebuild(newBlocks, logics);
  };

  const removeBlock = (i: number) => {
    const newBlocks = blocks.filter((_, idx) => idx !== i);
    const newLogics = logics.filter((_, idx) => idx !== i);
    rebuild(newBlocks, newLogics);
  };

  const toggleLogic = (i: number) => {
    const newLogics = logics.map((l, idx) =>
      idx === i ? { logic: l.logic === 'AND' ? 'OR' as const : 'AND' as const } : l,
    );
    rebuild(blocks, newLogics);
  };

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => (
        <div key={i}>
          <BlockRow
            cond={block}
            onChange={updated => updateBlock(i, updated)}
            onRemove={() => removeBlock(i)}
          />
          {i < blocks.length - 1 && (
            <button
              onClick={() => toggleLogic(i)}
              className="mt-1 text-[10px] font-mono px-2 py-0.5 border transition-colors
                border-[#374151] text-[#6b7280] hover:border-[#00FF41] hover:text-[#00FF41]"
            >
              {logics[i]?.logic ?? 'AND'} ▼
            </button>
          )}
        </div>
      ))}

      <button
        onClick={addBlock}
        className="text-xs font-mono text-[#6b7280] border border-dashed border-[#374151]
          hover:border-[#00FF41] hover:text-[#00FF41] px-3 py-1 transition-colors"
      >
        + 添加积木
      </button>

      {conditions.length > 0 && (
        <div className="mt-2 px-2 py-1.5 bg-[#0a0a0a] border border-[#1f2937]">
          <ConditionPreview conditions={conditions} />
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────

interface AchievementDef {
  id: string; key: string; icon: string; label: string; labelZh: string;
  desc: string; color: string; triggerType: string; triggerTarget: number;
  sortOrder: number; isHidden: boolean; conditions: string; createdAt: string;
}

const EMPTY_FORM = {
  key: '', icon: '', label: '', labelZh: '', desc: '',
  color: '#6b7280', triggerType: 'manual', triggerTarget: 0,
  sortOrder: 0, isHidden: false, conditions: '[]',
};

export function AdminAchievements() {
  const [achievements, setAchievements] = useState<AchievementDef[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editId, setEditId]             = useState<string | null>(null);
  const [form, setForm]                 = useState({ ...EMPTY_FORM });
  const [conditions, setConditions]     = useState<Condition[]>([]);
  const [busy, setBusy]                 = useState(false);
  const [deleting, setDeleting]         = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/achievements');
      const data = await res.json();
      if (data.success) setAchievements(data.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setConditions([]);
    setEditId(null);
    setShowForm(true);
  };

  const openEdit = (ach: AchievementDef) => {
    setForm({
      key: ach.key, icon: ach.icon, label: ach.label, labelZh: ach.labelZh,
      desc: ach.desc, color: ach.color, triggerType: ach.triggerType,
      triggerTarget: ach.triggerTarget, sortOrder: ach.sortOrder,
      isHidden: ach.isHidden, conditions: ach.conditions,
    });
    try { setConditions(JSON.parse(ach.conditions || '[]')); }
    catch { setConditions([]); }
    setEditId(ach.id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false); setEditId(null);
    setForm({ ...EMPTY_FORM }); setConditions([]);
  };

  const submit = async () => {
    if (!form.key.trim() || !form.icon.trim() || !form.labelZh.trim() || !form.desc.trim()) {
      toast('请填写所有必填字段', 'error'); return;
    }
    setBusy(true);
    try {
      const url    = editId ? `/api/admin/achievements/${editId}` : '/api/admin/achievements';
      const method = editId ? 'PUT' : 'POST';
      const payload = { ...form, label: form.label || form.labelZh, conditions: JSON.stringify(conditions) };
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) { toast(editId ? '成就已更新' : '成就已创建'); closeForm(); load(); }
      else toast(data.error?.message ?? '操作失败', 'error');
    } finally { setBusy(false); }
  };

  const deleteAch = async (ach: AchievementDef) => {
    if (!confirm(`确认删除「${ach.labelZh}」？`)) return;
    setDeleting(ach.id);
    try {
      const res  = await fetch(`/api/admin/achievements/${ach.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast('已删除'); load(); }
      else toast(data.error?.message ?? '删除失败', 'error');
    } finally { setDeleting(null); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="text-sm font-mono text-[#6b7280]">
          探索成就定义 — <span className="text-[#00FF41]">{achievements.length}</span> 条
        </div>
        <button onClick={openCreate}
          className="px-3 py-1.5 text-xs font-mono border border-[#374151] text-[#6b7280]
            hover:border-[#00FF41] hover:text-[#00FF41] transition-colors">
          + 新建成就
        </button>
      </div>

      {/* 成就列表 */}
      {loading ? (
        <div className="text-xs text-[#4b5563] font-mono">加载中...</div>
      ) : (
        <div className="space-y-2">
          {achievements.map(ach => {
            let preview: string[] = [];
            try {
              const conds: Condition[] = JSON.parse(ach.conditions || '[]');
              preview = conds.filter((c): c is BlockCondition => !('logic' in c))
                .slice(0, 2).map(c => BLOCK_BY_KEY[c.block]?.label ?? c.block);
            } catch { /* ignore */ }

            return (
              <div key={ach.id}
                className="flex items-start gap-3 px-3 py-2 border border-[#1f2937] bg-[#050505]
                  hover:border-[#374151] transition-colors"
                style={{ borderLeftColor: ach.color, borderLeftWidth: '3px' }}>
                <span className="text-xl mt-0.5">{ach.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#e5e7eb]">{ach.labelZh}</span>
                    {ach.isHidden && (
                      <span className="text-[10px] text-[#6b7280] border border-[#374151] px-1">隐藏</span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#4b5563] font-mono mt-0.5">
                    {preview.length > 0 ? preview.join(' + ') : ach.triggerType}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(ach)}
                    className="text-[10px] font-mono text-[#6b7280] hover:text-[#00FF41] transition-colors">
                    编辑
                  </button>
                  <button onClick={() => deleteAch(ach)} disabled={deleting === ach.id}
                    className="text-[10px] font-mono text-[#6b7280] hover:text-[#ef4444] transition-colors">
                    {deleting === ach.id ? '...' : '删除'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 表单弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center pt-12 px-4">
          <div className="bg-[#050505] border border-[#374151] w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f2937]">
              <span className="text-xs font-mono text-[#00FF41]">
                {editId ? '编辑成就' : '新建成就'}
              </span>
              <button onClick={closeForm} className="text-[#6b7280] hover:text-[#ef4444] text-xs font-mono">
                [ 关闭 X ]
              </button>
            </div>

            <div className="px-4 py-4 space-y-3">
              {/* 基础字段 */}
              {[
                { label: '唯一Key *', field: 'key', disabled: !!editId },
                { label: '图标(emoji) *', field: 'icon' },
                { label: '中文标题 *', field: 'labelZh' },
                { label: '英文标题', field: 'label' },
                { label: '描述 *', field: 'desc' },
              ].map(({ label, field, disabled }) => (
                <div key={field}>
                  <div className="text-[10px] font-mono text-[#6b7280] mb-1">{label}</div>
                  <input
                    value={(form as any)[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    disabled={disabled}
                    className="w-full bg-[#0a0a0a] border border-[#374151] text-[#e5e7eb] text-xs
                      px-2 py-1.5 font-mono disabled:opacity-50"
                  />
                </div>
              ))}

              <div className="flex gap-3">
                <div className="flex-1">
                  <div className="text-[10px] font-mono text-[#6b7280] mb-1">颜色</div>
                  <input type="color" value={form.color}
                    onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    className="w-full h-8 bg-[#0a0a0a] border border-[#374151] cursor-pointer" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-mono text-[#6b7280] mb-1">排序</div>
                  <input type="number" value={form.sortOrder}
                    onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                    className="w-full bg-[#0a0a0a] border border-[#374151] text-[#e5e7eb] text-xs px-2 py-1.5 font-mono" />
                </div>
                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-1 text-xs font-mono text-[#6b7280] cursor-pointer">
                    <input type="checkbox" checked={form.isHidden}
                      onChange={e => setForm(f => ({ ...f, isHidden: e.target.checked }))} />
                    隐藏成就
                  </label>
                </div>
              </div>

              {/* 条件积木 */}
              <div>
                <div className="text-[10px] font-mono text-[#6b7280] mb-2 border-b border-[#1f2937] pb-1">
                  触发条件积木
                </div>
                <ConditionBuilder conditions={conditions} onChange={setConditions} />
              </div>
            </div>

            <div className="px-4 py-3 border-t border-[#1f2937] flex justify-end gap-2">
              <button onClick={closeForm}
                className="px-3 py-1.5 text-xs font-mono border border-[#374151] text-[#6b7280]
                  hover:border-[#6b7280] transition-colors">
                取消
              </button>
              <button onClick={submit} disabled={busy}
                className="px-3 py-1.5 text-xs font-mono bg-[#00FF41] text-[#0A0A0A]
                  font-bold hover:bg-[#00CC33] disabled:opacity-50 transition-colors">
                {busy ? '保存中...' : (editId ? '更新' : '创建')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/AdminAchievements.tsx
git commit -m "feat: replace AdminAchievements with visual condition block builder"
```

---

## Task 14: 种子数据 — 47 个原版成就迁移

**Files:**
- Create: `prisma/seed-achievements.mjs`

- [ ] **Step 1: 创建迁移脚本**

```js
// prisma/seed-achievements.mjs
// 将原版 _achievements.json 里的 47 个成就转换为新 conditions 格式并写入 DB
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// 原版成就数据（直接内嵌，对应 data/_achievements.json）
const LEGACY = [
  { key:'pioneer',    icon:'👁️',  labelZh:'初次接入',     label:'First Contact',  desc:'成功与深网数据库建立连接，你的 IP 已被记录。',               conditions:[{block:'totalRead',op:'>=',value:1}],                                                                color:'#6b7280', sortOrder:0,  isHidden:false },
  { key:'curious',    icon:'📖',  labelZh:'见习调查员',   label:'Apprentice',     desc:'初步了解冰山一角，世界似乎没有你想象的那么简单。',             conditions:[{block:'totalRead',op:'>=',value:10}],                                                               color:'#6b7280', sortOrder:1,  isHidden:false },
  { key:'tracker',    icon:'🕵️', labelZh:'异常现象追踪者',label:'Tracker',        desc:'你开始在庞杂的数据中寻找规律，理智值微幅下降。',               conditions:[{block:'totalRead',op:'>=',value:50}],                                                               color:'#6b7280', sortOrder:2,  isHidden:false },
  { key:'overload',   icon:'🧠',  labelZh:'信息过载',     label:'Overload',       desc:'大量冗余且怪异的信息涌入大脑，偶尔会出现幻听。',               conditions:[{block:'totalRead',op:'>=',value:100}],                                                              color:'#6b7280', sortOrder:3,  isHidden:false },
  { key:'abyss',      icon:'🌀',  labelZh:'深渊凝视者',   label:'Abyss Gazer',   desc:'当你凝视深渊时，深渊中的某些东西也注意到了你。',               conditions:[{block:'totalRead',op:'>=',value:250}],                                                              color:'#6b7280', sortOrder:4,  isHidden:false },
  { key:'hazard',     icon:'🩸',  labelZh:'认知危害',     label:'Cognitohazard', desc:'接触了过多不该知道的真相，你的世界观已不可逆转地崩塌。',         conditions:[{block:'totalRead',op:'>=',value:500}],                                                              color:'#ef4444', sortOrder:5,  isHidden:false },
  { key:'omniscient', icon:'👁️‍🗨️',labelZh:'全知之眼',    label:'Omniscient',    desc:'你已阅尽千帆。但全知，亦是全盲。',                             conditions:[{block:'totalRead',op:'>=',value:1000}],                                                             color:'#8b5cf6', sortOrder:6,  isHidden:false },
  { key:'meme',       icon:'💀',  labelZh:'模因感染者',   label:'Meme Infected', desc:'[数据删除]...[数据损坏]... 载体已同化。',                       conditions:[{block:'totalRead',op:'>=',value:2000}],                                                             color:'#dc2626', sortOrder:7,  isHidden:false },
  { key:'squid',      icon:'🐙',  labelZh:'盲目吃鱼者',   label:'Deep Diver',    desc:'在最深处，隐藏着人类无法理解的庞然大物。',                     conditions:[{block:'isBottomTier',op:'==',value:true}],                                                          color:'#0ea5e9', sortOrder:8,  isHidden:false },
  { key:'allclear',   icon:'🗄️',  labelZh:'区域收容完成', label:'All Clear',     desc:'该区域内的所有异常档案已被你全面清点。',                       conditions:[{block:'all_clear',op:'==',value:true}],                                                             color:'#22c55e', sortOrder:9,  isHidden:false },
  { key:'nightowl1',  icon:'🌙',  labelZh:'午夜漫游',     label:'Night Owl',     desc:'夜深了，但你仍未安眠。是失眠，还是某种力量在召唤？',           conditions:[{block:'nightReadCount',op:'>=',value:1}],                                                           color:'#6b7280', sortOrder:10, isHidden:false },
  { key:'nightowl2',  icon:'🦉',  labelZh:'守夜人',       label:'Watchman',      desc:'在大多数人梦乡中时，你独自面对着屏幕的荧光。',                 conditions:[{block:'nightReadCount',op:'>=',value:10}],                                                          color:'#6b7280', sortOrder:11, isHidden:false },
  { key:'nightowl3',  icon:'🕯️', labelZh:'逢魔时刻',     label:'Witching Hour', desc:'阴气最重之时，你点开了第 30 份诡异的档案。',                   conditions:[{block:'nightReadCount',op:'>=',value:30}],                                                          color:'#6b7280', sortOrder:12, isHidden:true  },
  { key:'nightowl4',  icon:'😴',  labelZh:'睡眠剥夺',     label:'Sleep Deprived',desc:'长期在深夜接触异常信息，你的神经已经极度衰弱。',               conditions:[{block:'nightReadCount',op:'>=',value:50}],                                                          color:'#6b7280', sortOrder:13, isHidden:true  },
  { key:'nightowl5',  icon:'🚪',  labelZh:'黑暗中的敲门声',label:'Knock',        desc:'别回头。就在刚才，有什么东西站在了你的门外。',                 conditions:[{block:'nightReadCount',op:'>=',value:100}],                                                         color:'#1f2937', sortOrder:14, isHidden:true  },
  { key:'search1',    icon:'🔎',  labelZh:'循迹而行',     label:'On Track',      desc:'首次使用检索系统，在茫茫数据海中寻找线索。',                   conditions:[{block:'searchCount',op:'>=',value:1}],                                                              color:'#6b7280', sortOrder:15, isHidden:false },
  { key:'search2',    icon:'🐕',  labelZh:'关键字嗅探',   label:'Keyword Hound', desc:'像猎犬一样，精准地通过标签定位目标信息。',                     conditions:[{block:'searchCount',op:'>=',value:10}],                                                             color:'#6b7280', sortOrder:16, isHidden:false },
  { key:'search3',    icon:'💻',  labelZh:'数据挖掘',     label:'Data Mining',   desc:'熟练掌握终端的高级检索，没有你找不到的机密。',                 conditions:[{block:'searchCount',op:'>=',value:50}],                                                             color:'#6b7280', sortOrder:17, isHidden:false },
  { key:'search4',    icon:'📡',  labelZh:'棱镜计划',     label:'PRISM',         desc:'你的检索记录本身，已经构成了一份庞大的行为监控档案。',         conditions:[{block:'searchCount',op:'>=',value:100}],                                                            color:'#6b7280', sortOrder:18, isHidden:false },
  { key:'search5',    icon:'🎯',  labelZh:'目标锁定',     label:'Locked On',     desc:'在信息的洪流中，精准狙击。',                                   conditions:[{block:'searchCount',op:'>=',value:200}],                                                            color:'#6b7280', sortOrder:19, isHidden:false },
  { key:'random1',    icon:'🎰',  labelZh:'量子跃迁',     label:'Quantum Leap',  desc:'放弃主动选择，将命运交给系统的伪随机数生成器。',               conditions:[{block:'randomCount',op:'>=',value:1}],                                                              color:'#6b7280', sortOrder:20, isHidden:false },
  { key:'random2',    icon:'💥',  labelZh:'混沌漫步',     label:'Chaos Walk',    desc:'在毫无关联的词条间反复横跳，试图寻找荒诞的联系。',             conditions:[{block:'randomCount',op:'>=',value:10}],                                                             color:'#6b7280', sortOrder:21, isHidden:true  },
  { key:'random3',    icon:'🎲',  labelZh:'掷骰子的神',   label:'God of Dice',   desc:'你开始享受这种盲盒般的信息刺激。',                             conditions:[{block:'randomCount',op:'>=',value:50}],                                                             color:'#6b7280', sortOrder:22, isHidden:false },
  { key:'random4',    icon:'🐱',  labelZh:'薛定谔的档案', label:"Schrödinger's", desc:'在点开之前，它既是真相也是谎言。',                             conditions:[{block:'randomCount',op:'>=',value:100}],                                                            color:'#6b7280', sortOrder:23, isHidden:false },
  { key:'random5',    icon:'🌌',  labelZh:'迷失于赛博空间',label:'Cyberspace',   desc:'你已经忘记了自己最初是要找什么了。',                           conditions:[{block:'randomCount',op:'>=',value:200}],                                                            color:'#6b7280', sortOrder:24, isHidden:false },
  { key:'label_con',  icon:'👽',  labelZh:'锡纸帽狂热者', label:'Tinfoil Hat',   desc:'登月是假的？地球是平的？你似乎对这些很感兴趣。',               conditions:[{block:'currentItemLabelContains',op:'contains',value:'阴谋论'}],                                    color:'#6b7280', sortOrder:25, isHidden:false },
  { key:'label_urb',  icon:'👻',  labelZh:'都市传说验证', label:'Urban Legend',  desc:'听说在午夜对着镜子削苹果，就能看到未来的画面...',              conditions:[{block:'currentItemLabelContains',op:'contains',value:'都市传说'}],                                   color:'#6b7280', sortOrder:26, isHidden:false },
  { key:'label_lost', icon:'📁',  labelZh:'网络谜踪',     label:'Lost Media',    desc:'这些影像资料本该在十年前就从互联网上彻底消失了。',             conditions:[{block:'currentItemLabelContains',op:'contains',value:'失传媒体'}],                                   color:'#6b7280', sortOrder:27, isHidden:false },
  { key:'label_gore', icon:'🩸',  labelZh:'猎奇者',       label:'Gore Fan',      desc:'强烈的好奇心战胜了生理上的不适。',                             conditions:[{block:'currentItemLabelContains',op:'contains',value:'猎奇'}],                                      color:'#6b7280', sortOrder:28, isHidden:false },
  { key:'404',        icon:'🐛',  labelZh:'404 Not Found',label:'404',           desc:'你的检索次数达到了一个充满隐喻的数字。',                       conditions:[{block:'searchCount',op:'==',value:404}],                                                            color:'#6b7280', sortOrder:29, isHidden:true  },
  { key:'devil',      icon:'😈',  labelZh:'恶魔的低语',   label:'Devil Whisper', desc:'你总共阅读了 666 个词条。小心背后的阴影。',                     conditions:[{block:'totalRead',op:'==',value:666}],                                                              color:'#dc2626', sortOrder:30, isHidden:true  },
  { key:'3am',        icon:'⏱️', labelZh:'凌晨三点的疯子',label:'3AM Maniac',   desc:'在凌晨 3 点整，且必须是通过"随机跃迁"功能点开词条。',          conditions:[{block:'currentHour',op:'==',value:3},{logic:'AND'},{block:'triggerType',op:'==',value:'random'}],   color:'#1f2937', sortOrder:31, isHidden:true  },
  { key:'deepdive',   icon:'⚓',  labelZh:'深海潜水病',   label:'Deep Sick',     desc:'在同一张图的最底端，连续查阅超过 10 个词条。',                 conditions:[{block:'isBottomTier',op:'==',value:true},{logic:'AND'},{block:'currentIcebergReadCount',op:'>=',value:10}], color:'#0ea5e9', sortOrder:32, isHidden:true  },
  { key:'speedrun',   icon:'🏃',  labelZh:'极速扫描仪',   label:'Speed Scanner', desc:'在单张冰山图里一口气点开了 50 个词条，没有停歇。',             conditions:[{block:'currentIcebergReadCount',op:'>=',value:50}],                                                 color:'#6b7280', sortOrder:33, isHidden:true  },
  { key:'epic',       icon:'🏔️', labelZh:'史诗级收容专家',label:'Epic Containment',desc:'完全通关了一张包含 100 个以上词条的超大型冰山图！',          conditions:[{block:'currentIcebergItemCount',op:'>=',value:100},{logic:'AND'},{block:'all_clear',op:'==',value:true}], color:'#f59e0b', sortOrder:34, isHidden:true  },
  { key:'monk',       icon:'🧘‍♂️',labelZh:'苦行僧',       label:'Ascetic',       desc:'从未使用过搜索功能，纯靠肉眼手动翻阅了 100 个词条。',          conditions:[{block:'hasEverSearched',op:'==',value:false},{logic:'AND'},{block:'totalRead',op:'>=',value:100}],  color:'#6b7280', sortOrder:35, isHidden:true  },
  { key:'lucky77',    icon:'🍀',  labelZh:'幸运的混沌',   label:'Lucky Chaos',   desc:'使用了刚好 77 次随机功能。',                                   conditions:[{block:'randomCount',op:'==',value:77}],                                                             color:'#22c55e', sortOrder:36, isHidden:true  },
  { key:'firstclear', icon:'🧛',  labelZh:'初拥',         label:'First Clear',   desc:'在这个网站上，第一次完成"单图全清"的壮举。',                   conditions:[{block:'unlockedAchievementCount',op:'<=',value:3},{logic:'AND'},{block:'all_clear',op:'==',value:true}], color:'#8b5cf6', sortOrder:37, isHidden:true  },
  { key:'o5',         icon:'🛡️', labelZh:'O5 议会成员',  label:'O5 Council',   desc:'【最高荣誉】阅读破 500、搜索破 50、随机破 50、且熬夜阅读破 20。',conditions:[{block:'totalRead',op:'>=',value:500},{logic:'AND'},{block:'searchCount',op:'>=',value:50},{logic:'AND'},{block:'randomCount',op:'>=',value:50},{logic:'AND'},{block:'nightReadCount',op:'>=',value:20}], color:'#f59e0b', sortOrder:38, isHidden:true  },
  { key:'redacted',   icon:'⬛',  labelZh:'权限受限',     label:'Redacted',      desc:'警告：你正试图访问高模因污染档案，部分数据已被强制涂黑。',     conditions:[{block:'currentItemTitleContains',op:'contains',value:'██'}],                                        color:'#1f2937', sortOrder:39, isHidden:true  },
  { key:'444',        icon:'☠️',  labelZh:'死神之视',     label:'Death Sight',   desc:'444 份档案已被你装进大脑。不要再看下去了。',                   conditions:[{block:'totalRead',op:'==',value:444}],                                                              color:'#dc2626', sortOrder:40, isHidden:true  },
  { key:'blind',      icon:'🦯',  labelZh:'盲信者',       label:'True Believer', desc:'拒绝使用检索系统。你如盲人般在黑暗的信息网络中摸索前行。',     conditions:[{block:'hasEverSearched',op:'==',value:false},{logic:'AND'},{block:'totalRead',op:'>=',value:80}],   color:'#6b7280', sortOrder:41, isHidden:true  },
  { key:'minimal',    icon:'💬',  labelZh:'极简主义恐惧', label:'Minimal Horror',desc:'只有寥寥几个字，但背后的寒意却爬上了你的脊背。',               conditions:[{block:'currentItemDescLength',op:'<=',value:10},{logic:'AND'},{block:'currentItemIsEmpty',op:'==',value:false}], color:'#6b7280', sortOrder:42, isHidden:true  },
  { key:'shallow',    icon:'🕷️', labelZh:'徘徊于浅滩',   label:'Shallow',       desc:'你在水面上徘徊了很久。你到底在害怕深处的什么？',               conditions:[{block:'currentIcebergReadCount',op:'>=',value:30},{logic:'AND'},{block:'isBottomTier',op:'==',value:false}], color:'#6b7280', sortOrder:43, isHidden:true  },
  { key:'chaos_order',icon:'⚖️', labelZh:'混沌与秩序',   label:'Balance',       desc:'在绝对的理智检索与疯狂的随机跃迁之间，你达到了诡异的平衡。',   conditions:[{block:'searchCount',op:'>=',value:30},{logic:'AND'},{block:'varEqual',op:'==',value:true,varA:'searchCount',varB:'randomCount'}], color:'#6b7280', sortOrder:44, isHidden:true  },
  { key:'brain_jar',  icon:'🪞',  labelZh:'缸中之脑',     label:'Brain in Jar',  desc:'42。你触碰到了宇宙的底层代码，系统即将强制重启。',             conditions:[{block:'totalRead',op:'==',value:42},{logic:'AND'},{block:'searchCount',op:'==',value:42},{logic:'AND'},{block:'randomCount',op:'==',value:42}], color:'#8b5cf6', sortOrder:45, isHidden:true  },
  { key:'immune',     icon:'🔌',  labelZh:'模因免疫',     label:'Immune',        desc:'面对海量的异常信息，你的理智竟然毫无波动。这本身就是一种异常。', conditions:[{block:'totalRead',op:'>=',value:100},{logic:'AND'},{block:'unlockedAchievementCount',op:'<=',value:1}], color:'#6b7280', sortOrder:46, isHidden:true  },
];

async function main() {
  console.log('开始迁移成就数据...');
  let created = 0, skipped = 0;

  for (const ach of LEGACY) {
    const existing = await prisma.achievement.findUnique({ where: { key: ach.key } });
    if (existing) { skipped++; continue; }

    await prisma.achievement.create({
      data: {
        key:           ach.key,
        icon:          ach.icon,
        label:         ach.label,
        labelZh:       ach.labelZh,
        desc:          ach.desc,
        color:         ach.color,
        triggerType:   'manual',       // 新成就全用 conditions
        triggerTarget: 0,
        sortOrder:     ach.sortOrder,
        isHidden:      ach.isHidden,
        conditions:    JSON.stringify(ach.conditions),
      },
    });
    created++;
  }

  console.log(`完成：新建 ${created} 条，跳过已存在 ${skipped} 条`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: 执行迁移脚本**

```bash
cd frontend
node prisma/seed-achievements.mjs
```

期望输出：
```
开始迁移成就数据...
完成：新建 47 条，跳过已存在 0 条
```

- [ ] **Step 3: Commit**

```bash
git add prisma/seed-achievements.mjs
git commit -m "feat: seed 47 original achievements in new conditions format"
```

---

## 完成验收

- [ ] `npm run build` 无 TypeScript 错误
- [ ] `npm run dev` 启动，访问 `/iceberg/[任意slug]` 页面右上角出现导出按钮
- [ ] 阅读一个词条后，`user_stats` 表里有记录（可用 `npx prisma studio` 验证）
- [ ] 管理员后台 `/user/[admin-id]` → 成就配置 tab → 可新建成就、添加条件积木、预览自然语言
- [ ] 手动将某用户 `totalRead` 改为 1，触发 `POST /api/items/read`，成就 Toast 从右上角滑入
- [ ] `npx prisma studio` 验证 `achievements` 表有 47 条记录
