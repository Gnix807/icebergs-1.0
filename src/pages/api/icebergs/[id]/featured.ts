import type { APIContext } from 'astro';
import { prisma } from '../../../../lib/prisma';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { getSession } from '../../../../lib/auth/index';

export async function ALL(event: APIContext) {
  const { id } = event.params;
  const session = await getSession(event);
  if (!session) return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (!session.isFounder && session.role !== 'ADMIN') return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权限')), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const iceberg = await prisma.iceberg.findUnique({ where: { id }, select: { featured: true } });
  if (!iceberg) return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const updated = await prisma.iceberg.update({
    where: { id },
    data: { featured: !iceberg.featured },
    select: { id: true, featured: true },
  });

  return new Response(JSON.stringify(success({ featured: updated.featured })), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
