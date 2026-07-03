// prisma/migrate-to-pg.mjs
// 从 SQLite dev.db 导出数据 → 导入到 PostgreSQL
import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import fs from 'fs';

const DB_PATH = 'prisma/dev.db';
if (!fs.existsSync(DB_PATH)) {
  console.error('SQLite dev.db not found at', DB_PATH);
  process.exit(1);
}

const sqlite = new Database(DB_PATH);
const pg = new PrismaClient();

// snake_case → camelCase 转换
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// 把 SQLite 行数据（snake_case 列名）转为 Prisma 期望的 camelCase
function remapRow(row) {
  const result = {};
  for (const key of Object.keys(row)) {
    const camelKey = snakeToCamel(key);
    result[camelKey] = row[key];
  }
  return result;
}

// 把 SQLite String/Millisecond 日期转为 JS Date
function toDate(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'boolean') return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value; // non-date string (like "YYYY-MM-DD" for lastVisitDate)
  return d;
}

// 已知 DateTime 字段列表（camelCase 名）
const DATE_FIELDS = new Set([
  'createdAt', 'updatedAt', 'expiresAt', 'consumedAt', 'reviewedAt',
  'unlockedAt', 'clearedAt', 'resolvedAt', 'banUntil', 'lastWeeklyBonusAt',
  'applyDeadline', 'voteDeadline', 'confirmedAt', 'closesAt', 'autoClears',
]);

// SQLite 用 0/1 存 Boolean，PostgreSQL 需要 true/false
const BOOLEAN_FIELDS = new Set([
  'isFounder', 'privacyShowStats', 'privacyShowWatchlist',
  'read', 'isHidden', 'pinned', 'banner', 'featured',
]);

function normalizeRow(row) {
  const mapped = remapRow(row);
  for (const key of Object.keys(mapped)) {
    const val = mapped[key];
    // SQLite 存 Boolean 为 0/1（整数），转为 true/false
    if (BOOLEAN_FIELDS.has(key) && (val === 0 || val === 1)) {
      mapped[key] = val === 1;
    }
    // 转日期
    if (DATE_FIELDS.has(key) && val !== null) {
      mapped[key] = toDate(val);
    }
  }
  return mapped;
}

// 模型名 → Prisma client 属性名（已验证与 db push 后一致）
const TABLE_MAP = {
  user:                 'users',
  oAuthIdentity:        'oauth_identities',
  authRateLimitEvent:   'auth_rate_limit_events',
  oAuthChallenge:       'oauth_challenges',
  emailVerificationCode:'email_verification_codes',
  userAward:            'user_awards',
  session:              'sessions',
  iceberg:              'icebergs',
  tier:                 'tiers',
  item:                 'items',
  vote:                 'votes',
  watchlist:            'watchlist',
  notification:         'notifications',
  viewLog:              'view_logs',
  promotionRequest:     'promotion_requests',
  systemSettings:       'system_settings',
  icebergReview:        'iceberg_reviews',
  userWarning:          'user_warnings',
  appeal:               'appeals',
  feedback:             'feedbacks',
  report:               'reports',
  userAchievement:      'user_achievements',
  achievement:          'achievements',
  userStats:            'user_stats',
  itemRead:             'item_reads',
  election:             'elections',
  electionCandidate:    'election_candidates',
  electionVote:         'election_votes',
  comment:              'comments',
  commentLike:          'comment_likes',
  rfaRequest:           'rfa_requests',
  rfaVote:              'rfa_votes',
  impeachRequest:       'impeach_requests',
  impeachVote:          'impeach_votes',
  scoreLog:             'score_logs',
  announcement:         'announcements',
};

// 验证模型名在 Prisma client 中存在
for (const name of Object.keys(TABLE_MAP)) {
  if (!pg[name]) {
    console.error(`Invalid model name: ${name}`);
    process.exit(1);
  }
}

async function migrateModel(modelName) {
  const tableName = TABLE_MAP[modelName];
  if (!tableName) {
    console.log(`  ${modelName}: skipped (no mapping)`);
    return;
  }

  const tableExists = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName);
  if (!tableExists) {
    console.log(`  ${modelName}: skipped (no table '${tableName}')`);
    return;
  }

  const sqliteRows = sqlite.prepare(`SELECT * FROM ${tableName}`).all();
  if (sqliteRows.length === 0) {
    console.log(`  ${modelName}: 0 rows`);
    return;
  }

  let ok = 0, skip = 0, errs = 0;
  for (const row of sqliteRows) {
    const data = normalizeRow(row);
    try {
      await pg[modelName].create({ data });
      ok++;
    } catch (e) {
      const isDup = e.code === 'P2002' || (e.message && e.message.includes('Unique constraint'));
      const isFK = e.code === 'P2003' || (e.message && e.message.includes('Foreign key'));
      if (isDup) {
        skip++;
      } else if (isFK) {
        // FK 失败说明父表数据未正确导入，这种情况下放弃该行（前面打印过 user 错误了）
        errs++;
        if (errs <= 1) {
          console.error(`  ⚠ ${modelName}: FK violation (parent data missing)`);
        }
      } else {
        errs++;
        if (errs === 1) {
          console.error(`  ❌ ${modelName} (id: ${data.id}): ${e.message.slice(0, 150)}`);
        }
      }
    }
  }
  console.log(`  ${modelName}: ${ok} ok, ${skip} skipped, ${errs} errors`);
}

const MODELS = [
  'user', 'systemSettings',
  'oAuthIdentity', 'authRateLimitEvent', 'oAuthChallenge',
  'emailVerificationCode', 'userAward', 'session',
  'userWarning', 'appeal', 'userAchievement',
  'userStats', 'scoreLog',
  'iceberg', 'tier', 'item',
  'vote', 'watchlist', 'notification', 'viewLog',
  'comment', 'commentLike', 'itemRead',
  'promotionRequest', 'icebergReview',
  'election', 'electionCandidate', 'electionVote',
  'rfaRequest', 'rfaVote',
  'impeachRequest', 'impeachVote',
  'feedback', 'report', 'achievement',
  'announcement',
];

async function run() {
  console.log('SQLite -> PostgreSQL migration\n');

  // 清空 PG
  console.log('Clearing PG...');
  const reversed = [...Object.keys(TABLE_MAP)].reverse();
  for (const name of reversed) {
    try { await pg[name].deleteMany(); } catch {}
  }
  console.log('');

  for (const model of MODELS) {
    await migrateModel(model);
  }

  console.log('\nDone.');
}

run().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
}).finally(() => {
  sqlite.close();
  pg.$disconnect();
});
