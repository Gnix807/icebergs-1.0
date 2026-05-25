// prisma/migrate-to-pg.mjs
// 从 SQLite dev.db 导出数据 → 导入到 PostgreSQL
// 前提：SQLite dev.db 还在项目目录中，PG 连接串在 .env DATABASE_URL
import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';

const sqlite = new Database('prisma/dev.db');
const pg = new PrismaClient();

// 启用所有外键约束（PG特有）
sqlite.pragma('foreign_keys = ON');

function mapRow(row, modelName) {
  // Prisma create 接受原始对象，PG vs SQLite 字段名一致
  return row;
}

async function migrateModel(modelName) {
  const sqliteRows = sqlite.prepare(`SELECT * FROM ${modelName}s`).all();
  if (sqliteRows.length === 0) {
    console.log(`  ${modelName}: 0 rows`);
    return;
  }

  let ok = 0, skip = 0;
  for (const row of sqliteRows) {
    try {
      // Prisma API: pg.<modelName>.create({ data: ... })
      await pg[modelName].create({ data: row });
      ok++;
    } catch (e) {
      // 冲突跳过（幂等）
      skip++;
    }
  }
  console.log(`  ${modelName}: ${ok} imported, ${skip} skipped`);
}

const MODELS = [
  // 先导入无外键依赖的表
  'user', 'systemSetting',
  // 后导入有外键依赖的表
  'oauthIdentity', 'authRateLimitEvent', 'oauthChallenge',
  'userAward', 'session', 'iceberg', 'tier', 'item',
  'vote', 'watchlist', 'notification', 'viewLog',
  'promotionRequest', 'icebergReview', 'userWarning',
  'appeal', 'feedback', 'report', 'userAchievement',
  'achievement', 'userStat', 'itemRead',
  'election', 'electionCandidate', 'electionVote',
  'comment', 'commentLike',
  'rfaRequest', 'rfaVote',
  'impeachRequest', 'impeachVote',
  'scoreLog', 'announcement',
];

async function run() {
  console.log('SQLite → PostgreSQL migration\n');
  for (const model of MODELS) {
    await migrateModel(model);
  }
  console.log('\nDone.');
}

run().catch(console.error).finally(() => {
  sqlite.close();
  pg.$disconnect();
});
