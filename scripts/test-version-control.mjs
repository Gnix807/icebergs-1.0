import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { runBackfill } from './backfill-version-control.mjs';

const outfile = new URL(`../.vc-core-test-${randomUUID()}.mjs`, import.meta.url);

function snapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    metadata: { title: '测试冰山图', description: '基础简介', topic: 'general' },
    tiers: [
      {
        id: 'tier-a',
        name: '第一层',
        desc: '',
        order: 0,
        items: [
          {
            id: 'item-a',
            title: '基础词条',
            desc: '',
            labels: [],
            order: 0,
            tierId: 'tier-a',
          },
        ],
      },
      { id: 'tier-b', name: '第二层', desc: '', order: 1, items: [] },
    ],
    ...overrides,
  };
}

try {
  await build({
    entryPoints: [fileURLToPath(new URL('../src/lib/icebergRepository.ts', import.meta.url))],
    outfile: fileURLToPath(outfile),
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['@prisma/client', 'dotenv', 'dotenv/config', 'marked', 'katex'],
    logLevel: 'silent',
  });
  const {
    applyMergeResolutions,
    diffSnapshots,
    hashSnapshot,
    mergeSnapshots,
    normalizeSnapshot,
  } = await import(`${outfile.href}?v=${Date.now()}`);

  const normalized = normalizeSnapshot(snapshot());
  assert.ok(normalized);
  assert.equal(hashSnapshot(normalized), hashSnapshot(normalizeSnapshot(JSON.parse(JSON.stringify(normalized)))));

  const base = snapshot();
  const branch = snapshot({
    metadata: { ...snapshot().metadata, description: '远端简介' },
  });
  const local = snapshot({
    tiers: snapshot().tiers.map((tier) => tier.id === 'tier-a'
      ? { ...tier, items: tier.items.map((item) => ({ ...item, title: '本地词条' })) }
      : tier),
  });
  const automatic = mergeSnapshots(base, branch, local);
  assert.equal(automatic.conflicts.length, 0);
  assert.equal(automatic.snapshot.metadata.description, '远端简介');
  assert.equal(automatic.snapshot.tiers[0].items[0].title, '本地词条');

  const branchConflict = snapshot({
    metadata: { ...snapshot().metadata, title: '远端标题' },
  });
  const localConflict = snapshot({
    metadata: { ...snapshot().metadata, title: '本地标题' },
  });
  const conflicted = mergeSnapshots(base, branchConflict, localConflict);
  assert.equal(conflicted.conflicts.length, 1);
  const resolved = applyMergeResolutions(conflicted.snapshot, conflicted.conflicts, [{
    path: conflicted.conflicts[0].path,
    field: conflicted.conflicts[0].field,
    choice: 'theirs',
  }]);
  assert.equal(resolved.metadata.title, '本地标题');

  const deleted = snapshot({ tiers: [snapshot().tiers[1]] });
  const edited = snapshot({
    tiers: snapshot().tiers.map((tier) => tier.id === 'tier-a'
      ? { ...tier, name: '编辑后的第一层' }
      : tier),
  });
  assert.ok(mergeSnapshots(base, deleted, edited).conflicts.some((item) => item.field === '$deleted'));

  const moved = snapshot({
    tiers: [
      { ...snapshot().tiers[0], items: [] },
      {
        ...snapshot().tiers[1],
        items: [{ ...snapshot().tiers[0].items[0], tierId: 'tier-b' }],
      },
    ],
  });
  assert.ok(diffSnapshots(base, moved).some((change) =>
    change.kind === 'item' && change.change === 'moved'));

  const publishedSnapshot = snapshot({
    metadata: { title: 'Miscellanea', description: '旧站已发布内容', topic: 'other' },
  });
  const publishedIceberg = {
    id: 'Miscellanea',
    authorId: 'author-a',
    status: 'PUBLISHED',
    title: publishedSnapshot.metadata.title,
    description: publishedSnapshot.metadata.description,
    renderedDescription: '<p>旧站已发布内容</p>',
    topic: publishedSnapshot.metadata.topic,
    tiers: publishedSnapshot.tiers.map((tier) => ({
      ...tier,
      items: tier.items.map((item) => ({ ...item, labels: JSON.stringify(item.labels) })),
    })),
  };
  const legacyBranch = { id: 'branch-main', headCommitId: 'commit-initial' };
  const legacyCommit = { id: 'commit-initial', icebergId: publishedIceberg.id, treeId: 'tree-initial' };
  const legacyTree = {
    id: 'tree-initial',
    hash: hashSnapshot(publishedSnapshot),
    snapshot: publishedSnapshot,
  };
  let publication = null;
  const fakePrisma = {
    iceberg: { findMany: async () => [publishedIceberg] },
    icebergBranch: { findFirst: async () => legacyBranch },
    icebergCommit: { findFirst: async () => legacyCommit },
    icebergTree: { findUnique: async () => legacyTree },
    icebergPublication: {
      findUnique: async () => publication,
      upsert: async ({ create }) => {
        publication = { id: 'publication-a', ...create };
        return publication;
      },
    },
  };
  const verifyOnlyStats = await runBackfill(fakePrisma, { verifyOnly: true, dryRun: false });
  assert.equal(verifyOnlyStats.missing, 1);
  assert.equal(verifyOnlyStats.publicationsCreated, 0);
  assert.equal(publication, null);
  const backfillStats = await runBackfill(fakePrisma, { verifyOnly: false, dryRun: false });
  assert.equal(backfillStats.publicationsCreated, 1);
  assert.equal(publication.commitId, legacyCommit.id);
  assert.deepEqual(publication.snapshot, publishedSnapshot);
  const repeatedBackfillStats = await runBackfill(fakePrisma, { verifyOnly: false, dryRun: false });
  assert.equal(repeatedBackfillStats.publicationsCreated, 0);
  assert.equal(repeatedBackfillStats.skipped, 1);

  console.log('version-control core tests passed');
} finally {
  await unlink(outfile).catch(() => {});
}
