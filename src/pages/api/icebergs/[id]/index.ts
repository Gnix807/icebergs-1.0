import type { APIContext } from 'astro';
import { success, error, ErrorCodes } from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { getSession } from '../../../../lib/auth';
import { checkAchievements, updateDailyStreak } from '../../../../lib/achievementService';
import { normalizeIcebergTopic } from '../../../../lib/icebergTopic';
import { renderMarkdownWithMath } from '../../../../lib/markdown';
import { can } from '../../../../lib/permissions';

const OWNER_DELETABLE_STATUSES = ['DRAFT', 'REJECTED'];

type RestoreItem = {
  sourceId?: string;
  title: string;
  desc: string;
  order: number;
  labels: string;
};

type RestoreTier = {
  sourceId?: string;
  name: string;
  desc: string;
  order: number;
  items: RestoreItem[];
};

type RestoreSnapshot = {
  title: string;
  description: string;
  topic: string;
  tiers: RestoreTier[];
};

class RestoreConflictError extends Error {}
class StructureConflictError extends Error {}
class ImportSyncConflictError extends Error {}

type ImportSyncSummary = {
  addedTiers: number;
  updatedTiers: number;
  preservedTiers: number;
  addedItems: number;
  updatedItems: number;
  preservedItems: number;
};

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function stringIds(raw: unknown, limit = 2000): string[] | null {
  if (!Array.isArray(raw) || raw.length > limit) return null;
  const ids = raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return ids.length === raw.length && new Set(ids).size === ids.length ? ids : null;
}

function itemLayout(raw: unknown): Record<string, string[]> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const result: Record<string, string[]> = {};
  for (const [tierId, idsRaw] of Object.entries(raw as Record<string, unknown>)) {
    if (!tierId) return null;
    const ids = stringIds(idsRaw);
    if (!ids) return null;
    result[tierId] = ids;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function sanitizeLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((label): label is string => typeof label === 'string')
    .map((label) => label.trim())
    .filter((label) => label.length > 0 && label.length <= 20 && !/["\\\n\r<>{}]/.test(label))
    .slice(0, 10);
}

function parseStoredLabels(raw: string): string[] {
  try {
    return sanitizeLabels(JSON.parse(raw || '[]'));
  } catch {
    return [];
  }
}

function importMatchKey(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function mergeImportLabels(localRaw: string, remoteRaw: string): string {
  const local = parseStoredLabels(localRaw);
  const remote = parseStoredLabels(remoteRaw);
  return JSON.stringify([...new Set([...local, ...remote])].slice(0, 10));
}

function normalizeRestoreSnapshot(raw: unknown): RestoreSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const snapshot = raw as Record<string, unknown>;
  const title = typeof snapshot.title === 'string' ? snapshot.title.trim() : '';
  if (!title) return null;

  const rawTiers = Array.isArray(snapshot.tiers) ? snapshot.tiers : [];
  const tiers = rawTiers
    .filter((tier): tier is Record<string, unknown> => !!tier && typeof tier === 'object')
    .slice(0, 20)
    .map((tier, tierIndex) => {
      const rawItems = Array.isArray(tier.items) ? tier.items : [];
      const items = rawItems
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .slice(0, 500)
        .map((item, itemIndex) => {
          const itemTitle = typeof item.title === 'string' ? item.title.trim() : '';
          if (!itemTitle) return null;
          const desc = typeof item.desc === 'string' ? item.desc : '';
          const order = typeof item.order === 'number' && Number.isFinite(item.order)
            ? item.order
            : itemIndex;
          return {
            sourceId: typeof item.id === 'string' ? item.id : undefined,
            title: itemTitle.slice(0, 120),
            desc,
            order,
            labels: JSON.stringify(sanitizeLabels(item.labels)),
          };
        })
        .filter((item): item is NonNullable<typeof item> => !!item)
        .sort((a, b) => a.order - b.order)
        .map((item, order) => ({ ...item, order }));

      const name = typeof tier.name === 'string' ? tier.name.trim() : '';
      const desc = typeof tier.desc === 'string' ? tier.desc : '';
      const order = typeof tier.order === 'number' && Number.isFinite(tier.order)
        ? tier.order
        : tierIndex;
      return {
        sourceId: typeof tier.id === 'string' ? tier.id : undefined,
        name: (name || `Tier ${tierIndex + 1}`).slice(0, 80),
        desc: desc.slice(0, 240),
        order,
        items,
      };
    })
    .sort((a, b) => a.order - b.order)
    .map((tier, order) => ({ ...tier, order }));

  const description = typeof snapshot.description === 'string' ? snapshot.description : '';
  return {
    title,
    description,
    topic: normalizeIcebergTopic(snapshot.topic),
    tiers,
  };
}

function forEditor<T extends { tiers: Array<{ items: Array<{ labels: string }> }> }>(iceberg: T) {
  return {
    ...iceberg,
    tiers: iceberg.tiers.map((tier) => ({
      ...tier,
      items: tier.items.map((item) => ({
        ...item,
        labels: (() => {
          try { return JSON.parse(item.labels || '[]'); } catch { return []; }
        })(),
      })),
    })),
  };
}

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

  try {
    const { id } = event.params;
    const url = new URL(event.request.url);
    const context = (url.searchParams.get('context') || '').toLowerCase();
    const fieldsMinimal = url.searchParams.get('fields') === 'minimal';
    const fieldsCollaboration = url.searchParams.get('fields') === 'collaboration';
    const session = await getSession(event);

    if (!id) {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '缺少 ID')), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (fieldsCollaboration) {
      const collaborationState = await prisma.iceberg.findFirst({
        where: { OR: [{ id }, { slug: id }] },
        select: {
          id: true,
          status: true,
          authorId: true,
          projectId: true,
          updatedAt: true,
        },
      });
      if (!collaborationState) {
        return json(error(ErrorCodes.NOT_FOUND, '冰山图不存在'), 404);
      }
      const canView = collaborationState.status === 'PUBLISHED'
        || (!!session && (
          collaborationState.authorId === session.userId
          || session.isFounder
          || session.role === 'ADMIN'
          || session.role === 'EDITOR'
          || await isProjectMember(session.userId, collaborationState.projectId)
        ));
      if (!canView) return json(error(ErrorCodes.NOT_FOUND, '冰山图不存在'), 404);
      return json(success({
        id: collaborationState.id,
        updatedAt: collaborationState.updatedAt,
      }), 200);
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

// PUT /api/icebergs/:id - 更新冰山图元数据
export async function PUT(event: APIContext) {
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

    const existing = await prisma.iceberg.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!existing) {
      return new Response(JSON.stringify(error(ErrorCodes.NOT_FOUND, '冰山图不存在')), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const canManageAny = can(session, 'content:edit:any');
    const inProject = await isProjectMember(session.userId, existing.projectId);

    const body = await event.request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify(error(ErrorCodes.BAD_REQUEST, '请求格式错误')), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { title, description, status, topic, updatedAt: clientUpdatedAt } = body;

    const canEditScoped = can(session, 'content:edit:own')
      && (existing.authorId === session.userId || inProject);
    if (!canManageAny && !canEditScoped) {
      return new Response(JSON.stringify(error(ErrorCodes.FORBIDDEN, '无权操作')), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (status !== undefined && status !== existing.status) {
      return json(error(
        ErrorCodes.CONFLICT,
        '冰山图状态已变化，状态变更必须通过提交或审核流程完成',
      ), 409);
    }

    if (body.action === 'sync-import') {
      const imported = normalizeRestoreSnapshot(body.imported);
      const baseUpdatedAt = typeof body.baseUpdatedAt === 'string'
        ? new Date(body.baseUpdatedAt)
        : null;
      if (!imported || imported.tiers.length === 0
        || !baseUpdatedAt || Number.isNaN(baseUpdatedAt.getTime())) {
        return json(error(ErrorCodes.VALIDATION_ERROR, '同步数据无效或缺少协作版本'), 400);
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          // 先占用当前协作版本；失败时事务整体回滚，绝不会只同步一部分。
          const claimed = await tx.iceberg.updateMany({
            where: { id: existing.id, updatedAt: baseUpdatedAt },
            data: {
              title: imported.title.slice(0, 120),
              description: imported.description || existing.description,
              renderedDescription: imported.description
                ? renderMarkdownWithMath(imported.description)
                : existing.renderedDescription,
              updatedAt: new Date(),
            },
          });
          if (claimed.count !== 1) throw new ImportSyncConflictError();

          const currentTiers = await tx.tier.findMany({
            where: { icebergId: existing.id },
            orderBy: { order: 'asc' },
            include: { items: { orderBy: { order: 'asc' } } },
          });
          const unmatchedTiers = [...currentTiers];
          const summary: ImportSyncSummary = {
            addedTiers: 0,
            updatedTiers: 0,
            preservedTiers: 0,
            addedItems: 0,
            updatedItems: 0,
            preservedItems: 0,
          };

          for (let tierOrder = 0; tierOrder < imported.tiers.length; tierOrder += 1) {
            const remoteTier = imported.tiers[tierOrder];
            const tierMatchIndex = unmatchedTiers.findIndex(
              (tier) => importMatchKey(tier.name) === importMatchKey(remoteTier.name),
            );
            const matchedTier = tierMatchIndex >= 0
              ? unmatchedTiers.splice(tierMatchIndex, 1)[0]
              : null;

            let targetTierId: string;
            let currentItems: typeof currentTiers[number]['items'] = [];
            if (matchedTier) {
              targetTierId = matchedTier.id;
              currentItems = matchedTier.items;
              const nextTierDesc = remoteTier.desc || matchedTier.desc;
              if (matchedTier.name !== remoteTier.name
                || matchedTier.desc !== nextTierDesc
                || matchedTier.order !== tierOrder) {
                summary.updatedTiers += 1;
              }
              await tx.tier.update({
                where: { id: matchedTier.id },
                data: { name: remoteTier.name, desc: nextTierDesc, order: tierOrder },
              });
            } else {
              const created = await tx.tier.create({
                data: {
                  icebergId: existing.id,
                  name: remoteTier.name,
                  desc: remoteTier.desc,
                  order: tierOrder,
                },
              });
              targetTierId = created.id;
              summary.addedTiers += 1;
            }

            const unmatchedItems = [...currentItems];
            for (let itemOrder = 0; itemOrder < remoteTier.items.length; itemOrder += 1) {
              const remoteItem = remoteTier.items[itemOrder];
              const itemMatchIndex = unmatchedItems.findIndex(
                (item) => importMatchKey(item.title) === importMatchKey(remoteItem.title),
              );
              const matchedItem = itemMatchIndex >= 0
                ? unmatchedItems.splice(itemMatchIndex, 1)[0]
                : null;

              if (matchedItem) {
                const nextDesc = remoteItem.desc || matchedItem.desc;
                const nextLabels = mergeImportLabels(matchedItem.labels, remoteItem.labels);
                if (matchedItem.title !== remoteItem.title
                  || matchedItem.desc !== nextDesc
                  || matchedItem.labels !== nextLabels
                  || matchedItem.order !== itemOrder
                  || matchedItem.tierId !== targetTierId) {
                  await tx.item.update({
                    where: { id: matchedItem.id },
                    data: {
                      title: remoteItem.title,
                      desc: nextDesc,
                      renderedDesc: nextDesc ? renderMarkdownWithMath(nextDesc) : null,
                      labels: nextLabels,
                      order: itemOrder,
                      tierId: targetTierId,
                    },
                  });
                  summary.updatedItems += 1;
                }
              } else {
                await tx.item.create({
                  data: {
                    title: remoteItem.title,
                    desc: remoteItem.desc,
                    renderedDesc: remoteItem.desc ? renderMarkdownWithMath(remoteItem.desc) : null,
                    labels: remoteItem.labels,
                    order: itemOrder,
                    tierId: targetTierId,
                  },
                });
                summary.addedItems += 1;
              }
            }

            // 远端不存在的本地词条不删除，稳定追加在同步内容之后。
            for (let localIndex = 0; localIndex < unmatchedItems.length; localIndex += 1) {
              const localItem = unmatchedItems[localIndex];
              const nextOrder = remoteTier.items.length + localIndex;
              if (localItem.order !== nextOrder || localItem.tierId !== targetTierId) {
                await tx.item.update({
                  where: { id: localItem.id },
                  data: { order: nextOrder, tierId: targetTierId },
                });
              }
              summary.preservedItems += 1;
            }
          }

          // 远端不存在的本地层级也不删除，按原顺序追加到末尾。
          for (let localIndex = 0; localIndex < unmatchedTiers.length; localIndex += 1) {
            const localTier = unmatchedTiers[localIndex];
            const nextOrder = imported.tiers.length + localIndex;
            if (localTier.order !== nextOrder) {
              await tx.tier.update({ where: { id: localTier.id }, data: { order: nextOrder } });
            }
            summary.preservedTiers += 1;
            summary.preservedItems += localTier.items.length;
          }

          const synced = await tx.iceberg.findUniqueOrThrow({
            where: { id: existing.id },
            include: {
              tiers: {
                orderBy: { order: 'asc' },
                include: { items: { orderBy: { order: 'asc' } } },
              },
              author: {
                select: { id: true, username: true, nickname: true },
              },
              review: {
                select: { status: true, note: true, reviewedAt: true },
              },
            },
          });
          return { iceberg: forEditor(synced), summary };
        }, { isolationLevel: 'Serializable' });

        return json(success(result), 200);
      } catch (err) {
        if (err instanceof ImportSyncConflictError
          || (err && typeof err === 'object' && 'code' in err && err.code === 'P2034')) {
          return json(error(
            ErrorCodes.CONFLICT,
            '同步期间检测到其他协作者的新修改，远端内容尚未写入。请载入最新版本后重试。',
          ), 409);
        }
        throw err;
      }
    }

    if (body.action === 'restore-version') {
      const snapshot = normalizeRestoreSnapshot(body.snapshot);
      const baseUpdatedAt = typeof body.baseUpdatedAt === 'string'
        ? new Date(body.baseUpdatedAt)
        : null;
      if (!snapshot || !baseUpdatedAt || Number.isNaN(baseUpdatedAt.getTime())) {
        return json(error(ErrorCodes.VALIDATION_ERROR, '恢复版本数据无效'), 400);
      }

      try {
        const restored = await prisma.$transaction(async (tx) => {
          // Compare-and-swap makes the check and restore one atomic operation.
          // The target snapshot's old updatedAt is intentionally ignored.
          const claimed = await tx.iceberg.updateMany({
            where: { id: existing.id, updatedAt: baseUpdatedAt },
            data: {
              title: snapshot.title,
              description: snapshot.description,
              renderedDescription: snapshot.description
                ? renderMarkdownWithMath(snapshot.description)
                : null,
              topic: snapshot.topic,
              updatedAt: new Date(),
            },
          });
          if (claimed.count !== 1) throw new RestoreConflictError();

          const currentTiers = await tx.tier.findMany({
            where: { icebergId: existing.id },
            include: { items: true },
          });
          const currentTierById = new Map(currentTiers.map((tier) => [tier.id, tier]));
          const currentItems = currentTiers.flatMap((tier) => tier.items);
          const currentItemById = new Map(currentItems.map((item) => [item.id, item]));
          const keptTierIds = new Set<string>();
          const keptItemIds = new Set<string>();
          const restoredTierIds: string[] = [];

          for (const tier of snapshot.tiers) {
            const reusable = tier.sourceId && currentTierById.has(tier.sourceId)
              && !keptTierIds.has(tier.sourceId);
            if (reusable && tier.sourceId) {
              await tx.tier.update({
                where: { id: tier.sourceId },
                data: { name: tier.name, desc: tier.desc, order: tier.order },
              });
              keptTierIds.add(tier.sourceId);
              restoredTierIds.push(tier.sourceId);
            } else {
              const created = await tx.tier.create({
                data: {
                  icebergId: existing.id,
                  name: tier.name,
                  desc: tier.desc,
                  order: tier.order,
                },
              });
              keptTierIds.add(created.id);
              restoredTierIds.push(created.id);
            }
          }

          for (let tierIndex = 0; tierIndex < snapshot.tiers.length; tierIndex += 1) {
            const targetTierId = restoredTierIds[tierIndex];
            for (const item of snapshot.tiers[tierIndex].items) {
              const reusable = item.sourceId && currentItemById.has(item.sourceId)
                && !keptItemIds.has(item.sourceId);
              const data = {
                title: item.title,
                desc: item.desc,
                renderedDesc: item.desc ? renderMarkdownWithMath(item.desc) : null,
                order: item.order,
                tierId: targetTierId,
                labels: item.labels,
              };
              if (reusable && item.sourceId) {
                await tx.item.update({ where: { id: item.sourceId }, data });
                keptItemIds.add(item.sourceId);
              } else {
                const created = await tx.item.create({ data });
                keptItemIds.add(created.id);
              }
            }
          }

          const removedItemIds = currentItems
            .map((item) => item.id)
            .filter((itemId) => !keptItemIds.has(itemId));
          if (removedItemIds.length > 0) {
            await tx.itemRead.deleteMany({ where: { itemId: { in: removedItemIds } } });
            await tx.item.deleteMany({ where: { id: { in: removedItemIds } } });
          }

          const removedTierIds = currentTiers
            .map((tier) => tier.id)
            .filter((tierId) => !keptTierIds.has(tierId));
          if (removedTierIds.length > 0) {
            await tx.tier.deleteMany({ where: { id: { in: removedTierIds } } });
          }

          return tx.iceberg.findUniqueOrThrow({
            where: { id: existing.id },
            include: {
              tiers: {
                orderBy: { order: 'asc' },
                include: { items: { orderBy: { order: 'asc' } } },
              },
              author: {
                select: { id: true, username: true, nickname: true },
              },
              review: {
                select: { status: true, note: true, reviewedAt: true },
              },
            },
          });
        });

        return json(success(forEditor(restored)), 200);
      } catch (err) {
        if (err instanceof RestoreConflictError) {
          return json(error(
            ErrorCodes.CONFLICT,
            '检测到其他协作者的新修改，当前内容未被覆盖。请刷新页面后再恢复该版本。',
          ), 409);
        }
        throw err;
      }
    }

    if (body.action === 'reorder-structure') {
      const kind = body.kind;
      const baseUpdatedAt = typeof body.baseUpdatedAt === 'string'
        ? new Date(body.baseUpdatedAt)
        : null;
      if (!baseUpdatedAt || Number.isNaN(baseUpdatedAt.getTime())) {
        return json(error(ErrorCodes.VALIDATION_ERROR, '协作版本无效'), 400);
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          let itemVersions: Record<string, Date> | undefined;
          if (kind === 'tiers') {
            const baseIds = stringIds(body.baseOrder, 100);
            const targetIds = stringIds(body.order, 100);
            if (!baseIds || !targetIds) throw new StructureConflictError();

            const current = await tx.tier.findMany({
              where: { icebergId: existing.id },
              orderBy: { order: 'asc' },
              select: { id: true },
            });
            const currentIds = current.map((tier) => tier.id);
            if (!sameIds(currentIds, baseIds)
              || !sameIds([...targetIds].sort(), [...currentIds].sort())) {
              throw new StructureConflictError();
            }
            for (let order = 0; order < targetIds.length; order += 1) {
              await tx.tier.update({ where: { id: targetIds[order] }, data: { order } });
            }
          } else if (kind === 'items') {
            const base = itemLayout(body.baseLayout);
            const target = itemLayout(body.layout);
            if (!base || !target) throw new StructureConflictError();
            const tierIds = Object.keys(base);
            if (!sameIds([...tierIds].sort(), [...Object.keys(target)].sort())) {
              throw new StructureConflictError();
            }

            const tiers = await tx.tier.findMany({
              where: { id: { in: tierIds }, icebergId: existing.id },
              include: { items: { orderBy: { order: 'asc' }, select: { id: true } } },
            });
            if (tiers.length !== tierIds.length) throw new StructureConflictError();
            for (const tier of tiers) {
              if (!sameIds(tier.items.map((item) => item.id), base[tier.id])) {
                throw new StructureConflictError();
              }
            }

            const baseItemIds = Object.values(base).flat();
            const targetItemIds = Object.values(target).flat();
            if (new Set(baseItemIds).size !== baseItemIds.length
              || new Set(targetItemIds).size !== targetItemIds.length
              || !sameIds([...baseItemIds].sort(), [...targetItemIds].sort())) {
              throw new StructureConflictError();
            }
            for (const [tierId, ids] of Object.entries(target)) {
              for (let order = 0; order < ids.length; order += 1) {
                await tx.item.update({
                  where: { id: ids[order] },
                  data: { tierId, order },
                });
              }
            }
            const versionRows = await tx.item.findMany({
              where: { id: { in: targetItemIds } },
              select: { id: true, updatedAt: true },
            });
            itemVersions = Object.fromEntries(
              versionRows.map((item) => [item.id, item.updatedAt]),
            );
          } else {
            return null;
          }

          const revision = await tx.iceberg.update({
            where: { id: existing.id },
            data: { updatedAt: new Date() },
            select: { updatedAt: true },
          });
          return { updatedAt: revision.updatedAt, itemVersions };
        }, { isolationLevel: 'Serializable' });

        if (!result) return json(error(ErrorCodes.VALIDATION_ERROR, '排序类型无效'), 400);
        return json(success(result), 200);
      } catch (err) {
        if (err instanceof StructureConflictError
          || (err && typeof err === 'object' && 'code' in err && err.code === 'P2034')) {
          return json(error(
            ErrorCodes.CONFLICT,
            '排序期间检测到其他协作者的修改，当前排序未写入。请载入最新版本后重试。',
          ), 409);
        }
        throw err;
      }
    }

    if (body.action === 'restore-tier') {
      const normalized = normalizeRestoreSnapshot({
        title: existing.title,
        description: existing.description ?? '',
        topic: existing.topic,
        tiers: [body.tier],
      });
      const tierSnapshot = normalized?.tiers[0];
      if (!tierSnapshot) {
        return json(error(ErrorCodes.VALIDATION_ERROR, '待恢复的层级数据无效'), 400);
      }
      try {
        const restored = await prisma.$transaction(async (tx) => {
          const tierCount = await tx.tier.count({ where: { icebergId: existing.id } });
          const insertOrder = Math.max(0, Math.min(tierSnapshot.order, tierCount));
          await tx.tier.updateMany({
            where: { icebergId: existing.id, order: { gte: insertOrder } },
            data: { order: { increment: 1 } },
          });
          const tier = await tx.tier.create({
            data: {
              icebergId: existing.id,
              name: tierSnapshot.name,
              desc: tierSnapshot.desc,
              order: insertOrder,
              items: {
                create: tierSnapshot.items.map((item) => ({
                  title: item.title,
                  desc: item.desc,
                  renderedDesc: item.desc ? renderMarkdownWithMath(item.desc) : null,
                  order: item.order,
                  labels: item.labels,
                })),
              },
            },
            include: { items: { orderBy: { order: 'asc' } } },
          });
          const revision = await tx.iceberg.update({
            where: { id: existing.id },
            data: { updatedAt: new Date() },
            select: { updatedAt: true },
          });
          return {
            ...tier,
            items: tier.items.map((item) => ({
              ...item,
              labels: (() => {
                try { return JSON.parse(item.labels || '[]'); } catch { return []; }
              })(),
            })),
            icebergUpdatedAt: revision.updatedAt,
          };
        }, { isolationLevel: 'Serializable' });
        return json(success(restored), 201);
      } catch (err) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'P2034') {
          return json(error(
            ErrorCodes.CONFLICT,
            '恢复期间有协作者更新了层级顺序，请重试撤销操作。',
          ), 409);
        }
        throw err;
      }
    }

    const updateData: { title?: string; description?: string; renderedDescription?: string | null; topic?: string } = {};
    if (title != null && title !== undefined) updateData.title = String(title).trim();
    if (description !== undefined) {
      updateData.description = description;
      updateData.renderedDescription = description ? renderMarkdownWithMath(description) : null;
    }
    if (topic !== undefined) updateData.topic = normalizeIcebergTopic(topic);

    let collaborationMerged = false;
    if (clientUpdatedAt && (existing.projectId || body.baseMetadata)) {
      const serverTime = new Date(existing.updatedAt).getTime();
      const clientTime = new Date(clientUpdatedAt).getTime();
      if (clientTime < serverTime) {
        const base = body.baseMetadata && typeof body.baseMetadata === 'object'
          ? body.baseMetadata as Record<string, unknown>
          : null;
        const conflictingFields: string[] = [];
        if (!base) {
          conflictingFields.push('unknown');
        } else {
          if (updateData.title !== undefined
            && String(base.title ?? '') !== existing.title
            && updateData.title !== existing.title) conflictingFields.push('title');
          if (updateData.description !== undefined
            && String(base.description ?? '') !== String(existing.description ?? '')
            && updateData.description !== existing.description) conflictingFields.push('description');
          if (updateData.topic !== undefined
            && normalizeIcebergTopic(base.topic) !== normalizeIcebergTopic(existing.topic)
            && updateData.topic !== existing.topic) conflictingFields.push('topic');
        }
        if (conflictingFields.length > 0) {
          return json(error(
            ErrorCodes.CONFLICT,
            '其他协作者修改了相同的元数据字段，当前修改未覆盖对方内容。',
            {
              fields: conflictingFields,
              current: {
                title: existing.title,
                description: existing.description,
                topic: existing.topic,
                updatedAt: existing.updatedAt,
              },
            },
          ), 409);
        }
        collaborationMerged = true;
      }
    }

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

    return new Response(JSON.stringify(success({ ...iceberg, collaborationMerged })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('更新冰山图失败:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, '更新失败: ' + msg)), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Standards-compliant delete endpoint. The guarded GET action above remains
// temporarily for compatibility with the production editor's WAF workaround.
export async function DELETE(event: APIContext) {
  return deleteIceberg(event);
}
