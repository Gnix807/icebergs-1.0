import type { APIContext } from 'astro';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { error, ErrorCodes, success } from '../../../lib/api';
import { hasCapability } from '../../../lib/capabilities';

export async function GET(event: APIContext) {
  const session = await getSession(event);
  if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
  if (!hasCapability(session, 'SITE_ADMINISTRATION')) {
    return json(error(ErrorCodes.CAPABILITY_REQUIRED, '需要站点管理能力'), 403);
  }
  const cursor = event.url.searchParams.get('cursor');
  const rows = await (prisma as any).capabilityAuditLog.findMany({
    where: cursor ? { createdAt: { lt: new Date(cursor) } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return json(success(rows));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
