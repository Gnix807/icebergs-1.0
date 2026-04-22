// prisma/seed-achievements.mjs
// 将原版 _achievements.json 里的 47 个成就转换为新 conditions 格式并写入 DB
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// 原版成就数据（直接内嵌，对应 data/_achievements.json）
const LEGACY = [
  { key:'pioneer',    icon:'👁️',  labelZh:'初次接入',     label:'First Contact',  desc:'成功与深网数据库建立连接，你的 IP 已被记录。',               conditions:[{block:'totalRead',op:'>=',value:1}],                                                                color:'#6b7280', sortOrder:0,  isHidden:false },
  { key:'curious',    icon:'📖',  labelZh:'见习调查员',   label:'Apprentice',     desc:'初步了解冰山一角，世界似乎没有你想象的那么简单。',             conditions:[{block:'totalRead',op:'>=',value:10}],                                                               color:'#6b7280', sortOrder:1,  isHidden:false },
  { key:'tracker',    icon:'🕵️', labelZh:'异常现象追踪者',label:'Tracker',        desc:'你开始在庞杂的数据中寻找规律，理智值微幅下降。',               conditions:[{block:'totalRead',op:'>=',value:50}],                                                               color:'#6b7280', sortOrder:2,  isHidden:false },
  { key:'overload',   icon:'🧠',  labelZh:'信息过载',     label:'Overload',       desc:'大量冗余且怪异的信息涌入大脑，偶尔会出现幻听。',               conditions:[{block:'totalRead',op:'>=',value:100}],                                                              color:'#6b7280', sortOrder:3,  isHidden:false },
  { key:'abyss',      icon:'🌀',  labelZh:'深渊凝视者',   label:'Abyss Gazer',   desc:'当你凝视深渊时，深渊中的某些东西也注意到了你。',               conditions:[{block:'totalRead',op:'>=',value:250}],                                                              color:'#6b7280', sortOrder:4,  isHidden:false },
  { key:'hazard',     icon:'🩸',  labelZh:'认知危害',     label:'Cognitohazard', desc:'接触了过多不该知道的真相，你的世界观已不可逆转地崩塌。',         conditions:[{block:'totalRead',op:'>=',value:500}],                                                              color:'#ef4444', sortOrder:5,  isHidden:false },
  { key:'omniscient', icon:'👁️‍🗨️',labelZh:'全知之眼',    label:'Omniscient',    desc:'你已阅尽千帆。但全知，亦是全盲。',                             conditions:[{block:'totalRead',op:'>=',value:1000}],                                                             color:'#8b5cf6', sortOrder:6,  isHidden:false },
  { key:'meme',       icon:'💀',  labelZh:'模因感染者',   label:'Meme Infected', desc:'[数据删除]...[数据损坏]... 载体已同化。',                       conditions:[{block:'totalRead',op:'>=',value:2000}],                                                             color:'#dc2626', sortOrder:7,  isHidden:false },
  { key:'squid',      icon:'🐙',  labelZh:'盲目吃鱼者',   label:'Deep Diver',    desc:'在最深处，隐藏着人类无法理解的庞然大物。',                     conditions:[{block:'isBottomTier',op:'==',value:true}],                                                          color:'#0ea5e9', sortOrder:8,  isHidden:false },
  { key:'allclear',   icon:'🗄️',  labelZh:'区域收容完成', label:'All Clear',     desc:'该区域内的所有异常档案已被你全面清点。',                       conditions:[{block:'all_clear',op:'==',value:true}],                                                             color:'#22c55e', sortOrder:9,  isHidden:false },
  { key:'nightowl1',  icon:'🌙',  labelZh:'午夜漫游',     label:'Night Owl',     desc:'夜深了，但你仍未安眠。是失眠，还是某种力量在召唤？',           conditions:[{block:'nightReadCount',op:'>=',value:1}],                                                           color:'#6b7280', sortOrder:10, isHidden:false },
  { key:'nightowl2',  icon:'🦉',  labelZh:'守夜人',       label:'Watchman',      desc:'在大多数人梦乡中时，你独自面对着屏幕的荧光。',                 conditions:[{block:'nightReadCount',op:'>=',value:10}],                                                          color:'#6b7280', sortOrder:11, isHidden:false },
  { key:'nightowl3',  icon:'🕯️', labelZh:'逢魔时刻',     label:'Witching Hour', desc:'阴气最重之时，你点开了第 30 份诡异的档案。',                   conditions:[{block:'nightReadCount',op:'>=',value:30}],                                                          color:'#6b7280', sortOrder:12, isHidden:true  },
  { key:'nightowl4',  icon:'😴',  labelZh:'睡眠剥夺',     label:'Sleep Deprived',desc:'长期在深夜接触异常信息，你的神经已经极度衰弱。',               conditions:[{block:'nightReadCount',op:'>=',value:50}],                                                          color:'#6b7280', sortOrder:13, isHidden:true  },
  { key:'nightowl5',  icon:'🚪',  labelZh:'黑暗中的敲门声',label:'Knock',        desc:'别回头。就在刚才，有什么东西站在了你的门外。',                 conditions:[{block:'nightReadCount',op:'>=',value:100}],                                                         color:'#1f2937', sortOrder:14, isHidden:true  },
  { key:'search1',    icon:'🔎',  labelZh:'循迹而行',     label:'On Track',      desc:'首次使用检索系统，在茫茫数据海中寻找线索。',                   conditions:[{block:'searchCount',op:'>=',value:1}],                                                              color:'#6b7280', sortOrder:15, isHidden:false },
  { key:'search2',    icon:'🐕',  labelZh:'关键字嗅探',   label:'Keyword Hound', desc:'像猎犬一样，精准地通过标签定位目标信息。',                     conditions:[{block:'searchCount',op:'>=',value:10}],                                                             color:'#6b7280', sortOrder:16, isHidden:false },
  { key:'search3',    icon:'💻',  labelZh:'数据挖掘',     label:'Data Mining',   desc:'熟练掌握终端的高级检索，没有你找不到的机密。',                 conditions:[{block:'searchCount',op:'>=',value:50}],                                                             color:'#6b7280', sortOrder:17, isHidden:false },
  { key:'search4',    icon:'📡',  labelZh:'棱镜计划',     label:'PRISM',         desc:'你的检索记录本身，已经构成了一份庞大的行为监控档案。',         conditions:[{block:'searchCount',op:'>=',value:100}],                                                            color:'#6b7280', sortOrder:18, isHidden:false },
  { key:'search5',    icon:'🎯',  labelZh:'目标锁定',     label:'Locked On',     desc:'在信息的洪流中，精准狙击。',                                   conditions:[{block:'searchCount',op:'>=',value:200}],                                                            color:'#6b7280', sortOrder:19, isHidden:false },
  { key:'random1',    icon:'🎰',  labelZh:'量子跃迁',     label:'Quantum Leap',  desc:'放弃主动选择，将命运交给系统的伪随机数生成器。',               conditions:[{block:'randomCount',op:'>=',value:1}],                                                              color:'#6b7280', sortOrder:20, isHidden:false },
  { key:'random2',    icon:'💥',  labelZh:'混沌漫步',     label:'Chaos Walk',    desc:'在毫无关联的词条间反复横跳，试图寻找荒诞的联系。',             conditions:[{block:'randomCount',op:'>=',value:10}],                                                             color:'#6b7280', sortOrder:21, isHidden:true  },
  { key:'random3',    icon:'🎲',  labelZh:'掷骰子的神',   label:'God of Dice',   desc:'你开始享受这种盲盒般的信息刺激。',                             conditions:[{block:'randomCount',op:'>=',value:50}],                                                             color:'#6b7280', sortOrder:22, isHidden:false },
  { key:'random4',    icon:'🐱',  labelZh:'薛定谔的档案', label:"Schrödinger's", desc:'在点开之前，它既是真相也是谎言。',                             conditions:[{block:'randomCount',op:'>=',value:100}],                                                            color:'#6b7280', sortOrder:23, isHidden:false },
  { key:'random5',    icon:'🌌',  labelZh:'迷失于赛博空间',label:'Cyberspace',   desc:'你已经忘记了自己最初是要找什么了。',                           conditions:[{block:'randomCount',op:'>=',value:200}],                                                            color:'#6b7280', sortOrder:24, isHidden:false },
  { key:'label_con',  icon:'👽',  labelZh:'锡纸帽狂热者', label:'Tinfoil Hat',   desc:'登月是假的？地球是平的？你似乎对这些很感兴趣。',               conditions:[{block:'currentItemLabelContains',op:'contains',value:'阴谋论'}],                                    color:'#6b7280', sortOrder:25, isHidden:false },
  { key:'label_urb',  icon:'👻',  labelZh:'都市传说验证', label:'Urban Legend',  desc:'听说在午夜对着镜子削苹果，就能看到未来的画面...',              conditions:[{block:'currentItemLabelContains',op:'contains',value:'都市传说'}],                                   color:'#6b7280', sortOrder:26, isHidden:false },
  { key:'label_lost', icon:'📁',  labelZh:'网络谜踪',     label:'Lost Media',    desc:'这些影像资料本该在十年前就从互联网上彻底消失了。',             conditions:[{block:'currentItemLabelContains',op:'contains',value:'失传媒体'}],                                   color:'#6b7280', sortOrder:27, isHidden:false },
  { key:'label_gore', icon:'🩸',  labelZh:'猎奇者',       label:'Gore Fan',      desc:'强烈的好奇心战胜了生理上的不适。',                             conditions:[{block:'currentItemLabelContains',op:'contains',value:'猎奇'}],                                      color:'#6b7280', sortOrder:28, isHidden:false },
  { key:'404',        icon:'🐛',  labelZh:'404 Not Found',label:'404',           desc:'你的检索次数达到了一个充满隐喻的数字。',                       conditions:[{block:'searchCount',op:'==',value:404}],                                                            color:'#6b7280', sortOrder:29, isHidden:true  },
  { key:'devil',      icon:'😈',  labelZh:'恶魔的低语',   label:'Devil Whisper', desc:'你总共阅读了 666 个词条。小心背后的阴影。',                     conditions:[{block:'totalRead',op:'==',value:666}],                                                              color:'#dc2626', sortOrder:30, isHidden:true  },
  { key:'3am',        icon:'⏱️', labelZh:'凌晨三点的疯子',label:'3AM Maniac',   desc:'在凌晨 3 点整，且必须是通过"随机跃迁"功能点开词条。',          conditions:[{block:'currentHour',op:'==',value:3},{logic:'AND'},{block:'triggerType',op:'==',value:'random'}],   color:'#1f2937', sortOrder:31, isHidden:true  },
  { key:'deepdive',   icon:'⚓',  labelZh:'深海潜水病',   label:'Deep Sick',     desc:'在同一张图的最底端，连续查阅超过 10 个词条。',                 conditions:[{block:'isBottomTier',op:'==',value:true},{logic:'AND'},{block:'currentIcebergReadCount',op:'>=',value:10}], color:'#0ea5e9', sortOrder:32, isHidden:true  },
  { key:'speedrun',   icon:'🏃',  labelZh:'极速扫描仪',   label:'Speed Scanner', desc:'在单张冰山图里一口气点开了 50 个词条，没有停歇。',             conditions:[{block:'currentIcebergReadCount',op:'>=',value:50}],                                                 color:'#6b7280', sortOrder:33, isHidden:true  },
  { key:'epic',       icon:'🏔️', labelZh:'史诗级收容专家',label:'Epic Containment',desc:'完全通关了一张包含 100 个以上词条的超大型冰山图！',          conditions:[{block:'currentIcebergItemCount',op:'>=',value:100},{logic:'AND'},{block:'all_clear',op:'==',value:true}], color:'#f59e0b', sortOrder:34, isHidden:true  },
  { key:'monk',       icon:'🧘',  labelZh:'苦行僧',       label:'Ascetic',       desc:'从未使用过搜索功能，纯靠肉眼手动翻阅了 100 个词条。',          conditions:[{block:'hasEverSearched',op:'==',value:false},{logic:'AND'},{block:'totalRead',op:'>=',value:100}],  color:'#6b7280', sortOrder:35, isHidden:true  },
  { key:'lucky77',    icon:'🍀',  labelZh:'幸运的混沌',   label:'Lucky Chaos',   desc:'使用了刚好 77 次随机功能。',                                   conditions:[{block:'randomCount',op:'==',value:77}],                                                             color:'#22c55e', sortOrder:36, isHidden:true  },
  { key:'firstclear', icon:'🧛',  labelZh:'初拥',         label:'First Clear',   desc:'在这个网站上，第一次完成"单图全清"的壮举。',                   conditions:[{block:'unlockedAchievementCount',op:'<=',value:3},{logic:'AND'},{block:'all_clear',op:'==',value:true}], color:'#8b5cf6', sortOrder:37, isHidden:true  },
  { key:'o5',         icon:'🛡️', labelZh:'O5 议会成员',  label:'O5 Council',   desc:'【最高荣誉】阅读破 500、搜索破 50、随机破 50、且熬夜阅读破 20。',conditions:[{block:'totalRead',op:'>=',value:500},{logic:'AND'},{block:'searchCount',op:'>=',value:50},{logic:'AND'},{block:'randomCount',op:'>=',value:50},{logic:'AND'},{block:'nightReadCount',op:'>=',value:20}], color:'#f59e0b', sortOrder:38, isHidden:true  },
  { key:'redacted',   icon:'⬛',  labelZh:'权限受限',     label:'Redacted',      desc:'警告：你正试图访问高模因污染档案，部分数据已被强制涂黑。',     conditions:[{block:'currentItemTitleContains',op:'contains',value:'██'}],                                        color:'#1f2937', sortOrder:39, isHidden:true  },
  { key:'444',        icon:'☠️',  labelZh:'死神之视',     label:'Death Sight',   desc:'444 份档案已被你装进大脑。不要再看下去了。',                   conditions:[{block:'totalRead',op:'==',value:444}],                                                              color:'#dc2626', sortOrder:40, isHidden:true  },
  { key:'blind',      icon:'🦯',  labelZh:'盲信者',       label:'True Believer', desc:'拒绝使用检索系统。你如盲人般在黑暗的信息网络中摸索前行。',     conditions:[{block:'hasEverSearched',op:'==',value:false},{logic:'AND'},{block:'totalRead',op:'>=',value:80}],   color:'#6b7280', sortOrder:41, isHidden:true  },
  { key:'minimal',    icon:'💬',  labelZh:'极简主义恐惧', label:'Minimal Horror',desc:'只有寥寥几个字，但背后的寒意却爬上了你的脊背。',               conditions:[{block:'currentItemDescLength',op:'<=',value:10},{logic:'AND'},{block:'currentItemIsEmpty',op:'==',value:false}], color:'#6b7280', sortOrder:42, isHidden:true  },
  { key:'shallow',    icon:'🕷️', labelZh:'徘徊于浅滩',   label:'Shallow',       desc:'你在水面上徘徊了很久。你到底在害怕深处的什么？',               conditions:[{block:'currentIcebergReadCount',op:'>=',value:30},{logic:'AND'},{block:'isBottomTier',op:'==',value:false}], color:'#6b7280', sortOrder:43, isHidden:true  },
  { key:'chaos_order',icon:'⚖️', labelZh:'混沌与秩序',   label:'Balance',       desc:'在绝对的理智检索与疯狂的随机跃迁之间，你达到了诡异的平衡。',   conditions:[{block:'searchCount',op:'>=',value:30},{logic:'AND'},{block:'varEqual',op:'==',value:true,varA:'searchCount',varB:'randomCount'}], color:'#6b7280', sortOrder:44, isHidden:true  },
  { key:'brain_jar',  icon:'🪞',  labelZh:'缸中之脑',     label:'Brain in Jar',  desc:'42。你触碰到了宇宙的底层代码，系统即将强制重启。',             conditions:[{block:'totalRead',op:'==',value:42},{logic:'AND'},{block:'searchCount',op:'==',value:42},{logic:'AND'},{block:'randomCount',op:'==',value:42}], color:'#8b5cf6', sortOrder:45, isHidden:true  },
  { key:'immune',     icon:'🔌',  labelZh:'模因免疫',     label:'Immune',        desc:'面对海量的异常信息，你的理智竟然毫无波动。这本身就是一种异常。', conditions:[{block:'totalRead',op:'>=',value:100},{logic:'AND'},{block:'unlockedAchievementCount',op:'<=',value:1}], color:'#6b7280', sortOrder:46, isHidden:true  },
];

async function main() {
  console.log('开始迁移成就数据...');
  let created = 0, skipped = 0;

  for (const ach of LEGACY) {
    const existing = await prisma.achievement.findUnique({ where: { key: ach.key } });
    if (existing) { skipped++; continue; }

    await prisma.achievement.create({
      data: {
        key:           ach.key,
        icon:          ach.icon,
        label:         ach.label,
        labelZh:       ach.labelZh,
        desc:          ach.desc,
        color:         ach.color,
        triggerType:   'manual',       // 新成就全用 conditions
        triggerTarget: 0,
        sortOrder:     ach.sortOrder,
        isHidden:      ach.isHidden,
        conditions:    JSON.stringify(ach.conditions),
      },
    });
    created++;
  }

  console.log(`完成：新建 ${created} 条，跳过已存在 ${skipped} 条`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
