import { prisma } from './prisma';

export const RFA_VOTE_WEIGHT: Record<string, number> = {
  CONTRIBUTOR: 1,
  EDITOR: 2,
  MODERATOR: 3,
  ADMIN: 5,
};

export function getRfaWeight(role: string, isFounder: boolean): number {
  if (isFounder) return 7;
  return RFA_VOTE_WEIGHT[role] ?? 0;
}

export async function getRfaSettings() {
  const keys = [
    'editor_min_score', 'editor_min_days',
    'rfa_min_votes', 'rfa_pass_ratio', 'rfa_vote_days', 'rfa_cooldown_days',
  ];
  const rows = await prisma.systemSettings.findMany({ where: { key: { in: keys } } });
  const map: Record<string, string> = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return {
    minScore:     parseInt(map['editor_min_score']   ?? '100',  10),
    minDays:      parseInt(map['editor_min_days']    ?? '30',   10),
    minVotes:     parseInt(map['rfa_min_votes']      ?? '5',    10),
    passRatio:    parseFloat(map['rfa_pass_ratio']   ?? '0.67'),
    voteDays:     parseInt(map['rfa_vote_days']      ?? '7',    10),
    cooldownDays: parseInt(map['rfa_cooldown_days']  ?? '15',   10),
  };
}

/** 判定一个 RfA 的票数是否达到通过条件 */
export function evaluateRfa(
  votes: { vote: string; weight: number }[],
  settings: { minVotes: number; passRatio: number },
): 'APPROVED' | 'REJECTED' {
  const approveVotes  = votes.filter(v => v.vote === 'APPROVE');
  const opposeVotes   = votes.filter(v => v.vote === 'OPPOSE');
  const approveCount  = approveVotes.length;
  const approveWeight = approveVotes.reduce((s, v) => s + v.weight, 0);
  const opposeWeight  = opposeVotes.reduce((s, v) => s + v.weight, 0);
  const totalWeight   = approveWeight + opposeWeight;

  if (approveCount < settings.minVotes) return 'REJECTED';
  if (totalWeight === 0) return 'REJECTED';
  if (approveWeight / totalWeight < settings.passRatio) return 'REJECTED';
  return 'APPROVED';
}
