import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { can } from '../../../lib/permissions';

async function isProjectMember(userId: string, projectId: string | null): Promise<boolean> {
  if (!projectId) return false;
  try {
    const m = await prisma.projectMember.findFirst({ where: { projectId, userId } });
    return !!m;
  } catch { return false; }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function isTrustedLegacyMutation(event: APIContext): boolean {
  return event.request.headers.get('x-requested-with') === 'XMLHttpRequest'
    || event.request.headers.get('sec-fetch-site') === 'same-origin';
}

async function deleteTier(event: APIContext, legacyGet = false): Promise<Response> {
  try {
    if (legacyGet && !isTrustedLegacyMutation(event)) {
      return json(error(ErrorCodes.FORBIDDEN, '拒绝跨站删除请求'), 403);
    }

    const origin = event.request.headers.get('origin');
    if (origin && origin !== event.url.origin) {
      return json(error(ErrorCodes.FORBIDDEN, '拒绝跨站删除请求'), 403);
    }

    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);

    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少 ID'), 400);

    const existing = await prisma.tier.findUnique({
      where: { id },
      include: { iceberg: { select: { authorId: true } } },
    });
    if (!existing) return json(error(ErrorCodes.NOT_FOUND, '层级不存在'), 404);

    const canDeleteAny = can(session, 'content:delete:any');
    const isOwner = existing.iceberg.authorId === session.userId;
    const canDeleteOwn = isOwner && can(session, 'content:edit:own');
    if (!canDeleteAny && !canDeleteOwn) {
      return json(error(ErrorCodes.FORBIDDEN, '只有作者或管理员可以删除层级'), 403);
    }

    const deleted = await prisma.$transaction(async (tx) => {
      // Read the current children and enforce ownership in the same
      // transaction as the delete, closing the authorization TOCTOU window.
      const itemIds = (await tx.item.findMany({
        where: { tierId: id },
        select: { id: true },
      })).map((item) => item.id);
      const result = await tx.tier.deleteMany({
        where: canDeleteAny
          ? { id }
          : { id, iceberg: { authorId: session.userId } },
      });
      if (result.count === 0) return false;
      if (itemIds.length > 0) {
        await tx.itemRead.deleteMany({ where: { itemId: { in: itemIds } } });
      }
      return true;
    });
    if (!deleted) {
      const latest = await prisma.tier.findUnique({
        where: { id },
        select: { iceberg: { select: { authorId: true } } },
      });
      if (!latest) return json(error(ErrorCodes.NOT_FOUND, '层级不存在'), 404);
      return json(error(ErrorCodes.FORBIDDEN, '权限已变化，请刷新后重试'), 403);
    }
    return json(success({ deleted: true }), 200);
  } catch (err) {
    console.error('删除层级失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '删除失败'), 500);
  }
}

export async function GET(event: APIContext) {
  if (event.url.searchParams.get('action') === 'delete') {
    return deleteTier(event, true);
  }

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

      const canManageAny = can(session, 'content:edit:any');

      const body = JSON.parse(dataParam || '{}');
      const { name, desc, order } = body;

      const inProject = await isProjectMember(session.userId, existing.iceberg.projectId);
      const canEditScoped = can(session, 'content:edit:own')
        && (existing.iceberg.authorId === session.userId || inProject);
      if (!canManageAny && !canEditScoped) {
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

export async function DELETE(event: APIContext) {
  return deleteTier(event);
}
