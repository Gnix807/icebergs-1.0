/**
 * Seed script — inserts SystemSettings default values and Achievement definitions.
 * Run once after db push: node prisma/seed.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULTS = [
  // 版主人数上限
  { key: 'moderator_max',            value: '5'    }, // 版主人数上限
  // 晋升门槛 — CONTRIBUTOR
  { key: 'contributor_min_score',    value: '20'   }, // 最低质量分
  { key: 'contributor_min_icebergs', value: '2'    }, // 最低冰山图数
  { key: 'contributor_min_days',     value: '7'    }, // 最低注册天数
  // 晋升门槛 — EDITOR
  { key: 'editor_min_score',         value: '100'  }, // 最低质量分
  { key: 'editor_min_days',          value: '30'   }, // 最低注册天数
  // 晋升门槛 — MODERATOR
  { key: 'moderator_min_score',      value: '300'  }, // 最低质量分
  { key: 'moderator_min_days',       value: '60'   }, // 最低注册天数
  // 管理员席位 & 选举
  { key: 'admin_max',                   value: '3'    }, // 最多 ADMIN 人数
  { key: 'election_apply_days',         value: '7'    }, // 候选人申请期（天），创建选举时默认填入
  { key: 'election_vote_days',          value: '14'   }, // 投票期（天）
  { key: 'election_candidate_min_days', value: '30'   }, // 候选人最低注册天数
  { key: 'election_vote_min_days',      value: '3'    }, // 投票者最低注册天数
  // 投票与选举 RfA
  { key: 'rfa_min_votes',               value: '5'    }, // EDITOR RfA 最低赞成票数（原始票，不加权）
  { key: 'rfa_admin_min_votes',         value: '10'   }, // ADMIN  RfA 最低有效票数
  { key: 'rfa_pass_ratio',              value: '0.67' }, // 通过比例（约 2/3）
  { key: 'rfa_vote_days',               value: '7'    }, // 投票期（天）
  { key: 'rfa_cooldown_days',           value: '15'   }, // 失败后冷却期（天）
  // 持续活跃质量分
  { key: 'activity_comment_score',     value: '1'  }, // 发表评论得分
  { key: 'activity_comment_daily_cap', value: '5'  }, // 每日最多计分条数
  { key: 'activity_vote_score',        value: '1'  }, // 首次投票得分（投票者）
  { key: 'activity_vote_daily_cap',    value: '3'  }, // 每日最多计分次数
  { key: 'activity_like_score',        value: '1'  }, // 评论被点赞得分（给作者）
  { key: 'activity_weekly_threshold',  value: '10' }, // 周奖励触发行为数（评论+投票之和）
  { key: 'activity_weekly_bonus',      value: '5'  }, // 周奖励分值
  // 弹劾流程
  { key: 'impeach_vote_days',   value: '7'    }, // 投票期（天）
  { key: 'impeach_pass_ratio',  value: '0.67' }, // 通过比例
  { key: 'impeach_min_votes',   value: '3'    }, // 最低支持票数（原始票，不加权）
  // 账号管理
  { key: 'warned1_auto_clear',       value: '90'   }, // 天，WARNED_1 自动清除
  { key: 'warned2_appeal_days',      value: '180'  }, // 天，WARNED_2 申诉冷却期
  { key: 'promotion_expire',         value: '30'   }, // 天，晋升申请过期
];

// 探索成就默认定义（管理员可在后台增删改）
const EXPLORE_ACHIEVEMENTS = [
  {
    key: 'explore_first',
    icon: '🤿', label: 'DIVER',    labelZh: '初探深渊',
    desc: '阅读了你的第一个词条',
    color: '#22c55e', triggerType: 'read_count', triggerTarget: 1,  sortOrder: 1,
  },
  {
    key: 'explore_10',
    icon: '📖', label: 'READER',   labelZh: '求知若渴',
    desc: '累计阅读 10 个不同的词条',
    color: '#3b82f6', triggerType: 'read_count', triggerTarget: 10, sortOrder: 2,
  },
  {
    key: 'explore_50',
    icon: '🧠', label: 'SCHOLAR',  labelZh: '深海学者',
    desc: '累计阅读 50 个不同的词条',
    color: '#8b5cf6', triggerType: 'read_count', triggerTarget: 50, sortOrder: 3,
  },
  {
    key: 'explore_depth',
    icon: '🦑', label: 'ABYSSAL',  labelZh: '触及海底',
    desc: '胆量惊人，阅读了冰山最底层的一个词条',
    color: '#ef4444', triggerType: 'bottom_tier', triggerTarget: 0, sortOrder: 4,
  },
  {
    key: 'explore_all_clear',
    icon: '👑', label: 'COMPLETE', labelZh: '全知全能',
    desc: '单次探索中，读完了一张冰山的所有词条',
    color: '#f59e0b', triggerType: 'all_clear',   triggerTarget: 0, sortOrder: 5,
  },
];

async function main() {
  for (const row of DEFAULTS) {
    await prisma.systemSettings.upsert({
      where: { key: row.key },
      update: {},
      create: row,
    });
  }
  console.log(`Seeded ${DEFAULTS.length} SystemSettings entries.`);

  for (const ach of EXPLORE_ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { key: ach.key },
      update: {}, // 不覆盖管理员修改过的内容
      create: ach,
    });
  }
  console.log(`Seeded ${EXPLORE_ACHIEVEMENTS.length} Achievement definitions.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
