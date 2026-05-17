/**
 * 质量分流水记录工具
 * fire-and-forget，不阻塞业务逻辑。
 */
import { prisma } from './prisma';

export type ScoreReason =
  | 'comment'        // 发表评论
  | 'vote_cast'      // 首次投票
  | 'comment_liked'  // 评论被点赞
  | 'iceberg_created'// 提交审核的新冰山图
  | 'iceberg_voted'  // 冰山图被投票（作者获得/扣除）
  | 'promoted'       // 晋升奖励
  | 'weekly_bonus';  // 周活跃奖励

export function logScore(
  userId: string,
  delta: number,
  reason: ScoreReason,
  note?: string,
): void {
  prisma.scoreLog.create({
    data: { userId, delta, reason, note },
  }).catch(() => {});
}
