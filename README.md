# 冰山图宇宙

一个 SCP Foundation 风格的知识内容分享平台。用户可以创建和浏览"冰山图"——一种分层展示内容的可视化形式，表层为广为人知的事实，越往深处越冷僻小众。

## 技术栈

- **框架**：[Astro 5](https://astro.build/) + React 19（Islands 模式）
- **数据库**：Prisma 5 + SQLite
- **认证**：GitHub OAuth + 邮箱/密码
- **样式**：Tailwind CSS 3.4
- **拖拽**：@dnd-kit
- **状态**：Zustand 5（编辑器）

## 功能

- 冰山图创建与编辑（拖拽分层、自动保存）
- 内容审核队列（EDITOR 审核，ADMIN Override）
- RBAC 权限系统（USER / CONTRIBUTOR / EDITOR / MODERATOR / ADMIN）
- 成就系统（数据库配置型，无需改代码即可增删成就）
- RfA 晋升申请 + 弹劾系统 + 站长民主选举
- 评论、投票、收藏、站内通知、积分历史
- 管理后台（审核 / 晋升 / 举报 / 反馈 / 用户 / 申诉 / 选举 / 成就 / 系统配置）

## 快速开始

```bash
# 安装依赖
npm install

# 初始化数据库
npx prisma db push
node prisma/seed.mjs

# 启动开发服务器（端口 4321）
npm run dev
```

### 环境变量

复制 `.env.example` 为 `.env` 并填写：

```
DATABASE_URL="file:./dev.db"
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

## 开发命令

```bash
npm run dev      # 开发服务器
npm run build    # 生产构建
npm run check    # TypeScript 类型检查

npx prisma studio       # 可视化数据库
npx prisma db push      # 应用 schema 变更（可在 dev server 运行时执行）
npx prisma generate     # 重新生成 client（需先停止 dev server）
```

> **Windows 注意**：`prisma generate` 在 dev server 运行时会报 EPERM（DLL 占用），需先停服务再执行。

## 项目结构

```
src/
├── components/       # React 组件（Islands）
│   ├── admin/        # 管理后台
│   ├── iceberg/      # 冰山图相关
│   ├── ui/           # 通用 UI（Toast、Skeleton 等）
│   └── user/         # 用户中心
├── layouts/          # 全局布局 + 设计系统
├── lib/              # 工具库（auth、permissions、prisma 等）
├── pages/            # 页面 + API 路由
│   └── api/          # REST 端点
└── stores/           # Zustand store
prisma/
├── schema.prisma     # 数据库 schema
└── seed.mjs          # 初始数据
```

## 生产部署

部署前需将 `src/lib/auth/index.ts` 中的 OAuth 回调地址改为读取环境变量：

```
REDIRECT_URI=https://yourdomain.com/api/auth/callback
```
