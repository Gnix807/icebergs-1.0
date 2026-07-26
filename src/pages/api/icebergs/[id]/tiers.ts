import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { can } from '../../../../lib/permissions';

async function isProjectMember(userId: string, projectId: string | null): Promise<boolean> {
  if (!projectId) return false;
  try {
    const m = await prisma.projectMember.findFirst({
      where: { projectId, userId },
    });
    return !!m;
  } catch { return false; }
}

export async function POST(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) {
      return new Response(JSON.stringify(error(ErrorCodes.UNAUTHORIZED, '请先登录')), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { id } = event.params;
    if (!id) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await event.request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { name, order, desc } = body;
    if (!name || name.trim() === '') {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '层级名称不能为空')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const iceberg = await prisma.iceberg.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!iceberg) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const canManageAny = can(session, 'content:edit:any');
    const inProject = await isProjectMember(session.userId, iceberg.projectId);
    const canEditScoped = can(session, 'content:edit:own')
      && (iceberg.authorId === session.userId || inProject);
    if (!canManageAny && !canEditScoped) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作')), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    const maxOrderTier = await prisma.tier.findFirst({
      where: { icebergId: iceberg.id },
      orderBy: { order: 'desc' },
    });
    const newOrder = order !== undefined ? order : (maxOrderTier ? maxOrderTier.order + 1 : 0);

    const tier = await prisma.tier.create({
      data: {
        name: name.trim(),
        desc: typeof desc === 'string' ? desc : '',
        order: newOrder,
        icebergId: iceberg.id,
      },
    });

    return new Response(JSON.stringify(success(tier)), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('创建层级失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '操作失败')), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
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

      const body = JSON.parse(dataParam || '{}');
      const { name, order, desc } = body;

      if (!name || name.trim() === '') {
        return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '层级名称不能为空')), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 检查冰山图是否存在
      const iceberg = await prisma.iceberg.findFirst({
        where: { OR: [{ id }, { slug: id }] },
      });
      if (!iceberg) {
        return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const canManageAny = can(session, 'content:edit:any');
      const inProject = await isProjectMember(session.userId, iceberg.projectId);
      const canEditScoped = can(session, 'content:edit:own')
        && (iceberg.authorId === session.userId || inProject);
      if (!canManageAny && !canEditScoped) {
        return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作')), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const maxOrderTier = await prisma.tier.findFirst({
        where: { icebergId: iceberg.id },
        orderBy: { order: 'desc' },
      });

      const newOrder = order !== undefined ? order : (maxOrderTier ? maxOrderTier.order + 1 : 0);

      const tier = await prisma.tier.create({
        data: {
          name: name.trim(),
          desc: typeof desc === 'string' ? desc : '',
          order: newOrder,
          icebergId: iceberg.id,
        },
      });

      return new Response(JSON.stringify(success(tier)), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('创建层级失败:', err);
      return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '操作失败')), {
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

    const tiers = await prisma.tier.findMany({
      where: { icebergId: id },
      orderBy: { order: 'asc' },
    });

    return new Response(JSON.stringify(success(tiers)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('获取层级失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '操作失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
