<p align="center">
  <img src="public/readme-banner.svg" alt="Iceberg Universe" />
</p>

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

一个以「冰山图」为核心的社区驱动知识平台。将任意话题按认知深度分层拆解——从大众常识到冷门深水区。任何人可以浏览、创建、协作编辑冰山图，参与投票评论和社区治理。

在线地址：**[icebergs.gnix807.cn](https://icebergs.gnix807.cn)**

---

## 目录

- [项目简介](#项目简介)
- [功能](#功能)
- [截图](#截图)
- [技术栈](#技术栈)
- [环境要求](#环境要求)
- [安装](#安装)
- [使用](#使用)
- [部署](#部署)
- [贡献](#贡献)
- [项目状态](#项目状态)
- [计划](#计划)
- [支持](#支持)
- [变更记录](#变更记录)
- [作者与致谢](#作者与致谢)
- [许可证](#许可证)

---

## 项目简介

冰山图（Iceberg Chart）是一种特殊的知识呈现形式：将一个话题按「从浅到深」拆解为多个层级，每层列出若干条目并附上解释。水面之上只是冰山一角——真正庞大的信息藏在水下。

**冰山图宇宙**是一个围绕这种形式构建的开放社区。区别于 Reddit 帖子或零散博客——这里的信息被组织成结构化、可协作、可沉淀的知识地图。

目前站内已有三座冰山图：

| | |
|---|---|
| 🕳️ **中文兔子洞冰山图【重制版】** | 点进去就再也出不来的互联网深坑 |
| 🤪 **奇异搞笑互联网冰山图（持续更新）** | 早期论坛神帖、抽象文化名场面 |
| 📼 **中文失传媒体冰山图（提案征集中）** | 曾经存在但今天难以寻觅的中文内容 |

---

## 功能

**核心体验**

| 功能 | 说明 |
|---|---|
| 冰山图编辑器 | 可视化拖拽编辑，支持 Markdown + KaTeX 公式，Ctrl+Z/Y 撤销重做，自动保存草稿，多人协作编辑 |
| 词条弹窗 | 异步加载描述内容，键盘 ← → 逐条浏览，一键复制链接 |
| 全文搜索 | 中英文混合检索，Ctrl+K 全局热键呼出，300ms 防抖 |
| 双色主题 | 暗色终端绿（品牌色 `#00FF41`）+ 浅色模式，可选 CRT 复古扫描线效果 |
| 移动端适配 | 44px 最小触控区域，响应式布局，iOS 安全区域适配 |

**社区机制**

| 功能 | 说明 |
|---|---|
| 投票 & 评论 | 每个冰山图都可以投票（赞成/反对）和评论讨论 |
| 品质分 & 成就 | 浏览、投票、评论、创建均累积品质分；34+ 种成就徽章（传说/史诗/稀有/普通），活跃即解锁 |
| 排行榜 | 热门 + 高赞双榜，前三名金银铜专属边框，支持时间段筛选 |
| 内容审核 | 提交 → 编辑审核 → 发布流程，含提交前自动检查清单（标题长度、层级数、条目密度） |
| RBAC 权限 | USER / CONTRIBUTOR / EDITOR / MODERATOR / ADMIN / FOUNDER 六层角色体系 |

**进阶功能**

| 功能 | 说明 |
|---|---|
| 创意板 | 35 种话题分类，看板 + 列表双视图，可提交创意让他人认领实现 |
| 专题协作 (WikiProject) | 开项目组，看板任务管理，成员邀请，多人协同编修 |
| 社区治理 | RfA 公开选举编辑资格，管理员弹劾机制，举报处理，反馈跟踪 |
| 管理面板 | 用户管理、审核队列、系统配置、成就配置、SEO 管理 |
| 导出图片 | 一键将冰山图导出为含水印的 PNG 信息图 |
| SEO | Open Graph + Twitter Card + JSON-LD 结构化数据 + Sitemap.xml + Robots.txt |

---

## 截图

<p align="center">
  <strong>首页</strong><br />
  <img src="public/screenshots/homepage.png" alt="首页" width="70%" />
</p>

<p align="center">
  <strong>冰山图浏览</strong><br />
  <img src="public/screenshots/iceberg.png" alt="冰山图浏览" width="70%" />
</p>

<p align="center">
  <strong>编辑器</strong><br />
  <img src="public/screenshots/editor.png" alt="编辑器" width="70%" />
</p>

---

## 技术栈

<p align="center">
  <img src="https://go-skill-icons.vercel.app/api/icons?i=astro,react,typescript,tailwindcss,postgresql,prisma,docker,nodejs" alt="tech stack" />
  <br />
  <sub>Astro · React · TypeScript · Tailwind CSS · PostgreSQL · Prisma · Docker · Node.js</sub>
</p>

- **框架** — Astro 5 (SSR) + React 19 (Islands 架构)，Zustand 状态管理，@dnd-kit 拖拽
- **认证** — GitHub OAuth + Google OAuth + 邮箱密码登录
- **搜索** — PostgreSQL tsvector + GIN 全文索引，中英文混合
- **部署** — Node.js standalone + Docker Compose 一键部署

---

## 环境要求

| 依赖 | 最低版本 | 说明 |
|---|---|---|
| Node.js | 22+ | 运行环境和包管理 |
| PostgreSQL | 18 | 数据库，需启用 pg_trgm 扩展 |
| Git | 任意 | 克隆仓库 |
| npm | 随 Node.js 附带 | 包管理 |

> 如果你使用 Docker Compose 部署，以上依赖由容器自动提供，无需手动安装。

---

## 安装

### 本地开发环境

```bash
# 1. 克隆仓库
git clone https://github.com/Gnix807/icebergs-1.0.git
cd icebergs-1.0/frontend

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，至少填入 DATABASE_URL 和 GitHub OAuth 凭据

# 3. 安装依赖
npm install

# 4. 初始化数据库
npx prisma db push
npx prisma generate

# 5. 导入种子数据
node prisma/seed.mjs                    # 基础数据（角色、设置）
node prisma/seed-achievements.mjs       # 成就定义
node prisma/seed-demo.mjs               # 可选：演示冰山图

# 6. 创建全文搜索索引
psql -d icebergs -f prisma/migrations/001_fulltext_search.sql

# 7. 启动开发服务器
npm run dev
```

开发服务器运行在 `http://localhost:4321`。

### 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | 是 | PostgreSQL 连接串，格式 `postgresql://user:password@host:port/db` |
| `GITHUB_CLIENT_ID` | 是 | GitHub OAuth App 的 Client ID |
| `GITHUB_CLIENT_SECRET` | 是 | GitHub OAuth App 的 Client Secret |
| `GOOGLE_CLIENT_ID` | 否 | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | 否 | Google OAuth Client Secret |
| `REDIRECT_URI` | 是 | OAuth 回调完整地址，开发环境为 `http://localhost:4321/api/auth/callback` |
| `CRON_SECRET` | 生产必填 | Cron 端点鉴权密钥，随机字符串 |
| `NODE_ENV` | 否 | `development` 或 `production` |

`.env.example` 和 `.env.docker` 提供了完整模板，复制后填写即可。

---

## 使用

### 作为用户

访问 **[icebergs.gnix807.cn](https://icebergs.gnix807.cn)**，注册账号后即可：

- 浏览、搜索冰山图
- 创建自己的冰山图（可视化编辑器）
- 投票、评论
- 查看排行榜和成就

详细操作见 → **[使用指南](https://icebergs.gnix807.cn/guide)**

### 开发命令

```bash
npm run dev        # 启动开发服务器（端口 4321）
npm run build      # 生产构建
npm run check      # TypeScript 类型检查
npx prisma studio  # 数据库可视化管理界面
npx prisma db push # 同步 Prisma Schema 到数据库
```

---

## 部署

### Docker Compose（推荐）

```bash
git clone https://github.com/Gnix807/icebergs-1.0.git /opt/icebergs
cd /opt/icebergs
cp .env.docker .env                  # 编辑填入 OAuth 密钥和域名
docker compose up -d                 # 自动建库、迁移、种子、启动
```

容器启动后自动完成：等待数据库就绪 → 执行迁移 → 导入种子数据 → 创建全文索引 → 启动应用。

之后用 nginx 或 1Panel 反代到 `127.0.0.1:4321`，配置 SSL 证书。

```bash
# 更新到最新版本
git pull && docker compose up -d --build

# 数据库备份
docker compose exec db pg_dump -U icebergs icebergs > backup.sql
```

### 手动部署

```bash
cp .env.example .env                 # 填写所有生产环境变量
npm install
npx prisma generate && npx prisma db push
node prisma/seed.mjs && node prisma/seed-achievements.mjs
psql -d icebergs -f prisma/migrations/001_fulltext_search.sql
npm run build
node dist/server/entry.mjs           # 用 PM2 或 systemd 托管
```

部署后还需配置：
- nginx 反向代理 + SSL 证书
- GitHub / Google OAuth App 回调地址更新为生产域名
- （可选）Cron 定时任务（选举推进、RfA 推进、弹劾推进）

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

### 提交前

```bash
npm run check    # TypeScript 类型检查，确保无报错
npm run build    # 验证构建是否通过
```

- 代码风格请保持与现有代码一致（Space Mono 等宽字体风格，终端绿主题 CSS 变量命名）
- 新功能建议先[开 Issue](https://github.com/Gnix807/icebergs-1.0/issues) 讨论方向
- 文档改进、翻译、拼写修正可直接提 PR

---

## 项目状态

项目处于 **活跃开发中**（Active Development）。

核心功能（浏览、创建、社区互动、成就系统、权限管理）已稳定运行，持续添加新功能并修复已知 Bug。

---

## 计划

- [ ] 国际化支持 (i18n)
- [ ] 更丰富的导出格式（JSON、Markdown）
- [ ] 第三方登录扩展（微信、GitLab）
- [ ] 数据统计仪表盘
- [ ] 开放 API 接口
- [ ] 自动化测试覆盖

---

## 支持

所有问题通过 [GitHub Issues](https://github.com/Gnix807/icebergs-1.0/issues) 提交：

- 🐛 **Bug 反馈** — 请附上复现步骤和截图
- 💡 **功能建议** — 描述使用场景和期望效果
- ❓ **使用问题** — 尽量描述清楚你在哪个页面、操作了什么

---

## 变更记录

详细的版本更新记录见站内 → **[Changelog](https://icebergs.gnix807.cn/changelog)**

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

同时也感谢 **Astro**、**React**、**Prisma**、**PostgreSQL** 等开源基础设施。

---

## 许可证

[MIT](LICENSE)
