/**
 * GET  /api/admin/reports          EDITOR/ADMIN — list reports
 * Query: ?status=PENDING&type=iceberg&page=1
 */
import type { APIEvent } from '@astrojs/node';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { can } from '../../../../lib/permissions';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(event: APIEvent) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    if (!can(session, 'report:handle')) return json(error(ErrorCodes.FORBIDDEN, '需要编辑权限'), 403);

    const url = new URL(event.request.url);
    const status = url.searchParams.get('status') ?? 'PENDING';
    const type   = url.searchParams.get('type') ?? undefined;
    const page   = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const take   = 20;

    const where: Record<string, unknown> = { status };
    if (type) where.type = type;

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * take,
        take,
        include: {
          filer: { select: { id: true, username: true, nickname: true } },
          handler: { select: { id: true, username: true, nickname: true } },
        },
      }),
      prisma.report.count({ where }),
    ]);

    return json(success({ reports, total, page, pages: Math.ceil(total / take) }));
  } catch (err) {
    console.error('获取举报列表失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '获取失败'), 500);
  }
}
