#!/bin/sh
set -e

echo "[icebergs] 等待数据库..."
until pg_isready -h db -U icebergs 2>/dev/null; do
  sleep 2
done

echo "[icebergs] 数据库迁移..."
npx prisma db push --accept-data-loss --skip-generate

echo "[icebergs] 种子数据..."
if ! node prisma/seed.mjs; then
  echo "[icebergs] WARN: 基础种子数据执行失败，应用将继续启动" >&2
fi
if ! node prisma/seed-achievements.mjs; then
  echo "[icebergs] WARN: 成就种子数据执行失败，应用将继续启动" >&2
fi

echo "[icebergs] 全文搜索..."
if ! PGPASSWORD="${DB_PASSWORD}" psql \
  -v ON_ERROR_STOP=1 \
  --single-transaction \
  -h db -U icebergs -d icebergs \
  -f prisma/migrations/001_fulltext_search.sql; then
  echo "[icebergs] WARN: 全文搜索初始化失败，事务已回滚，应用将继续启动" >&2
fi

echo "[icebergs] 启动..."
exec node dist/server/entry.mjs
