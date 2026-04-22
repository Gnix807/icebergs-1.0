# 冰山图宇宙 — 项目交接文档

> 撰写日期：2026-04-21  
> 适用场景：更换开发者、更换 AI 辅助 API、新人上手

---

## 一、项目定位

**冰山图宇宙**是一个 SCP Foundation 风格的知识/内容分享平台。用户可以创建"冰山图"——一种分层展示内容的可视化形式（表层为广为人知的事实，越往下越小众/冷僻）。

平台定位：内容创作 + 社区审核 + 成就系统 + 站长民主选举制度。

---

## 二、技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Astro 5 + React 19 (Islands 模式) + `@astrojs/node` SSR |
| 数据库 | Prisma 5 + SQLite（`frontend/prisma/dev.db`） |
| 状态管理 | Zustand 5（仅编辑器用） |
| 认证 | Arctic（GitHub OAuth + Google OAuth）+ 邮箱/密码（pbkdf2） |
| 拖拽 | `@dnd-kit` |
| CSS | Tailwind 3.4 + 全局设计系统（`src/layouts/Layout.astro`） |

**重要约定：所有开发在 `frontend/` 目录进行。** 根目录的 `server.js`、`src/`、`public/` 是遗留的 Express+HTML 系统，不要修改。

---

## 三、开发命令

```bash
cd frontend

npm run dev        # 开发服务器，端口 4321
npm run build      # 生产构建
npm run check      # TypeScript 类型检查

# 数据库操作（必须先停止 dev server，Windows 存在 DLL 锁）
npx prisma db push     # 应用 schema 变更到 dev.db
npx prisma studio      # 可视化数据库浏览器
npx prisma generate    # 重新生成 Prisma client
node prisma/seed.mjs   # 写入初始数据
```

> **Windows 特有问题**：`prisma generate` 在 dev server 运行时会报 EPERM（DLL 被占用）。新增表可以在 server 运行时 `db push`，但 `generate` 必须先停服务。临时可用 `(prisma as any).newModel` 绕过，之后再补 generate。

---

## 四、架构要点

### 数据流

```
.astro 页面  ──(Prisma 直接查询)──▶  服务端渲染
React Island ──(fetch /api/*)──────▶  API 路由（.ts）
                                         │
                                         ▼
                                    Prisma + SQLite
```

- **页面层**（`.astro`）：纯 SSR，直接调 Prisma，不走 API
- **交互层**（React Islands，`client:load`）：通过 `/api/*` 端点通信
- **API 层**（`src/pages/api/**/*.ts`）：返回 `ApiResponse<T>`，结构始终为 `{ success, data }` 或 `{ success, error }`，见 `src/lib/api.ts`

### 认证

- Session DB 持久化（无 JWT，无内存 Map）
- `src/lib/auth/index.ts` 提供：
  - `getSession(event: APIEvent)` — 用于 API 路由
  - `getSessionById(sessionId?)` — 用于 Astro 页面
- 懒解封：`resolveSessionUser()` 内自动检测 TEMP_BANNED 是否到期并解除

### 权限

```typescript
can(session, 'content:create')   // 创建内容
can(session, 'content:review')   // 审核（EDITOR+）
can(session, 'content:override') // 越权发布（ADMIN+）
can(session, 'user:ban')         // 封禁用户
```

角色层级（低→高）：`USER < CONTRIBUTOR < EDITOR < MODERATOR < ADMIN`  
`FOUNDER` 是特殊标志位，永久免疫降级/弹劾。

### 枚举存储

SQLite 不支持 Prisma enum。所有枚举字段（`role`、`status`、`IcebergStatus` 等）存储为普通字符串，TypeScript union type 提供编译期安全，见 `src/lib/types.ts`。

---

## 五、已完成功能清单（截至 2026-04-21）

### 核心内容

| 功能 | 说明 |
|------|------|
| 冰山图 CRUD | 新建、编辑、删除、发布；编辑器含 DnD 拖排、自动保存、localStorage 草稿恢复 |
| 分层词条 | 每张冰山图多层，每层多词条，词条含标题/描述/Markdown/标签/图片 |
| 提交自查清单 | `src/lib/checklist.ts`，投稿前校验标题长度、描述、层数、词条密度、NSFW 确认 |
| 内容审核队列 | EDITOR+ 可审核他人投稿；ADMIN 可 Override 自己投稿（回避制度绕过） |
| 评论系统 | 点赞、楼中楼回复、排序 |
| 投票 / 收藏 / 浏览日志 | 完整记录 |
| 全局搜索 | `/api/search` + Ctrl+K 快捷键 |
| 随机冰山图 | `/iceberg/random` |

### 用户系统

| 功能 | 说明 |
|------|------|
| 认证 | GitHub OAuth / Google OAuth / 邮箱注册+登录 |
| 质量分 | 四级：VISITOR(0) / RESEARCHER(10) / ANALYST(100) / SUPERVISOR(500) |
| 积分历史 | ScoreLog 表 + 用户中心积分 Tab |
| 用户中心 | 我的冰山 / 收藏夹 / 设置 / 积分历史 |
| 晋升申请（RfA） | EDITOR+ 申请投票晋升，7 天投票期，支持撤票 |
| 弹劾系统 | MODERATOR/ADMIN 可被弹劾，投票通过后降级，cron 自动结案 |

### 治理系统

| 功能 | 说明 |
|------|------|
| 站长选举 | OPEN_APPLY → VOTING → CLOSED → CONFIRMED 状态机，加权投票 |
| 任命机制 | ADMIN/FOUNDER 可直接任命角色（绕过选举，受 admin_max 上限） |
| 弹劾流程 | 发起 / 投票 / 降级 / 撤销 / cron 自动推进 |
| 平台规则页 | `/rules` |
| 机构页 | `/org`，展示 FOUNDER/ADMIN/MODERATOR/EDITOR + 选举历史 |

### 成就系统

| 功能 | 说明 |
|------|------|
| 数据库配置型 | 成就条件以 JSON `Condition[]` 存储，无需改代码即可增删成就 |
| 积木式条件编辑器 | AdminAchievements 组件，支持 AND/OR/NOT 嵌套 |
| 实时解锁通知 | 阅读词条后即时检查，通过 CustomEvent 桥接 → Steam 风格右上角 Toast |
| 大量内置触发块 | `totalRead`、`currentItemLabelContains`、`consecutiveDays`、`isBottomTier` 等 |

### 管理后台（AdminPanel，9 个 Tab）

审核 / 晋升 / 举报 / 反馈 / 用户 / 申诉 / 选举 / 成就配置 / 系统配置

### Cron 端点（需外部定时调用）

| 端点 | 作用 |
|------|------|
| `POST /api/admin/cron/advance-elections` | 自动推进选举状态 |
| `POST /api/admin/cron/advance-rfa` | 关闭过期 RfA 并晋升/拒绝 |
| `POST /api/admin/cron/advance-impeach` | 关闭过期弹劾并执行降级 |
| `POST /api/admin/cron/weekly-activity-bonus` | 每周活跃度积分奖励 |

---

## 六、本轮（2026-04-21）修复的三个 Bug

### Bug 1 — 成就条件与词条标签无法联动

**现象**：配置了 `currentItemLabelContains = "nsfw"` 的成就，阅读 NSFW 词条时始终不触发。

**根因**：
1. `achievementEngine.ts` 的 `currentItemLabelContains` 分支大小写敏感（标签存为 `"NSFW"`，条件值写的 `"nsfw"` 不匹配）
2. `read.ts` 中已读词条走 early return，跳过成就检查
3. `checkAchievements()` 返回 `void`，API response 从未携带解锁列表

**修复文件**：
- `src/lib/achievementEngine.ts` — 改为 case-insensitive `.toLowerCase().includes()`
- `src/lib/achievementService.ts` — 返回类型改为 `Promise<UnlockedAchievement[]>`，非关键副作用改为 fire-and-forget
- `src/pages/api/items/read.ts` — stats 更新用 `if (isNew)` 包裹，成就检查始终运行；response 携带 `newAchievements`

### Bug 2 — 右下角出现丑陋的原生 div 弹窗

**现象**：解锁成就时，右下角出现 `position:fixed;bottom:80px` 的原生 div，与右上角 Steam 风格 Toast 并存。

**根因**：`[slug].astro` 调用了 `window.__toast`（从未被定义），fallback 到了内联 div。

**修复文件**：
- `src/components/ui/AchievementToast.tsx` — 新增监听 `app:achievement` CustomEvent
- `src/pages/iceberg/[slug].astro` — 移除 `window.__toast` 和内联 div，改为 `window.dispatchEvent(new CustomEvent('app:achievement', { detail: newAchievements }))`

### Bug 3 — 管理员提交的冰山图在审核队列中不可见

**现象**：Admin 自己投稿的冰山图，在审核队列里看不到（也无法发布）。

**根因**：`GET /api/reviews` 的回避制度过滤 `authorId: { not: session.userId }` 把 Admin 自己的投稿也隐藏了，造成死锁。

**修复文件**：
- `src/pages/api/reviews/index.ts` — 拆成两个查询：普通队列（排除自己）+ 自投队列（仅 ADMIN/FOUNDER 可见，带 `selfAuthored: true` 标记）
- `src/components/admin/AdminReviews.tsx` — `selfAuthored` 卡片显示紫色"自己提交 · 需要 Override"徽章，按钮替换为"直接发布"，触发 Override 模态框（需填写 ≥5 字理由，调用 `PUT /api/reviews/[id]/override`，理由永久记录）

---

## 七、关键文件速查

```
frontend/
├── prisma/
│   ├── schema.prisma          # 全量数据库 schema
│   └── seed.mjs               # 初始化数据（system_settings、成就等）
├── src/
│   ├── layouts/Layout.astro   # 全局 CSS 变量 + 设计系统 + AchievementToast island
│   ├── lib/
│   │   ├── api.ts             # ApiResponse 格式、ErrorCodes
│   │   ├── api-client.ts      # 前端 fetch 封装
│   │   ├── auth/index.ts      # getSession / createSession / deleteSession
│   │   ├── permissions.ts     # can(session, action)
│   │   ├── prisma.ts          # Prisma client 单例
│   │   ├── notify.ts          # notify() 站内通知，fire-and-forget
│   │   ├── checklist.ts       # 投稿前自查校验
│   │   ├── achievementService.ts  # checkAchievements() 主函数
│   │   ├── achievementEngine.ts   # evaluateConditions() 条件求值
│   │   ├── qualityLevel.ts    # 质量分等级定义
│   │   ├── rfa.ts             # RfA 申请逻辑
│   │   └── types.ts           # 全局 TypeScript 类型
│   ├── pages/
│   │   ├── index.astro        # 首页
│   │   ├── iceberg/[slug].astro   # 冰山图详情（含阅读追踪 + 成就触发）
│   │   ├── editor/[id].astro  # 冰山图编辑器
│   │   ├── user/[id].astro    # 用户主页
│   │   ├── org.astro          # 机构页
│   │   ├── rfa/               # RfA 系统页面
│   │   ├── impeach/           # 弹劾系统页面
│   │   ├── elections/         # 选举系统页面
│   │   └── api/               # 全部 REST 端点
│   ├── components/
│   │   ├── NavBar.tsx         # 导航栏（成就 pending 轮询 15s）
│   │   ├── admin/AdminPanel.tsx   # 管理后台（9 tabs）
│   │   ├── iceberg/IcebergEditor.tsx  # 冰山图编辑器（DnD + Zustand）
│   │   └── ui/AchievementToast.tsx    # Steam 风格成就弹窗
│   └── stores/icebergStore.ts  # 编辑器 Zustand store
```

---

## 八、已知问题 / 待清理

| 项目 | 说明 |
|------|------|
| `src/lib/supabase.ts` | 死代码，无任何引用，可直接删除 |
| `ExportButton` 组件 | `src/components/iceberg/ExportButton.tsx` 已实现但未挂载到详情页 |
| OAuth 仅 GitHub | 代码中 Google OAuth 已移除；如需国内平台（微信/QQ）需单独对接 |

---

## 九、生产部署阻塞项

1. **`REDIRECT_URI` 硬编码**  
   `src/lib/auth/index.ts` 中 OAuth 回调地址写死为 `http://localhost:4321/api/auth/callback`。  
   部署前必须改为读取环境变量：
   ```typescript
   const redirectUri = import.meta.env.REDIRECT_URI;
   ```
   并在生产环境 `.env` 中配置 `REDIRECT_URI=https://yourdomain.com/api/auth/callback`

2. **SQLite 换库**  
   生产环境建议迁移到 PostgreSQL。Prisma 支持无缝切换，主要改动：  
   - `DATABASE_URL` 改为 `postgresql://...`
   - `schema.prisma` 中 `provider = "sqlite"` 改为 `"postgresql"`
   - 所有 `String` 类型的枚举字段无需改动（SQLite 存字符串的选择本就兼容 PostgreSQL）
   - 重跑 `prisma migrate dev` 建表，再跑 `seed.mjs`

3. **Cron 任务调度**  
   四个 `/api/admin/cron/*` 端点目前没有自动触发机制，需要通过 cron job（服务器 crontab / Vercel Cron / GitHub Actions 定时触发）定期调用。

---

## 十、下一步展望

| 优先级 | 功能 | 说明 |
|--------|------|------|
| 高 | 生产部署 | 解决 REDIRECT_URI 硬编码 + 迁移 PostgreSQL + 配置 Cron |
| 高 | ExportButton 接入 | 将 `ExportButton.tsx` 挂到详情页，支持导出冰山图为图片 |
| 中 | 邮件通知 | 现有 `notify()` 仅写入 DB，可接 SMTP/SendGrid 发送邮件 |
| 中 | 图片上传 | 词条图片目前存 URL，可接 S3/OSS 实现本地上传 |
| 中 | 全文搜索增强 | 当前 `/api/search` 是 SQLite LIKE 搜索，可接 MeiliSearch/Typesense |
| 低 | 国内 OAuth | 可接微信/QQ OAuth，需在 Arctic 之外自行实现 |
| 低 | 死代码清理 | 删除 `src/lib/supabase.ts` |

---

## 十一、给新 AI / 接手者的上手提示

1. **先读 `CLAUDE.md`**（项目根目录），它是最权威的架构说明
2. **所有修改只在 `frontend/` 目录**，根目录是遗留系统
3. **新增数据库表**：`prisma db push`（可在 server 运行时执行）→ 停服务 → `prisma generate`
4. **API 响应格式统一**：永远返回 `{ success: true, data: ... }` 或 `{ success: false, error: { code, message } }`，使用 `src/lib/api.ts` 的 `success()` / `error()` 工厂函数
5. **权限检查**：每个写操作 API 必须 `can(session, action)`，不要裸判断 `session.role`
6. **成就系统扩展**：只需在 AdminPanel → 成就配置 Tab 里用积木编辑器新增成就条件，无需改代码
7. **Windows 注意事项**：停服后再 `prisma generate`；路径用 `/` 不用 `\`
