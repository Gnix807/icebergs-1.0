/**
 * POST /api/admin/cron/weekly-activity-bonus
 *
 * 检查所有距上次周奖励已满 7 天的用户，若本周内行为数（评论+首次投票）≥ 阈值，
 * 发放周活跃奖励并更新 lastWeeklyBonusAt。
 *
 * 鉴权：请求头 Authorization: Bearer <CRON_SECRET>
 *
 * 建议每天凌晨调用一次（系统自动跳过未达 7 天的用户）：
 *   curl -X POST https://yourdomain.com/api/admin/cron/weekly-activity-bonus \
 *        -H "Authorization: Bearer $CRON_SECRET"
 */
import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error } from '../../../../lib/api';
import { notify } from '../../../../lib/notify';
import { logScore, QUALITY_SCORE_FROZEN } from '../../../../lib/scoreLog';

export async function ALL(event: APIContext) {
  const secret = process.env.CRON_SECRET;
  const auth = event.request.headers.get('Authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify(error('FORBIDDEN', '无效密钥')), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (QUALITY_SCORE_FROZEN) {
    return new Response(JSON.stringify(success({
      skipped: true,
      reason: 'legacy quality score is frozen',
    })), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);

  // 读取配置
  const rows = await prisma.systemSettings.findMany({
    where: { key: { in: ['activity_weekly_threshold', 'activity_weekly_bonus'] } },
  });
  const cfg: Record<string, string> = {};
  rows.forEach(r => { cfg[r.key] = r.value; });
  const threshold = parseInt(cfg['activity_weekly_threshold'] ?? '10', 10);
  const bonus     = parseInt(cfg['activity_weekly_bonus']     ?? '5',  10);

  if (bonus <= 0 || threshold <= 0) {
    return new Response(JSON.stringify(success({ skipped: true, reason: 'bonus or threshold is 0' })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 找出距上次周奖励已满 7 天（或从未获得）的用户
  const eligibleUsers = await prisma.user.findMany({
    where: {
      status: { not: 'PERM_BANNED' },
      OR: [
        { lastWeeklyBonusAt: null },
        { lastWeeklyBonusAt: { lt: weekAgo } },
      ],
    },
    select: { id: true },
  });

  const awarded: { userId: string; actions: number }[] = [];

  for (const user of eligibleUsers) {
    const [commentCount, voteCount] = await Promise.all([
      prisma.comment.count({
        where: { userId: user.id, createdAt: { gte: weekAgo } },
      }),
      // 只计 createdAt（首次投票）在本周内的，不计改票
      prisma.vote.count({
        where: { userId: user.id, createdAt: { gte: weekAgo } },
      }),
    ]);

    const total = commentCount + voteCount;
    if (total >= threshold) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          qualityScore:      { increment: bonus },
          lastWeeklyBonusAt: now,
        },
      });
      logScore(user.id, bonus, 'weekly_bonus', `本周活跃 ${total} 次`);
      notify(
        user.id,
        'weekly_bonus',
        '周活跃奖励',
        `本周活跃度达标（${total} 次），获得 ${bonus} 质量分`,
        undefined,
      );
      awarded.push({ userId: user.id, actions: total });
    }
  }

  return new Response(
    JSON.stringify(success({ awarded: awarded.length, users: awarded })),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
