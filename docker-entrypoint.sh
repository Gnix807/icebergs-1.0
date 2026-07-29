#!/bin/sh
set -eu

DB_HOST="${DB_HOST:-db}"
DB_USER="${DB_USER:-icebergs}"
DB_NAME="${DB_NAME:-icebergs}"

run_sql_migration() {
  label="$1"
  file="$2"
  echo "[icebergs] ${label}..."
  PGPASSWORD="${DB_PASSWORD}" psql \
    -v ON_ERROR_STOP=1 \
    --single-transaction \
    -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" \
    -f "${file}"
}

echo "[icebergs] 等待数据库..."
until pg_isready -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" 2>/dev/null; do
  sleep 2
done

# 旧版本曾把 search_vector 声明为 TEXT。Prisma 无法自动生成 TEXT ->
# TSVECTOR 的 USING 表达式，因此已有表时必须先由幂等 SQL 修正类型。
if PGPASSWORD="${DB_PASSWORD}" psql \
  -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" \
  -tAc "SELECT to_regclass('public.icebergs') IS NOT NULL" \
  | grep -q 't'; then
  run_sql_migration "迁移前修复全文搜索列" "prisma/migrations/001_fulltext_search.sql"
fi

echo "[icebergs] 数据库迁移..."
# 生产环境绝不自动接受破坏性 schema 变更。当前版本只有新增表、
# 新增列和索引；如果未来出现删表/删列漂移，容器应停止而不是改写数据。
npx prisma db push --skip-generate

run_sql_migration "全文搜索索引" "prisma/migrations/001_fulltext_search.sql"
run_sql_migration "能力与贡献体系增量初始化" "prisma/migrations/002_capabilities_contributions.sql"

echo "[icebergs] 补齐默认配置（不覆盖管理员设置）..."
node prisma/seed.mjs
node prisma/seed-achievements.mjs
node prisma/seed-features.mjs

echo "[icebergs] 幂等回填版本库..."
node scripts/backfill-version-control.mjs

echo "[icebergs] 幂等回填能力与贡献档案..."
node scripts/backfill-capabilities-contributions.mjs

echo "[icebergs] 校验迁移结果..."
node scripts/backfill-version-control.mjs --verify-only
node scripts/backfill-capabilities-contributions.mjs --verify-only

echo "[icebergs] 启动..."
exec node dist/server/entry.mjs
