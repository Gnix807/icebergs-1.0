import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { checkAchievements, updateDailyStreak } from '../../../../lib/achievementService';
import { normalizeIcebergTopic } from '../../../../lib/icebergTopic';
import { renderMarkdownWithMath } from '../../../../lib/markdown';
import { can } from '../../../../lib/permissions';

const OWNER_DELETABLE_STATUSES = ['DRAFT', 'REJECTED'];

async function isProjectMember(userId: string, projectId: string | null): Promise<boolean> {
  if (!projectId) return false;
  try {
    const m = await prisma.projectMember.findFirst({
      where: { projectId, userId },
    });
    return !!m;
  } catch { return false; }
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function isTrustedLegacyMutation(event: APIContext): boolean {
  const requestedWith = event.request.headers.get('x-requested-with');
  const fetchSite = event.request.headers.get('sec-fetch-site');
  return requestedWith === 'XMLHttpRequest' || fetchSite === 'same-origin';
}

async function deleteIceberg(event: APIContext, legacyGet = false): Promise<Response> {
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

    const existing = await prisma.iceberg.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { id: true, authorId: true, status: true },
    });
    if (!existing) return json(error(ErrorCodes.NOT_FOUND, '冰山图不存在'), 404);

    const canDeleteAny = can(session, 'content:delete:any');
    const isOwner = existing.authorId === session.userId;
    const canDeleteOwn = isOwner && can(session, 'content:edit:own');
    if (!canDeleteAny && !canDeleteOwn) {
      return json(error(ErrorCodes.FORBIDDEN, '无权删除该冰山图'), 403);
    }
    if (!canDeleteAny && !OWNER_DELETABLE_STATUSES.includes(existing.status)) {
      return json(error(
        ErrorCodes.CONFLICT,
        '待审核、已发布或已归档的冰山图只能由管理员删除',
      ), 409);
    }

    // Most related rows are removed by Prisma/DB cascades. These models keep
    // loose iceberg IDs, so clean or unlink them in the same transaction.
    const deleted = await prisma.$transaction(async (tx) => {
      const result = await tx.iceberg.deleteMany({
        where: canDeleteAny
          ? { id: existing.id }
          : {
              id: existing.id,
              authorId: session.userId,
              status: { in: OWNER_DELETABLE_STATUSES },
            },
      });
      if (result.count === 0) return false;

      await tx.feedback.updateMany({
        where: { icebergId: existing.id },
        data: { icebergId: null },
      });
      await tx.idea.updateMany({
        where: { icebergId: existing.id },
        data: { icebergId: null },
      });
      await tx.draft.deleteMany({ where: { icebergId: existing.id } });
      await tx.itemRead.deleteMany({ where: { icebergId: existing.id } });
      return true;
    });

    if (!deleted) {
      const latest = await prisma.iceberg.findUnique({
        where: { id: existing.id },
        select: { authorId: true, status: true },
      });
      if (!latest) return json(error(ErrorCodes.NOT_FOUND, '冰山图不存在'), 404);
      if (latest.authorId !== session.userId && !canDeleteAny) {
        return json(error(ErrorCodes.FORBIDDEN, '冰山图所有者已变更，请刷新后重试'), 403);
      }
      return json(error(ErrorCodes.CONFLICT, '冰山图状态已变化，请刷新后重试'), 409);
    }

    return json(success({ deleted: true }), 200);
  } catch (err) {
    console.error('删除冰山图失败:', err);
    return json(error(ErrorCodes.INTERNAL_ERROR, '删除失败'), 500);
  }
}

// GET /api/icebergs/:id - 获取冰山图详情
export async function GET(event: APIContext) {
  if (event.url.searchParams.get('action') === 'delete') {
    return deleteIceberg(event, true);
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

      const existing = await prisma.iceberg.findFirst({
        where: { OR: [{ id }, { slug: id }] },
      });
      if (!existing) {
        return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const canManageAny = can(session, 'content:edit:any');
      const inProject = await isProjectMember(session.userId, existing.projectId);

      const body = JSON.parse(dataParam || '{}')
      const { title, description, status, topic, updatedAt: clientUpdatedAt } = body;

      const canEditScoped = can(session, 'content:edit:own')
        && (existing.authorId === session.userId || inProject);
      if (!canManageAny && !canEditScoped) {
        return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作')), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Status transitions belong to the dedicated submit/review/override
      // endpoints. Accept an unchanged status for existing editor clients, but
      // never let this generic metadata endpoint publish or otherwise move it.
      if (status !== undefined && status !== existing.status) {
        return json(error(
          ErrorCodes.CONFLICT,
          '冰山图状态已变化，状态变更必须通过提交或审核流程完成',
        ), 409);
      }

      // 乐观锁：避免协作时多人同时编辑互相覆盖
      if (clientUpdatedAt && existing.projectId) {
        const serverTime = new Date(existing.updatedAt).getTime();
        const clientTime = new Date(clientUpdatedAt).getTime();
        if (clientTime < serverTime) {
          return new Response(JSON.stringify(error(
            ErrorCodes.CONFLICT,
            '编辑冲突：自你打开此页面后，有其他协作者保存了修改。请刷新页面后重新编辑。',
          )), {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      const updateData: { title?: string; description?: string; renderedDescription?: string | null; topic?: string } = {};
      if (title != null && title !== undefined) updateData.title = String(title).trim();
      if (description !== undefined) {
        updateData.description = description;
        updateData.renderedDescription = description ? renderMarkdownWithMath(description) : null;
      }
      if (topic !== undefined) updateData.topic = normalizeIcebergTopic(topic);

      const iceberg = await prisma.iceberg.update({
        where: { id: existing.id },
        data: updateData,
        include: {
          tiers: {
            orderBy: { order: 'asc' },
            include: { items: true },
          },
          author: {
            select: { id: true, username: true, nickname: true },
          },
        },
      });

      return new Response(JSON.stringify(success(iceberg)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('更新冰山图失败:', err);
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '更新失败: ' + msg)), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

  }

  try {
    const { id } = event.params;
    const url = new URL(event.request.url);
    const context = (url.searchParams.get('context') || '').toLowerCase();
    const fieldsMinimal = url.searchParams.get('fields') === 'minimal';
    const session = await getSession(event);

    if (!id) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 优先用 slug 查，再用 id 查
    const iceberg = await prisma.iceberg.findFirst({
      where: {
        OR: [{ id }, { slug: id }],
      },
      include: {
        tiers: {
          orderBy: { order: 'asc' },
          ...(fieldsMinimal ? {} : { include: { items: true } }),
        },
        author: {
          select: { id: true, username: true, nickname: true },
        },
        review: {
          select: { status: true, note: true, reviewedAt: true },
        },
      },
    });

    if (!iceberg) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const isOwner = !!session && iceberg.authorId === session.userId;
    const isPrivileged = !!session && (session.isFounder || session.role === 'ADMIN' || session.role === 'EDITOR');
    const inProject = !!session && await isProjectMember(session.userId, iceberg.projectId);
    const canViewUnpublished = isOwner || isPrivileged || inProject;

    if (iceberg.status !== 'PUBLISHED' && !canViewUnpublished) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 追踪 visitedIcebergCount（首次访问该图，仅公开阅读场景）
    if (session && iceberg.status === 'PUBLISHED' && context !== 'editor') {
      const alreadyRead = await prisma.itemRead.findFirst({
        where: { userId: session.userId, icebergId: iceberg.id },
      });
      if (!alreadyRead) {
        await updateDailyStreak(session.userId);
        await prisma.userStats.upsert({
          where: { userId: session.userId },
          create: { userId: session.userId, visitedIcebergCount: 1 },
          update: { visitedIcebergCount: { increment: 1 } },
        });
        checkAchievements(session.userId, {
          type: 'visit',
          currentIceberg: { id: iceberg.id, tierCount: 0, itemCount: 0 },
          isFirstVisitIceberg: true,
        });
      }
    }

    // Parse labels from JSON string to array for the editor
    const processed = {
      ...iceberg,
      review: canViewUnpublished ? iceberg.review : null,
      tiers: iceberg.tiers.map((t: any) => ({
        ...t,
        items: t.items ? t.items.map((i: any) => ({
          ...i,
          labels: (() => { try { return JSON.parse(i.labels || '[]'); } catch { return []; } })(),
        })) : [],
      })),
    };

    return new Response(JSON.stringify(success(processed)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('获取冰山图失败:', err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '获取失败')), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Standards-compliant delete endpoint. The guarded GET action above remains
// temporarily for compatibility with the production editor's WAF workaround.
export async function DELETE(event: APIContext) {
  return deleteIceberg(event);
}
