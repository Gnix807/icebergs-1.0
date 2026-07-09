<p align="center">
  <img src="public/favicon.svg" width="80" alt="Iceberg Universe" />
</p>

<h1 align="center">冰 山 图 宇 宙</h1>

<p align="center">
  <a href="https://icebergs.gnix807.cn"><img src="https://img.shields.io/badge/website-online-00FF41" alt="online" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" /></a>
</p>

<br />

> 你有没有过这种感觉——你以为自己很了解某件事，直到有一天发现，那只是冰山一角。

我就是因为这种感觉上了头，然后花了几个月建了这个站。

---

简单说，这是一个**冰山图社区**。大家把各种话题按认知深度拆成好几层，从"地球人都知道"一直排到"全站不超过 50 个人知道"。

现在站上有三座冰山：

- 🕳️ **中文兔子洞冰山图** · 那些点进去就再也出不来的中文互联网深坑
- 🤪 **奇异搞笑互联网冰山图** · 早期论坛神帖、抽象文化、离谱名场面合集
- 📼 **中文失传媒体冰山图** · 曾经存在但今天很难找到的中文影像、文字和软件

你可以随便逛、搜索、点随机碰运气。排行榜前三名有金银铜边框——没错，就是这个味儿。

---

建一座冰山不难。编辑器是所见即所得的：左边加层级和条目，右边实时预览。写解释、打标签、附来源链接，跟写 Wiki 差不多。中途随时存草稿，关掉浏览器回来接着写。还可以拉人协作。

提交之前系统会帮你检查——标题够不够长、层级够不够多、条目密不密集——过了就进审核，审核过了就上站。

---

每个冰山都能投票、评论。投票和评论会涨品质分，品质分够了会解锁成就。从"访客"到"研究员"到"分析师"到"督导者"，徽章挂头像旁边。

系统会偷偷记你的浏览数、评论数、深夜访问次数——**半夜逛冰山真的会被发现，有一个成就就是干这个的。**

---

除了冰山本身，还有一些别的：

**创意板** — 想看某个话题但还没人建冰山？先挂个创意，让别人来认领。**专题协作** — 开个项目组，用看板管任务，组队建冰山。**社区治理** — 编辑资格公开选举产生，管理员也可以被弹劾。不是一个人说了算。

暗色终端绿主题，CRT 扫描线可开关，也有浅色模式，在设置里切。

---

## 想参与？

最直接的参与方式：**去站上建一座冰山**。这是这个项目存在的唯一理由。

如果你会写代码：

```bash
git clone https://github.com/Gnix807/icebergs-1.0.git
cd icebergs-1.0/frontend
cp .env.example .env
npm install
npm run dev
```

修 bug 直接提 PR，新功能先开个 Issue 聊聊。别担心代码不够好——这整个项目是一个人加四个 AI 写的，能乱到哪里去。

---

## 部署

Docker 一把梭：

```bash
git clone https://github.com/Gnix807/icebergs-1.0.git /opt/icebergs
cd /opt/icebergs
cp .env.docker .env    # 把 OAuth 密钥填进去
docker compose up -d   # 自动建库、迁移、种子、启动
```

然后 nginx 反代到 4321 端口，配 SSL。更新就 `git pull && docker compose up -d --build`。

不想用 Docker 也行，Node.js 22 + PostgreSQL 18，手动跑一遍 `npm install → prisma db push → seed → build`，再用进程守护托管就行。

---

## 致谢

我一个人不可能搞出这个体量的全栈项目。大部分代码是跟 AI 一起写的——

| | |
|---|---|
| **Claude / Claude Code** | 架构设计、功能开发、改了无数 bug |
| **OpenCode** | 代码审查、压住了好多我乱写的逻辑 |
| **DeepSeek** | 后端逻辑和数据处理帮了大忙 |
| **GPT / ChatGPT** | 前端组件和 UI 细节 |

还有 **Astro**、**React**、**Prisma**、**PostgreSQL** 这些开源基础设施——没有它们这项目连搭都搭不起来。

---

MIT · [icebergs.gnix807.cn](https://icebergs.gnix807.cn)
