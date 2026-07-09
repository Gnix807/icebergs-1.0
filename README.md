<p align="center">
  <img src="public/favicon.svg" width="80" alt="Iceberg Universe" />
</p>

<h1 align="center">Iceberg Universe · 冰山图宇宙</h1>

<p align="center">
  <strong>把每个话题的未知领域挖出来</strong>
</p>

<p align="center">
  <a href="https://icebergs.gnix807.cn"><img src="https://img.shields.io/badge/website-online-00FF41" alt="Website" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License MIT" /></a>
  <a href="#"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome" /></a>
</p>

<br />

<p align="center">
  一个人人都可以浏览和创建的<strong>冰山图社区</strong>。<br />
  把任意话题按深度分层拆解——从人尽皆知到细思极恐。<br />
  完全免费，开源，由社区驱动。
</p>

<br />

---

## 什么是冰山图？

> 水面之上的只是冰山一角——而真正庞大的部分，藏在水下。

冰山图是一种结构化知识形式。把一个主题按「大众认知 → 深层奥秘」分成多个层级，每层列出若干条目并附上解释。越往下越冷门、越硬核。

从恐怖游戏到编程语言，从都市传说到互联网黑话——**任何话题都可以建一座冰山**。

---

## 功能


| 模块 | 说明 |
|---|---|
| :ice_cube: **冰山图编辑器** | 可视化拖拽编辑，Markdown + KaTeX，撤销/重做，自动保存 |
| :mag: **全文搜索** | 中英文混合搜索，Ctrl+K 全局呼出 |
| :bar_chart: **排行榜** | 热门/高赞双榜，前三名金银铜专属边框 |
| :trophy: **品质分 & 成就** | 34+ 种成就徽章（传说/史诗/稀有/普通），活跃即解锁 |
| :speech_balloon: **投票 & 评论** | 每个冰山都可互动，每次操作累积品质分 |
| :busts_in_silhouette: **协作编辑** | WikiProject 看板、成员邀请、多人编修 |
| :bulb: **创意板** | 35 种话题分类，看板+列表双视图，多人认领 |
| :shield: **RBAC 权限** | 六层角色体系 + RfA 选举 + 弹劾机制 |
| :art: **双色主题** | 暗色终端绿 + 浅色模式，CRT 复古扫描线 |
| :wrench: **管理面板** | 用户管理、审核队列、系统配置、SEO 管理 |
| :camera: **一键导出** | 将冰山图导出为 PNG 信息图 |

---

## 快速开始

```bash
git clone https://github.com/Gnix807/icebergs-1.0.git
cd icebergs-1.0/frontend

cp .env.example .env    # 填入数据库连接 + OAuth 凭据

npm install
npx prisma db push && npx prisma generate
node prisma/seed.mjs && node prisma/seed-achievements.mjs
psql -d icebergs -f prisma/migrations/001_fulltext_search.sql

npm run dev             # http://localhost:4321
```

### Docker

```bash
cp .env.docker .env
docker compose up -d
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | [Astro](https://astro.build) 5 + [React](https://react.dev) 19 |
| 样式 | [Tailwind CSS](https://tailwindcss.com) + 自定义 CSS 变量 |
| 数据库 | [PostgreSQL](https://postgresql.org) + [Prisma](https://prisma.io) |
| 搜索 | PostgreSQL Full-Text Search (tsvector + GIN) |
| 状态管理 | [Zustand](https://github.com/pmndrs/zustand) |
| 拖拽 | [@dnd-kit](https://dndkit.com) |
| 认证 | GitHub OAuth + Google OAuth + 邮箱密码 |
| 部署 | Node.js standalone + Docker Compose |

---

## 项目结构

```
frontend/
├── prisma/                   # Schema + 迁移 + 种子
├── src/
│   ├── components/
│   │   ├── admin/            # 管理面板
│   │   ├── iceberg/          # 冰山编辑器、列表、评论
│   │   ├── user/             # 用户中心、设置、成就
│   │   └── ui/               # Toast、骨架屏、成就弹窗
│   ├── layouts/Layout.astro  # 全局布局 + SEO + 分析
│   ├── lib/                  # 认证、权限、成就、通知
│   ├── middleware.ts         # 速率限制
│   ├── pages/
│   │   ├── api/              # REST API 路由
│   │   ├── iceberg/          # 冰山图浏览/编辑
│   │   ├── projects/         # 专题协作
│   │   └── ideas/            # 创意板
│   ├── stores/               # Zustand 状态
│   └── styles/global.css     # 全局样式
├── docker-compose.yml
└── package.json
```

---

## 贡献

欢迎提交 Issue 和 Pull Request。

---

## 致谢

本项目借助以下 AI 模型和工具完成开发——一个人 + AI，做出了以往需要一个团队才能完成的全栈项目。

| 工具 / 模型 | 主要贡献 |
|---|---|
| **[Claude](https://claude.ai) / [Claude Code](https://docs.anthropic.com/en/docs/claude-code)** | 架构设计、功能开发、调试 |
| **[OpenCode](https://opencode.ai)** | 代码审查、重构、部署 |
| **[DeepSeek](https://deepseek.com)** | 后端逻辑、数据处理 |
| **[GPT / ChatGPT](https://chat.openai.com)** | 前端组件、UI 交互 |

同时感谢 **Astro**、**React**、**Prisma**、**PostgreSQL** 等开源基础设施。

---

## 许可

[MIT](LICENSE)

---

<p align="center">
  <sub>Built with :green_heart: by <a href="https://github.com/Gnix807">Gnix807</a> and AI collaborators</sub>
</p>
