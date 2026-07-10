# 参与贡献

感谢你有兴趣为冰山图宇宙做贡献！无论你是写代码、做设计、写文档、还是单纯来提想法，都非常欢迎。

## 行为准则

请保持友善和尊重。我们希望能建立一个开放、包容的社区。

## 如何参与

### 提 Bug

在 [Issues](https://github.com/Gnix807/icebergs-1.0/issues) 页面提交，请尽量包含：

- 你做了什么操作
- 你期望看到什么结果
- 实际发生了什么
- 截图（如果有的话）
- 浏览器和操作系统信息

### 提功能建议

同样在 Issues 提交，请描述：

- 你希望实现什么功能
- 这个功能解决什么问题
- 你期望的使用场景

### 提交代码

1. Fork 本项目
2. 创建你的分支 (`git checkout -b feat/some-feature`)
3. 提交你的改动 (`git commit -m 'feat: add some feature'`)
4. 推送到分支 (`git push origin feat/some-feature`)
5. 创建 Pull Request

### 开发环境

```bash
git clone https://github.com/Gnix807/icebergs-1.0.git
cd icebergs-1.0/frontend
cp .env.example .env
npm install
npx prisma db push && npx prisma generate
node prisma/seed.mjs && node prisma/seed-achievements.mjs
psql -d icebergs -f prisma/migrations/001_fulltext_search.sql
npm run dev
```

### 提交规范

- 提交信息使用简洁的中文或英文
- PR 标题清晰描述改动内容
- 较大的功能改动请先开 Issue 讨论
- 提交前运行 `npm run check` 确保类型检查通过

### 代码风格

- TypeScript 严格模式
- React 函数组件 + Hooks
- Astro 页面用 `.astro` 文件
- 统一使用项目中已有的 ESLint/Prettier 配置（如果有的话）

## 从哪里开始

适合初次贡献的任务通常标记为 **good first issue**，可以在 Issues 列表中查找。

如果你不确定从哪里开始，可以直接在站上建一座冰山图——内容贡献同样重要。

## 致谢

所有贡献者都会在项目文档和致谢页面中被提及。感谢你的每一份贡献！
