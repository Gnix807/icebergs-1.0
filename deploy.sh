#!/bin/sh
set -eu

APP_DIR="${APP_DIR:-/opt/icebergs}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE="docker compose --env-file ${ENV_FILE}"

cd "${APP_DIR}"

echo "==> 1/7 拉取最新代码（仅允许快进）"
git pull --ff-only origin main

echo "==> 2/7 检查生产配置"
docker run --rm \
  -v "${APP_DIR}:/app:ro" \
  -w /app \
  node:22-alpine3.22 \
  node scripts/deploy-preflight.mjs --env-file "${ENV_FILE}"
${COMPOSE} config >/dev/null

echo "==> 3/7 启动并等待数据库"
${COMPOSE} up -d db
db_container="$(${COMPOSE} ps -q db)"
if [ -z "${db_container}" ]; then
  echo "无法找到数据库容器" >&2
  exit 1
fi

attempt=0
until [ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "${db_container}")" = "healthy" ]; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 60 ]; then
    echo "数据库在 120 秒内未就绪" >&2
    ${COMPOSE} logs --tail=80 db
    exit 1
  fi
  sleep 2
done

echo "==> 4/7 生成部署前数据库备份"
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="/backups/icebergs-predeploy-${backup_stamp}.dump"
${COMPOSE} exec -T -e "BACKUP_FILE=${backup_file}" db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$BACKUP_FILE"'
echo "    备份已保存：${backup_file}"

echo "==> 5/7 构建应用镜像（复用缓存）"
${COMPOSE} build app

echo "==> 6/7 启动应用并自动执行安全迁移"
${COMPOSE} up -d app
app_container="$(${COMPOSE} ps -q app)"
if [ -z "${app_container}" ]; then
  echo "无法找到应用容器" >&2
  exit 1
fi

attempt=0
until [ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "${app_container}")" = "healthy" ]; do
  state="$(docker inspect --format '{{.State.Status}}' "${app_container}")"
  if [ "${state}" = "exited" ] || [ "${state}" = "dead" ]; then
    echo "应用启动失败，最近日志如下：" >&2
    ${COMPOSE} logs --tail=160 app
    exit 1
  fi
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 150 ]; then
    echo "应用在 300 秒内未通过健康检查" >&2
    ${COMPOSE} logs --tail=160 app
    exit 1
  fi
  sleep 2
done

echo "==> 7/7 输出部署状态"
${COMPOSE} ps
echo ""
echo "部署完成。数据库已备份，增量迁移、历史回填和健康检查均已通过。"
