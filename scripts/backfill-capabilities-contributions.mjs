import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const verifyOnly = process.argv.includes('--verify-only');

const legacyCapabilities = {
  EDITOR: ['PUBLICATION_REVIEW', 'CONTENT_CURATION', 'COMMUNITY_MODERATION'],
  MODERATOR: ['PUBLICATION_REVIEW', 'CONTENT_CURATION', 'COMMUNITY_MODERATION'],
  ADMIN: ['PUBLICATION_REVIEW', 'CONTENT_CURATION', 'COMMUNITY_MODERATION', 'SITE_ADMINISTRATION'],
};
const legacyBlocks = new Set([
  'qualityLevel',
  'qualityScore',
  'collabEditCount',
  'role',
  'capability',
]);
const contributionAchievements = [
  {
    key: 'merged_pr_first',
    icon: '⑴',
    label: 'First Merge',
    labelZh: '第一次合并',
    desc: '你的第一个合并请求已安全进入主版本。',
    color: '#22c55e',
    conditions: [{ block: 'mergedPullRequestCount', op: '>=', value: 1 }],
    category: '协作',
    rarity: '普通',
    sortOrder: 510,
  },
  {
    key: 'merged_pr_ten',
    icon: '⑽',
    label: 'Ten Merges',
    labelZh: '稳定合作者',
    desc: '累计完成 10 个已合并的合并请求。',
    color: '#00ff41',
    conditions: [{ block: 'mergedPullRequestCount', op: '>=', value: 10 }],
    category: '协作',
    rarity: '稀有',
    sortOrder: 520,
  },
  {
    key: 'cross_iceberg_collaborator',
    icon: '⌘',
    label: 'Cross Repository Collaborator',
    labelZh: '跨冰山协作者',
    desc: '已在至少 3 张不同冰山图中完成合并贡献。',
    color: '#38bdf8',
    conditions: [{ block: 'distinctCollabIcebergCount', op: '>=', value: 3 }],
    category: '协作',
    rarity: '稀有',
    sortOrder: 530,
  },
  {
    key: 'audited_reviewer',
    icon: '✓',
    label: 'Audited Reviewer',
    labelZh: '可靠审阅者',
    desc: '已有 3 次审核决定通过抽查审计。',
    color: '#a78bfa',
    conditions: [{ block: 'validReviewCount', op: '>=', value: 3 }],
    category: '协作',
    rarity: '史诗',
    sortOrder: 540,
  },
  {
    key: 'project_service_five',
    icon: '◆',
    label: 'Project Service',
    labelZh: '项目服务者',
    desc: '在专题协作中完成了 5 项正式任务。',
    color: '#f59e0b',
    conditions: [{ block: 'completedTaskCount', op: '>=', value: 5 }],
    category: '协作',
    rarity: '稀有',
    sortOrder: 550,
  },
];

function parsedConditions(value) {
  try {
    const result = JSON.parse(value || '[]');
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

async function expectedData() {
  const [users, publications, pulls, reviews, tasks, achievements] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: Object.keys(legacyCapabilities) } },
      select: { id: true, role: true, isFounder: true },
    }),
    prisma.icebergPublication.findMany({
      select: {
        id: true, icebergId: true, publishedAt: true,
        iceberg: { select: { authorId: true, projectId: true } },
      },
    }),
    prisma.icebergPullRequest.findMany({
      where: { status: 'MERGED', mergedAt: { not: null } },
      select: {
        id: true, authorId: true, icebergId: true, mergedAt: true,
        iceberg: { select: { projectId: true } },
      },
    }),
    prisma.icebergPullReview.findMany({
      where: { state: { in: ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'] } },
      select: {
        id: true, reviewerId: true, createdAt: true,
        pullRequest: {
          select: {
            authorId: true, icebergId: true,
            iceberg: { select: { projectId: true } },
          },
        },
      },
    }),
    prisma.projectTask.findMany({
      where: { status: 'COMPLETED', assigneeId: { not: null } },
      select: { id: true, assigneeId: true, projectId: true, updatedAt: true },
    }),
    prisma.achievement.findMany({
      select: { id: true, key: true, conditions: true },
    }),
  ]);

  const capabilities = users.flatMap((user) =>
    (user.isFounder ? legacyCapabilities.ADMIN : legacyCapabilities[user.role] ?? [])
      .map((capability) => ({ userId: user.id, capability })));
  const events = [
    ...publications.map((row) => ({
      idempotencyKey: `publication:${row.id}`,
      userId: row.iceberg.authorId,
      type: 'ICEBERG_PUBLISHED',
      dimension: 'CREATION',
      resourceType: 'iceberg-publication',
      resourceId: row.id,
      icebergId: row.icebergId,
      projectId: row.iceberg.projectId,
      occurredAt: row.publishedAt,
    })),
    ...pulls.map((row) => ({
      idempotencyKey: `pull-merged:${row.id}`,
      userId: row.authorId,
      type: 'PULL_REQUEST_MERGED',
      dimension: 'COLLABORATION',
      resourceType: 'pull-request',
      resourceId: row.id,
      icebergId: row.icebergId,
      projectId: row.iceberg.projectId,
      occurredAt: row.mergedAt,
    })),
    ...reviews
      .filter((row) => row.reviewerId !== row.pullRequest.authorId)
      .map((row) => ({
        idempotencyKey: `pull-review:${row.id}`,
        userId: row.reviewerId,
        type: 'PULL_REVIEW_SUBMITTED',
        dimension: 'REVIEW',
        resourceType: 'pull-review',
        resourceId: row.id,
        icebergId: row.pullRequest.icebergId,
        projectId: row.pullRequest.iceberg.projectId,
        occurredAt: row.createdAt,
      })),
    ...tasks.map((row) => ({
      idempotencyKey: `project-task-completed:${row.id}`,
      userId: row.assigneeId,
      type: 'PROJECT_TASK_COMPLETED',
      dimension: 'SERVICE',
      resourceType: 'project-task',
      resourceId: row.id,
      projectId: row.projectId,
      occurredAt: row.updatedAt,
    })),
  ];
  const legacyAchievements = achievements.filter((achievement) =>
    parsedConditions(achievement.conditions)
      .some((condition) => condition?.block && legacyBlocks.has(condition.block)));
  return { capabilities, events, legacyAchievements };
}

async function refreshProfile(userId) {
  const events = await prisma.contributionEvent.findMany({
    where: { userId },
    select: { type: true, dimension: true, icebergId: true },
  });
  const byDimension = (value) => events.filter((event) => event.dimension === value).length;
  const byType = (value) => events.filter((event) => event.type === value).length;
  const values = {
    creationCount: byDimension('CREATION'),
    collaborationCount: byDimension('COLLABORATION'),
    reviewCount: byDimension('REVIEW'),
    serviceCount: byDimension('SERVICE'),
    publishedIcebergCount: byType('ICEBERG_PUBLISHED'),
    mergedPullRequestCount: byType('PULL_REQUEST_MERGED'),
    distinctCollabIcebergCount: new Set(
      events.filter((event) => event.type === 'PULL_REQUEST_MERGED')
        .map((event) => event.icebergId).filter(Boolean),
    ).size,
    nonSelfReviewCount: byType('PULL_REVIEW_SUBMITTED'),
    validReviewCount: byType('REVIEW_AUDIT_PASSED'),
    completedTaskCount: byType('PROJECT_TASK_COMPLETED'),
  };
  await prisma.userContributionProfile.upsert({
    where: { userId },
    create: { userId, ...values },
    update: values,
  });
}

async function verify(expected) {
  const capabilityRows = await prisma.userCapability.findMany({
    where: { userId: { in: [...new Set(expected.capabilities.map((row) => row.userId))] } },
    select: { userId: true, capability: true },
  });
  const actualCapabilities = new Set(capabilityRows.map((row) => `${row.userId}:${row.capability}`));
  const capabilityCount = expected.capabilities
    .filter((row) => actualCapabilities.has(`${row.userId}:${row.capability}`)).length;
  const [eventCount, legacyCount] = await Promise.all([
    prisma.contributionEvent.count({
      where: { idempotencyKey: { in: expected.events.map((row) => row.idempotencyKey) } },
    }),
    prisma.achievement.count({
      where: {
        id: { in: expected.legacyAchievements.map((row) => row.id) },
        lifecycle: 'LEGACY',
      },
    }),
  ]);
  const summary = {
    capabilities: `${capabilityCount}/${expected.capabilities.length}`,
    contributionEvents: `${eventCount}/${expected.events.length}`,
    legacyAchievements: `${legacyCount}/${expected.legacyAchievements.length}`,
  };
  const valid = Object.values(summary).every((value) => {
    const [actual, wanted] = value.split('/').map(Number);
    return actual === wanted;
  });
  console.log(JSON.stringify({ ...summary, valid }, null, 2));
  if (!valid) process.exitCode = 1;
}

try {
  const expected = await expectedData();
  console.log(JSON.stringify({
    dryRun,
    verifyOnly,
    expectedCapabilities: expected.capabilities.length,
    expectedContributionEvents: expected.events.length,
    legacyAchievementDefinitions: expected.legacyAchievements.length,
  }, null, 2));

  if (!dryRun && !verifyOnly) {
    for (const row of expected.capabilities) {
      await prisma.userCapability.upsert({
        where: { userId_capability: row },
        create: {
          ...row,
          status: 'ACTIVE',
          source: 'MIGRATION',
          reason: '由旧角色平移，保留上线前有效职责',
        },
        update: {},
      });
    }
    for (const row of expected.events) {
      await prisma.contributionEvent.upsert({
        where: { idempotencyKey: row.idempotencyKey },
        create: row,
        update: {},
      });
    }
    for (const achievement of expected.legacyAchievements) {
      await prisma.achievement.update({
        where: { id: achievement.id },
        data: { lifecycle: 'LEGACY' },
      });
    }
    for (const definition of contributionAchievements) {
      await prisma.achievement.upsert({
        where: { key: definition.key },
        create: {
          ...definition,
          triggerType: 'contribution',
          triggerTarget: 0,
          conditions: JSON.stringify(definition.conditions),
          lifecycle: 'ACTIVE',
          ruleVersion: 1,
        },
        // 回填允许重复执行，但不能覆盖管理员后续调整过的成就定义。
        update: {},
      });
    }
    await prisma.achievement.upsert({
      where: { key: 'legacy_contributor' },
      create: {
        key: 'legacy_contributor',
        icon: '◇',
        label: 'Legacy Contributor',
        labelZh: '早期贡献者',
        desc: '曾参与旧版贡献者体系的建设，作为永久历史荣誉保留。',
        color: '#8b5cf6',
        triggerType: 'manual',
        category: '其他',
        rarity: '史诗',
        lifecycle: 'LEGACY',
        ruleVersion: 1,
        sortOrder: 9000,
      },
      update: { lifecycle: 'LEGACY' },
    });
    const contributors = await prisma.user.findMany({
      where: { role: 'CONTRIBUTOR' },
      select: { id: true },
    });
    for (const user of contributors) {
      await prisma.userAchievement.upsert({
        where: {
          userId_achievementId: {
            userId: user.id,
            achievementId: 'legacy_contributor',
          },
        },
        create: {
          userId: user.id,
          achievementId: 'legacy_contributor',
          evidence: { source: 'legacy-role-migration' },
        },
        update: {},
      });
    }
    for (const userId of new Set(expected.events.map((row) => row.userId))) {
      await refreshProfile(userId);
    }
  }
  if (!dryRun) await verify(expected);
} finally {
  await prisma.$disconnect();
}
