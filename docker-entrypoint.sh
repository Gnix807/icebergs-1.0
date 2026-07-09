#!/bin/sh
set -e

echo "[icebergs] 等待数据库..."
until pg_isready -h db -U icebergs 2>/dev/null; do
  sleep 2
done

echo "[icebergs] 数据库迁移..."
npx prisma db push --accept-data-loss --skip-generate

echo "[icebergs] 种子数据..."
node prisma/seed.mjs 2>/dev/null || true
node prisma/seed-achievements.mjs 2>/dev/null || true

echo "[icebergs] 全文搜索..."
PGPASSWORD="${DB_PASSWORD:-icebergs_dev}" psql -h db -U icebergs -d icebergs -f prisma/migrations/001_fulltext_search.sql 2>/dev/null || true

echo "[icebergs] 启动..."
exec node dist/server/entry.mjs
