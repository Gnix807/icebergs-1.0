# 冰山图宇宙 (Iceberg Universe)

> 一个以「冰山图」为核心的知识整理与分享社区。把你知道的一切，按深度分层。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Astro 5 SSR + React 19 Islands |
| 样式 | Tailwind 3.4 + 自定义 CSS 变量 |
| 数据库 | PostgreSQL 18 + Prisma 5 |
| 状态管理 | Zustand 5 |
| 拖拽 | @dnd-kit |
| 认证 | Arctic (GitHub OAuth) + 邮箱密码 (pbkdf2) |
| 搜索 | PostgreSQL tsvector + GIN 索引 |
| 字体 | Space Grotesk + Space Mono + MiSans |

## 快速开始

### 环境要求

- Node.js 22+
- PostgreSQL 18
- Git

### 安装与启动

```bash
cd frontend
cp .env.example .env      # 编辑 .env 填入 OAuth 密钥
npm install
npx prisma db push        # 初始化数据库表结构
npx prisma generate       # 生成 Prisma Client

# 初始化全文搜索索引
psql -U icebergs -d icebergs -f prisma/migrations/001_fulltext_search.sql

# 可选：导入旧 SQLite 数据
# node prisma/migrate-to-pg.mjs

npm run dev               # 启动开发服务器，默认 http://localhost:4321
```

### 环境变量 (`.env`)

```env
DATABASE_URL="postgresql://icebergs:icebergs_dev@127.0.0.1:5433/icebergs"
GITHUB_CLIENT_ID=           # GitHub OAuth App Client ID
GITHUB_CLIENT_SECRET=       # GitHub OAuth App Client Secret
REDIRECT_URI=http://localhost:4321/api/auth/callback
CRON_SECRET=                # Cron 端点鉴权密钥
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run check` | TypeScript 类型检查 |
| `npx prisma studio` | 数据库可视化管理 |
| `npx prisma db push` | 同步 Schema 到数据库 |

## 架构

### SSR 模式

`.astro` 页面通过 Prisma 直接在服务端获取数据，React 组件仅在有交互需求的场景下以 Islands (`client:load` / `client:visible`) 方式加载。

### 认证与会话

- **会话持久化** — 数据库存储，无 JWT，无内存状态
- **OAuth** — Arctic 库实现 GitHub 登录，支持 PKCE
- **邮箱登录** — pbkdf2 密码哈希，无需邮箱验证码
- **权限控制** — 统一 `can(session, action)` 函数，角色层级：USER → CONTRIBUTOR → EDITOR → MODERATOR → ADMIN → FOUNDER

### 数据模型

核心模型：`Iceberg` → `Tier` → `Item`（三层嵌套）。每个词条支持 Markdown 描述、标签分类、KaTeX 数学公式。

### 全文搜索

PostgreSQL `tsvector` + GIN 索引，支持中英文混合搜索。中文自动按字拆分，英文按词拆分。

## 功能

| 功能 | 路由 |
|------|------|
| 首页 | `/` |
| 冰山广场 | `/iceberg/list` |
| 冰山详情 | `/iceberg/[slug]` |
| 创建/编辑冰山图 | `/iceberg/new` `/iceberg/edit/[id]` |
| 排行榜 | `/leaderboard` |
| 创意板 | `/ideas` |
| 功能大厅 | `/sitemap` |
| 个人主页 | `/user/[id]` |
| 机构 | `/org` |
| RfA 选举 | `/rfa` `/elections` `/impeach` |
| 使用指南 | `/guide` |
| 平台规则 | `/rules` |
| 反馈 | `/feedback` |

## 目录结构

```
frontend/src/
├── components/
│   ├── admin/          # 管理面板（审核/用户/设置…）
│   ├── iceberg/        # 冰山编辑器、列表、弹窗、评论…
│   ├── ui/             # Toast、骨架屏、成就弹窗
│   ├── user/           # 用户中心、设置、成就展示
│   ├── LoginForm.tsx
│   └── NavBar.tsx
├── hooks/              # useModalAnimation
├── layouts/
│   └── Layout.astro    # 全局布局 + 设计系统
├── lib/
│   ├── auth/           # 认证、限流、OAuth 挑战…
│   ├── achievementService.ts / achievementEngine.ts
│   ├── permissions.ts  # RBAC 权限控制
│   ├── icebergTopic.ts # 主题分类
│   ├── features.ts     # 功能开关
│   └── api.ts          # 统一 API 响应格式
├── pages/
│   ├── api/            # REST API 端点
│   ├── iceberg/        # 冰山图页面
│   ├── user/           # 用户页面
│   └── ...             # 其他页面
├── stores/
│   └── icebergStore.ts # Zustand 编辑器状态
└── styles/
    └── global.css      # 全局样式 + CSS 变量
```

## 设计系统

暗色主题，品牌色 `#00FF41`（终端绿）。CSS 变量定义在 `:root`，浅色模式通过 `html.light` 覆盖。

- 背景层级：`#0d1117` → `#161b22` → `#1c2128` → `#21262d`
- 字体：Space Grotesk（UI） + Space Mono（代码） + MiSans Normal（中文）
