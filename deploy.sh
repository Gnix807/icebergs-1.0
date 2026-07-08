#!/bin/bash
set -e

cd /opt/icebergs

echo "==> 1/6 拉取最新代码"
git pull origin main

echo "==> 2/6 安装依赖"
npm install

echo "==> 3/6 数据库迁移"
npx prisma generate
npx prisma db push

echo "==> 4/6 全文搜索索引"
# 尝试自动执行，失败则提示手动
psql "$DATABASE_URL" -f prisma/migrations/001_fulltext_search.sql 2>/dev/null || \
  echo "    ⚠ 请手动执行: psql \$DATABASE_URL -f prisma/migrations/001_fulltext_search.sql"

echo "==> 5/6 构建"
npm run build

echo "==> 6/6 重启服务"
if command -v pm2 &> /dev/null && pm2 list 2>/dev/null | grep -q icebergs; then
  pm2 restart icebergs
  echo "    PM2 已重启"
elif [ -f /opt/icebergs/dist/server/entry.mjs ]; then
  echo "    ⚠ 未检测到进程管理，请手动重启"
  echo "    1Panel: 进程守护 → 重启 icebergs"
else
  echo "    ⚠ 构建产物不存在，请检查 npm run build 是否成功"
fi

echo ""
echo "✅ 部署完成"
