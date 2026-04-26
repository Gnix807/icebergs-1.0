/**
 * GET /api/announcements/banner
 * 返回当前启用横幅展示的公告（最多一条），无则返回 null。
 */
import { prisma } from '../../../lib/prisma';
import { success } from '../../../lib/api';

const db = prisma;

export async function GET() {
  const ann = await db.announcement.findFirst({
    where: { banner: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, title: true, type: true, createdAt: true,
    },
  });

  return new Response(
    JSON.stringify(success({ banner: ann ?? null })),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
