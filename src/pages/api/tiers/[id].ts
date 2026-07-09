import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';

async function isProjectMember(userId: string, projectId: string | null): Promise<boolean> {
  if (!projectId) return false;
  try {
    const m = await prisma.projectMember.findFirst({ where: { projectId, userId } });
    return !!m;
  } catch { return false; }
}

export async function GET(event: APIContext) {
  const dataParam = event.url.searchParams.get('data');
  if (dataParam) {

    try {
      const session = await getSession(event);
      if (!session) {
        return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { id } = event.params;

      if (!id) {
        return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const existing = await prisma.tier.findUnique({ where: { id }, include: { iceberg: true } });
      if (!existing) {
        return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '层级不存在')), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const canManageAny = session.isFounder || session.role === 'ADMIN' || session.role === 'EDITOR';

      const body = JSON.parse(dataParam || '{}');
      const { name, desc, order } = body;

      const inProject = await isProjectMember(session.userId, existing.iceberg.projectId);
      if (existing.iceberg.authorId !== session.userId && !canManageAny && !inProject) {
        return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作')), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name.trim();
      if (desc !== undefined) updateData.desc = desc;
      if (order !== undefined) updateData.order = order;

      const tier = await prisma.tier.update({
        where: { id },
        data: updateData,
      });

      return new Response(JSON.stringify(success(tier)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('更新层级失败:', err);
      return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '更新失败')), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

  }

  try {
    const { id } = event.params;

    if (!id) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tier = await prisma.tier.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!tier) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '层级不存在')), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(success(tier)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[tiers] 操作失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '服务器内部错误')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

