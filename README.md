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

> 你有没有过这种感觉——你以为自己很了解某件事，直到有一天发现，那只是冰山一角。

**冰山图宇宙**是一个社区驱动的知识平台。每个人都可以在这里把任意话题按「从浅到深」拆解成一座冰山，也可以浏览别人建好的冰山、投票、评论、解锁成就。完全免费，无需下载。

---

## 为什么建这个？

互联网上有大量零散的「冷知识」「深层资料」——它们分散在 Reddit 帖子、YouTube 评论区、个人博客里。冰山图把这些碎片组织起来，变成一张可浏览、可协作、可沉淀的地图。

这里没有算法推荐，没有信息流。**你来决定看什么、建什么。**

---

## 逛一逛

站上已经有各种话题的冰山，比如：

- 🕳️ **中文兔子洞冰山图【重制版】** — 那些一旦点进去就再也出不来的中文互联网深坑
- 🤪 **奇异搞笑互联网冰山图（持续更新）** — 从早期论坛神帖到抽象文化的离谱名场面
- 📼 **中文失传媒体冰山图（提案征集中）** — 曾经存在但如今难以寻觅的中文影像、文字、软件

你可以搜索、按分类筛选、点「随机」碰运气，或者直接看排行榜——**前三名有金银铜专属边框**。

---

## 建一座冰山

编辑器是可视化的：

1. 取个标题，写段简介
2. 添加层级（水面 → 浅水 → 深层 → 深渊……层数不限）
3. 在每层添加条目，写解释、打标签、附来源链接
4. 随时保存草稿，随时回来继续编辑
5. 还可以邀请别人**协作编辑**
6. 完成后提交审核——系统会自动检查标题长度、层级数量、条目密度是否达标

审核通过后，你的冰山就会出现在站上，供所有人浏览、投票、评论。

---

## 社区

每个冰山都可以**投票和评论**。高质量的内容会自然浮上排行榜。

每次互动（浏览、投票、评论、创建冰山）都会累积**品质分**。分数达到阈值会解锁**成就徽章**——

- :beginner: 访客 → :microscope: 研究员 → :chart_with_upwards_trend: 分析师 → :crown: 督导者

徽章显示在头像旁边，代表你在社区里的信誉值。一共有 34+ 种成就，包括「深夜访问」「连续打卡」「协作达人」等等。**半夜逛冰山真的会被发现。**

---

## 不只是冰山

除了核心的冰山图，站上还有：

- **创意板** — 35 个话题分类，如果你想看某个话题但还没人建冰山，可以先提个创意，别人来认领实现
- **专题协作** — 开一个 WikiProject，拉人组队，用看板管任务，一起建冰山
- **社区治理** — 编辑资格由 RfA 公开选举产生，管理员可以被弹劾。不是一个人说了算

---

## 设计

暗色主题，品牌色 `#00FF41`（终端绿）。老式 CRT 监视器质感——扫描线、噪点、亮度波动（可以在设置里开关）。

也有浅色模式，在设置里一键切。

---

## 贡献

欢迎任何形式的参与——不管你是写代码、做设计、写文档、报 bug、还是单纯来提想法。

### 本地开发

```bash
git clone https://github.com/Gnix807/icebergs-1.0.git
cd icebergs-1.0/frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:4321
```

### 在哪里帮忙

| 方向 | 说明 |
|---|---|
| 🐛 **Bug 修复** | Issue 区挑一个，或者自己发现了直接提 PR |
| ✨ **新功能** | 先开 Issue 讨论，避免方向跑偏 |
| 📝 **文档 & 翻译** | README、使用指南、i18n 翻译 |
| 🧊 **建冰山** | 直接在站上创建冰山图，就是最好的贡献 |
| 🔍 **审核** | 审核队列里还有未处理的冰山图和举报 |
| 🎨 **视觉** | 主题优化、动画调整、移动端适配 |

### 提交前

- TypeScript 类型检查：`npm run check`
- 生产构建验证：`npm run build`
- 保持跟现有代码风格一致（Space Mono 等宽字体，终端绿主题）

---

## 部署

### Docker Compose（推荐）

```bash
git clone https://github.com/Gnix807/icebergs-1.0.git /opt/icebergs
cd /opt/icebergs
cp .env.docker .env          # 编辑填入 OAuth 密钥
docker compose up -d          # 自动建库、迁移、种子、启动
```

之后用 nginx 反代到 `127.0.0.1:4321`，配好 SSL 证书即可。

**更新**：`git pull && docker compose up -d --build`

**备份**：`docker compose exec db pg_dump -U icebergs icebergs > backup.sql`

### 手动部署

环境要求：Node.js 22+，PostgreSQL 18，然后：

```bash
cp .env.example .env          # 填入数据库 + OAuth 配置
npm install
npx prisma generate && npx prisma db push
node prisma/seed.mjs && node prisma/seed-achievements.mjs
psql -d icebergs -f prisma/migrations/001_fulltext_search.sql
npm run build
node dist/server/entry.mjs    # 用 PM2 或进程守护托管
```

### 部署检查清单

- [ ] PostgreSQL 数据库已创建
- [ ] `.env` 中 `DATABASE_URL`、OAuth 密钥、`REDIRECT_URI` 已配置
- [ ] 全文搜索索引已初始化
- [ ] 反向代理 + SSL 证书已配置
- [ ] 浏览器打开域名确认可访问
- [ ] GitHub / Google OAuth 回调地址已更新为生产域名
- [ ] （可选）配置搜索引擎验证码 + 提交 sitemap

---

## 致谢

这个项目由一个人借助 AI 工具完成——从想法到上线、从数据模型到前端动画。

| 工具 / 模型 | 主要贡献 |
|---|---|
| **[Claude](https://claude.ai) / [Claude Code](https://docs.anthropic.com/en/docs/claude-code)** | 架构设计、功能开发、调试 |
| **[OpenCode](https://opencode.ai)** | 代码审查、重构、部署 |
| **[DeepSeek](https://deepseek.com)** | 后端逻辑、数据处理 |
| **[GPT / ChatGPT](https://chat.openai.com)** | 前端组件、UI 交互 |

也感谢 **Astro**、**React**、**Prisma**、**PostgreSQL** 等基础设施。

---

## 许可

[MIT](LICENSE)

---

<p align="center">
  <sub>Built with :green_heart: by <a href="https://github.com/Gnix807">Gnix807</a> and AI collaborators</sub>
</p>
