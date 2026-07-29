import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

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

  console.log('version-control core tests passed');
} finally {
  await unlink(outfile).catch(() => {});
}
