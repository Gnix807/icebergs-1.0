import type { APIContext } from 'astro';
import { getSession } from '../../../../lib/auth/index';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

// POST /api/auth/achievements/ack — 清空当前用户的 pendingAchievements
export async function POST(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

  await prisma.userStats.upsert({
    where: { userId: session.userId },
    create: { userId: session.userId, pendingAchievements: '[]' },
    update: { pendingAchievements: '[]' },
  });

  return json(success({ cleared: true }));
}

