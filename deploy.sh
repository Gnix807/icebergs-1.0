#!/bin/sh
set -eu

APP_DIR="${APP_DIR:-/opt/icebergs}"
ENV_FILE="${ENV_FILE:-}"

cd "${APP_DIR}"

if [ -z "${ENV_FILE}" ]; then
  if [ -f ".env.production" ]; then
    ENV_FILE=".env.production"
  elif [ -f ".env" ]; then
    ENV_FILE=".env"
    echo "==> 未找到 .env.production，继续使用现有 .env"
  else
    echo "未找到 .env.production 或 .env，无法读取生产配置" >&2
    exit 1
  fi
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "指定的生产配置文件不存在：${ENV_FILE}" >&2
  exit 1
fi

COMPOSE="docker compose --env-file ${ENV_FILE}"

echo "==> 1/8 拉取最新代码（仅允许快进）"
git pull --ff-only origin main

echo "==> 2/8 检查生产配置"
docker run --rm \
  -v "${APP_DIR}:/app:ro" \
  -w /app \
  node:22-alpine3.22 \
  node scripts/deploy-preflight.mjs --env-file "${ENV_FILE}"
${COMPOSE} config >/dev/null

echo "==> 3/8 确保数据库已启动并等待就绪"
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

echo "==> 4/8 生成部署前数据库备份"
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="/backups/icebergs-predeploy-${backup_stamp}.dump"
${COMPOSE} exec -T -e "BACKUP_FILE=${backup_file}" db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$BACKUP_FILE"'
echo "    备份已保存：${backup_file}"

stack_stopped=0
restore_stack_on_failure() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "${status}" -ne 0 ] && [ "${stack_stopped}" -eq 1 ]; then
    echo "部署中断，尝试使用现有镜像重新启动服务..." >&2
    ${COMPOSE} up -d || true
  fi
  exit "${status}"
}
trap restore_stack_on_failure EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

echo "==> 5/8 停止现有 Docker 服务（保留数据卷）"
stack_stopped=1
${COMPOSE} down --remove-orphans

echo "==> 6/8 重新构建应用镜像（复用缓存）"
${COMPOSE} build app

echo "==> 7/8 启动全部服务并自动执行安全迁移"
${COMPOSE} up -d

db_container="$(${COMPOSE} ps -q db)"
if [ -z "${db_container}" ]; then
  echo "无法找到数据库容器" >&2
  exit 1
fi

attempt=0
until [ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "${db_container}")" = "healthy" ]; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 60 ]; then
    echo "数据库重启后在 120 秒内未就绪" >&2
    ${COMPOSE} logs --tail=80 db
    exit 1
  fi
  sleep 2
done

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

stack_stopped=0
trap - EXIT HUP INT TERM

echo "==> 8/8 输出部署状态"
${COMPOSE} ps
echo ""
echo "部署完成。旧服务已停止并重建，数据库备份、增量迁移、历史回填和健康检查均已通过。"
