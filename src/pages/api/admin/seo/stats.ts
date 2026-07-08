import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';

export async function GET(event: APIContext) {
  const session = await getSession(event);
  if (!session || (!session.isFounder && session.role !== 'ADMIN')) {
    return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权访问')), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const [publishedCount, totalIcebergs] = await Promise.all([
    prisma.iceberg.count({ where: { status: 'PUBLISHED' } }),
    prisma.iceberg.count(),
  ]);

  return new Response(JSON.stringify(success({ publishedCount, totalIcebergs })), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
