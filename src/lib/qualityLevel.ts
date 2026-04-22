export interface QualityLevel {
  level: number;
  label: string;       // e.g. "RESEARCHER"
  labelZh: string;     // e.g. "研究员"
  score: number;
  nextScore: number | null;  // null = max level
  progress: number;    // 0-1
}

const LEVELS = [
  { level: 0, label: 'VISITOR',    labelZh: '访客',   min: 0   },
  { level: 1, label: 'RESEARCHER', labelZh: '研究员', min: 10  },
  { level: 2, label: 'ANALYST',    labelZh: '分析师', min: 100 },
  { level: 3, label: 'SUPERVISOR', labelZh: '主管',   min: 500 },
];

export function getQualityLevel(score: number, role: string): QualityLevel {
  if (role === 'ADMIN') {
    return { level: 4, label: 'ADMIN', labelZh: '管理员', score, nextScore: null, progress: 1 };
  }

  let current = LEVELS[0];
  for (const l of LEVELS) {
    if (score >= l.min) current = l;
    else break;
  }

  const nextLevel = LEVELS.find(l => l.level === current.level + 1) ?? null;
  const prevMin = current.min;
  const nextMin = nextLevel?.min ?? null;

  const progress = nextMin !== null
    ? Math.min((score - prevMin) / (nextMin - prevMin), 1)
    : 1;

  return {
    level: current.level,
    label: current.label,
    labelZh: current.labelZh,
    score,
    nextScore: nextMin,
    progress,
  };
}

// 积分操作（简化版 Q1-B）
export const SCORE_ACTIONS = {
  iceberg_created:  5,   // 创建冰山图
  vote_received_up: 1,   // 收到上投票
  vote_received_down: -1, // 收到下投票
} as const;
