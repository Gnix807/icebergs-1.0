# Icebergs Frontend 代码复盘报告

> 生成时间：2026-04-12

---

## 一、项目现状

### 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Astro 5 + `@astrojs/node` (SSR, `output: 'server'`) |
| UI | React 19 + Tailwind 3.4 |
| 数据库 | Prisma 5 + SQLite (`dev.db`) |
| 状态管理 | Zustand 5 |
| 拖拽 | @dnd-kit |
| OAuth | Arctic (GitHub + Google) |
| 字体 | JetBrains Mono + Inter |

### 目录结构

```
frontend/src/
├── components/
│   ├── NavBar.tsx              # 全局导航：鉴权/主题/搜索
│   ├── LoginForm.tsx           # 登录弹窗
│   └── iceberg/
│       ├── IcebergEditor.tsx   # 完整 DnD 编辑器 (~682 行)
│       ├── IcebergList.tsx     # 卡片列表 (archive-card 风格)
│       ├── ItemCard.tsx
│       ├── TierCard.tsx
│       └── ExportButton.tsx    # 占位，未实现
├── layouts/
│   └── Layout.astro            # 全局布局 + 设计系统 CSS
├── lib/
│   ├── auth/index.ts           # OAuth + session（in-memory Map）
│   ├── prisma.ts               # Prisma 单例
│   ├── api.ts                  # 统一响应格式
│   ├── api-client.ts           # fetch 封装
│   ├── markdown.ts
│   └── supabase.ts             # 疑似未使用
├── pages/
│   ├── index.astro             # 首页（SSR，Prisma 实时数据）
│   ├── leaderboard.astro       # 排行榜（SSR，viewCount 排序）
│   ├── feedback.astro          # 反馈表单（SSR POST）
│   ├── login.astro
│   ├── iceberg/
│   │   ├── [slug].astro        # 详情页（SSR + Drawer 抽屉）
│   │   ├── list.astro          # 列表页（React island）
│   │   ├── new.astro           # 新建编辑器
│   │   └── edit/[id].astro     # 编辑现有冰山图
│   ├── editor/[id].astro       # 备用编辑器路由
│   ├── user/[id].astro         # 用户主页（SSR）
│   └── api/
│       ├── auth/
│       │   ├── [...auth].ts    # GitHub + Google OAuth + /me + logout
│       │   └── register.ts     # 邮箱注册
│       ├── icebergs/
│       │   ├── index.ts        # GET 列表 / POST 创建
│       │   └── [id]/
│       │       ├── index.ts    # GET / PUT / DELETE
│       │       └── tiers.ts    # GET 层级列表 / POST 新建层级
│       ├── tiers/
│       │   ├── [id].ts         # GET / PUT / DELETE 层级
│       │   └── [id]/items.ts   # GET / POST 条目
│       ├── items/[id].ts       # PUT / DELETE 条目
│       ├── users/[id].ts       # GET 用户信息
│       └── search.ts           # GET 全文搜索
└── stores/
    └── icebergStore.ts         # Zustand store
```

### 已完成页面

| 路由 | 类型 | 状态 |
|---|---|---|
| `/` | SSR | 完成，含实时统计 + 最新9篇 |
| `/leaderboard` | SSR | 完成，含进度条/金银铜徽章 |
| `/feedback` | SSR+POST | 完成，支持 URL 参数预填 |
| `/iceberg/list` | SSR shell | 完成，IcebergList React island |
| `/iceberg/new` | SSR shell | 完成，IcebergEditor |
| `/iceberg/[slug]` | SSR | 完成，含 Drawer 抽屉 + Markdown |
| `/iceberg/edit/[id]` | SSR shell | 完成 |
| `/user/[id]` | SSR | 完成，archive-card 风格 |
| `/login` | SSR shell | 完成 |
| 管理后台 | — | **未实现** |

### 设计系统（Layout.astro 全局 CSS）

所有页面统一使用以下 CSS 类，浅色模式 `html.light` 有完整覆盖：

| 类名 | 说明 |
|---|---|
| `.archive-card` | 左4px边框卡片，hover 右移4px + 绿色边框 |
| `.rank-card` + `.top-1/2/3` | 金/银/铜左边框 |
| `.view-bar` / `.view-bar-fill` | 3px 浏览量进度条 |
| `.boot-animate` | 启动淡入动画，配合 `animation-delay` 用 |
| `.glitch-hover` | hover 时 RGB 色差效果 |
| `.bg-grid` | 终端点阵背景（50px 网格） |
| `.vignette` | 边角渐暗遮罩，`z-[9997]` 固定层 |

页面标准结构：
```html
<div class="vignette fixed inset-0 z-[9997] pointer-events-none"></div>
<main class="bg-grid max-w-?xl mx-auto px-4 py-12 relative z-10">
  <header class="boot-animate" style="animation-delay:0ms">...</header>
  <section class="boot-animate" style="animation-delay:80ms">...</section>
</main>
```

### NavBar 功能

- OAuth 登录状态（`/api/auth/me` 轮询）
- 主题切换（`html.light` class，`localStorage` 持久化）
- 移动端汉堡菜单
- 全局搜索覆盖层（Ctrl+K 触发，↑↓ 键盘导航，↵ 跳转）
- 搜索防抖 300ms，调用 `GET /api/search?q=`

---

## 二、Bug 与问题清单

### P0 — 严重，影响核心功能

---

#### Bug 1：邮箱注册密码未存入数据库（`register.ts:65-76`）

**问题：**
```ts
// 第65行：计算了哈希
const passwordHash = btoa(password + '_iceberg_salt_' + email);

// 第68-76行：create 里根本没有 passwordHash 字段
const user = await prisma.user.create({
  data: { id, email, username, nickname, role: 'USER' },
  // passwordHash 从未使用
});
```

`User` schema 也没有 `password` 字段，密码信息彻底丢失。注册后用户被自动登录，但此后**无法再用邮箱密码登录**，因为：
1. 密码没存
2. 没有对应的邮箱登录 endpoint

**附加问题：** `btoa()` 是 Base64 编码，不是哈希，完全可逆，不能用于密码存储。

**修复方向：**
- Schema 加 `passwordHash String?` 字段
- 换用 `bcrypt` 或 Node 内置 `crypto.pbkdf2`
- 新增 `POST /api/auth/login` endpoint 做密码验证

---

#### Bug 2：logout 内存泄漏（`[...auth].ts:232-235`）

**问题：**
```ts
if (action === 'logout') {
  event.cookies.delete('session', { path: '/' }); // 只删 cookie
  // 忘了调用 deleteSession(event)
  return new Response(null, { status: 302, headers: { Location: '/' } });
}
```

同文件里已有完整的 `deleteSession()` 函数（会从 `sessions` Map 中移除条目），但 logout 路由没有调用它。每次登出，Map 里的 session 会一直驻留到30天过期。

**修复：**
```ts
if (action === 'logout') {
  deleteSession(event); // 改为调用此函数
  return new Response(null, { status: 302, headers: { Location: '/' } });
}
```

---

#### Bug 3：所有写操作 API 无身份验证

涉及文件：`api/icebergs/index.ts`（POST）、`api/icebergs/[id]/index.ts`（PUT/DELETE）、`api/tiers/[id].ts`（PUT/DELETE）、`api/tiers/[id]/items.ts`（POST）、`api/items/[id].ts`（PUT/DELETE）

**问题：** 以上所有修改操作均未读取 session，任何人（包括未登录用户）可以：
- 创建冰山图
- 修改/删除任何人的冰山图、层级、条目

**修复方向：** 在每个写操作前加：
```ts
const session = await getSession(event);
if (!session) return 401;
// 所有权验证：检查 iceberg.authorId === session.userId
```

---

### P1 — 重要，影响数据正确性

---

#### Bug 4：新建层级顺序计算查询用错 id（`icebergs/[id]/tiers.ts:68-70`）

**问题：**
```ts
// 已通过 findFirst 查到真实 iceberg（支持 slug）
const iceberg = await prisma.iceberg.findFirst({
  where: { OR: [{ id }, { slug: id }] },
});

// 但查最大 order 时仍用原始 param id（可能是 slug）
const maxOrderTier = await prisma.tier.findFirst({
  where: { icebergId: id },      // BUG：应为 iceberg.id
  orderBy: { order: 'desc' },
});
```

当通过 slug 访问时，`icebergId: id` 用 slug 去匹配 tier 的 icebergId（实际存的是 cuid），永远查不到，导致新建的 tier 顺序总是0，产生排序混乱。

**修复：** 将 `icebergId: id` 改为 `icebergId: iceberg.id`

---

#### Bug 5：viewCount 双重计数

**问题：**

`pages/iceberg/[slug].astro:31-34`（SSR 页面）：
```ts
await prisma.iceberg.update({ data: { viewCount: { increment: 1 } } });
```

`pages/api/icebergs/[id]/index.ts:43-46`（API GET）：
```ts
await prisma.iceberg.update({ data: { viewCount: { increment: 1 } } });
```

IcebergEditor 通过 API 加载冰山图数据时会触发 API 的 +1，因此：
- 用户访问详情页：+1（正确）
- 编辑者每次打开编辑器：+1（错误）
- 保存时重新拉取数据：再 +1（错误）

**修复方向：** API 的 GET 不应计数，浏览量只在 SSR 详情页请求时增加。或增加防重复计数逻辑（IP/session 去重）。

---

#### Bug 6：草稿对任何人可见（`icebergs/index.ts:20`）

**问题：**
```ts
const status = url.searchParams.get('status') || 'PUBLISHED';
```

任意用户传 `?status=DRAFT` 即可拿到全站所有人的草稿列表，没有 session 鉴权。

**修复：** 如果 `status !== 'PUBLISHED'`，验证 session 并限制只返回当前用户的草稿。

---

### P2 — 中等，安全/体验问题

---

#### Bug 7：错误响应暴露内部信息（`tiers.ts` / `[id]/index.ts`）

```ts
return new Response(JSON.stringify(error(ErrorCodes.INTERNAL_ERROR, String(err))), { status: 500 });
```

`String(err)` 包含异常堆栈、内部路径、表名、SQL 语句等，不应直接返回给客户端。应统一返回通用错误消息，内部细节只打 log。

---

#### Bug 8：反馈数据不持久化（`feedback.astro:20`）

```ts
console.log('[Feedback]', { type, content, contact, icebergId, itemName });
submitted = true;
```

反馈提交后只打日志，服务重启即丢失。Schema 没有 Feedback 表。

---

#### Bug 9：大量调试日志遗留（安全 + 代码质量）

`pages/api/auth/[...auth].ts` 中遗留了完整的 OAuth 调试日志，包括：
- 打印用户邮箱列表（`console.log('Emails response:', JSON.stringify(emails))`）
- 打印 access token 前20字符
- 打印 state、code 等敏感参数

`pages/api/icebergs/[id]/tiers.ts:8,21` 有遗留的操作日志：
```ts
console.log('tiers GET called, id:', id);
console.log('tiers found:', tiers);
```

---

### P3 — 轻微，设计与类型问题

---

#### Bug 10：description 被原地覆写为 HTML（`[slug].astro:37`）

```ts
iceberg.description = marked.parse(iceberg.description) as string;
```

原始 Markdown 被 HTML 字符串直接覆盖，类型系统无感知。Item 的处理方式更合理（使用独立的 `_descHtml` 字段），description 应保持一致。

---

#### Bug 11：`/api/auth/me` 多返回 email 字段

`[...auth].ts:253` 的 `select` 包含 `email: true`，但 NavBar 的 `User` 接口未声明此字段。邮箱被静默传到前端，多余且有轻微隐私风险。

---

#### 设计问题：`lib/supabase.ts` 疑似无用死代码

文件存在但未被任何页面或 API 导入，应确认后删除。

---

## 三、生产部署阻塞项

| 问题 | 说明 |
|---|---|
| Session 存内存 Map | 服务重启所有登录状态丢失，需换成 DB/文件存储 |
| REDIRECT_URI 硬编码 | `lib/auth/index.ts:11` 写死 `localhost:4321`，部署必须改为环境变量 |
| 无 HTTPS 强制 | `secure: process.env.NODE_ENV === 'production'` 依赖正确设置 NODE_ENV |

---

## 四、待实现功能

- [ ] 邮箱登录端点（`POST /api/auth/login`）+ schema 加 passwordHash 字段
- [ ] 全局写操作鉴权 + 所有权验证
- [ ] Session 持久化（SQLite Session 表或文件存储）
- [ ] 投票/点赞系统（schema 无 Vote 表）
- [ ] 反馈持久化（schema 无 Feedback 表）
- [ ] 导出功能（`ExportButton.tsx` 是占位符）
- [ ] 管理后台
- [ ] 国内 OAuth（微博/QQ）
