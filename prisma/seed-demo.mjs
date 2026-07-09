/**
 * seed-demo.mjs — 生成演示冰山图数据，解决冷启动空城问题
 *
 * 用法: node prisma/seed-demo.mjs
 * 需要先执行 prisma/seed.mjs 初始化系统配置
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMOS = [
  {
    title: '互联网迷因简史',
    description: '从跳舞婴儿到 Doge，从 Rickroll 到 Skibidi Toilet——互联网迷因如何塑造了一代人的文化记忆。',
    topic: 'internet',
    tiers: [
      { name: '大众熟知的迷因', desc: '', items: [
        { title: 'Doge', desc: '一只柴犬的照片配上 Comic Sans 字体，2013 年爆红，催生了 Dogecoin 加密货币。' },
        { title: 'Rickroll', desc: '2007 年起流行的恶作剧——发送看似相关的链接，实际指向 Rick Astley 的 Never Gonna Give You Up MV。' },
        { title: 'Distracted Boyfriend', desc: '2015 年 iStock 上的库存照片，2017 年被网友发掘成为万能出轨/分心表情包。' },
        { title: 'Nyan Cat', desc: '2011 年 YouTube 上传的像素猫咪动画，搭配循环播放的合成音乐，成为早期互联网的标志性迷因。' },
        { title: 'Pepe the Frog', desc: '创作者 Matt Furie 于 2005 年创作的漫画角色，2010 年代被 4chan 大量改编。' },
      ]},
      { name: '亚文化圈子迷因', desc: '', items: [
        { title: 'Loss.jpg', desc: 'Ctrl+Alt+Del 漫画中关于流产的严肃情节，因其过于突兀的画风转变被 4chan 拆解为极简像素梗图。' },
        { title: 'Wojak / Feels Guy', desc: '源自 Something Awful 论坛的涂鸦风格人脸，用于表达各种情绪状态，衍生出 Doomer、Soyjak 等变体。' },
        { title: 'Polandball', desc: '2009 年起源于 Krautchan 的國家人格化漫画——将各国画成带国旗的圆球，用破烂英语讨论国际关系。' },
      ]},
      { name: '深层迷因考古', desc: '', items: [
        { title: 'This Is My Hole! (The Enigma of Amigara Fault)', desc: '伊藤润二 2002 年创作的恐怖短篇——山体上出现人形洞，人们被不可抗拒的冲动吸引钻进属于自己的洞里。' },
        { title: 'Saki Sanobashi (Go For a Punch)', desc: '2015 年 4chan 用户声称看过一部 80 年代日本 OVA 动画，描述一群被困厕所的裸体少女的恐怖故事。至今未被证实存在。' },
        { title: 'Selene Delgado', desc: '2018 年委内瑞拉电视台插播的走失儿童公告，因模特照片过于诡异恐怖引发大规模网络讨论和 Creepypasta 创作。' },
      ]},
    ],
  },
  {
    title: '都市传说与未解之谜',
    description: '从 Slender Man 到消失的航班，这些真真假假的故事构成了现代民间传说中最引人入胜的篇章。',
    topic: 'urban_legend',
    tiers: [
      { name: '流行文化中的都市传说', desc: '', items: [
        { title: 'Slender Man', desc: '2009 年 Something Awful 论坛创造的无脸瘦高西装男，2014 年引发一起真实的未遂杀人案。' },
        { title: 'Bloody Mary', desc: '对着镜子重复念三次 Mary 的名字，据说会召唤出复仇的鬼魂。这个游戏在美国校园流传超过 50 年。' },
        { title: '哭泣的男孩画作', desc: '1985 年英国《太阳报》报道——多起火灾中唯一未烧毁的都是这幅哭泣小男孩的画，引发全国恐慌。' },
      ]},
      { name: '地方传说与目击事件', desc: '', items: [
        { title: '天蛾人 (Mothman)', desc: '1966-67 年西弗吉尼亚州 Point Pleasant 出现的神秘有翼人形生物，被 2002 年电影《天蛾人的预言》进一步推入流行文化。' },
        { title: '多佛恶魔 (Dover Demon)', desc: '1977 年马萨诸塞州三名青少年连续两个晚上目击的橙眼无毛大头生物，仅在两天内出现后消失。' },
        { title: '山羊人诅咒 (Goatman\'s Bridge)', desc: '德克萨斯州 Old Alton Bridge 的传说——一个黑人牧羊人被三 K 党吊死在桥上，现在桥上有时会传出羊叫声和鬼影。' },
      ]},
      { name: '深层阴谋与替代历史', desc: '', items: [
        { title: '曼德拉效应 (Mandela Effect)', desc: '大量不相关的人对同一历史事件拥有相同的错误记忆——最著名的是 Nelson Mandela 被误认为 1980 年代死于狱中。' },
        { title: '消失的第 9 号指挥所 (NAVY POD)', desc: '1978 年苏联太平洋舰队一次未公开记录的核潜艇灾难事件，据传整艘潜艇和全体船员在无线电静默中消失。' },
        { title: 'Max Headroom 信号劫持事件', desc: '1987 年芝加哥两家电视台信号被不明人士劫持，播出了一段穿着 Max Headroom 面具的神秘人物视频。至今未破案。' },
      ]},
    ],
  },
  {
    title: '游戏开发秘闻录',
    description: '那些影响了一代人的经典游戏背后，藏着哪些不为人知的开发故事、彩蛋和被废弃的创意？',
    topic: 'game',
    tiers: [
      { name: '经典彩蛋与秘技', desc: '', items: [
        { title: '魂斗罗 30 条命秘籍', desc: '上上下下左右左右 BA——这个最著名的 Konami 密码最初是为《Gradius》设计的，因为开发者自己都打不通自己的游戏。' },
        { title: '《Minecraft》的 C418 音乐', desc: '德国音乐人 Daniel Rosenfeld 在独立游戏论坛上被 Notch 发掘，成为 Minecraft 配乐的创作者。他的作品至今仍是游戏中最具标志性的声音。' },
        { title: '《塞尔达传说》的林克命名由来', desc: 'Link 的名字意为"连接"——宫本茂希望这个角色成为玩家与游戏世界之间的纽带。早期开发中他甚至叫 Chris。' },
      ]},
      { name: '被砍掉的经典项目', desc: '', items: [
        { title: 'StarCraft: Ghost', desc: '暴雪 2002 年公布的第三人称潜行射击游戏，以 Nova 为主角。经过多次推迟后于 2014 年正式取消。' },
        { title: 'Half-Life 2: Episode 3 / Half-Life 3', desc: '游戏史上最著名的"有生之年"系列。Marc Laidlaw 于 2017 年在个人网站上发布了剧情大纲。' },
        { title: 'Silent Hills (P.T.)', desc: '小岛秀夫与 Guillermo del Toro 合作的恐怖游戏，2014 年的可玩预告片 P.T. 被认为是史上最恐怖的 Demo。2015 年 Konami 取消项目。' },
      ]},
      { name: '开发者秘辛与行业潜规则', desc: '', items: [
        { title: 'Polybius 街机传说', desc: '据传 1981 年俄勒冈州出现了一台名为 Polybius 的街机，玩过的玩家会出现噩梦、失忆和自杀倾向。一些爱好者认为这是 CIA 的行为实验。' },
        { title: '《超级马里奥 64》的"每个拷贝都是个性化"理论', desc: '2020 年 9 月爆发的互联网现象——玩家声称每个人的卡带里马里奥的动作、AI 行为都略有不同。实际上是随机种子带来的正常行为差异。' },
        { title: '任天堂 PlayStation 原型机', desc: '1991 年索尼和任天堂合作开发的 CD-ROM 版 SNES 原型机。合作破裂后仅生产了约 200 台，2015 年一台在阁楼被发现并以 30 万美元拍卖。' },
      ]},
    ],
  },
];

async function main() {
  console.log('Seeding demo icebergs...');

  for (const demo of DEMOS) {
    const slug = 'demo_' + Math.random().toString(36).slice(2, 10);

    const existing = await prisma.iceberg.findFirst({ where: { slug } });
    if (existing) {
      console.log(`  Skip: ${demo.title} (already exists)`);
      continue;
    }

    // 使用第一个 admin 账号作为作者
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    if (!admin) { console.error('  没有管理员账号，跳过演示数据'); return; }
    const authorId = admin.id;

    await prisma.iceberg.create({
      data: {
        slug,
        title: demo.title,
        description: demo.description,
        topic: demo.topic,
        status: 'PUBLISHED',
        featured: true,
        authorId,
        viewCount: Math.floor(Math.random() * 500) + 100,
        tiers: {
          create: demo.tiers.map((t, ti) => ({
            name: t.name,
            desc: t.desc,
            order: ti,
            items: {
              create: t.items.map((it, ii) => ({
                title: it.title,
                desc: it.desc,
                order: ii,
              })),
            },
          })),
        },
      },
    });

    console.log(`  Created: ${demo.title}`);
  }

  console.log('Demo seeding complete.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
