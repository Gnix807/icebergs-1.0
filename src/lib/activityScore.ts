/**
 * 持续活跃质量分工具
 *
 * 所有分值与上限均从 system_settings 读取，可随时在后台调整。
 * 所有函数均在操作完成后调用（计数已包含当次行为），fire-and-forget。
 */
import { prisma } from './prisma';
import { logScore, QUALITY_SCORE_FROZEN } from './scoreLog';

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getIntSetting(key: string, fallback: number): Promise<number> {
  const row = await prisma.systemSettings.findUnique({ where: { key } });
  const v = parseInt(row?.value ?? '', 10);
  return isNaN(v) ? fallback : v;
}

/**
 * 发表评论后调用（评论已创建）。
 * 今日评论数（含本条）≤ daily_cap 时给投稿人加分。
 */
export async function awardCommentScore(userId: string): Promise<void> {
  if (QUALITY_SCORE_FROZEN) return;
  const [score, cap] = await Promise.all([
    getIntSetting('activity_comment_score',     1),
    getIntSetting('activity_comment_daily_cap', 5),
  ]);
  if (score <= 0 || cap <= 0) return;

  const todayCount = await prisma.comment.count({
    where: { userId, createdAt: { gte: todayStart() } },
  });
  if (todayCount <= cap) {
    prisma.user.update({
      where: { id: userId },
      data: { qualityScore: { increment: score } },
    }).catch(() => {});
    logScore(userId, score, 'comment');
  }
}

/**
 * 首次对某篇图投票后调用（vote 记录已创建）。
 * 今日新建投票数（含本次）≤ daily_cap 时给投票人加分。
 */
export async function awardNewVoteScore(userId: string): Promise<void> {
  if (QUALITY_SCORE_FROZEN) return;
  const [score, cap] = await Promise.all([
    getIntSetting('activity_vote_score',     1),
    getIntSetting('activity_vote_daily_cap', 3),
  ]);
  if (score <= 0 || cap <= 0) return;

  const todayCount = await prisma.vote.count({
    where: { userId, createdAt: { gte: todayStart() } },
  });
  if (todayCount <= cap) {
    prisma.user.update({
      where: { id: userId },
      data: { qualityScore: { increment: score } },
    }).catch(() => {});
    logScore(userId, score, 'vote_cast');
  }
}

/**
 * 评论被他人点赞时调用（给评论作者加分）。
 * 无每日上限——社区认可是质量信号。
 */
export async function awardCommentLikeScore(commentAuthorId: string): Promise<void> {
  if (QUALITY_SCORE_FROZEN) return;
  const score = await getIntSetting('activity_like_score', 1);
  if (score <= 0) return;

  prisma.user.update({
    where: { id: commentAuthorId },
    data: { qualityScore: { increment: score } },
  }).catch(() => {});
  logScore(commentAuthorId, score, 'comment_liked');
}
