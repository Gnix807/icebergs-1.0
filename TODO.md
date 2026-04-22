# 冰山图项目待办事项

## 已完成 ✅

### 基础架构
- [x] Astro 5 + React 19 + SQLite 本地开发环境
- [x] Prisma 5 配置
- [x] GitHub OAuth 登录 (Arctic)
- [x] 统一 API 响应格式

### API 端点
- [x] `GET/POST /api/icebergs` - 冰山图列表/创建
- [x] `GET/PUT/DELETE /api/icebergs/:id` - 冰山图详情/更新/删除
- [x] `GET/POST /api/icebergs/:id/tiers` - 层级列表/创建
- [x] `GET/PUT/DELETE /api/tiers/:id` - 层级详情/更新/删除
- [x] `GET/POST /api/tiers/:id/items` - 条目列表/创建
- [x] `PUT/DELETE /api/items/:id` - 条目更新/删除

### 前端页面
- [x] `/iceberg/new` - 创建冰山图编辑器
- [x] `/iceberg/list` - 冰山图列表页
- [x] `/iceberg/:slug` - 冰山图详情页

### 编辑器功能
- [x] Zustand store 连接
- [x] 标题/描述编辑
- [x] 添加/删除/重命名层级
- [x] 添加/编辑/删除条目
- [x] DnD 拖拽排序
- [x] Tier/Item 的增删改同步到 API
- [x] 保存草稿到服务器
- [x] 发布冰山图 (status: DRAFT → PUBLISHED)
- [x] 发布后跳转到冰山图详情页

### 查看冰山图
- [x] 列表页显示已发布的冰山图
- [x] 详情页展示冰山图内容
- [x] 详情页 UI 优化 (卡片悬停动画、投票按钮、响应式网格)

## 待处理 📋

### 高优先级
- [x] 条目顺序保存 (Item 表添加 order 字段)
- [x] 层级/条目顺序同步到服务器 (拖拽后自动同步)

### 中优先级
- [x] 自动保存 (auto-save) 功能
- [x] localStorage 兜底草稿
- [x] 加载已有冰山图到编辑器
- [x] Markdown 渲染 (条目描述)

### 低优先级
- [ ] 冰山图导出功能
- [x] 用户主页 `/user/:id`
- [x] 登录后创建/查找用户记录
- [x] 获取当前用户 `/api/auth/me`
- [x] 全局导航栏
- [x] 多登录方式 (GitHub + Google + 游客模式)
- [x] 邮箱注册功能
- [ ] 国内平台登录 (微博、QQ) - 待实现
- [ ] 评论/点赞功能
- [ ] 搜索和筛选

### 优化项
- [ ] 性能优化 (SSR vs SSG)
- [ ] 错误处理完善
- [ ] 加载状态 UI
- [ ] 空状态 UI

---

最后更新: 2026-04-11 (添加邮箱注册功能，国内平台登录占位)
