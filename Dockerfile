FROM node:22-slim

WORKDIR /app

# 安装系统依赖（Prisma + bcrypt）
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 复制源码和配置
COPY prisma/ prisma/
COPY astro.config.mjs tsconfig.json tailwind.config.mjs ./
COPY src/ src/
COPY public/ public/

# 构建
RUN npx prisma generate && npm run build

EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
