#!/bin/bash
set -e

cd /opt/icebergs/frontend

echo "==> 1/6 拉取最新代码"
git pull

echo "==> 2/6 安装依赖"
npm install

echo "==> 3/6 数据库迁移"
npx prisma generate
npx prisma db push

echo "==> 4/6 全文搜索索引"
PGPASSWORD=$(grep DATABASE_URL .env | sed 's/.*:\/\/.*:\(.*\)@.*/\1/') \
  psql $(grep DATABASE_URL .env | sed 's|.*://\(.*\)@|\1|' | sed 's|/icebergs||')/icebergs \
  -f prisma/migrations/001_fulltext_search.sql 2>/dev/null || echo "    (如 PG 不在本地容器请手动执行 001_fulltext_search.sql)"

echo "==> 5/6 构建"
npm run build

echo "==> 6/6 重启服务"
# 尝试 PM2 重启
if command -v pm2 &> /dev/null && pm2 list | grep -q icebergs; then
  pm2 restart icebergs
  echo "    PM2 已重启"
# 尝试 1Panel 进程守护重启
elif supervisorctl status icebergs &> /dev/null; then
  supervisorctl restart icebergs
  echo "    进程守护已重启"
else
  echo "    ⚠ 未检测到 PM2 或 Supervisor，请手动重启"
  echo "    PM2: pm2 start dist/server/entry.mjs --name icebergs"
  echo "    1Panel: 进程守护 → 新建 → 启动命令: /usr/bin/node /opt/icebergs/frontend/dist/server/entry.mjs"
fi

echo ""
echo "✅ 部署完成"
