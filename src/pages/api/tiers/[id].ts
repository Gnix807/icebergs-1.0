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
      include: { iceberg: { select: { id: true, authorId: true, projectId: true } } },
    });
    if (!existing) return json(error(ErrorCodes.NOT_FOUND, '层级不存在'), 404);

    const canDeleteAny = can(session, 'content:delete:any');
    const inProject = await isProjectMember(session.userId, existing.iceberg.projectId);
    const canDeleteScoped = can(session, 'content:edit:own')
      && (existing.iceberg.authorId === session.userId || inProject);
    if (!canDeleteAny && !canDeleteScoped) {
      return json(error(ErrorCodes.FORBIDDEN, '无权删除该层级'), 403);
    }

    const baseRaw = event.url.searchParams.get('base');
    const base = baseRaw
      ? (() => { try { return JSON.parse(baseRaw) as Record<string, unknown>; } catch { return null; } })()
      : null;
    const deleted = await prisma.$transaction(async (tx) => {
      // Read the current children and enforce ownership in the same
      // transaction as the delete, closing the authorization TOCTOU window.
      const currentItems = await tx.item.findMany({
        where: { tierId: id },
        orderBy: { order: 'asc' },
        select: { id: true },
      });
      const itemIds = currentItems.map((item) => item.id);
      if (base) {
        const currentTier = await tx.tier.findUnique({ where: { id } });
        const currentIceberg = await tx.iceberg.findUnique({
          where: { id: existing.iceberg.id },
          select: { updatedAt: true },
        });
        const baseUpdatedAt = typeof base.baseUpdatedAt === 'string'
          ? new Date(base.baseUpdatedAt)
          : null;
        if (!currentTier
          || !currentIceberg
          || (base.name !== undefined && base.name !== currentTier.name)
          || (base.desc !== undefined && base.desc !== currentTier.desc)
          || !baseUpdatedAt
          || Number.isNaN(baseUpdatedAt.getTime())
          || baseUpdatedAt.getTime() !== currentIceberg.updatedAt.getTime()) {
          return { conflict: true as const };
        }
      }
      const result = await tx.tier.deleteMany({
        where: canDeleteAny
          ? { id }
          : {
              id,
              iceberg: {
                OR: [
                  { authorId: session.userId },
                  { project: { members: { some: { userId: session.userId } } } },
                ],
              },
            },
      });
      if (result.count === 0) return { deleted: false as const };
      if (itemIds.length > 0) {
        await tx.itemRead.deleteMany({ where: { itemId: { in: itemIds } } });
      }
      const revision = await tx.iceberg.update({
        where: { id: existing.iceberg.id },
        data: { updatedAt: new Date() },
        select: { updatedAt: true },
      });
      return { deleted: true as const, updatedAt: revision.updatedAt };
    }, { isolationLevel: 'Serializable' });
    if ('conflict' in deleted) {
      return json(error(
        ErrorCodes.CONFLICT,
        '该层级已被其他协作者修改，未执行删除。请载入最新版本后重试。',
      ), 409);
    }
    if (!deleted.deleted) {
      const latest = await prisma.tier.findUnique({
        where: { id },
        select: { iceberg: { select: { authorId: true } } },
      });
      if (!latest) return json(error(ErrorCodes.NOT_FOUND, '层级不存在'), 404);
      return json(error(ErrorCodes.FORBIDDEN, '权限已变化，请刷新后重试'), 403);
    }
    return json(success({ deleted: true, icebergUpdatedAt: deleted.updatedAt }), 200);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2034') {
      return json(error(
        ErrorCodes.CONFLICT,
        '删除期间检测到其他协作者的修改，未执行删除。',
      ), 409);
    }
    console.error('删除层级失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '删除失败'), 500);
  }
}

export async function PUT(event: APIContext) {
  try {
    const session = await getSession(event);
    if (!session) return json(error(ErrorCodes.UNAUTHORIZED, '请先登录'), 401);
    const { id } = event.params;
    if (!id) return json(error(ErrorCodes.BAD_REQUEST, '缺少 ID'), 400);
    const body = await event.request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json(error(ErrorCodes.BAD_REQUEST, '请求格式错误'), 400);
    }

    const existing = await prisma.tier.findUnique({
      where: { id },
      include: { iceberg: true },
    });
    if (!existing) return json(error(ErrorCodes.NOT_FOUND, '层级不存在'), 404);
    const canManageAny = can(session, 'content:edit:any');
    const inProject = await isProjectMember(session.userId, existing.iceberg.projectId);
    const canEditScoped = can(session, 'content:edit:own')
      && (existing.iceberg.authorId === session.userId || inProject);
    if (!canManageAny && !canEditScoped) {
      return json(error(ErrorCodes.FORBIDDEN, '无权操作'), 403);
    }

    const base = body.baseTier && typeof body.baseTier === 'object'
      ? body.baseTier as Record<string, unknown>
      : null;
    const updateData: { name?: string; desc?: string; order?: number } = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.desc !== undefined) updateData.desc = String(body.desc);
    if (body.order !== undefined && Number.isFinite(body.order)) updateData.order = body.order;
    if (updateData.name === '') {
      return json(error(ErrorCodes.VALIDATION_ERROR, '层级名称不能为空'), 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const where: Record<string, unknown> = { id };
      if (base) {
        if (updateData.name !== undefined && base.name !== undefined) where.name = base.name;
        if (updateData.desc !== undefined && base.desc !== undefined) where.desc = base.desc;
        if (updateData.order !== undefined && base.order !== undefined) where.order = base.order;
      }
      const claimed = await tx.tier.updateMany({ where, data: updateData });
      if (claimed.count !== 1) return null;
      const tier = await tx.tier.findUniqueOrThrow({ where: { id } });
      const revision = await tx.iceberg.update({
        where: { id: existing.icebergId },
        data: { updatedAt: new Date() },
        select: { updatedAt: true },
      });
      return { ...tier, icebergUpdatedAt: revision.updatedAt };
    });
    if (!result) {
      const current = await prisma.tier.findUnique({ where: { id } });
      return json(error(
        ErrorCodes.CONFLICT,
        '该层级的相同字段已被其他协作者修改，当前修改未覆盖对方内容。',
        { current },
      ), 409);
    }
    return json(success(result), 200);
  } catch (err) {
    console.error('更新层级失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '更新失败'), 500);
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
