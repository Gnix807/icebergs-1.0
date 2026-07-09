import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { renderMarkdownWithMath } from '../../../../lib/markdown';

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

      const canManageAny = session.isFounder || session.role === 'ADMIN' || session.role === 'EDITOR';
      const inProject = await isProjectMember(session.userId, tier.iceberg.projectId);
      if (tier.iceberg.authorId !== session.userId && !canManageAny && !inProject) {
        return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作')), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 计算 order
      let itemOrder = order;
      if (itemOrder === undefined) {
        const maxOrderItem = await prisma.item.findFirst({
          where: { tierId: id },
          orderBy: { order: 'desc' },
        });
        itemOrder = maxOrderItem ? maxOrderItem.order + 1 : 0;
      }

      const renderedDesc = desc ? renderMarkdownWithMath(desc) : null;

      const item = await prisma.item.create({
        data: {
          title: title.trim(),
          desc: desc || '',
          renderedDesc,
          order: itemOrder,
          tierId: id,
          labels: JSON.stringify(labels),
        },
      });

      return new Response(JSON.stringify(success(item)), {
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

