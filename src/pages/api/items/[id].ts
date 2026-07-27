import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { renderMarkdownWithMath } from '../../../lib/markdown';
import { can } from '../../../lib/permissions';

async function isProjectMember(userId: string, projectId: string | null): Promise<boolean> {
  if (!projectId) return false;
  try {
    const m = await prisma.projectMember.findFirst({
      where: { projectId, userId },
    });
    return !!m;
  } catch { return false; }
}

/** Allow any label up to 20 chars; strip dangerous chars; cap at 10 labels. */
function sanitizeLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((l): l is string => typeof l === 'string')
    .map(l => l.trim())
    .filter(l => l.length > 0 && l.length <= 20 && !/["\\\n\r<>{}]/.test(l))
    .slice(0, 10);
}

export async function ALL(event: APIContext) {
  const legacyDelete = event.url.searchParams.get('action') === 'delete';
  const isDelete = event.request.method === 'DELETE' || legacyDelete;
  if (legacyDelete) {
    const requestedWith = event.request.headers.get('x-requested-with');
    const fetchSite = event.request.headers.get('sec-fetch-site');
    if (requestedWith !== 'XMLHttpRequest' && fetchSite !== 'same-origin') {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '拒绝跨站删除请求')), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
  }
  if (isDelete) {
    const origin = event.request.headers.get('origin');
    if (origin && origin !== event.url.origin) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '拒绝跨站删除请求')), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
  }

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

  const existing = await prisma.item.findUnique({
    where: { id },
    include: { tier: { include: { iceberg: true } } },
  });
  if (!existing) {
    return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '条目不存在')), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const canManageAny = can(session, 'content:edit:any');
  const inProject = await isProjectMember(session.userId, existing.tier.iceberg.projectId);
  const canEditScoped = can(session, 'content:edit:own')
    && (existing.tier.iceberg.authorId === session.userId || inProject);
  if (!canManageAny && !canEditScoped) {
    return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作')), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isDelete) {
    const expectedUpdatedAtRaw = event.url.searchParams.get('baseUpdatedAt');
    const expectedUpdatedAt = expectedUpdatedAtRaw ? new Date(expectedUpdatedAtRaw) : null;
    const deleted = await prisma.$transaction(async (tx) => {
      const result = await tx.item.deleteMany({
        where: canManageAny
          ? {
              id,
              ...(expectedUpdatedAt && !Number.isNaN(expectedUpdatedAt.getTime())
                ? { updatedAt: expectedUpdatedAt }
                : {}),
            }
          : {
              id,
              ...(expectedUpdatedAt && !Number.isNaN(expectedUpdatedAt.getTime())
                ? { updatedAt: expectedUpdatedAt }
                : {}),
              OR: [
                { tier: { iceberg: { authorId: session.userId } } },
                {
                  tier: {
                    iceberg: {
                      project: { members: { some: { userId: session.userId } } },
                    },
                  },
                },
              ],
            },
      });
      if (result.count === 0) return null;
      await tx.itemRead.deleteMany({ where: { itemId: id } });
      const revision = await tx.iceberg.update({
        where: { id: existing.tier.iceberg.id },
        data: { updatedAt: new Date() },
        select: { updatedAt: true },
      });
      return revision.updatedAt;
    });

    if (!deleted) {
      const latest = await prisma.item.findUnique({
        where: { id },
        select: { id: true, updatedAt: true },
      });
      const responseBody = latest
        ? expectedUpdatedAt
          ? error(
              ErrorCodes.CONFLICT,
              '该词条已被其他协作者修改，未执行删除。',
              { current: latest },
            )
          : error(ErrorCodes.FORBIDDEN, '权限已变化，请刷新后重试')
        : error(ErrorCodes.NOT_FOUND, '条目不存在');
      return new Response(JSON.stringify(responseBody), {
        status: latest ? (expectedUpdatedAt ? 409 : 403) : 404,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    return new Response(JSON.stringify(success({ deleted: true, icebergUpdatedAt: deleted })), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const body = event.request.method === 'GET' ? JSON.parse(event.url.searchParams.get('data') || '{}') : await event.request.json();
  const { title, desc, order, tierId } = body;

  const updateData: { title?: string; desc?: string; renderedDesc?: string; order?: number; labels?: string; tierId?: string } = {};
  if (title !== undefined) updateData.title = title.trim();
  if (desc !== undefined) {
    updateData.desc = desc;
    updateData.renderedDesc = renderMarkdownWithMath(desc);
  }
  if (order !== undefined) updateData.order = order;
  if (tierId !== undefined) {
    if (typeof tierId !== 'string' || !tierId.trim()) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, 'tierId 无效')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (tierId !== existing.tierId) {
      const targetTier = await prisma.tier.findUnique({
        where: { id: tierId },
        include: { iceberg: true },
      });
      if (!targetTier) {
        return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '目标层级不存在')), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (targetTier.iceberg.authorId !== session.userId && !canManageAny && !inProject) {
        return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作目标层级')), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (targetTier.icebergId !== existing.tier.iceberg.id) {
        return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '暂不支持跨冰山移动词条')), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      updateData.tierId = tierId;
    }
  }
  if (body.labels !== undefined) {
    updateData.labels = JSON.stringify(sanitizeLabels(body.labels));
  }

  const expectedUpdatedAt = typeof body.baseUpdatedAt === 'string'
    ? new Date(body.baseUpdatedAt)
    : null;
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.item.updateMany({
      where: {
        id,
        ...(expectedUpdatedAt && !Number.isNaN(expectedUpdatedAt.getTime())
          ? { updatedAt: expectedUpdatedAt }
          : {}),
      },
      data: updateData,
    });
    if (claimed.count !== 1) return null;
    const item = await tx.item.findUniqueOrThrow({ where: { id } });
    const revision = await tx.iceberg.update({
      where: { id: existing.tier.iceberg.id },
      data: { updatedAt: new Date() },
      select: { updatedAt: true },
    });
    return { ...item, icebergUpdatedAt: revision.updatedAt };
  });
  if (!result) {
    const current = await prisma.item.findUnique({ where: { id } });
    return new Response(JSON.stringify(error(
      ErrorCodes.CONFLICT,
      '该词条已被其他协作者修改，当前修改未覆盖对方内容。',
      { current },
    )), {
      status: 409,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  return new Response(JSON.stringify(success(result)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
