import type { APIContext } from 'astro';
import { getSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { USERBOX_LIBRARY, USERBOX_BASE_SLOTS, USERBOX_MAX_SLOTS } from '../../../../lib/awards';

const ALL_BOXES = USERBOX_LIBRARY.flatMap(c => c.boxes);
const ALL_BOX_IDS = new Set(ALL_BOXES.map(b => b.id));
/** 需要特定成就才能使用的 id → 所需成就 id */
const REQUIRES_MAP = new Map(
  ALL_BOXES.filter(b => b.requires).map(b => [b.id, b.requires!])
);

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function ALL(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  if (session.userId !== event.params.id) return json(error(ErrorCodes.FORBIDDEN, '无权限'), 403);

  let body: { ids?: unknown };
  try { body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json(); } catch { return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400); }

  if (!Array.isArray(body.ids)) return json(error(ErrorCodes.BAD_REQUEST, 'ids 必须是数组'), 400);

  // 获取用户信息（isFounder）及社区成就
  const [userRow, achievements] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { isFounder: true } }),
    prisma.userAchievement.findMany({ where: { userId: session.userId }, select: { achievementId: true } }),
  ]);
  const isFounder   = userRow?.isFounder ?? false;
  const unlockedIds = new Set(achievements.map(a => a.achievementId));

  let ids: string[];
  if (isFounder) {
    // 站长：仅过滤不存在的 id，不限槽位和成就
    ids = (body.ids as unknown[]).filter((x): x is string => typeof x === 'string' && ALL_BOX_IDS.has(x));
  } else {
    // 普通用户：按槽位 + 成就门槛过滤
    const COMMUNITY_IDS = new Set(['pioneer', 'prolific', 'popular', 'analyst', 'veteran', 'scholar']);
    const communityCount = [...unlockedIds].filter(id => COMMUNITY_IDS.has(id)).length;
    const maxSlots = Math.min(USERBOX_BASE_SLOTS + communityCount, USERBOX_MAX_SLOTS);
    ids = (body.ids as unknown[])
      .filter((x): x is string => {
        if (typeof x !== 'string' || !ALL_BOX_IDS.has(x)) return false;
        const required = REQUIRES_MAP.get(x);
        return !required || unlockedIds.has(required);
      })
      .slice(0, maxSlots);
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { userboxIds: JSON.stringify(ids) },
  });

  return json(success({ ids }), 200);
}

