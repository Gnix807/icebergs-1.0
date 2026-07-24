# Alpine 镜像更小，并自带 apk 可用的系统证书链；Prisma 会自动生成
# 对应 musl/OpenSSL 3 的引擎，适合当前 PostgreSQL 部署。
FROM node:22-alpine3.22

WORKDIR /app

# PostgreSQL 客户端（启动脚本需要 pg_isready / psql）
RUN apk add --no-cache \
    postgresql-client ca-certificates openssl

# 依赖
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm install prisma --no-save

# 复制源码和配置
COPY prisma/ prisma/
COPY astro.config.mjs tsconfig.json tailwind.config.mjs ./
COPY src/ src/
COPY public/ public/

# 构建
RUN npx prisma generate && npm run build

COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 4321
ENTRYPOINT ["/app/docker-entrypoint.sh"]
