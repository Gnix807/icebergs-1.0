FROM node:22-slim

WORKDIR /app

# PostgreSQL 客户端（启动脚本需要 pg_isready / psql）
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*

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
