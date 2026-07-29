import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const VERIFY_ONLY = process.argv.includes('--verify-only');
const DRY_RUN = process.argv.includes('--dry-run');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 1) : undefined;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
}

function parseLabels(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function snapshotOf(iceberg) {
  return {
    schemaVersion: 1,
    metadata: {
      title: iceberg.title,
      description: iceberg.description || '',
      topic: iceberg.topic || 'general',
    },
    tiers: iceberg.tiers.map((tier, tierIndex) => ({
      id: tier.id,
      name: tier.name,
      desc: tier.desc || '',
      order: tierIndex,
      items: tier.items.map((item, itemIndex) => ({
        id: item.id,
        title: item.title,
        desc: item.desc || '',
        labels: parseLabels(item.labels),
        order: itemIndex,
        tierId: tier.id,
      })),
    })),
  };
}

function searchText(snapshot) {
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

async function backfillOne(iceberg) {
  const exists = await prisma.icebergBranch.findFirst({
    where: { icebergId: iceberg.id, normalizedName: 'main', archivedAt: null },
  });
  if (exists) return 'skipped';

  const snapshot = snapshotOf(iceberg);
  const treeHash = sha256(snapshot);
  await prisma.$transaction(async (tx) => {
    const raced = await tx.icebergBranch.findFirst({
      where: { icebergId: iceberg.id, normalizedName: 'main', archivedAt: null },
    });
    if (raced) return;
    const tree = await tx.icebergTree.upsert({
      where: { hash: treeHash },
      create: {
        hash: treeHash,
        schemaVersion: 1,
        snapshot,
        byteSize: Buffer.byteLength(canonical(snapshot), 'utf8'),
      },
      update: {},
    });
    const createdAt = new Date();
    const commitHash = sha256({
      treeHash,
      firstParentId: null,
      secondParentId: null,
      authorId: iceberg.authorId,
      message: '初始化版本库',
      createdAt: createdAt.toISOString(),
    });
    const commit = await tx.icebergCommit.create({
      data: {
        icebergId: iceberg.id,
        hash: commitHash,
        treeId: tree.id,
        authorId: iceberg.authorId,
        message: '初始化版本库',
        source: 'INITIAL',
        createdAt,
      },
    });
    await tx.icebergBranch.create({
      data: {
        icebergId: iceberg.id,
        name: 'main',
        normalizedName: 'main',
        title: '主版本',
        headCommitId: commit.id,
        createdById: iceberg.authorId,
        protected: true,
      },
    });
    await tx.iceberg.update({
      where: { id: iceberg.id },
      data: { repositoryInitializedAt: createdAt },
    });
    if (iceberg.status === 'PUBLISHED') {
      await tx.icebergPublication.upsert({
        where: { icebergId: iceberg.id },
        create: {
          icebergId: iceberg.id,
          commitId: commit.id,
          title: iceberg.title,
          description: iceberg.description,
          renderedDescription: iceberg.renderedDescription,
          topic: iceberg.topic,
          snapshot,
          searchText: searchText(snapshot),
          publishedAt: createdAt,
        },
        update: {},
      });
    }
  }, { isolationLevel: 'Serializable' });
  const stored = await prisma.icebergTree.findUnique({ where: { hash: treeHash } });
  if (!stored || sha256(stored.snapshot) !== treeHash) throw new Error(`snapshot hash mismatch: ${iceberg.id}`);
  return 'created';
}

async function verifyOne(iceberg) {
  const branch = await prisma.icebergBranch.findFirst({
    where: { icebergId: iceberg.id, normalizedName: 'main', archivedAt: null },
  });
  if (!branch) return { missing: true };
  const commit = await prisma.icebergCommit.findFirst({
    where: { id: branch.headCommitId, icebergId: iceberg.id },
  });
  if (!commit) throw new Error(`main commit missing: ${iceberg.id}`);
  const tree = await prisma.icebergTree.findUnique({ where: { id: commit.treeId } });
  if (!tree || sha256(tree.snapshot) !== tree.hash) {
    throw new Error(`main tree hash mismatch: ${iceberg.id}`);
  }
  const projection = snapshotOf(iceberg);
  if (canonical(projection) !== canonical(tree.snapshot)) {
    throw new Error(`main projection mismatch: ${iceberg.id}`);
  }
  if (iceberg.status === 'PUBLISHED') {
    const publication = await prisma.icebergPublication.findUnique({ where: { icebergId: iceberg.id } });
    if (!publication) throw new Error(`publication missing: ${iceberg.id}`);
    const publicationCommit = await prisma.icebergCommit.findFirst({
      where: { id: publication.commitId, icebergId: iceberg.id },
    });
    if (!publicationCommit) throw new Error(`publication commit missing: ${iceberg.id}`);
    const publicationTree = await prisma.icebergTree.findUnique({
      where: { id: publicationCommit.treeId },
    });
    if (!publicationTree || sha256(publicationTree.snapshot) !== publicationTree.hash
      || canonical(publication.snapshot) !== canonical(publicationTree.snapshot)) {
      throw new Error(`publication snapshot mismatch: ${iceberg.id}`);
    }
  }
  return { missing: false };
}

async function main() {
  const icebergs = await prisma.iceberg.findMany({
    orderBy: { createdAt: 'asc' },
    ...(LIMIT ? { take: LIMIT } : {}),
    include: {
      tiers: {
        orderBy: { order: 'asc' },
        include: { items: { orderBy: { order: 'asc' } } },
      },
    },
  });
  let created = 0;
  let skipped = 0;
  let missing = 0;
  let verified = 0;
  for (const iceberg of icebergs) {
    const verification = await verifyOne(iceberg);
    if (!verification.missing) {
      verified += 1;
      skipped += 1;
      continue;
    }
    missing += 1;
    if (VERIFY_ONLY || DRY_RUN) continue;
    const result = await backfillOne(iceberg);
    if (result === 'created') created += 1;
    else skipped += 1;
  }
  const mode = VERIFY_ONLY ? 'verify-only' : DRY_RUN ? 'dry-run' : 'write';
  console.log(`version-control backfill complete: mode=${mode}, total=${icebergs.length}, created=${created}, verified=${verified}, missing=${missing}, skipped=${skipped}`);
  if (VERIFY_ONLY && missing > 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
