import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';

export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session || !session.isFounder) {
    return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '仅限创始人操作')), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const [ach, stats, user] = await Promise.all([
    prisma.userAchievement.deleteMany({ where: { userId: session.userId } }),
    prisma.userStats.upsert({
      where: { userId: session.userId },
      create: { userId: session.userId },
      update: {
        totalRead: 0, searchCount: 0, randomCount: 0,
        nightReadCount: 0, visitedIcebergCount: 0,
        consecutiveDays: 0, lastVisitDate: null,
        totalVotesCast: 0, totalSessionMinutes: 0,
        pendingAchievements: '[]',
      },
    }),
    prisma.user.update({
      where: { id: session.userId },
      data: { qualityScore: 0 },
    }),
  ]);

  return new Response(JSON.stringify(success({
    message: `已重置：${ach.count} 条成就 + 统计数据 + 质量分归零`,
    achievementsCleared: ach.count,
  })), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
