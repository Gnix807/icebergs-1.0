import { createHash, randomUUID } from 'node:crypto';
import { prisma } from './prisma';
import { accountMayAct } from './capabilities';
import { renderMarkdownWithMath } from './markdown';
import { normalizeIcebergTopic } from './icebergTopic';

export const SNAPSHOT_SCHEMA_VERSION = 1;
export const DEFAULT_BRANCH_NAME = 'main';

export type RepositoryRole = 'MAINTAINER' | 'CONTRIBUTOR' | 'PROPOSER' | 'VIEWER' | 'NONE';
export type CommitSource = 'INITIAL' | 'MANUAL' | 'MERGE' | 'REVERT' | 'IMPORT';

export interface SnapshotItemV1 {
  id: string;
  title: string;
  desc: string;
  labels: string[];
  order: number;
  tierId: string;
}

export interface SnapshotTierV1 {
  id: string;
  name: string;
  desc: string;
  order: number;
  items: SnapshotItemV1[];
}

export interface SnapshotV1 {
  schemaVersion: 1;
  metadata: {
    title: string;
    description: string;
    topic: string;
  };
  tiers: SnapshotTierV1[];
}

export interface StructuredChange {
  path: string;
  kind: 'metadata' | 'tier' | 'item';
  change: 'added' | 'deleted' | 'modified' | 'moved';
  entityId?: string;
  field?: string;
  before?: unknown;
  after?: unknown;
}

export interface MergeConflict {
  path: string;
  kind: 'metadata' | 'tier' | 'item';
  entityId?: string;
  field: string;
  base: unknown;
  ours: unknown;
  theirs: unknown;
}

export interface MergeResult {
  snapshot: SnapshotV1;
  conflicts: MergeConflict[];
}

export interface MergeResolution {
  path: string;
  field: string;
  choice: 'ours' | 'theirs';
}

type Db = any;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function stableId(value: unknown, prefix: string): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (candidate && candidate.length <= 160 && /^[A-Za-z0-9_.:-]+$/.test(candidate)) {
    return candidate;
  }
  return `${prefix}_${randomUUID()}`;
}

function labels(value: unknown): string[] {
  if (typeof value === 'string') {
    try { return labels(JSON.parse(value)); } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 48))
    .filter(Boolean))].slice(0, 24);
}

export function normalizeSnapshot(raw: unknown): SnapshotV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, any>;
  const metadataSource = source.metadata && typeof source.metadata === 'object'
    ? source.metadata as Record<string, unknown>
    : source;
  const title = text(metadataSource.title, 120);
  if (!title) return null;
  if (!Array.isArray(source.tiers) || source.tiers.length > 100) return null;

  const seenTierIds = new Set<string>();
  const seenItemIds = new Set<string>();
  const tiers: SnapshotTierV1[] = [];
  for (let tierIndex = 0; tierIndex < source.tiers.length; tierIndex += 1) {
    const tierRaw = source.tiers[tierIndex];
    if (!tierRaw || typeof tierRaw !== 'object' || Array.isArray(tierRaw)) return null;
    let tierId = stableId(tierRaw.id ?? tierRaw.sourceId, 'tier');
    while (seenTierIds.has(tierId)) tierId = `tier_${randomUUID()}`;
    seenTierIds.add(tierId);
    const itemRows = Array.isArray(tierRaw.items) ? tierRaw.items : [];
    if (itemRows.length > 2000) return null;
    const items: SnapshotItemV1[] = [];
    for (let itemIndex = 0; itemIndex < itemRows.length; itemIndex += 1) {
      const itemRaw = itemRows[itemIndex];
      if (!itemRaw || typeof itemRaw !== 'object' || Array.isArray(itemRaw)) return null;
      let itemId = stableId(itemRaw.id ?? itemRaw.sourceId, 'item');
      while (seenItemIds.has(itemId)) itemId = `item_${randomUUID()}`;
      seenItemIds.add(itemId);
      const itemTitle = text(itemRaw.title, 240);
      if (!itemTitle) return null;
      items.push({
        id: itemId,
        title: itemTitle,
        desc: typeof itemRaw.desc === 'string' ? itemRaw.desc.slice(0, 200_000) : '',
        labels: labels(itemRaw.labels),
        order: itemIndex,
        tierId,
      });
    }
    tiers.push({
      id: tierId,
      name: text(tierRaw.name ?? tierRaw.title, 120) || `层级 ${tierIndex + 1}`,
      desc: typeof tierRaw.desc === 'string' ? tierRaw.desc.slice(0, 20_000) : '',
      order: tierIndex,
      items,
    });
  }

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    metadata: {
      title,
      description: typeof metadataSource.description === 'string'
        ? metadataSource.description.slice(0, 200_000)
        : '',
      topic: normalizeIcebergTopic(metadataSource.topic),
    },
    tiers,
  };
}

export function snapshotFromIceberg(iceberg: any): SnapshotV1 {
  return normalizeSnapshot({
    metadata: {
      title: iceberg.title,
      description: iceberg.description ?? '',
      topic: iceberg.topic,
    },
    tiers: (iceberg.tiers ?? []).map((tier: any) => ({
      id: tier.id,
      name: tier.name,
      desc: tier.desc ?? '',
      items: (tier.items ?? []).map((item: any) => ({
        id: item.id,
        title: item.title,
        desc: item.desc ?? '',
        labels: item.labels,
      })),
    })),
  })!;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashSnapshot(snapshot: SnapshotV1): string {
  return createHash('sha256').update(canonical(snapshot)).digest('hex');
}

function hashCommit(input: {
  treeHash: string;
  firstParentId?: string | null;
  secondParentId?: string | null;
  authorId: string;
  message: string;
  createdAt: string;
}): string {
  return createHash('sha256').update(canonical(input)).digest('hex');
}

function same(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function changeFields(
  changes: StructuredChange[],
  kind: StructuredChange['kind'],
  path: string,
  entityId: string | undefined,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
) {
  for (const field of fields) {
    if (!same(before[field], after[field])) {
      changes.push({
        path: `${path}.${field}`,
        kind,
        change: field === 'order' || field === 'tierId' ? 'moved' : 'modified',
        entityId,
        field,
        before: before[field],
        after: after[field],
      });
    }
  }
}

export function diffSnapshots(base: SnapshotV1, head: SnapshotV1): StructuredChange[] {
  const changes: StructuredChange[] = [];
  changeFields(changes, 'metadata', 'metadata', undefined, base.metadata, head.metadata, [
    'title', 'description', 'topic',
  ]);
  const baseTiers = new Map(base.tiers.map((tier) => [tier.id, tier]));
  const headTiers = new Map(head.tiers.map((tier) => [tier.id, tier]));
  const tierIds = new Set([...baseTiers.keys(), ...headTiers.keys()]);
  for (const id of tierIds) {
    const before = baseTiers.get(id);
    const after = headTiers.get(id);
    if (!before && after) {
      changes.push({ path: `tiers.${id}`, kind: 'tier', change: 'added', entityId: id, after });
    } else if (before && !after) {
      changes.push({ path: `tiers.${id}`, kind: 'tier', change: 'deleted', entityId: id, before });
    } else if (before && after) {
      changeFields(changes, 'tier', `tiers.${id}`, id, before as any, after as any, [
        'name', 'desc', 'order',
      ]);
    }
  }
  const flatten = (snapshot: SnapshotV1) => new Map(
    snapshot.tiers.flatMap((tier) => tier.items).map((item) => [item.id, item]),
  );
  const baseItems = flatten(base);
  const headItems = flatten(head);
  const itemIds = new Set([...baseItems.keys(), ...headItems.keys()]);
  for (const id of itemIds) {
    const before = baseItems.get(id);
    const after = headItems.get(id);
    if (!before && after) {
      changes.push({ path: `items.${id}`, kind: 'item', change: 'added', entityId: id, after });
    } else if (before && !after) {
      changes.push({ path: `items.${id}`, kind: 'item', change: 'deleted', entityId: id, before });
    } else if (before && after) {
      changeFields(changes, 'item', `items.${id}`, id, before as any, after as any, [
        'title', 'desc', 'labels', 'tierId', 'order',
      ]);
    }
  }
  return changes;
}

function mergeValue(
  conflicts: MergeConflict[],
  context: Omit<MergeConflict, 'field' | 'base' | 'ours' | 'theirs'>,
  field: string,
  base: unknown,
  ours: unknown,
  theirs: unknown,
): unknown {
  if (same(ours, theirs)) return ours;
  if (same(base, ours)) return theirs;
  if (same(base, theirs)) return ours;
  conflicts.push({ ...context, field, base, ours, theirs });
  return ours;
}

function mergeEntity(
  conflicts: MergeConflict[],
  kind: 'tier' | 'item',
  id: string,
  base: Record<string, any> | undefined,
  ours: Record<string, any> | undefined,
  theirs: Record<string, any> | undefined,
  fields: string[],
): Record<string, any> | undefined {
  const context = { path: `${kind === 'tier' ? 'tiers' : 'items'}.${id}`, kind, entityId: id };
  if (!base) {
    if (!ours) return theirs;
    if (!theirs) return ours;
    if (same(ours, theirs)) return ours;
    conflicts.push({ ...context, field: '$entity', base: null, ours, theirs });
    return ours;
  }
  if (!ours && !theirs) return undefined;
  if (!ours) {
    if (same(base, theirs)) return undefined;
    conflicts.push({ ...context, field: '$deleted', base, ours: null, theirs });
    return theirs;
  }
  if (!theirs) {
    if (same(base, ours)) return undefined;
    conflicts.push({ ...context, field: '$deleted', base, ours, theirs: null });
    return ours;
  }
  const merged: Record<string, any> = { id };
  for (const field of fields) {
    merged[field] = mergeValue(conflicts, context, field, base[field], ours[field], theirs[field]);
  }
  return merged;
}

export function mergeSnapshots(base: SnapshotV1, ours: SnapshotV1, theirs: SnapshotV1): MergeResult {
  const conflicts: MergeConflict[] = [];
  const metadata = {
    title: String(mergeValue(conflicts, { path: 'metadata', kind: 'metadata' }, 'title',
      base.metadata.title, ours.metadata.title, theirs.metadata.title)),
    description: String(mergeValue(conflicts, { path: 'metadata', kind: 'metadata' }, 'description',
      base.metadata.description, ours.metadata.description, theirs.metadata.description)),
    topic: String(mergeValue(conflicts, { path: 'metadata', kind: 'metadata' }, 'topic',
      base.metadata.topic, ours.metadata.topic, theirs.metadata.topic)),
  };
  const tierMaps = [base, ours, theirs].map((snapshot) =>
    new Map(snapshot.tiers.map((tier) => [tier.id, tier as Record<string, any>])),
  );
  const tierIds = new Set([...tierMaps[0].keys(), ...tierMaps[1].keys(), ...tierMaps[2].keys()]);
  const mergedTiers = new Map<string, SnapshotTierV1>();
  for (const id of tierIds) {
    const row = mergeEntity(conflicts, 'tier', id, tierMaps[0].get(id), tierMaps[1].get(id),
      tierMaps[2].get(id), ['name', 'desc', 'order']);
    if (row) {
      mergedTiers.set(id, {
        id,
        name: String(row.name ?? ''),
        desc: String(row.desc ?? ''),
        order: Number(row.order) || 0,
        items: [],
      });
    }
  }
  const itemMaps = [base, ours, theirs].map((snapshot) =>
    new Map(snapshot.tiers.flatMap((tier) => tier.items)
      .map((item) => [item.id, item as Record<string, any>])),
  );
  const itemIds = new Set([...itemMaps[0].keys(), ...itemMaps[1].keys(), ...itemMaps[2].keys()]);
  for (const id of itemIds) {
    const row = mergeEntity(conflicts, 'item', id, itemMaps[0].get(id), itemMaps[1].get(id),
      itemMaps[2].get(id), ['title', 'desc', 'labels', 'order', 'tierId']);
    if (!row) continue;
    const tier = mergedTiers.get(row.tierId);
    if (!tier) {
      conflicts.push({
        path: `items.${id}`,
        kind: 'item',
        entityId: id,
        field: 'tierId',
        base: itemMaps[0].get(id)?.tierId,
        ours: itemMaps[1].get(id)?.tierId,
        theirs: itemMaps[2].get(id)?.tierId,
      });
      continue;
    }
    tier.items.push(row as SnapshotItemV1);
  }
  const tiers = [...mergedTiers.values()]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((tier, tierIndex) => ({
      ...tier,
      order: tierIndex,
      items: tier.items.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((item, itemIndex) => ({ ...item, order: itemIndex, tierId: tier.id })),
    }));
  return {
    snapshot: { schemaVersion: 1, metadata, tiers },
    conflicts,
  };
}

export function applyMergeResolutions(
  preview: SnapshotV1,
  conflicts: MergeConflict[],
  resolutions: MergeResolution[],
): SnapshotV1 | null {
  const selected = new Map(resolutions.map((resolution) => [
    `${resolution.path}:${resolution.field}`,
    resolution.choice,
  ]));
  if (conflicts.some((conflict) => !selected.has(`${conflict.path}:${conflict.field}`))) return null;
  const resolved = JSON.parse(JSON.stringify(preview)) as SnapshotV1;

  const removeItem = (itemId: string) => {
    for (const tier of resolved.tiers) {
      tier.items = tier.items.filter((item) => item.id !== itemId);
    }
  };
  const upsertTier = (tierId: string, value: any) => {
    let tier = resolved.tiers.find((candidate) => candidate.id === tierId);
    if (!tier) {
      tier = {
        id: tierId,
        name: String(value?.name ?? ''),
        desc: String(value?.desc ?? ''),
        order: Number(value?.order) || resolved.tiers.length,
        items: [],
      };
      resolved.tiers.push(tier);
    } else {
      tier.name = String(value?.name ?? tier.name);
      tier.desc = String(value?.desc ?? tier.desc);
      tier.order = Number.isFinite(Number(value?.order)) ? Number(value.order) : tier.order;
    }
    return tier;
  };
  const upsertItem = (itemId: string, value: any) => {
    removeItem(itemId);
    const tier = resolved.tiers.find((candidate) => candidate.id === value?.tierId);
    if (!tier) return;
    tier.items.push({
      id: itemId,
      title: String(value?.title ?? ''),
      desc: String(value?.desc ?? ''),
      labels: Array.isArray(value?.labels) ? value.labels.map(String) : [],
      order: Number(value?.order) || tier.items.length,
      tierId: tier.id,
    });
  };

  for (const conflict of conflicts) {
    const choice = selected.get(`${conflict.path}:${conflict.field}`)!;
    const value = choice === 'ours' ? conflict.ours : conflict.theirs;
    if (conflict.kind === 'metadata') {
      (resolved.metadata as any)[conflict.field] = value;
      continue;
    }
    if (conflict.kind === 'tier' && conflict.entityId) {
      if (conflict.field === '$deleted' || conflict.field === '$entity') {
        if (value == null) {
          resolved.tiers = resolved.tiers.filter((tier) => tier.id !== conflict.entityId);
        } else {
          upsertTier(conflict.entityId, value);
        }
      } else {
        const tier = upsertTier(conflict.entityId, value);
        (tier as any)[conflict.field] = value;
      }
      continue;
    }
    if (conflict.kind === 'item' && conflict.entityId) {
      if (conflict.field === '$deleted' || conflict.field === '$entity') {
        if (value == null) removeItem(conflict.entityId);
        else upsertItem(conflict.entityId, value);
      } else {
        let owner = resolved.tiers.find((tier) =>
          tier.items.some((item) => item.id === conflict.entityId));
        const item = owner?.items.find((candidate) => candidate.id === conflict.entityId);
        if (!item) {
          if (value && typeof value === 'object') upsertItem(conflict.entityId, value);
          continue;
        }
        if (conflict.field === 'tierId') {
          const moved = { ...item, tierId: String(value) };
          removeItem(item.id);
          owner = resolved.tiers.find((tier) => tier.id === moved.tierId);
          owner?.items.push(moved);
        } else {
          (item as any)[conflict.field] = value;
        }
      }
    }
  }
  return normalizeSnapshot(resolved);
}

export async function isRepositoryFeatureEnabled(): Promise<boolean> {
  const env = process.env.GIT_COLLABORATION_ENABLED;
  if (env === 'true') return true;
  if (env === 'false') return false;
  if (process.env.NODE_ENV !== 'production') return true;
  try {
    const row = await prisma.systemSettings.findUnique({
      where: { key: 'feature_git_collaboration' },
      select: { value: true },
    });
    return row?.value === 'true';
  } catch {
    return false;
  }
}

export async function legacyRepositoryWriteBlocked(icebergId: string): Promise<boolean> {
  if (!await isRepositoryFeatureEnabled()) return false;
  const row = await prisma.iceberg.findUnique({
    where: { id: icebergId },
    select: { repositoryInitializedAt: true },
  });
  return !!row?.repositoryInitializedAt;
}

export async function getRepositoryRole(session: any, iceberg: any): Promise<RepositoryRole> {
  if (!session) return iceberg.status === 'PUBLISHED' ? 'VIEWER' : 'NONE';
  if (iceberg.authorId === session.userId) return 'MAINTAINER';
  const db = prisma as any;
  const collaborator = await db.icebergCollaborator.findFirst({
    where: { icebergId: iceberg.id, userId: session.userId },
    select: { role: true, status: true },
  }).catch(() => null);
  if (collaborator?.status === 'BLOCKED') {
    return iceberg.status === 'PUBLISHED' ? 'VIEWER' : 'NONE';
  }
  if (collaborator?.status === 'ACTIVE' && collaborator.role === 'MAINTAINER') return 'MAINTAINER';
  if (collaborator?.status === 'ACTIVE') return 'CONTRIBUTOR';
  if (iceberg.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: iceberg.projectId },
      select: {
        creatorId: true,
        members: {
          where: { userId: session.userId },
          select: { role: true },
          take: 1,
        },
      },
    });
    if (project?.creatorId === session.userId) return 'MAINTAINER';
    const member = project?.members[0];
    if (member?.role === 'MODERATOR') return 'MAINTAINER';
    if (member) return 'CONTRIBUTOR';
  }
  const contributionMode = iceberg.contributionMode ?? 'DEFAULT';
  const proposalsOpen = contributionMode === 'OPEN'
    || (contributionMode === 'DEFAULT' && !iceberg.projectId);
  if (iceberg.status === 'PUBLISHED' && proposalsOpen && accountMayAct(session.status)) {
    return 'PROPOSER';
  }
  return iceberg.status === 'PUBLISHED' ? 'VIEWER' : 'NONE';
}

async function storeTree(db: Db, snapshot: SnapshotV1) {
  const hash = hashSnapshot(snapshot);
  const serialized = canonical(snapshot);
  const existing = await db.icebergTree.findUnique({ where: { hash } });
  if (existing) return existing;
  return db.icebergTree.create({
    data: {
      hash,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      snapshot,
      byteSize: Buffer.byteLength(serialized, 'utf8'),
    },
  });
}

async function storeCommit(db: Db, input: {
  icebergId: string;
  tree: any;
  firstParentId?: string | null;
  secondParentId?: string | null;
  authorId: string;
  message: string;
  source: CommitSource;
}) {
  const createdAt = new Date();
  const hash = hashCommit({
    treeHash: input.tree.hash,
    firstParentId: input.firstParentId,
    secondParentId: input.secondParentId,
    authorId: input.authorId,
    message: input.message,
    createdAt: createdAt.toISOString(),
  });
  return db.icebergCommit.create({
    data: {
      icebergId: input.icebergId,
      treeId: input.tree.id,
      hash,
      firstParentId: input.firstParentId ?? null,
      secondParentId: input.secondParentId ?? null,
      authorId: input.authorId,
      message: input.message.slice(0, 240),
      source: input.source,
      createdAt,
    },
  });
}

export async function getSnapshotForCommit(commitId: string, db: Db = prisma as any): Promise<SnapshotV1> {
  const commit = await db.icebergCommit.findUnique({ where: { id: commitId } });
  if (!commit) throw new Error('COMMIT_NOT_FOUND');
  const tree = await db.icebergTree.findUnique({ where: { id: commit.treeId } });
  const snapshot = normalizeSnapshot(tree?.snapshot);
  if (!snapshot) throw new Error('TREE_INVALID');
  return snapshot;
}

export async function ensureRepository(icebergId: string, actorId?: string) {
  const db = prisma as any;
  const existing = await db.icebergBranch.findFirst({
    where: { icebergId, normalizedName: DEFAULT_BRANCH_NAME, archivedAt: null },
  });
  if (existing) return existing;

  try {
    return await prisma.$transaction(async (rawTx) => {
      const tx = rawTx as any;
      const raced = await tx.icebergBranch.findFirst({
        where: { icebergId, normalizedName: DEFAULT_BRANCH_NAME, archivedAt: null },
      });
      if (raced) return raced;
      const iceberg = await tx.iceberg.findUnique({
        where: { id: icebergId },
        include: { tiers: { orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' } } } } },
      });
      if (!iceberg) throw new Error('ICEBERG_NOT_FOUND');
      const snapshot = snapshotFromIceberg(iceberg);
      const tree = await storeTree(tx, snapshot);
      const commit = await storeCommit(tx, {
        icebergId,
        tree,
        authorId: actorId || iceberg.authorId,
        message: '初始化版本库',
        source: 'INITIAL',
      });
      const branch = await tx.icebergBranch.create({
        data: {
          icebergId,
          name: DEFAULT_BRANCH_NAME,
          normalizedName: DEFAULT_BRANCH_NAME,
          title: '主版本',
          headCommitId: commit.id,
          createdById: actorId || iceberg.authorId,
          protected: true,
        },
      });
      await tx.iceberg.update({
        where: { id: icebergId },
        data: { repositoryInitializedAt: new Date() },
      });
      if (iceberg.status === 'PUBLISHED') {
        await tx.icebergPublication.upsert({
          where: { icebergId },
          create: {
            icebergId,
            commitId: commit.id,
            title: snapshot.metadata.title,
            description: snapshot.metadata.description,
            renderedDescription: snapshot.metadata.description
              ? renderMarkdownWithMath(snapshot.metadata.description) : null,
            topic: snapshot.metadata.topic,
            snapshot,
            searchText: snapshotSearchText(snapshot),
          },
          update: {},
        });
      }
      return branch;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    const raced = await db.icebergBranch.findFirst({
      where: { icebergId, normalizedName: DEFAULT_BRANCH_NAME, archivedAt: null },
    });
    if (raced) return raced;
    throw error;
  }
}

export function snapshotSearchText(snapshot: SnapshotV1): string {
  return [
    snapshot.metadata.title,
    snapshot.metadata.description,
    snapshot.metadata.topic,
    ...snapshot.tiers.flatMap((tier) => [
      tier.name,
      tier.desc,
      ...tier.items.flatMap((item) => [item.title, item.desc, ...item.labels]),
    ]),
  ].join(' ').slice(0, 1_000_000);
}

export async function applySnapshotToProjection(tx: Db, icebergId: string, snapshot: SnapshotV1) {
  await tx.iceberg.update({
    where: { id: icebergId },
    data: {
      title: snapshot.metadata.title,
      description: snapshot.metadata.description,
      renderedDescription: snapshot.metadata.description
        ? renderMarkdownWithMath(snapshot.metadata.description) : null,
      topic: snapshot.metadata.topic,
      updatedAt: new Date(),
    },
  });
  const currentTiers = await tx.tier.findMany({
    where: { icebergId },
    include: { items: true },
  });
  const currentTierIds = new Set(currentTiers.map((tier: any) => tier.id));
  const currentItems = currentTiers.flatMap((tier: any) => tier.items);
  const currentItemIds = new Set(currentItems.map((item: any) => item.id));
  const keptTierIds = new Set<string>();
  const keptItemIds = new Set<string>();

  for (const tier of snapshot.tiers) {
    if (currentTierIds.has(tier.id)) {
      await tx.tier.update({
        where: { id: tier.id },
        data: { name: tier.name, desc: tier.desc, order: tier.order },
      });
    } else {
      await tx.tier.create({
        data: { id: tier.id, icebergId, name: tier.name, desc: tier.desc, order: tier.order },
      });
    }
    keptTierIds.add(tier.id);
    for (const item of tier.items) {
      const data = {
        title: item.title,
        desc: item.desc,
        renderedDesc: item.desc ? renderMarkdownWithMath(item.desc) : null,
        labels: JSON.stringify(item.labels),
        order: item.order,
        tierId: tier.id,
      };
      if (currentItemIds.has(item.id)) {
        await tx.item.update({ where: { id: item.id }, data });
      } else {
        await tx.item.create({ data: { id: item.id, ...data } });
      }
      keptItemIds.add(item.id);
    }
  }
  const removedItems = currentItems.map((item: any) => item.id).filter((id: string) => !keptItemIds.has(id));
  if (removedItems.length) {
    await tx.itemRead.deleteMany({ where: { itemId: { in: removedItems } } });
    await tx.item.deleteMany({ where: { id: { in: removedItems } } });
  }
  const removedTiers = currentTiers.map((tier: any) => tier.id).filter((id: string) => !keptTierIds.has(id));
  if (removedTiers.length) await tx.tier.deleteMany({ where: { id: { in: removedTiers } } });
}

export async function createRepositoryCommit(input: {
  icebergId: string;
  branchId: string;
  expectedHeadCommitId: string;
  snapshot: SnapshotV1;
  authorId: string;
  message: string;
  source?: CommitSource;
  secondParentId?: string | null;
  materializeMain?: boolean;
  afterCommit?: (tx: Db, commit: any) => Promise<void>;
}) {
  return prisma.$transaction(async (rawTx) => {
    const tx = rawTx as any;
    const branch = await tx.icebergBranch.findUnique({ where: { id: input.branchId } });
    if (!branch || branch.icebergId !== input.icebergId || branch.archivedAt) {
      throw new Error('BRANCH_NOT_FOUND');
    }
    if (branch.headCommitId !== input.expectedHeadCommitId) throw new Error('BRANCH_BEHIND');
    const tree = await storeTree(tx, input.snapshot);
    const commit = await storeCommit(tx, {
      icebergId: input.icebergId,
      tree,
      firstParentId: branch.headCommitId,
      secondParentId: input.secondParentId,
      authorId: input.authorId,
      message: input.message,
      source: input.source ?? 'MANUAL',
    });
    const claimed = await tx.icebergBranch.updateMany({
      where: { id: branch.id, headCommitId: input.expectedHeadCommitId },
      data: { headCommitId: commit.id },
    });
    if (claimed.count !== 1) throw new Error('BRANCH_BEHIND');
    if (input.materializeMain || branch.normalizedName === DEFAULT_BRANCH_NAME) {
      await applySnapshotToProjection(tx, input.icebergId, input.snapshot);
    }
    await tx.icebergWorkingCopy.updateMany({
      where: { branchId: branch.id, userId: input.authorId },
      data: { baseCommitId: commit.id, snapshot: input.snapshot, revision: { increment: 1 } },
    });
    if (input.afterCommit) await input.afterCommit(tx, commit);
    return commit;
  }, { isolationLevel: 'Serializable' });
}

export function editorIcebergFromSnapshot(iceberg: any, snapshot: SnapshotV1) {
  return {
    ...iceberg,
    title: snapshot.metadata.title,
    description: snapshot.metadata.description,
    topic: snapshot.metadata.topic,
    tiers: snapshot.tiers.map((tier) => ({
      ...tier,
      icebergId: iceberg.id,
      items: tier.items.map((item) => ({ ...item, labels: [...item.labels] })),
    })),
  };
}

export async function overlayPublishedMetadata<T extends { id: string }>(rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  try {
    const publications = await (prisma as any).icebergPublication.findMany({
      where: { icebergId: { in: rows.map((row) => row.id) } },
    });
    const byIceberg = new Map(publications.map((publication: any) => [
      publication.icebergId,
      publication,
    ]));
    return rows.map((row: any) => {
      const publication: any = byIceberg.get(row.id);
      const snapshot = normalizeSnapshot(publication?.snapshot);
      if (!publication || !snapshot) return row;
      return {
        ...row,
        title: publication.title,
        description: publication.description,
        renderedDescription: publication.renderedDescription,
        topic: publication.topic,
        _count: row._count ? { ...row._count, tiers: snapshot.tiers.length } : row._count,
        tiers: Array.isArray(row.tiers)
          ? snapshot.tiers.map((tier) => ({
            id: tier.id,
            name: tier.name,
            desc: tier.desc,
            order: tier.order,
            items: tier.items.map((item) => ({
              id: item.id,
              title: item.title,
              desc: item.desc,
              labels: JSON.stringify(item.labels),
              order: item.order,
              tierId: tier.id,
            })),
          }))
          : row.tiers,
      };
    });
  } catch {
    return rows;
  }
}

export async function findCommonAncestor(leftCommitId: string, rightCommitId: string): Promise<string | null> {
  const db = prisma as any;
  const collect = async (start: string) => {
    const distances = new Map<string, number>();
    const queue: Array<[string, number]> = [[start, 0]];
    while (queue.length && distances.size < 10_000) {
      const [id, distance] = queue.shift()!;
      if (distances.has(id)) continue;
      distances.set(id, distance);
      const commit = await db.icebergCommit.findUnique({
        where: { id },
        select: { firstParentId: true, secondParentId: true },
      });
      if (commit?.firstParentId) queue.push([commit.firstParentId, distance + 1]);
      if (commit?.secondParentId) queue.push([commit.secondParentId, distance + 1]);
    }
    return distances;
  };
  const left = await collect(leftCommitId);
  const right = await collect(rightCommitId);
  let best: { id: string; score: number } | null = null;
  for (const [id, leftDistance] of left) {
    const rightDistance = right.get(id);
    if (rightDistance === undefined) continue;
    const score = leftDistance + rightDistance;
    if (!best || score < best.score) best = { id, score };
  }
  return best?.id ?? null;
}
