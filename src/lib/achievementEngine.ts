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
  totalRead:               ctx => ctx.stats.totalRead,
  searchCount:             ctx => ctx.stats.searchCount,
  randomCount:             ctx => ctx.stats.randomCount,
  nightReadCount:          ctx => ctx.stats.nightReadCount,
  visitedIcebergCount:     ctx => ctx.stats.visitedIcebergCount,
  consecutiveDays:         ctx => ctx.stats.consecutiveDays,
  totalVotesCast:          ctx => ctx.stats.totalVotesCast,
  currentIcebergReadCount: ctx => ctx.currentIcebergReadCount,
  currentHour:             ctx => ctx.currentHour,
  currentMinute:           ctx => ctx.currentMinute,
  currentDayOfWeek:        ctx => ctx.currentDayOfWeek,
  currentDayOfMonth:       ctx => ctx.currentDayOfMonth,
  currentMonth:            ctx => ctx.currentMonth,
};

function getVarNum(name: string, ctx: AchievementContext): number {
  return VAR_MAP[name]?.(ctx) ?? 0;
}

// ── 单条件求值 ────────────────────────────────────────────

function evaluateBlock(cond: BlockCondition, ctx: AchievementContext): boolean {
  const { block, op, value } = cond;

  // 特殊块
  if (block === 'isPrime')       return isPrime(ctx.stats.totalRead);
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
    case 'currentHour':             ctxValue = ctx.currentHour; break;
    case 'currentMinute':           ctxValue = ctx.currentMinute; break;
    case 'currentDayOfWeek':        ctxValue = ctx.currentDayOfWeek; break;
    case 'currentDayOfMonth':       ctxValue = ctx.currentDayOfMonth; break;
    case 'currentMonth':            ctxValue = ctx.currentMonth; break;
    case 'daysSinceRegister':       ctxValue = ctx.user.daysSinceRegister; break;
    case 'visitedIcebergCount':     ctxValue = ctx.stats.visitedIcebergCount; break;
    case 'consecutiveDays':         ctxValue = ctx.stats.consecutiveDays; break;
    case 'sessionMinutes':          ctxValue = ctx.sessionMinutes; break;
    case 'currentTierOrder':        ctxValue = ctx.currentItem?.tierOrder ?? -1; break;
    case 'currentIcebergTierCount': ctxValue = ctx.currentIceberg?.tierCount ?? 0; break;
    case 'currentIcebergItemCount': ctxValue = ctx.currentIceberg?.itemCount ?? 0; break;
    case 'currentItemDescContains': ctxValue = ctx.currentItem?.desc ?? ''; break;
    case 'currentItemDescLength':   ctxValue = (ctx.currentItem?.desc ?? '').trim().length; break;
    case 'currentItemTitleContains':ctxValue = ctx.currentItem?.title ?? ''; break;
    case 'currentItemLabelContains':
      // Case-insensitive: labels are stored uppercase ('NSFW') but admin may type lowercase
      return String(value) === ''
        ? false
        : (ctx.currentItem?.labels.join(',') ?? '').toLowerCase().includes(String(value).toLowerCase());

    case 'currentItemLabelCount':   ctxValue = ctx.currentItem?.labels.length ?? 0; break;
    case 'currentItemIsEmpty':      ctxValue = !(ctx.currentItem?.desc ?? '').trim(); break;
    case 'currentIcebergReadCount': ctxValue = ctx.currentIcebergReadCount; break;
    case 'isBottomTier':            ctxValue = ctx.isBottomTier; break;
    case 'isFirstVisitIceberg':     ctxValue = ctx.isFirstVisitIceberg; break;
    case 'totalRead':               ctxValue = ctx.stats.totalRead; break;
    case 'watchlistCount':          ctxValue = ctx.user.watchlistCount; break;
    case 'totalVotesCast':          ctxValue = ctx.stats.totalVotesCast; break;
    case 'createdIcebergCount':     ctxValue = ctx.user.createdIcebergCount; break;
    case 'qualityLevel':            ctxValue = ctx.user.qualityLevel; break;
    case 'qualityScore':            ctxValue = ctx.user.qualityScore; break;
    case 'unlockedAchievementCount':ctxValue = ctx.user.unlockedAchievementCount; break;
    case 'warningCount':            ctxValue = ctx.user.warningCount; break;
    case 'hasUnreadNotification':   ctxValue = ctx.user.hasUnreadNotification; break;
    case 'hasEverSearched':         ctxValue = ctx.stats.searchCount > 0; break;
    case 'searchCount':             ctxValue = ctx.stats.searchCount; break;
    case 'randomCount':             ctxValue = ctx.stats.randomCount; break;
    case 'nightReadCount':          ctxValue = ctx.stats.nightReadCount; break;
    case 'triggerType':             ctxValue = ctx.triggerType; break;
    case 'projectJoinedCount':      ctxValue = ctx.user.projectJoinedCount; break;
    case 'projectCreatedCount':     ctxValue = ctx.user.projectCreatedCount; break;
    case 'ideaSubmittedCount':      ctxValue = ctx.user.ideaSubmittedCount; break;
    case 'taskCompletedCount':      ctxValue = ctx.user.taskCompletedCount; break;
    case 'collabEditCount':         ctxValue = ctx.user.collabEditCount; break;
    default:                        return false;
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
