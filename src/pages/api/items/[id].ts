import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../lib/api';
import { prisma } from '../../../lib/prisma';
import { getSession } from '../../../lib/auth';
import { renderMarkdownWithMath } from '../../../lib/markdown';

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
  const inProject = await isProjectMember(session.userId, existing.tier.iceberg.projectId);
  if (existing.tier.iceberg.authorId !== session.userId && !canManageAny && !inProject) {
    return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作')), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (event.request.method === 'DELETE') {
    await prisma.item.delete({ where: { id } });

    return new Response(JSON.stringify(success({ deleted: true })), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
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

  const item = await prisma.item.update({
    where: { id },
    data: updateData,
  });

  return new Response(JSON.stringify(success(item)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

