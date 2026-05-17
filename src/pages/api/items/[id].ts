import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';

/** Allow any label up to 20 chars; strip dangerous chars; cap at 10 labels. */
function sanitizeLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((l): l is string => typeof l === 'string')
    .map(l => l.trim())
    .filter(l => l.length > 0 && l.length <= 20 && !/["\\\n\r<>{}]/.test(l))
    .slice(0, 10);
}

export async function PUT(event: APIContext) {
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

    const body = await event.request.json();
    const { title, desc, order, tierId } = body;

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

    const canManageAny = session.isFounder || session.role === 'ADMIN' || session.role === 'EDITOR';
    if (existing.tier.iceberg.authorId !== session.userId && !canManageAny) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作')), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updateData: { title?: string; desc?: string; order?: number; labels?: string; tierId?: string } = {};
    if (title !== undefined) updateData.title = title.trim();
    if (desc !== undefined) updateData.desc = desc;
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
        if (targetTier.iceberg.authorId !== session.userId && !canManageAny) {
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

    const item = await prisma.item.update({
      where: { id },
      data: updateData,
    });

    return new Response(JSON.stringify(success(item)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('更新条目失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '操作失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function DELETE(event: APIContext) {
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

    const canManageAny = session.isFounder || session.role === 'ADMIN' || session.role === 'EDITOR';
    if (existing.tier.iceberg.authorId !== session.userId && !canManageAny) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作')), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await prisma.item.delete({ where: { id } });

    return new Response(JSON.stringify(success({ deleted: true })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('删除条目失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '操作失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

