import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { error, ErrorCodes, success } from '../../../lib/api';
import { getContributionProfile } from '../../../lib/contributions';

export async function GET(event: APIContext) {
  const userId = event.params.userId;
  if (!userId) return json(error(ErrorCodes.BAD_REQUEST, '缺少用户 ID'), 400);
  const [viewer, user] = await Promise.all([
    getSession(event),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, privacyShowStats: true, qualityScore: true },
    }),
  ]);
  if (!user) return json(error(ErrorCodes.NOT_FOUND, '用户不存在'), 404);
  if (!user.privacyShowStats && viewer?.userId !== userId
    && !viewer?.capabilities.includes('SITE_ADMINISTRATION')) {
    return json(error(ErrorCodes.FORBIDDEN, '该用户未公开贡献统计'), 403);
  }
  const profile = await getContributionProfile(userId);
  return json(success({
    profile,
    legacyQualityScore: viewer?.userId === userId ? user.qualityScore : undefined,
  }));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
