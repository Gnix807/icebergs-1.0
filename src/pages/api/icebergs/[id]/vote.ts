import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth/index';
import { checkAchievements, updateDailyStreak } from '../../../../lib/achievementService';
import { awardNewVoteScore } from '../../../../lib/activityScore';
import { logScore } from '../../../../lib/scoreLog';
import { notifyAggregated } from '../../../../lib/notify';
import { isRateLimited } from '../../../../lib/rateLimit';

// POST /api/icebergs/:id/vote  body: { value: 1 | -1 }
// Toggle: if same value exists → delete (un-vote); else upsert
export async function ALL(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (await isRateLimited('vote', session.userId, 30)) {
      return new Response(JSON.stringify(error(ErrorCodes.RATE_LIMITED, '操作太频繁，请稍后再试')), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { id } = event.params;
    if (!id) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json().catch(() => ({}));
    const value = body.value;
    if (value !== 1 && value !== -1) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, 'value 必须为 1 或 -1')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Find iceberg (include authorId for quality score update)
    const iceberg = await prisma.iceberg.findFirst({
      where: { OR: [{ id }, { slug: id }], status: 'PUBLISHED' },
      select: { id: true, authorId: true },
    });
    if (!iceberg) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const key = { userId: session.userId, icebergId: iceberg.id };

    // Check existing vote
    const existing = await prisma.vote.findUnique({ where: { userId_icebergId: key } });

    // 计算对作者质量分的净影响
    let scoreDelta = 0;
    if (existing && existing.value === value) {
      // 取消投票：撤回之前的影响
      await prisma.vote.delete({ where: { userId_icebergId: key } });
      scoreDelta = -value; // 撤回 +1 → -1; 撤回 -1 → +1
    } else {
      // 新投票或换票
      const prevValue = existing?.value ?? 0;
      await prisma.vote.upsert({
        where: { userId_icebergId: key },
        create: { userId: session.userId, icebergId: iceberg.id, value },
        update: { value },
      });
      scoreDelta = value - prevValue; // 如换票: +1→-1 delta=-2
    }

    // 异步更新作者质量分（不阻塞响应）
    if (scoreDelta !== 0 && iceberg.authorId !== session.userId) {
      prisma.user.update({
        where: { id: iceberg.authorId },
        data: { qualityScore: { increment: scoreDelta } },
      }).catch(() => {});
      logScore(iceberg.authorId, scoreDelta, 'iceberg_voted');
      // 仅新 upvote 时通知（换票/取消/downvote 不打扰作者）
      if (!existing && value === 1) {
        notifyAggregated(
          iceberg.authorId,
          'iceberg_voted',
          `iceberg:${iceberg.id}`,
          n => n === 1 ? '有人赞了你的冰山图' : `${n} 人赞了你的冰山图`,
          `/iceberg/${iceberg.id}`,
        );
      }
    }

    // Return new score
    const agg = await prisma.vote.aggregate({
      where: { icebergId: iceberg.id },
      _sum: { value: true },
    });
    const score = agg._sum.value ?? 0;

    const userVote = existing?.value === value ? 0 : value;

    // 更新投票统计 + 检查成就（仅新投票，非取消）
    if (!(existing && existing.value === value)) {
      // 首次投票给投票人加活跃分（改票、撤票不计）
      if (!existing) awardNewVoteScore(session.userId);
      await updateDailyStreak(session.userId);
      await prisma.userStats.upsert({
        where: { userId: session.userId },
        create: { userId: session.userId, totalVotesCast: 1 },
        update: { totalVotesCast: { increment: 1 } },
      });
      checkAchievements(session.userId, { type: 'vote' });
    }

    return new Response(JSON.stringify(success({ score, userVote })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('vote POST failed:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '操作失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

