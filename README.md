# 🧊 冰山图宇宙 · Iceberg Universe

> 任何话题的表面之下，都藏着一座冰山。

**icebergs.gnix807.cn** 是一个以「冰山图」为核心的社区驱动知识平台。每个人都可以在这里浏览、创建和分享冰山图——把任意话题按「大众认知 → 深层奥秘」分层拆解，挖出水面之下不为人知的细节。

---

## 什么是冰山图？

冰山图是一种将主题知识按认知深度分层呈现的结构化内容形式。最上层是大众常识，越往下越冷门、越硬核、越细思极恐。从都市传说、散佚媒体到被遗忘的历史和技术深挖——只要你对某个领域了解够深，就能建一座冰山。

---

## 功能

### 核心体验
- **冰山图编辑器** — 可视化拖拽编辑，Markdown + KaTeX 公式支持，Ctrl+Z/Y 撤销重做，自动保存草稿，多人协作
- **词条弹窗** — 异步加载描述，键盘 ← → 导航，来源链接
- **全文搜索** — 中英文混合搜索，Ctrl+K 全局呼出
- **双色主题** — 暗色终端绿 + 浅色模式，可选 CRT 复古扫描线效果
- **移动端适配** — 响应式布局，触控友好

### 社区机制
- **投票 & 评论** — 每个冰山都可以投票、评论、讨论
- **品质分 & 成就** — 活跃行为累积品质分，解锁 34+ 种成就徽章（传说/史诗/稀有/普通）
- **排行榜** — 热门/高赞双榜，金银铜 Hero 展示区
- **内容审核** — 提交→编辑审核→发布流程，含提交前自动检查清单

### 进阶功能
- **专题协作 (WikiProject)** — 看板任务、成员邀请、讨论区、多人协作编辑
- **创意板** — 35 种话题分类，多人认领，看板+列表双视图
- **RBAC 权限** — USER / CONTRIBUTOR / EDITOR / MODERATOR / ADMIN / FOUNDER 六层体系
- **社区治理** — RfA 编辑选举、管理员弹劾、举报处理
- **管理员面板** — 用户管理、审核队列、系统配置、成就配置、SEO 管理

---

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Astro 5 SSR + React 19 Islands |
| 样式 | Tailwind CSS + 自定义 CSS 变量 |
| 数据库 | PostgreSQL 18 + Prisma ORM |
| 搜索 | PostgreSQL Full-Text Search (tsvector + GIN) |
| 状态管理 | Zustand（撤销/重做命令栈） |
| 拖拽 | @dnd-kit |
| 认证 | GitHub OAuth + Google OAuth + 邮箱密码 |
| 字体 | Space Grotesk + Space Mono + MiSans |
| 部署 | Node.js standalone + Docker Compose |

---

## 快速开始

### 环境要求
- Node.js 22+
- PostgreSQL 18
- Git

### 安装

```bash
git clone https://github.com/Gnix807/icebergs-1.0.git
cd icebergs-1.0/frontend

cp .env.example .env    # 编辑填入数据库连接串和 OAuth 凭据

npm install
npx prisma db push
npx prisma generate
node prisma/seed.mjs
node prisma/seed-achievements.mjs

psql -d icebergs -f prisma/migrations/001_fulltext_search.sql

node prisma/seed-demo.mjs   # 可选：生成演示数据

npm run dev                 # http://localhost:4321
```

### Docker Compose

```bash
cp .env.docker .env         # 编辑填入 OAuth 密钥
docker compose up -d
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run check` | TypeScript 类型检查 |
| `npx prisma studio` | 数据库 GUI |
| `npx prisma db push` | 同步 Schema |

---

## 项目结构

```
frontend/
├── prisma/                  # Schema + 迁移 + 种子
├── src/
│   ├── components/
│   │   ├── admin/           # 管理面板
│   │   ├── iceberg/         # 冰山编辑器、列表、弹窗、评论
│   │   ├── user/            # 用户中心、设置、成就
│   │   └── ui/              # Toast、骨架屏、成就弹窗
│   ├── layouts/Layout.astro # 全局布局 + SEO + 分析
│   ├── lib/                 # 认证、权限、成就、通知、API 工具
│   ├── middleware.ts        # 速率限制
│   ├── pages/
│   │   ├── api/             # REST API 路由
│   │   ├── iceberg/         # 冰山图浏览/编辑/列表
│   │   ├── projects/        # 专题协作
│   │   ├── ideas/           # 创意板
│   │   └── ...              # 排行榜、精选、指南等
│   ├── stores/              # Zustand 状态
│   └── styles/global.css    # 全局样式 + CSS 变量
├── docker-compose.yml
└── package.json
```

---

## 设计系统

品牌色 `#00FF41`（终端绿），CSS 变量定义于 `:root`，浅色模式通过 `html.light` 覆盖。

| 层级 | 色值 | 用途 |
|------|------|------|
| 背景 0 | `#0d1117` | 页面基底 |
| 背景 1 | `#161b22` | 卡片容器 |
| 背景 2 | `#1c2128` | 悬浮层 |
| 背景 3 | `#21262d` | 高亮边框 |

字体：Space Grotesk（标题）+ Space Mono（等宽）+ MiSans Normal（中文正文）。

---

## 致谢

本项目借助了以下 AI 模型和工具完成开发：

- **[Claude](https://claude.ai) / [Claude Code](https://docs.anthropic.com/en/docs/claude-code)** — Anthropic 的 AI 编程助手，承担了大部分功能的架构设计、代码实现和调试工作
- **[OpenCode](https://opencode.ai)** — 终端 AI 编程工具，负责代码审查、重构和部署流程
- **[DeepSeek](https://deepseek.com)** — 辅助部分后端逻辑和数据处理任务的实现
- **[GPT / ChatGPT](https://chat.openai.com)** — 辅助部分前端组件和 UI 交互的设计与实现

没有这些工具的辅助，一个人不可能在短时间内完成这个体量的全栈项目。

同时也感谢 **Astro**、**React**、**Prisma**、**PostgreSQL** 等开源项目提供的优秀基础设施。

---

## 许可

[MIT License](LICENSE)
