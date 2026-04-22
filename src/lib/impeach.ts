import { prisma } from './prisma';

// 弹劾投票权重
export const IMPEACH_VOTE_WEIGHT: Record<string, number> = {
  EDITOR:    1,
  MODERATOR: 2,
  ADMIN:     3,
};

export function getImpeachWeight(role: string, isFounder: boolean): number {
  if (isFounder) return 5;
  return IMPEACH_VOTE_WEIGHT[role] ?? 0;
}

/**
 * 某角色是否有资格对给定 targetRole 的弹劾案投票。
 * 弹劾 MODERATOR：EDITOR+ 可投
 * 弹劾 ADMIN：MODERATOR+ 可投
 * 被弹劾人本人不可投（调用方负责排除）
 */
export function canVoteOnImpeach(
  voterRole: string,
  isFounder: boolean,
  targetRole: string,
): boolean {
  const w = getImpeachWeight(voterRole, isFounder);
  if (w <= 0) return false;
  if (targetRole === 'ADMIN' && voterRole === 'EDITOR' && !isFounder) return false;
  return true;
}

export async function getImpeachSettings() {
  const rows = await prisma.systemSettings.findMany({
    where: { key: { in: ['impeach_vote_days', 'impeach_pass_ratio', 'impeach_min_votes'] } },
  });
  const m: Record<string, string> = {};
  rows.forEach(r => { m[r.key] = r.value; });
  return {
    voteDays:  parseInt(m['impeach_vote_days']  ?? '7',    10),
    passRatio: parseFloat(m['impeach_pass_ratio'] ?? '0.67'),
    minVotes:  parseInt(m['impeach_min_votes']  ?? '3',    10),
  };
}

/** 判定票数是否达到弹劾通过条件 */
export function evaluateImpeach(
  votes: { vote: string; weight: number }[],
  settings: { minVotes: number; passRatio: number },
): 'PASSED' | 'REJECTED' {
  const support  = votes.filter(v => v.vote === 'SUPPORT');
  const oppose   = votes.filter(v => v.vote === 'OPPOSE');
  const sWeight  = support.reduce((s, v) => s + v.weight, 0);
  const oWeight  = oppose.reduce((s, v) => s + v.weight, 0);
  const total    = sWeight + oWeight;

  if (support.length < settings.minVotes) return 'REJECTED';
  if (total === 0) return 'REJECTED';
  if (sWeight / total < settings.passRatio) return 'REJECTED';
  return 'PASSED';
}

/** 弹劾通过后目标角色降为 */
export function demotedRole(targetRole: string): string {
  if (targetRole === 'ADMIN')     return 'MODERATOR';
  if (targetRole === 'MODERATOR') return 'EDITOR';
  return 'EDITOR';
}
