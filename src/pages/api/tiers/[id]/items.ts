import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { renderMarkdownWithMath } from '../../../../lib/markdown';
import { legacyRepositoryWriteBlocked } from '../../../../lib/icebergRepository';

async function isProjectMember(userId: string, projectId: string | null): Promise<boolean> {
  if (!projectId) return false;
  try {
    const m = await prisma.projectMember.findFirst({ where: { projectId, userId } });
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

    const { title, desc, order } = body;
    if (!title || title.trim() === '') {
      return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '标题不能为空')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const labels = sanitizeLabels(body.labels);

    const tier = await prisma.tier.findUnique({ where: { id }, include: { iceberg: true } });
    if (!tier) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '层级不存在')), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (await legacyRepositoryWriteBlocked(tier.icebergId)) {
      return new Response(JSON.stringify(error(
        'VERSION_CONTROL_ENABLED' as any,
        '该冰山图已启用版本控制，请刷新编辑器。',
      )), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }

    const inProject = await isProjectMember(session.userId, tier.iceberg.projectId);
    if (tier.iceberg.authorId !== session.userId && !inProject) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作')), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    const renderedDesc = desc ? renderMarkdownWithMath(desc) : null;

    const result = await prisma.$transaction(async (tx) => {
      const maxOrderItem = await tx.item.findFirst({
        where: { tierId: id },
        orderBy: { order: 'desc' },
      });
      const appendOrder = maxOrderItem ? maxOrderItem.order + 1 : 0;
      const requestedOrder = typeof order === 'number' && Number.isFinite(order) ? order : appendOrder;
      const item = await tx.item.create({
        data: {
          title: title.trim(),
          desc: desc || '',
          renderedDesc,
          order: Math.max(requestedOrder, appendOrder),
          tierId: id,
          labels: JSON.stringify(labels),
        },
      });
      const revision = await tx.iceberg.update({
        where: { id: tier.icebergId },
        data: { updatedAt: new Date() },
        select: { updatedAt: true },
      });
      return { ...item, icebergUpdatedAt: revision.updatedAt };
    });

    return new Response(JSON.stringify(success(result)), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('创建条目失败:', err);
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
      const { title, desc, order } = body;

      if (!title || title.trim() === '') {
        return new Response(JSON.stringify(error(ErrorCodes.VALIDATION_ERROR, '标题不能为空')), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const labels = sanitizeLabels(body.labels);

      const tier = await prisma.tier.findUnique({ where: { id }, include: { iceberg: true } });
      if (!tier) {
        return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '层级不存在')), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (await legacyRepositoryWriteBlocked(tier.icebergId)) {
        return new Response(JSON.stringify(error(
          'VERSION_CONTROL_ENABLED' as any,
          '该冰山图已启用版本控制，请刷新编辑器。',
        )), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }

      const inProject = await isProjectMember(session.userId, tier.iceberg.projectId);
      if (tier.iceberg.authorId !== session.userId && !inProject) {
        return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作')), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 计算 order
      const renderedDesc = desc ? renderMarkdownWithMath(desc) : null;

      const result = await prisma.$transaction(async (tx) => {
        const maxOrderItem = await tx.item.findFirst({
          where: { tierId: id },
          orderBy: { order: 'desc' },
        });
        const appendOrder = maxOrderItem ? maxOrderItem.order + 1 : 0;
        const requestedOrder = typeof order === 'number' && Number.isFinite(order) ? order : appendOrder;
        const item = await tx.item.create({
          data: {
            title: title.trim(),
            desc: desc || '',
            renderedDesc,
            order: Math.max(requestedOrder, appendOrder),
            tierId: id,
            labels: JSON.stringify(labels),
          },
        });
        const revision = await tx.iceberg.update({
          where: { id: tier.icebergId },
          data: { updatedAt: new Date() },
          select: { updatedAt: true },
        });
        return { ...item, icebergUpdatedAt: revision.updatedAt };
      });

      return new Response(JSON.stringify(success(result)), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('创建条目失败:', err);
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

    const tier = await prisma.tier.findUnique({ where: { id } });
    if (!tier) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '层级不存在')), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const items = await prisma.item.findMany({
      where: { tierId: id },
      orderBy: { order: 'asc' },
    });

    return new Response(JSON.stringify(success(items)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('获取条目失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '操作失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
