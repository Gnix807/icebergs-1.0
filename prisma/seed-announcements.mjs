// 临时：写入近期更新公告到数据库
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const announcements = [
  {
    title: '🎨 视觉系统全面升级',
    content: `## 概览

全站视觉系统完成了一次深度翻新——从暗黑终端风迁移至更成熟、更克制的新设计体系。

### 主要变化

- **底色提亮**：极暗底 → 暗灰底，长时间阅读更舒适
- **品牌色升级**：荧光绿 → 祖母绿，更沉稳专业
- **微圆角**：按钮、卡片、输入框从全直角改为 4-6px 微圆角
- **阴影系统**：新增三层阴影层级（卡片/浮层/模态），区分视觉层次
- **字体瘦身**：Google Fonts 加载量从 15 个字重缩减至 11 个

### 技术细节

全站约 2600 处硬编码颜色统一迁移至 24 个语义化 CSS 变量，亮色/暗色模式通过变量切换自动适配，不再需要逐处维护。`,
    type: 'info',
    pinned: true,
  },
  {
    title: '🏆 成就系统大扩展 — 从 52 到 92 项',
    content: `## 新增成就

成就系统经历了一次全面扩充，从 52 项增至 92 项，覆盖更多行为维度：

| 分类 | 新增 | 说明 |
|------|------|------|
| 阅读里程碑 | 7 项 | 25/75/200/400/750/5000/10000 词条档位 |
| 数字彩蛋 | 12 项 | 13/23/69/128/314/1337/1984 等特殊数字 |
| 时间日期 | 7 项 | 黑色星期五、万圣节、跨年守夜等节日成就 |
| 连续登录 | 5 项 | 3/7/30/100/365 天连登成就 |
| 广度探索 | 3 项 | 访问 10/50/200 张不同冰山图 |
| 词条深度 | 5 项 | 长篇阅读、虚空词条、标签收集等 |
| 元成就 | 1 项 | 解锁 60 项成就 |

### 系统改进

- 删除了与 LEGACY 重复的 5 个旧版 EXPLORE 成就
- 统一了社区徽章与探索成就的存储结构
- 部分隐藏成就等你发现 👀`,
    type: 'info',
    pinned: false,
  },
  {
    title: '📋 用户后台全面重构 — 仪表盘化',
    content: `## 改进

用户中心页面从侧边栏布局重构为仪表盘风格：

### 旧版问题

- 7 个区块垂直堆叠的侧边栏，信息冗长重复
- 移动端需要先展开"档案附录"才能看到主体内容
- 社区徽章与探索成就两套展示系统互不相通

### 新版体验

- **水平统计条**：阅读/创作/收藏/段位/连登 5 卡片一行看完
- **成就展示条**：最近 3 个成就常驻可见，不再藏在深页
- **快捷操作栏**：创建/反馈/设置/通知/晋升入口集中排列
- **标签页全宽**：内容区不再被侧边栏挤压
- **设置页重组**：晋升卡移出设置，账号设置和用户框定制分区卡片化
- **UserboxPicker 独立化**：从 1800 行的 UserCenter 中提取为独立组件`,
    type: 'info',
    pinned: false,
  },
  {
    title: '📖 阅读体验优化 — 抽屉改造 + 导航重构',
    content: `## 词条抽屉

冰山图详情页的词条抽屉进行了 7 项体验优化：

- **标题吸顶**：滚动时层级名和词条标题始终可见
- **底部导航**：长内容无需滚回顶部即可翻页
- **淡入过渡**：词条切换 80ms 交叉淡入，不再瞬切
- **滚动记忆**：关闭再打开同一词条恢复滚动位置
- **遮罩减淡**：75% 全黑 → 50% + 毛玻璃，冰山图隐约可见
- **键盘提示**：底部显示 ←→ 切换 · Esc 关闭

## 导航栏重构

- 从扁平"11 项 + 更多"改为**分类下拉**：探索 / 帮助 / 关于 三个功能分组
- 主栏保留 4 个核心入口（首页/广场/排行/创建）

## 排行榜扩展

- 新增**时间范围筛选**：本周 / 本月 / 全部
- 点赞数 tab 颜色统一为品牌祖母绿`,
    type: 'info',
    pinned: false,
  },
  {
    title: '⚡ 性能与可访问性优化',
    content: `## 性能

- **字体加载瘦身**：删除 4 个未使用的字重变体，首屏加载量减少约 66%
- **评论懒加载**：评论区改为滚动至可见时才加载，减少首屏 JS
- **QRCode 按需加载**：导出功能中的 QR 码库改为点击时才加载
- **后台轮询优化**：后台标签页暂停 API 轮询，减少无效请求
- **CSS 抽文件**：1178 行全局样式从 HTML 内联移至独立 CSS 文件，启用浏览器缓存

## 可访问性

- 18 个表单输入新增 aria-label
- 8 个纯图标按钮新增辅助标签
- 14 个装饰性 SVG 添加 aria-hidden="true"
- placeholder 文字对比度从 2.9:1 提升至 5.5:1（WCAG AA 达标）
- 全局 focus-visible 扩展至链接和可交互卡片
- 移动端页脚增加快捷链接（反馈/规则/条款/隐私）`,
    type: 'info',
    pinned: false,
  },
];

async function main() {
  const admin = await prisma.user.findFirst({
    where: { OR: [{ isFounder: true }, { role: 'ADMIN' }] },
    select: { id: true },
  });
  if (!admin) {
    console.error('No admin/founder user found.');
    process.exit(1);
  }
  console.log('Author ID:', admin.id);

  let n = 0;
  for (const ann of announcements) {
    await prisma.announcement.create({
      data: {
        title: ann.title,
        content: ann.content,
        type: ann.type,
        pinned: ann.pinned,
        banner: ann.pinned,
        authorId: admin.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    n++;
  }
  console.log('Created', n, 'announcements');
}

main().catch(console.error).finally(() => prisma.$disconnect());
