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

  const result = await prisma.userAchievement.deleteMany({});

  return new Response(JSON.stringify(success({
    message: `已清空 ${result.count} 条成就记录`,
    count: result.count,
  })), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
