# 冰山图宇宙 · 开发会话记录

> 会话日期：2026-06-17 ~ 2026-06-19（3 天密集迭代）
> 分支：main（已合并 `frontend-polish`）
> 核心目标：前端设计系统化 + 体验全面翻新

---

## 一、设计系统改造

### 1.1 设计令牌体系化（24 个语义颜色令牌）
- 全站 ~2,600 处硬编码颜色迁移至 CSS 变量
- 亮色/暗色模式通过变量切换自动适配，删除 300+ 行手动覆盖代码
- Tailwind config 扩展：字体/间距/ZIndex/圆角/阴影/缓动 全部令牌化

### 1.2 Supabase 设计规范迁移
- 品牌色：终端绿 `#00FF41` → 祖母绿 `#3ecf8e`
- 底色：`#0d1117` 极暗 → `#1c1c1c` 暗灰
- 圆角系统：全直角 → 微圆角 4-6px
- 阴影系统：无 → 三层阴影层级
- 字体瘦身：15 字重 → 11 字重

---

## 二、体验优化

### 2.1 冰山图阅读抽屉（7 项改进）
- 标题吸顶、底部导航栏、80ms 淡入过渡、滚动位置记忆、遮罩减淡 75%→50%+毛玻璃、键盘提示
- 抽屉宽度 520px → 640px

### 2.2 NavBar 导航重构
- 从扁平 11 项 → 分类下拉：探索 / 帮助 / 关于
- 主栏 4 核心：首页 / 冰山广场 / 排行榜 / 创建

### 2.3 用户后台仪表盘化
- 删除 7 区块垂直侧边栏（~400 行）
- 新增水平 StatsBar（5 卡片）+ AchievementStrip + ActionsBar
- 设置页重组：晋升卡移出，账号设置/用户框定制分区卡片化
- UserboxPicker 独立为文件
- 去重 3 个 MutationObserver

### 2.4 排行榜时间范围筛选
- 新增本周 / 本月 / 全部 三个时间维度
- 点赞 tab 颜色统一为品牌色

### 2.5 首页共建区域（后删除）
- 新增社区共建 section，后因与统计区重复被移除

---

## 三、成就系统扩展

### 3.1 新增成就（52 → 92）
| 分类 | 数量 | 示例 |
|------|------|------|
| 阅读里程碑 | 7 | 25/75/200/400/750/5000/10000 |
| 数字彩蛋 | 12 | 13/23/69/128/314/1337/1984/2048 |
| 时间日期 | 7 | 黑色星期五/万圣节/跨年 |
| 连续登录 | 5 | 3/7/30/100/365 天 |
| 广度探索 | 3 | 10/50/200 张不同冰山图 |
| 词条深度 | 5 | 长文/空词条/标签收集 |
| 元成就 | 1 | 解锁 60 项 |

### 3.2 系统优化
- 删除重复的 EXPLORE 成就
- 统一社区徽章与探索成就存储

---

## 四、性能优化

| 项目 | 效果 |
|------|------|
| 字体字重裁剪 | 首屏加载 ↓66% |
| CommentSection → `client:visible` | 延迟加载，减少首屏 JS |
| QRCode 动态导入 | 60KB 惰性加载 |
| NavBar 轮询优化 | 后台标签页暂停 API 请求 |
| CSS 抽文件 | 1178 行从 HTML 内联 → 独立文件，启用缓存 |
| 删除无效 JetBrains Mono/Fira Code 引用 | 6 处清理 |

---

## 五、可访问性改进

| 项目 | 数量 |
|------|------|
| 表单输入添加 `aria-label` | 18 个 |
| 图标按钮添加辅助标签 | 8 个 |
| 装饰 SVG 添加 `aria-hidden` | 14 个 |
| placeholder 对比度修复 | 2.9:1 → 5.5:1 |
| `focus-visible` 扩展至链接/卡片 | 全局 |
| ItemCard 键盘编辑支持 | Tab + Enter |
| 移动端页脚快捷链接 | 新增 |

---

## 六、功能开关系统

### 6.1 8 个开关（默认关闭 6 个）
| 开关 | 默认 | 关闭效果 |
|------|------|---------|
| `feature_rfa` | OFF | RfA 页面显示"暂未开放" |
| `feature_impeach` | OFF | 弹劾页面显示"暂未开放" |
| `feature_promotion` | OFF | 隐藏晋升按钮 |
| `feature_appeals` | OFF | 隐藏申诉面板 |
| `feature_userboxes` | OFF | 隐藏用户框定制 |
| `feature_privacy` | OFF | 隐藏隐私开关 |
| `feature_session_mgmt` | OFF | 隐藏会话管理 |
| `feature_quality_score` | ON | 保持 |

### 6.2 管理界面
- AdminPanel → 新增「功能开关」标签页（8 个 toggle）

---

## 七、数据库架构

### 7.1 PostgreSQL 迁移（代码已就绪，待部署）
- Schema `provider` 改为 PostgreSQL
- 清理 4 个 auth 文件中的运行时 CREATE TABLE（冗余）
- 创建 `prisma/migrate-to-pg.mjs` 数据迁移脚本
- **当前本地仍用 SQLite**（PG 启动失败，回退）

### 7.2 部署规划
- 服务器：1Panel Linux + PostgreSQL + Nginx + PM2
- 备份：1Panel 定时 `pg_dump` + 自动备份到远程存储
- CI/CD：GitHub Actions → SSH 拉代码 + 构建 + 重启

---

## 八、其他改动

| 项目 | 说明 |
|------|------|
| CRT 扫描线按钮 | `bg-surface-2/90` 失效 → 改内联 rgba + `astro:page-load` 事件 |
| 公告种子 | 5 条更新公告写入 DB（类型修正→ changelog） |
| About 页面 | 技术栈简化（去版本号，加开源协议） |
| Footer | 移动端增加快捷链接 |
| AnnouncementBanner | 乱码修复（查看详情 → / 关闭按钮 ✕） |
| predev 脚本 | 启动前清 Vite 缓存，解决 504 错误 |
| 按钮样式标准化 | AdminReports/Reviews/Editor 改用 `btn-*` 全局类 |
| Alert → Toast | RfA 申请页替换 `alert()` |

---

## 分支状态

| 分支 | 状态 |
|------|------|
| `main` | 最新，已合并所有改动 |
| `design-tokens-v2` | 设计令牌体系 |
| `frontend-polish` | 已合并入 main |

---

## 待办事项

- [ ] 服务器部署 PostgreSQL + 数据迁移
- [ ] 1Panel HTTPS 证书配置
- [ ] PM2 守护 + 自动重启
- [ ] 成就系统社区互动类（需要 triggerType 扩展）
- [ ] IcebergEditor 自动保存 Ref 优化（目前跳过，函数体太大）
- [ ] 模态框焦点陷阱
- [ ] 探索成就 UI 按分类展示
- [ ] Redis 评估（当前不需要，预留接口）

---

*由 AI 编码助手 opencode（模型：deepseek-v4-pro）辅助完成。*
