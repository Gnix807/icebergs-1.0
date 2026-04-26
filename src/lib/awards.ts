// 管理员/站长可授予的勋章定义
export const AWARD_TYPES = [
  {
    id: 'quality_star',
    icon: '✦',
    label: 'QUALITY STAR',
    labelZh: '优质内容星',
    desc: '贡献了高质量冰山图内容',
    color: '#f59e0b',
    bg: '#f59e0b',
  },
  {
    id: 'community_star',
    icon: '◈',
    label: 'COMMUNITY STAR',
    labelZh: '社区建设星',
    desc: '对社区发展有重要贡献',
    color: '#22c55e',
    bg: '#22c55e',
  },
  {
    id: 'creative_star',
    icon: '◆',
    label: 'CREATIVE STAR',
    labelZh: '创意先锋星',
    desc: '展现了创新性内容创作',
    color: '#8b5cf6',
    bg: '#8b5cf6',
  },
  {
    id: 'helpful_star',
    icon: '★',
    label: 'HELPFUL STAR',
    labelZh: '热心助人星',
    desc: '积极协助其他用户',
    color: '#06b6d4',
    bg: '#06b6d4',
  },
  {
    id: 'outstanding_star',
    icon: '⬡',
    label: 'OUTSTANDING',
    labelZh: '杰出贡献星',
    desc: '长期卓越贡献，获特别表彰',
    color: '#ef4444',
    bg: '#ef4444',
  },
] as const;

export type AwardTypeId = typeof AWARD_TYPES[number]['id'];

export function getAwardDef(id: string) {
  return AWARD_TYPES.find(a => a.id === id);
}

// 用户框预设库
export const USERBOX_MAX_SLOTS = 6;
export const USERBOX_BASE_SLOTS = 3;

export type UserboxDef = {
  id: string;
  leftBg: string;
  leftFg: string;
  leftText: string;
  text: string;
  /** 需要持有此社区成就 ID 才能选用 */
  requires?: string;
  /** 解锁提示文案 */
  requiresLabel?: string;
};

export const USERBOX_LIBRARY: Array<{
  category: string;
  boxes: UserboxDef[];
}> = [
  {
    category: '内容兴趣',
    boxes: [
      { id: 'interest_history',  leftBg: '#3b1f1f', leftFg: '#fca5a5', leftText: 'HIST', text: '该用户对历史研究感兴趣' },
      { id: 'interest_science',  leftBg: '#1f2a3b', leftFg: '#93c5fd', leftText: 'SCI',  text: '该用户热爱科学探索' },
      { id: 'interest_culture',  leftBg: '#2a1f3b', leftFg: '#c4b5fd', leftText: 'CULT', text: '该用户关注文化与人文' },
      { id: 'interest_tech',     leftBg: '#1f3b2a', leftFg: '#6ee7b7', leftText: 'TECH', text: '该用户痴迷于技术与工程' },
      { id: 'interest_art',      leftBg: '#3b2a1f', leftFg: '#fcd34d', leftText: 'ART',  text: '该用户热衷于艺术与美学' },
      { id: 'interest_geo',      leftBg: '#1f3b3b', leftFg: '#67e8f9', leftText: 'GEO',  text: '该用户对地理与地缘感兴趣' },
      { id: 'interest_nature',   leftBg: '#1a3b1f', leftFg: '#86efac', leftText: 'NAT',  text: '该用户探索自然与生态' },
      { id: 'interest_mystery',  leftBg: '#1f1f3b', leftFg: '#a5b4fc', leftText: '???',  text: '该用户着迷于未解之谜' },
    ],
  },
  {
    category: '贡献风格',
    boxes: [
      { id: 'style_creator',    leftBg: '#003300', leftFg: '#00FF41', leftText: 'CRT',  text: '该用户是活跃的冰山图创作者',
        requires: 'pioneer',  requiresLabel: '探路者成就（发布首篇冰山图）' },
      { id: 'style_researcher', leftBg: '#002233', leftFg: '#38bdf8', leftText: 'RSC',  text: '该用户注重深度研究与引证',
        requires: 'analyst',  requiresLabel: '分析师成就（质量分达到 100）' },
      { id: 'style_explorer',   leftBg: '#1f2a00', leftFg: '#bef264', leftText: 'EXP',  text: '该用户广泛探索各类冰山图' },
      { id: 'style_editor',     leftBg: '#330033', leftFg: '#f0abfc', leftText: 'EDT',  text: '该用户致力于内容质量审核' },
      { id: 'style_voter',      leftBg: '#330011', leftFg: '#fda4af', leftText: 'VOT',  text: '该用户积极参与内容投票' },
    ],
  },
  {
    category: '个性标签',
    boxes: [
      { id: 'persona_nightowl',      leftBg: '#0d0d2b', leftFg: '#818cf8', leftText: '🌙', text: '该用户是夜猫子' },
      { id: 'persona_perfectionist', leftBg: '#1f1a00', leftFg: '#fbbf24', leftText: '◎',  text: '该用户追求完美' },
      { id: 'persona_wikifan',       leftBg: '#1a1a1a', leftFg: '#9ca3af', leftText: 'WK', text: '该用户是百科全书爱好者' },
      { id: 'persona_deepdiver',     leftBg: '#001a33', leftFg: '#7dd3fc', leftText: '▼',  text: '该用户喜欢深度挖掘冷知识' },
      { id: 'persona_veteran',       leftBg: '#1a0d00', leftFg: '#fb923c', leftText: 'VET', text: '该用户是本站资深成员',
        requires: 'veteran', requiresLabel: '资深者成就（注册满 180 天）' },
    ],
  },
];

export function getUserboxDef(id: string) {
  for (const cat of USERBOX_LIBRARY) {
    const box = cat.boxes.find(b => b.id === id);
    if (box) return box;
  }
  return null;
}
