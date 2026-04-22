import type { APIEvent } from '@astrojs/node';
import { prisma } from '../../lib/prisma';
import { success } from '../../lib/api';
import { getSession } from '../../lib/auth/index';
import { checkAchievements, updateDailyStreak } from '../../lib/achievementService';

export async function GET(event: APIEvent) {
  const q = event.url.searchParams.get('q')?.trim() || '';

  if (q.length < 2) {
    return new Response(JSON.stringify(success({ items: [] })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const items = await prisma.iceberg.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [
          { title: { contains: q } },
          { description: { contains: q } },
        ],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        _count: { select: { tiers: true } },
      },
      take: 8,
      orderBy: { viewCount: 'desc' },
    });

    // 更新搜索统计 + 检查成就（仅登录用户）
    const session = await getSession(event);
    if (session) {
      await updateDailyStreak(session.userId);
      await prisma.userStats.upsert({
        where: { userId: session.userId },
        create: { userId: session.userId, searchCount: 1 },
        update: { searchCount: { increment: 1 } },
      });
      checkAchievements(session.userId, { type: 'search' });
    }

    return new Response(JSON.stringify(success({ items })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('搜索失败:', err);
    return new Response(JSON.stringify(success({ items: [] })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
