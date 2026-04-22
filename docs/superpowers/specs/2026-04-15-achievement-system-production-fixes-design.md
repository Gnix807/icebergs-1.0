# 设计文档：完整成就系统 + 生产环境修复

> 日期：2026-04-15
> 状态：已审阅，待实施

---

## 一、背景与目标

### 背景

- 现有 `Achievement` / `UserAchievement` 表已建立，但触发逻辑未连线
- 原项目（`public/index.html` + `data/_achievements.json`）有 47 个成就，全部依赖客户端 localStorage，无法迁移到多设备
- 管理后台 `AdminAchievements` 组件存在但只支持单条件（`triggerType` + `triggerTarget`）
- 生产部署存在 5 处已知问题，需一并修复

### 目标

1. 将成就系统升级为**可视化条件积木**，管理员无需写代码即可配置任意复杂成就
2. 行为数据服务端持久化，支持跨设备、跨会话的成就追踪
3. 成就解锁时展示 **Steam 风格 Toast**
4. 修复全部 5 处生产环境问题

---

## 二、数据模型

### 2.1 新增 `UserStats` 表

```prisma
model UserStats {
  userId              String   @id
  user                User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  searchCount         Int      @default(0)
  randomCount         Int      @default(0)
  nightReadCount      Int      @default(0)   // 0:00–5:00 阅读次数
  visitedIcebergCount Int      @default(0)   // 探索过的不同冰山图数量
  consecutiveDays     Int      @default(0)   // 连续访问天数
  lastVisitDate       String?               // YYYY-MM-DD
  totalVotesCast       Int      @default(0)
  totalSessionMinutes  Int      @default(0)
  pendingAchievements  String   @default("[]")
  // JSON string[]：已触发但前端尚未 ack 的成就 key 列表

  updatedAt            DateTime @updatedAt

  @@map("user_stats")
}
```

`User` 表添加反向关联：`stats UserStats?`

### 2.2 `Achievement` 表新增字段

```prisma
model Achievement {
  // 现有字段全部保留...

  conditions  String  @default("[]")
  // JSON 格式：Condition[]，替代旧 triggerType + triggerTarget 单条件模式
  // 旧成就在迁移脚本中自动转换为单积木 conditions，向后兼容
}
```

### 2.3 条件 JSON 格式

```ts
type Condition =
  | { block: string; op: Op; value: string | number | boolean; varB?: string }
  | { logic: 'AND' | 'OR' }

type Op = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'between'
```

示例（凌晨三点随机跳转 + 总阅读 = 666）：

```json
[
  { "block": "totalRead", "op": "==", "value": 666 },
  { "logic": "AND" },
  { "block": "currentHour", "op": "==", "value": 3 },
  { "logic": "AND" },
  { "block": "triggerType", "op": "==", "value": "random" }
]
```

---

## 三、条件积木系统（38 块）

### 类别一：时间 / 日历

| block key | 说明 | 运算符 | 值类型 |
|---|---|---|---|
| `currentHour` | 当前小时 | == != > >= < <= | 0–23 |
| `currentMinute` | 当前分钟 | == | 0–59 |
| `currentDayOfWeek` | 星期几 | == != | 下拉：0周日…6周六 |
| `currentDayOfMonth` | 几号 | == | 1–31 |
| `currentMonth` | 月份 | == | 下拉：1–12 |
| `daysSinceRegister` | 距注册天数 | >= == | 数字 |

### 类别二：跨图探索

| block key | 说明 | 运算符 | 值类型 |
|---|---|---|---|
| `visitedIcebergCount` | 探索过的冰山图数 | >= == | 数字 |
| `consecutiveDays` | 连续访问天数 | >= == | 数字 |
| `sessionMinutes` | 本次会话时长（分） | >= | 数字 |

### 类别三：词条深度

| block key | 说明 | 运算符 | 值类型 |
|---|---|---|---|
| `currentTierOrder` | 词条所在第几层（0-based） | == >= <= | 数字 |
| `currentIcebergTierCount` | 当前图共几层 | == >= <= | 数字 |
| `currentIcebergItemCount` | 当前图总词条数 | >= == | 数字 |
| `currentItemDescContains` | 词条描述含文字 | contains | 文本 |
| `currentItemDescLength` | 词条描述长度 | == >= <= | 数字 |
| `currentItemTitleContains` | 词条标题含文字 | contains | 文本 |
| `currentItemLabelContains` | 词条标签含 | contains | 文本 |
| `currentItemLabelCount` | 词条标签数量 | >= == | 数字 |
| `currentItemIsEmpty` | 词条描述是否为空 | == | 是/否 |
| `currentIcebergReadCount` | 当前图已读词条数 | >= == | 数字 |
| `isBottomTier` | 是否最底层 | == | 是/否 |
| `isFirstVisitIceberg` | 是否首次访问该图 | == | 是/否 |

### 类别四：用户成长

| block key | 说明 | 运算符 | 值类型 |
|---|---|---|---|
| `totalRead` | 累计阅读词条数 | == >= <= | 数字 |
| `watchlistCount` | 收藏冰山图数 | >= == | 数字 |
| `totalVotesCast` | 累计投票次数 | >= == | 数字 |
| `createdIcebergCount` | 已发布冰山图数 | >= == | 数字 |
| `qualityLevel` | 当前质量等级 | >= == | 下拉：0–3 |
| `unlockedAchievementCount` | 已解锁成就数 | <= >= == | 数字 |
| `warningCount` | 已收到警告次数 | >= == | 数字 |
| `hasUnreadNotification` | 是否有未读通知 | == | 是/否 |
| `hasEverSearched` | 是否曾使用搜索 | == | 是/否 |

### 类别五：数学彩蛋

| block key | 说明 | 运算符 | 值类型 |
|---|---|---|---|
| `searchCount` | 搜索次数 | == >= <= | 数字 |
| `randomCount` | 随机跳转次数 | == >= <= | 数字 |
| `nightReadCount` | 深夜阅读次数 | >= == | 数字 |
| `isDivisibleBy` | 总阅读量能被N整除 | == | 数字 |
| `isPrime` | 总阅读量是质数 | == | 是/否 |
| `varDiff` | 两变量之差绝对值 | <= == | 数字（需选 varA + varB）|
| `triggerType` | 触发方式 | == | 下拉：read/search/random/vote/visit |

### 类别六：行为反转

| block key | 说明 | 运算符 | 值类型 |
|---|---|---|---|
| `varEqual` | 变量A 等于 变量B | == | 下拉选两个变量 |

---

## 四、触发与检查逻辑

### 4.1 触发入口

| 用户行为 | API | UserStats 更新 |
|---|---|---|
| 阅读词条 | `POST /api/items/read` | `totalRead++`，0–5点 `nightReadCount++` |
| 全局搜索 | `GET /api/search` | `searchCount++`，`hasEverSearched=true` |
| 随机跳转 | `GET /api/icebergs/random` | `randomCount++` |
| 首次访问冰山图 | `GET /api/icebergs/[id]` | `visitedIcebergCount++` |
| 投票 | `POST /api/icebergs/[id]/vote` | `totalVotesCast++` |
| 每日首次请求 | 任意需登录 API | 检查更新 `consecutiveDays` / `lastVisitDate` |

### 4.2 检查流程

```
完成主操作
    ↓
checkAchievements(userId, context)  — 不 await，异步 fire-and-forget
    ↓
拉取该用户所有「未解锁」Achievement（含 conditions JSON）
    ↓
逐条 evaluateConditions(conditions, context)
    ↓
满足 → 写 UserAchievement + notify() 站内通知 + 写入 pendingAchievements 缓存
    ↓
前端下次轮询 /api/auth/me 时带回 pendingAchievements[]
    ↓
AchievementToast 队列展示，展示后 POST /api/auth/achievements/ack 清空
```

### 4.3 AchievementContext

```ts
interface AchievementContext {
  userId: string
  triggerType: 'read' | 'search' | 'random' | 'vote' | 'visit'
  currentHour: number
  currentMinute: number
  currentDayOfWeek: number   // 0=Sunday
  currentDayOfMonth: number
  currentMonth: number       // 1-12
  currentItem?: {
    id: string; title: string; desc: string
    labels: string[]         // 已解析为数组
    tierOrder: number        // 0-based
    icebergId: string
  }
  currentIceberg?: {
    id: string; tierCount: number; itemCount: number
  }
  currentIcebergReadCount?: number
  isBottomTier?: boolean
  isFirstVisitIceberg?: boolean
  sessionMinutes: number
  stats: UserStats            // 刚更新后的快照
  user: {
    qualityLevel: number      // 0-3
    warningCount: number
    createdIcebergCount: number
    watchlistCount: number
    unlockedAchievementCount: number
    daysSinceRegister: number
    hasUnreadNotification: boolean
  }
}
```

### 4.4 求值引擎

文件：`src/lib/achievementEngine.ts`

- 纯函数 `evaluateConditions(conditions, ctx): boolean`
- 遍历 conditions 数组，logic 节点切换 AND/OR，block 节点取值比较
- 特殊积木：`isPrime`（内置质数判断）、`isDivisibleBy`（取模）、`varDiff`（两变量差绝对值）、`varEqual`（两变量相等）
- `hasEverSearched` 在引擎内部由 `stats.searchCount > 0` 推导，不单独存字段
- `sessionMinutes` 由前端在阅读词条时通过 `POST /api/items/read` 的 body 附带 `sessionMinutes` 上报，服务端取最大值更新 `totalSessionMinutes`；成就检查时 context 里使用本次上报值

---

## 五、Steam 风格 AchievementToast

### 5.1 视觉规格

- 位置：`fixed top-6 right-6`，宽度 `320px`
- 结构：顶部标签「隐藏权限已解锁 // ACHIEVEMENT UNLOCKED」（终端绿）+ 成就图标 + 标题 + 描述
- 左侧 4px 竖条颜色取成就配置的 `color` 字段
- 动画：从 `translateX(110%)` 滑入，停留 4s，滑出

### 5.2 时序

```
0ms    → 插入 DOM，translateX(110%)
50ms   → translateX(0)，opacity 1
4000ms → translateX(110%)，opacity 0
4300ms → 移出 DOM
300ms  → 间隔后播放下一个
```

### 5.3 组件

新建 `src/components/ui/AchievementToast.tsx`，挂载在 `Layout.astro` 全局层（`client:load`）。
监听来源：NavBar 现有 `/api/auth/me` 30s 轮询返回的 `pendingAchievements[]`。
与现有 `Toast.tsx`（右下角操作反馈）完全独立，互不影响。

---

## 六、生产环境修复

| # | 问题 | 文件 | 修复方式 |
|---|---|---|---|
| 1 | REDIRECT_URI 硬编码 | `src/lib/auth/index.ts` | 改读 `import.meta.env.REDIRECT_URI` |
| 2 | ExportButton 未接入 | `src/pages/iceberg/[slug].astro` + `ExportButton.tsx` | 接入组件，`targetId` 字符串传入 |
| 3 | viewCount 双重计数 | `src/pages/api/icebergs/[id]/index.ts` | 删除 API GET 里的 `viewCount++` |
| 4 | 错误响应暴露堆栈 | 约 8 个 API 文件 | `String(err)` 改为通用消息，内部 console.error |
| 5 | supabase.ts 死代码 | `src/lib/supabase.ts` | 直接删除 |

---

## 七、实施顺序

1. 生产环境 5 项修复（逐项，低风险）
2. Prisma schema 变更（UserStats 表 + Achievement.conditions 字段）
3. 求值引擎 `achievementEngine.ts`
4. `checkAchievements` 服务函数
5. UserStats 更新逻辑接入各触发 API
6. `/api/auth/me` 附带 `pendingAchievements` + `/api/auth/achievements/ack`
7. AdminAchievements 可视化条件积木 UI
8. 旧成就迁移脚本
9. `AchievementToast` 组件 + Layout 挂载
10. 种子数据：从原项目 47 个成就迁移为新 conditions 格式
