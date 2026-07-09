<p align="center">
  <img src="public/favicon.svg" width="80" />
</p>

<h1 align="center">冰山图宇宙 · Iceberg Universe</h1>

<p align="center">
  <a href="https://icebergs.gnix807.cn">
    <img src="https://img.shields.io/badge/website-online-00FF41?style=flat-square" alt="website" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs" />
  </a>
</p>

<br />

一个以「冰山图」为核心的社区驱动知识平台。将任意话题按认知深度分层拆解，从大众常识到冷门深水区。

---

## 目录

- [项目简介](#项目简介)
- [功能](#功能)
- [技术栈](#技术栈)
- [本地开发](#本地开发)
- [部署](#部署)
- [贡献](#贡献)
- [作者与致谢](#作者与致谢)
- [许可证](#许可证)

---

## 项目简介

冰山图（Iceberg Chart）是一种特殊的知识呈现形式：将一个话题按「从浅到深」拆解为多个层级，每个层级列出若干条目并附上解释。水面之上的常识只是冰山一角——真正的庞大信息藏在水下。

**冰山图宇宙**是一个开放社区，任何人都可以：

- 浏览别人建好的冰山图
- 自己创建冰山图（可视化编辑器）
- 邀请他人协作编辑
- 投票、评论、解锁成就
- 参与社区治理

目前站内已上线的冰山图包括：

| | |
|---|---|
| 🕳️ **中文兔子洞冰山图【重制版】** | 一旦点进去就再也出不来的互联网深坑 |
| 🤪 **奇异搞笑互联网冰山图（持续更新）** | 早期论坛神帖、抽象文化名场面 |
| 📼 **中文失传媒体冰山图（提案征集中）** | 曾经存在但今天难以寻觅的中文内容 |

在线地址：**[icebergs.gnix807.cn](https://icebergs.gnix807.cn)**

---

## 功能

**核心**

| 模块 | 说明 |
|---|---|
| 冰山图编辑器 | 可视化拖拽编辑，Markdown + KaTeX，撤销/重做，自动保存草稿 |
| 全文搜索 | 中英文混合检索，Ctrl+K 全局呼出，300ms 防抖 |
| 词条弹窗 | 异步加载描述，键盘 ← → 导航，来源链接 |
| 导出图片 | 一键将冰山图导出为 PNG 信息图 |

**社区**

| 模块 | 说明 |
|---|---|
| 投票 & 评论 | 每个冰山都可互动，每次操作累积品质分 |
| 品质分 & 成就 | 34+ 种成就徽章（传说/史诗/稀有/普通），活跃即解锁 |
| 排行榜 | 热门/高赞双榜，前三名金银铜专属边框 |
| 内容审核 | 提交 → 编辑审核 → 发布流程，含自动检查清单 |

**进阶**

| 模块 | 说明 |
|---|---|
| 创意板 | 35 种话题分类，看板 + 列表双视图，多人认领 |
| 专题协作 | 开项目组，看板任务管理，成员邀请，多人编修 |
| RBAC 权限 | USER / CONTRIBUTOR / EDITOR / MODERATOR / ADMIN / FOUNDER 六层 |
| 社区治理 | RfA 编辑选举、管理员弹劾、举报处理、反馈跟踪 |
| 管理面板 | 用户管理、审核队列、系统配置、SEO 管理、成就配置 |

**体验**

| 模块 | 说明 |
|---|---|
| 双色主题 | 暗色终端绿 + 浅色模式，CRT 复古扫描线效果（可开关） |
| 移动端适配 | 44px 触控区域，响应式布局，iOS 安全区域适配 |
| SEO | Open Graph + Twitter Card + JSON-LD + Sitemap.xml + Robots.txt |
| 性能 | 描述按需异步加载，content-visibility 延迟渲染，DB 复合索引 |

---

## 技术栈

| 类别 | 技术 |
|---|---|
| 框架 | Astro 5 (SSR) + React 19 (Islands 架构) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS + 自定义 CSS 变量 |
| 数据库 | PostgreSQL 18 + Prisma ORM |
| 全文搜索 | PostgreSQL tsvector + GIN 索引 |
| 状态管理 | Zustand（含撤销/重做命令栈） |
| 拖拽 | @dnd-kit |
| 认证 | GitHub OAuth + Google OAuth + 邮箱密码 |
| 部署 | Node.js standalone + Docker Compose |

---

## 本地开发

### 环境要求

- Node.js 22+
- PostgreSQL 18
- Git

### 启动

```bash
git clone https://github.com/Gnix807/icebergs-1.0.git
cd icebergs-1.0/frontend
cp .env.example .env
npm install
npx prisma db push && npx prisma generate
node prisma/seed.mjs && node prisma/seed-achievements.mjs
psql -d icebergs -f prisma/migrations/001_fulltext_search.sql
npm run dev
```

开发服务器运行在 `http://localhost:4321`。

### 常用命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 生产构建
npm run check    # TypeScript 类型检查
npx prisma studio # 数据库可视化管理
```

---

## 部署

### Docker Compose（推荐）

```bash
git clone https://github.com/Gnix807/icebergs-1.0.git /opt/icebergs
cd /opt/icebergs
cp .env.docker .env      # 编辑填入 OAuth 密钥和域名
docker compose up -d     # 自动建库、迁移、种子、启动
```

启动后用 nginx 反代到 `127.0.0.1:4321`，配置 SSL 证书。

```bash
# 更新
git pull && docker compose up -d --build

# 备份
docker compose exec db pg_dump -U icebergs icebergs > backup.sql
```

### 手动部署

```bash
cp .env.example .env     # 填入数据库连接、OAuth 密钥、域名
npm install
npx prisma generate && npx prisma db push
node prisma/seed.mjs && node prisma/seed-achievements.mjs
psql -d icebergs -f prisma/migrations/001_fulltext_search.sql
npm run build
node dist/server/entry.mjs   # 用 PM2 或 systemd 托管
```

### 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | 是 | PostgreSQL 连接串 |
| `GITHUB_CLIENT_ID` | 是 | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | 是 | GitHub OAuth App Client Secret |
| `GOOGLE_CLIENT_ID` | 否 | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | 否 | Google OAuth Client Secret |
| `REDIRECT_URI` | 是 | OAuth 回调完整地址 |
| `CRON_SECRET` | 生产必填 | Cron 端点鉴权密钥 |
| `NODE_ENV` | 否 | `development` / `production` |

---

## 贡献

欢迎任何形式的参与——Bug 修复、新功能、文档改进、翻译。

```bash
git clone https://github.com/Gnix807/icebergs-1.0.git
cd icebergs-1.0/frontend
cp .env.example .env
npm install
npm run dev
```

提交前请运行 `npm run check` 确保类型检查通过，并保持与现有代码风格一致。

对于较大的改动，建议先开 Issue 讨论方向。

---

## 作者与致谢

本项目由 [Gnix807](https://github.com/Gnix807) 创建并维护。

大量代码借助以下 AI 工具完成——一个人 + AI，做出了以往需要一个团队才能完成的全栈项目：

| 工具 | 主要贡献 |
|---|---|
| **Claude / Claude Code** | 架构设计、功能开发、调试 |
| **OpenCode** | 代码审查、重构、部署 |
| **DeepSeek** | 后端逻辑、数据处理 |
| **GPT / ChatGPT** | 前端组件、UI 交互 |

同时也感谢 **Astro**、**React**、**Prisma**、**PostgreSQL** 等开源项目。

---

## 许可证

[MIT](LICENSE)
