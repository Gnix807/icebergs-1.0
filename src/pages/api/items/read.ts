import type { APIEvent } from '@astrojs/node';
import { getSession } from '../../../lib/auth/index';
import { prisma } from '../../../lib/prisma';
import { checkAchievements, updateDailyStreak } from '../../../lib/achievementService';

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
  let isNew = false;
  try {
    await prisma.itemRead.create({ data: { userId, itemId, icebergId } });
    isNew = true;
  } catch {
    // 已读过，upsert 无法用 update: {} 判断新增，用 create catch 更可靠
  }

  // 2. 更新 UserStats（仅首次阅读才计数）
  if (isNew) {
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
          totalSessionMinutes: { set: sessionMinutes },
        }),
      },
    });
  }

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
  const maxTierOrder = iceberg ? iceberg._count.tiers - 1 : 0;
  const isBottomTier = tierOrder === maxTierOrder;

  // 4. 检查成就（同步，直接把结果带回给前端；skipPending 避免 NavBar 重复展示）
  const newAchievements = await checkAchievements(userId, {
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
  }, { skipPending: true });

  return new Response(JSON.stringify({ success: true, newAchievements }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
