import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { error, ErrorCodes, success } from '../../../lib/api';
import { CONTRIBUTION_DIMENSIONS } from '../../../lib/contributions';

const FIELD_BY_DIMENSION = {
  CREATION: 'creationCount',
  COLLABORATION: 'collaborationCount',
  REVIEW: 'reviewCount',
  SERVICE: 'serviceCount',
} as const;

export async function GET(event: APIContext) {
  const dimension = String(event.url.searchParams.get('dimension') || 'CREATION');
  if (!CONTRIBUTION_DIMENSIONS.includes(dimension as any)) {
    return json(error(ErrorCodes.VALIDATION_ERROR, '贡献维度无效'), 400);
  }
  const field = FIELD_BY_DIMENSION[dimension as keyof typeof FIELD_BY_DIMENSION];
  const profiles = await (prisma as any).userContributionProfile.findMany({
    where: { [field]: { gt: 0 } },
    orderBy: { [field]: 'desc' },
    take: 50,
  });
  const users = await prisma.user.findMany({
    where: {
      id: { in: profiles.map((profile: any) => profile.userId) },
      privacyShowStats: true,
    },
    select: { id: true, username: true, nickname: true, avatar: true },
  });
  const userMap = Object.fromEntries(users.map((user) => [user.id, user]));
  return json(success(profiles
    .filter((profile: any) => userMap[profile.userId])
    .map((profile: any) => ({ ...profile, user: userMap[profile.userId] }))));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
