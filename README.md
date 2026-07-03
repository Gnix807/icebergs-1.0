# 冰山图宇宙 (Iceberg Universe)

> 一个以「冰山图」为核心的知识探索与分享社区。任何话题的表面之下，都藏着冰山。

## 什么是冰山图？

冰山图是一种将特定主题的知识按「大众认知 → 深层奥秘」分层呈现的结构化内容形式。就像冰山一样，浮出水面的只是表层常识，真正庞大而有趣的部分藏在水面之下，从社区理论、散佚媒体到被遗忘的历史和深挖研究。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Astro 5 SSR + React 19 Islands |
| 样式 | Tailwind CSS + 自定义 CSS 变量 |
| 数据库 | PostgreSQL + Prisma ORM |
| 搜索 | PostgreSQL Full-Text Search (tsvector + GIN) |
| 状态管理 | Zustand |
| 拖拽 | @dnd-kit |
| 认证 | GitHub OAuth + 邮箱密码 |
| 字体 | Space Grotesk + Space Mono + MiSans |

## 功能概览

- **冰山图创建器** — 多层拖拽编辑器，支持 Markdown + KaTeX 数学公式
- **词条弹窗阅读** — 点击任意词条弹出详情，键盘 ← → 导航，支持链接复制
- **全文搜索** — 中英文混合搜索，覆盖冰山图标题、描述和词条内容
- **社区审核** — 内容提交 → 编辑审核 → 发布，含提交前检查清单
- **排行榜** — 按浏览量 / 点赞数排名，支持周/月/全时段
- **质量分与成就** — 阅读/创作/投票/收藏可解锁成就，分 14 个类别
- **创意板** — 提交创意，社区认领并完成
- **RBAC 权限系统** — USER / CONTRIBUTOR / EDITOR / MODERATOR / ADMIN / FOUNDER
- **社区治理** — RfA 编辑选举、管理员弹劾、站长轮换制
- **暗色主题** — 终端绿 (#00FF41) 品牌色，适配浅色模式

## 快速开始

### 环境要求

- Node.js 22+
- PostgreSQL 18
- Git

### 安装

```bash
# 1. 克隆项目
git clone https://github.com/Gnix807/icebergs-1.0.git
cd icebergs-1.0/frontend

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入数据库连接串和 GitHub OAuth 凭据

# 3. 安装依赖
npm install

# 4. 初始化数据库
npx prisma db push
npx prisma generate

# 5. 初始化全文搜索索引
psql -d icebergs -f prisma/migrations/001_fulltext_search.sql

# 6. 启动
npm run dev
```

开发服务器默认运行在 `http://localhost:4321`。

### 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret |
| `REDIRECT_URI` | OAuth 回调地址 |
| `NODE_ENV` | 运行环境 (`development` / `production`) |
| `CRON_SECRET` | Cron 端点鉴权密钥 |

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run check` | TypeScript 类型检查 |
| `npx prisma studio` | 数据库可视化管理 |
| `npx prisma db push` | 同步 Schema 到数据库 |

## 项目结构

```
frontend/
├── prisma/
│   ├── schema.prisma              # 数据模型定义
│   └── migrations/               # SQL 迁移脚本
├── public/                       # 静态资源
├── src/
│   ├── components/
│   │   ├── admin/                # 管理面板
│   │   ├── iceberg/              # 冰山编辑器、列表、弹窗、评论
│   │   ├── nav/                  # 导航组件
│   │   ├── ui/                   # Toast、骨架屏、成就弹窗
│   │   ├── user/                 # 用户中心、设置、成就
│   │   ├── LoginForm.tsx         # 登录/注册表单
│   │   └── NavBar.tsx            # 全局导航栏
│   ├── hooks/                    # React Hooks
│   ├── layouts/
│   │   └── Layout.astro          # 全局布局 + 设计系统
│   ├── lib/
│   │   ├── auth/                 # 认证、限流、OAuth
│   │   ├── achievement*.ts       # 成就系统
│   │   ├── permissions.ts        # RBAC 权限
│   │   ├── api.ts                # 统一 API 响应
│   │   └── notify.ts             # 站内通知
│   ├── pages/
│   │   ├── api/                  # REST API 端点
│   │   ├── iceberg/              # 冰山图页面
│   │   ├── user/                 # 用户页面
│   │   ├── ideas/                # 创意板
│   │   └── ...                   # 其他页面
│   ├── stores/
│   │   └── icebergStore.ts       # 编辑器状态
│   └── styles/
│       └── global.css            # 全局样式 + CSS 变量
├── .env.example                  # 环境变量模板
├── tailwind.config.mjs
├── tsconfig.json
├── astro.config.mjs
└── package.json
```

## 设计系统

暗色主题，品牌色 `#00FF41`（终端绿）。CSS 变量全局定义于 `:root`，浅色模式通过 `html.light` 覆盖。

| 层级 | 色值 | 用途 |
|------|------|------|
| 背景 0 | `#0d1117` | 页面基底 |
| 背景 1 | `#161b22` | 卡片容器 |
| 背景 2 | `#1c2128` | 悬浮层 |
| 背景 3 | `#21262d` | 高亮边框 |

字体组合：Space Grotesk（UI 标题） + Space Mono（等宽/代码） + MiSans Normal（中文正文）。

## 从 SQLite 迁移

项目最初使用 SQLite，已迁移至 PostgreSQL。如果手头有旧的 `dev.db` 文件：

```bash
# 将旧的 SQLite dev.db 放入 prisma/ 目录，然后执行：
node prisma/migrate-to-pg.mjs
```

## 许可

[MIT License](LICENSE)
