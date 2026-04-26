/**
 * GET /api/announcements/latest
 * 返回最新一条公告的 id 与 createdAt，供导航栏未读检测使用。
 * 无公告时返回 { latestAt: null }
 */
import { prisma } from '../../../lib/prisma';
import { success } from '../../../lib/api';

const db = prisma;

export async function GET() {
  const latest = await db.announcement.findFirst({
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, createdAt: true },
  });

  return new Response(
    JSON.stringify(success({ latestAt: latest ? latest.createdAt.toISOString() : null })),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
