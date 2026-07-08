# 冰山图宇宙 (Iceberg Universe)

> 一个以「冰山图」为核心的知识探索与分享社区。任何话题的表面之下，都藏着冰山。

## 什么是冰山图？

冰山图是一种将特定主题的知识按「大众认知 → 深层奥秘」分层呈现的结构化内容形式。就像冰山一样，浮出水面的只是表层常识，真正庞大而有趣的部分藏在水面之下，从社区理论、散佚媒体到被遗忘的历史和深挖研究。

## 技术栈

| 层 | 技术 |
|---|---|---|
| 框架 | Astro 5 SSR + React 19 Islands |
| 样式 | Tailwind CSS + 自定义 CSS 变量 |
| 数据库 | PostgreSQL + Prisma ORM |
| 搜索 | PostgreSQL Full-Text Search (tsvector + GIN) |
| 状态管理 | Zustand（含撤销/重做命令栈） |
| 拖拽 | @dnd-kit |
| 认证 | GitHub OAuth + 邮箱密码 |
| 字体 | Space Grotesk + Space Mono + MiSans |
| SEO | Open Graph + Twitter Card + JSON-LD 结构化数据 + Sitemap.xml |
| 分析 | Google Analytics 4 + 百度统计（管理面板配置） |

## 功能概览

- **冰山图创建器** — 多层拖拽编辑器，Markdown + KaTeX，Ctrl+Z/Y 撤销重做，词条导入（icebergthreads 一键抓取）
- **词条弹窗阅读** — 异步加载描述，键盘 ← → 导航，链接复制，防 ViewTransitions 冲突
- **全文搜索** — 中英文混合搜索，Ctrl+K 全局搜索，300ms 防抖
- **性能优化** — 描述按需异步加载（页面体积 -95%），content-visibility 延迟渲染，保存时预渲染 Markdown，DB 复合索引，速率限制中间件
- **移动端适配** — 44px 触控区域，响应式弹窗与通知下拉，iOS 安全区域适配底部导航
- **专题协作 (WikiProject)** — 创建协作项目，看板任务管理，成员邀请，讨论区，多人协作编辑
- **创意板** — 看板+列表双视图，35 种话题筛选，多人认领，评论讨论，短 ID 引用
- **主题门户** — 按 35 个分类浏览冰山图与创意，148→4 次查询聚合优化
- **精选内容** — 管理员甄选优质冰山图集中展示
- **排行榜** — 热门/高赞/用户三标签页，时间段筛选，前三名 Hero 展示区
- **质量分与成就** — 34 个新增成就（含 12 个协作），稀有度分级（传说/史诗/稀有/普通），复核检测
- **词条标签系统** — 169 个预设标签，分标记/内容/来源三大类
- **SEO 地基** — Open Graph / Twitter Card 全站标签，JSON-LD 结构化数据，Sitemap.xml + Robots.txt，SEO 管理面板（站长验证、分析代码注入、自定义 head）
- **社区审核** — 内容提交→编辑审核→发布，含提交前检查清单
- **RBAC 权限系统** — USER / CONTRIBUTOR / EDITOR / MODERATOR / ADMIN / FOUNDER
- **社区治理** — RfA 编辑选举、管理员弹劾、举报处理、反馈跟踪
- **双色主题** — 暗色终端绿 + 浅色模式，可选 CRT 复古扫描线效果
- **导出图片** — 一键生成含水印的 PNG 信息图

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

# 4. 初始化数据库并导入种子数据
npx prisma db push
npx prisma generate
node prisma/seed.mjs
node prisma/seed-achievements.mjs

# 5. 初始化全文搜索索引
psql -d icebergs -f prisma/migrations/001_fulltext_search.sql

# 6. 启动（开发端口4321会自增）
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
│   │   ├── admin/                # 管理面板（含 SEO 管理）
│   │   ├── iceberg/              # 冰山编辑器、列表、弹窗、评论
│   │   ├── nav/                  # 导航组件
│   │   ├── ui/                   # Toast、骨架屏、成就弹窗
│   │   ├── user/                 # 用户中心、设置、成就
│   │   ├── ErrorBoundary.tsx     # React 错误边界
│   │   ├── LoginForm.tsx         # 登录/注册表单
│   │   └── NavBar.tsx            # 全局导航栏
│   ├── hooks/                    # React Hooks
│   ├── layouts/
│   │   └── Layout.astro          # 全局布局 + SEO 标签 + 分析注入
│   ├── lib/
│   │   ├── auth/                 # 认证、限流、OAuth
│   │   ├── achievement*.ts       # 成就系统
│   │   ├── permissions.ts        # RBAC 权限
│   │   ├── api.ts                # 统一 API 响应
│   │   └── notify.ts             # 站内通知
│   ├── middleware.ts             # 速率限制 + 慢请求日志
│   ├── pages/
│   │   ├── api/
│   │   │   ├── admin/            # 管理 API（含 seo/stats + seo/audit）
│   │   │   ├── items/[id]/desc.ts # 词条描述懒加载
│   │   │   └── health.ts         # 健康检查
│   │   ├── iceberg/              # 冰山图浏览/编辑/列表/随机/导入
│   │   ├── projects/             # 专题协作组
│   │   ├── topic/                # 主题门户
│   │   ├── ideas/                # 创意板
│   │   ├── guide/                # 使用指南 + 写作指南
│   │   ├── user/                 # 用户中心
│   │   ├── featured.astro        # 精选内容
│   │   ├── leaderboard.astro     # 排行榜
│   │   ├── changelog.astro       # 更新日志
│   │   ├── sitemap.xml.ts        # 搜索引擎 XML 站点地图
│   │   ├── robots.txt.ts         # 搜索引擎爬虫规则
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
