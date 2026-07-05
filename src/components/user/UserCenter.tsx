import { useState, useEffect, useRef, type ComponentType } from 'react';
import { AWARD_TYPES, USERBOX_BASE_SLOTS, USERBOX_MAX_SLOTS, USERBOX_LIBRARY } from '../../lib/awards';
import { UserboxPicker } from './UserboxPicker';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { Layers, Anchor, BookOpen, Brain, Fish, Trophy } from 'lucide-react';

// 探索成就 key → Lucide 图标组件映射（DB 中的 icon 字段作为降级备用）
const EXPLORE_ICON_MAP: Record<string, ComponentType<{ size?: number; strokeWidth?: number; color?: string }>> = {
  explore_first:     Anchor,
  explore_10:        BookOpen,
  explore_50:        Brain,
  explore_depth:     Fish,
  explore_all_clear: Trophy,
};
import { UserIcebergs } from './UserIcebergs';
import { UserWatchlist } from './UserWatchlist';
import { UserSettings } from './UserSettings';
import { AdminPanel } from '../admin/AdminPanel';
import { getQualityLevel } from '../../lib/qualityLevel';
import { toast } from '../ui/Toast';

interface Iceberg {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: string;
  viewCount: number;
  createdAt: string;
  _count: { tiers: number };
}

interface User {
  id: string;
  username: string;
  nickname: string | null;
  role: string;
  status: string;
  banUntil: string | null;
  createdAt: string;
  bio: string | null;
  avatar: string | null;
  qualityScore: number;
  isFounder?: boolean;
  privacyShowStats: boolean;
  privacyShowWatchlist: boolean;
  _count: { icebergs: number };
}

interface SocialStats {
  totalViews: number;
  totalVotes: number;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface AchievementDef {
  key: string;
  icon: string;
  label: string;
  labelZh: string;
  desc: string;
  color: string;
  triggerType: string;
  triggerTarget: number;
  sortOrder: number;
  isHidden: boolean;
}

interface Props {
  user: User;
  icebergs: Iceberg[];
  isOwner: boolean;
  presenceStatus?: 'online' | 'active' | 'offline';
  viewerRole?: string;
  viewerIsFounder?: boolean;
  appealEligible?: boolean;
  promotionEligible?: boolean;
  promotionPending?: boolean;
  rfaEligible?: boolean;       // CONTRIBUTOR + 满足门槛
  rfaPending?: boolean;        // 已有 OPEN 的 RfA
  rfaActiveId?: string | null; // 进行中的 RfA id（用于跳转）
  socialStats?: SocialStats;
  achievements?: { achievementId: string; unlockedAt: string }[];
  achievementDefs?: AchievementDef[];
  userReadCount?: number;
  watchlistCount?: number;
  awards?: { id: string; type: string; message: string | null; createdAt: string; giver: { id: string; username: string; nickname: string | null } }[];
  userboxIds?: string[];
}

type Tab = 'icebergs' | 'drafts' | 'watchlist' | 'explore' | 'score' | 'settings' | 'admin';

const LEVEL_COLORS: Record<number, string> = {
  0: '#6b7280',
  1: '#22c55e',
  2: '#3b82f6',
  3: '#f59e0b',
  4: '#ef4444',
};

const LEVEL_LABELS: Record<number, string> = {
  0: '访客',
  1: '研究员',
  2: '分析师',
  3: '主管',
  4: '管理员',
};

const ROLE_BADGES: Record<string, { label: string; color: string }> = {
  ADMIN:       { label: 'ADMIN',   color: '#ef4444' },
  EDITOR:      { label: 'EDITOR',  color: '#3b82f6' },
  CONTRIBUTOR: { label: 'CONTRIB', color: '#22c55e' },
  USER:        { label: 'USER',    color: '#6b7280' },
};

type PresenceStatus = 'online' | 'active' | 'offline';
const PRESENCE_META: Record<PresenceStatus, { label: string; dot: string; text: string; pulse: boolean; hint: string }> = {
  online:  { label: 'ONLINE', dot: '#22c55e', text: '#86efac', pulse: true,  hint: '当前登录中' },
  active:  { label: 'ACTIVE', dot: '#f59e0b', text: '#fbbf24', pulse: false, hint: '今日有访问记录' },
  offline: { label: 'OFFLINE', dot: '#6e7681', text: '#6e7681', pulse: false, hint: '暂无今日访问记录' },
};

const NOTIF_ICONS: Record<string, { icon: string; color: string }> = {
  iceberg_approved:   { icon: '✓', color: '#22c55e' },
  iceberg_rejected:   { icon: '✕', color: '#ef4444' },
  promotion_approved: { icon: '★', color: '#f59e0b' },
  promotion_rejected: { icon: '✕', color: '#ef4444' },
  appeal_approved:    { icon: '✓', color: '#22c55e' },
  appeal_rejected:    { icon: '✕', color: '#ef4444' },
  warned:             { icon: '!', color: '#f97316' },
  restricted:         { icon: '⊘', color: '#3b82f6' },
  banned:             { icon: '✕', color: '#ef4444' },
  unbanned:           { icon: '✓', color: '#22c55e' },
  comment_reply:      { icon: '↩', color: '#00FF41' },
  rfa_submitted:      { icon: '◈', color: '#3b82f6' },
  rfa_vote:           { icon: '○', color: '#6b7280' },
  rfa_approved:       { icon: '★', color: '#8b5cf6' },
  rfa_rejected:       { icon: '✕', color: '#ef4444' },
  weekly_bonus:       { icon: '◆', color: '#f59e0b' },
  impeach_initiated:  { icon: '⚑', color: '#ef4444' },
  impeach_vote:       { icon: '○', color: '#ef4444' },
  impeach_passed:     { icon: '▼', color: '#8b5cf6' },
  impeach_rejected:   { icon: '✓', color: '#22c55e' },
  award_received:     { icon: '✦', color: '#f59e0b' },
};

const COMMUNITY_BADGES = [
  { id: 'pioneer',  icon: '◈', label: 'PIONEER',  labelZh: '探路者', desc: '发布首篇冰山图',  color: '#22c55e', founderOnly: false },
  { id: 'prolific', icon: '◉', label: 'PROLIFIC', labelZh: '多产者', desc: '累计发布 10 篇', color: '#06b6d4', founderOnly: false },
  { id: 'popular',  icon: '★', label: 'POPULAR',  labelZh: '受众者', desc: '累计获赞 50+',   color: '#f59e0b', founderOnly: false },
  { id: 'analyst',  icon: '◆', label: 'ANALYST',  labelZh: '分析师', desc: '质量分达到 100', color: '#3b82f6', founderOnly: false },
  { id: 'veteran',  icon: '⬡', label: 'VETERAN',  labelZh: '资深者', desc: '注册满 180 天',  color: '#8b5cf6', founderOnly: false },
  { id: 'scholar',  icon: '✦', label: 'SCHOLAR',  labelZh: '学者',   desc: '质量分达到 500', color: '#ef4444', founderOnly: false },
  { id: 'origin',   icon: '⍟', label: 'ORIGIN',   labelZh: '缔造者', desc: '冰山图宇宙创始人，博览群类，无所不通', color: '#f59e0b', founderOnly: true },
] as const;

// ── 质量分记录 Tab 子组件 ──────────────────────────────────────────────────
const SCORE_REASON_META: Record<string, { label: string; icon: string; color: string }> = {
  comment:         { label: '发表评论',     icon: '◎', color: '#22c55e'  },
  vote_cast:       { label: '投票',         icon: '○', color: '#3b82f6'  },
  comment_liked:   { label: '评论被点赞',   icon: '★', color: '#f59e0b'  },
  iceberg_created: { label: '提交审核（新稿）', icon: '◈', color: '#00FF41'  },
  iceberg_voted:   { label: '冰山图投票',   icon: '◆', color: '#8b5cf6'  },
  promoted:        { label: '晋升奖励',     icon: '▲', color: '#f59e0b'  },
  weekly_bonus:    { label: '周活跃奖励',   icon: '◉', color: '#ec4899'  },
};

interface ScoreLogEntry {
  id: string;
  delta: number;
  reason: string;
  note: string | null;
  createdAt: string;
}

function ScoreLogTab({ userId }: { userId: string }) {
  const [logs,    setLogs]    = useState<ScoreLogEntry[]>([]);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/users/${userId}/score-log?page=${page}&limit=20`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setLogs(d.data.items);
          setTotal(d.data.meta.total);
          setPages(d.data.meta.totalPages);
        }
      })
      .finally(() => setLoading(false));
  }, [userId, page]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 bg-surface-2 border border-border-subtle animate-pulse" />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="py-20 text-center border border-dashed border-border-subtle">
        <p className="text-text-mid font-mono text-sm">暂无质量分记录</p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[10px] font-mono text-text-mid mb-4">
        // 共 {total} 条记录
      </div>
      <div className="space-y-1.5">
        {logs.map(log => {
          const meta = SCORE_REASON_META[log.reason] ?? { label: log.reason, icon: '·', color: '#6b7280' };
          return (
            <div key={log.id} className="flex items-center gap-3 px-4 py-3 border border-border-subtle bg-surface-2">
              <span className="text-base flex-shrink-0" style={{ color: meta.color }}>{meta.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-mono text-text-body">{meta.label}</span>
                {log.note && (
                  <span className="ml-2 text-[10px] font-mono text-text-mid truncate">{log.note}</span>
                )}
              </div>
              <span className={`text-sm font-mono font-bold tabular-nums flex-shrink-0 ${log.delta >= 0 ? 'text-success' : 'text-danger'}`}>
                {log.delta >= 0 ? `+${log.delta}` : log.delta}
              </span>
              <span className="text-[10px] font-mono text-text-lo flex-shrink-0 w-20 text-right">
                {new Date(log.createdAt).toLocaleDateString('zh-CN')}
              </span>
            </div>
          );
        })}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-[10px] font-mono border border-border-subtle text-text-lo hover:border-border hover:text-text-body disabled:opacity-30 transition-colors"
          >← 上一页</button>
          <span className="text-[10px] font-mono text-text-mid">{page} / {pages}</span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page >= pages}
            className="px-3 py-1.5 text-[10px] font-mono border border-border-subtle text-text-lo hover:border-border hover:text-text-body disabled:opacity-30 transition-colors"
          >下一页 →</button>
        </div>
      )}
    </div>
  );
}

// ── 探索成就 Tab 子组件 ────────────────────────────────────────────────────

function achCategory(key: string): string {
  if (/^(explore_first|explore_10|explore_50|explore_depth|explore_all_clear|pioneer|curious|tracker|overload|abyss|hazard|omniscient|meme|read_|num_|devil|brain_jar|allclear|deepdive|speedrun|epic|firstclear|shallow|squid|404|p3_all_clear|p3_1000_read)/.test(key)) return '阅读';
  if (/^create_|^p3_create_/.test(key)) return '创作';
  if (/^vote_|^p3_vote_/.test(key)) return '投票';
  if (/^watch_|^p3_watch_/.test(key)) return '收藏';
  if (/^quality_|^p3_quality_/.test(key)) return '质量';
  if (/^search|^p3_search_|^(monk|blind|p3_nosearch|chaos_order|p3_dual_)/.test(key)) return '搜索';
  if (/^random|^lucky|^p3_randomdeep/.test(key)) return '随机';
  if (/^nightowl|^3am|^p3_latenight/.test(key)) return '深夜';
  if (/^streak_|^globe_|^p3_globe_|^p3_streak_/.test(key)) return '坚持';
  if (/^time_|^day_|^p3_afterwork|^p3_weekend|^p3_leap|^p3_founders|^p3_session_3h/.test(key)) return '时刻';
  if (/^label_|^p3_label_/.test(key)) return '标签';
  if (/^item_|^minimal|^redacted|^p3_gargantuan|^p3_prime|^p3_777/.test(key)) return '词条';
  if (/^p3_join_|^p3_proj_|^p3_createproj|^p3_both_|^p3_idea_|^p3_task_|^p3_collab_/.test(key)) return '协作';
  if (/^p3_balance|^p3_fork|^p3_wellrounded|^p3_notif|^p3_ach_30/.test(key)) return '综合';
  if (/^p3_newcomer|^p3_warned/.test(key)) return '隐藏';
  if (/^o5|^immune|^meta_|^444|^p3_newcomer|^p3_warned/.test(key)) return '隐藏';
  return '其他';
}

const ACH_CATEGORIES = ['全部','阅读','创作','协作','投票','收藏','质量','坚持','搜索','随机','标签','词条','深夜','时刻','综合','隐藏','其他'];

function ExploreTab({
  achievementDefs, achievementMap, userReadCount, isLight,
}: {
  achievementDefs: AchievementDef[];
  achievementMap: Record<string, string>;
  userReadCount: number;
  isLight: boolean;
}) {
  const [achFilter, setAchFilter] = useState('全部');
  const getCat = (d: AchievementDef) => (d as any).category || achCategory(d.key);
  const allDefs = achievementDefs.filter(d => !d.isHidden || d.key in achievementMap);
  const categories = ['全部', ...new Set(allDefs.map(d => getCat(d)))];
  const visible = allDefs.filter(d => achFilter === '全部' || getCat(d) === achFilter);

  if (visible.length === 0) {
    return (
      <div className="py-16 text-center font-mono">
        <div className="flex justify-center mb-4 opacity-20">
          <Layers size={48} strokeWidth={1} className="text-brand" />
        </div>
        <div className="text-sm text-text-mid">暂无探索成就定义</div>
      </div>
    );
  }

  const unlocked = visible.filter(d => d.key in achievementMap).length;

  return (
    <div>
      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-1 mb-3">
        {categories.map(cat => {
          const count = allDefs.filter(d => getCat(d) === cat).length;
          if (cat !== '全部' && count === 0) return null;
          return (
            <button key={cat} onClick={() => setAchFilter(cat)}
              className={`text-[10px] font-mono px-2 py-1 border transition-colors ${
                achFilter === cat ? 'border-brand text-brand bg-brand/10' : 'border-border-subtle text-text-mid hover:border-brand'
              }`}>
              {cat}{cat !== '全部' && <span className="ml-0.5 opacity-40">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* 顶部进度栏 */}
      <div className="border border-border-subtle bg-surface-2 px-5 py-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-text-mid tracking-widest">{achFilter === '全部' ? '探索进度' : achFilter + '进度'}</span>
          <span className="text-xs font-mono text-warning tabular-nums">{unlocked} / {visible.length}</span>
        </div>
        <div className="w-full h-2 bg-surface-4 border border-border-minimal overflow-hidden">
          <div
            className="h-full transition-all duration-700"
            style={{
              width: `${Math.round((unlocked / Math.max(1, visible.length)) * 100)}%`,
              background: 'linear-gradient(90deg, #22c55e, #f59e0b, #ef4444)',
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-text-lo mt-1">
          <span>累计阅读词条 {userReadCount}</span>
          <span>{Math.round((unlocked / Math.max(1, visible.length)) * 100)}%</span>
        </div>
      </div>

      {/* 成就列表 */}
      <div className="space-y-3">
        {visible.map(ach => {
          const isUnlocked    = ach.key in achievementMap;
          const unlockedAt    = achievementMap[ach.key];
          const dateStr       = unlockedAt
            ? new Date(unlockedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
            : null;
          const isCountType   = ach.triggerType === 'read_count';
          const hasConditions = (() => { try { return JSON.parse((ach as any).conditions || '[]').length > 0; } catch { return false; } })();
          const progress      = isCountType && ach.triggerTarget > 0
            ? Math.min(1, userReadCount / ach.triggerTarget)
            : isUnlocked ? 1 : 0;

          return (
            <div
              key={ach.key}
              className="relative overflow-hidden transition-all"
              style={isUnlocked ? {
                border:     `1px solid ${ach.color}44`,
                borderLeft: `3px solid ${ach.color}`,
                background: `${ach.color}0d`,
                boxShadow:  `0 0 20px ${ach.color}10`,
              } : {
                border:     isLight ? '1px solid #d1d5db' : '1px solid #12161e',
                borderLeft: isLight ? '3px solid #9ca3af' : '3px solid #1a1f2a',
                background: isLight ? '#f3f4f6' : '#070809',
              }}
            >
              {/* 未解锁：右上角锁标 */}
              {!isUnlocked && (
                <div className="absolute top-2 right-3 text-[10px] font-mono tracking-widest select-none flex items-center gap-1"
                  style={{ color: isLight ? '#cbd5e1' : '#30363d' }}>
                  <span>🔒</span>
                  <span>LOCKED</span>
                </div>
              )}

              <div className="relative flex items-start gap-4 px-5 py-4">
                {/* 大图标 */}
                <div
                  className="flex-shrink-0 w-14 h-14 border flex items-center justify-center"
                  style={isUnlocked ? {
                    borderColor: `${ach.color}55`,
                    background:  `${ach.color}18`,
                    boxShadow:   `0 0 16px ${ach.color}44`,
                  } : {
                    borderColor: isLight ? '#d1d5db' : '#12161e',
                    background:  isLight ? '#e5e7eb' : '#050608',
                    filter:      'grayscale(1) brightness(0.6)',
                  }}
                >
                  {(() => {
                    const IconComp = EXPLORE_ICON_MAP[ach.key];
                    return IconComp
                      ? <IconComp size={26} strokeWidth={1.5} color={isUnlocked ? ach.color : (isLight ? '#9ca3af' : '#2d3748')} />
                      : <span className="text-3xl">{ach.icon}</span>;
                  })()}
                </div>

                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span
                      className="text-sm font-mono font-bold tracking-wide"
                      style={{ color: isUnlocked ? ach.color : (isLight ? '#6b7280' : '#2d3748') }}
                    >
                      {ach.label}
                    </span>
                    <span
                      className="text-xs font-mono"
                      style={{ color: isUnlocked ? '#4b5563' : (isLight ? '#9ca3af' : '#252d3a') }}
                    >
                      {ach.labelZh}
                    </span>
                    {isUnlocked && (
                      <span className="ml-auto text-xs font-mono text-success flex-shrink-0">
                        ✓ {dateStr}
                      </span>
                    )}
                  </div>
                  <div
                    className="text-xs font-mono leading-relaxed mb-2"
                    style={{ color: isUnlocked ? '#6b7280' : (isLight ? '#9ca3af' : '#1a1f28') }}
                  >
                    {ach.desc}
                  </div>

                  {/* 进度条（read_count 类型） */}
                  {isCountType && !isUnlocked && ach.triggerTarget > 0 && (
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-text-mid mb-1">
                        <span>进度</span>
                        <span className="tabular-nums">{Math.min(userReadCount, ach.triggerTarget)} / {ach.triggerTarget}</span>
                      </div>
                      <div className="w-full h-1.5 bg-surface-4 border border-border-minimal overflow-hidden">
                        <div
                          className="h-full transition-all duration-500"
                          style={{ width: `${Math.round(progress * 100)}%`, background: ach.color }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 非计数类型提示 */}
                  {!isCountType && !isUnlocked && !hasConditions && (
                    <div className="text-[10px] font-mono text-[#1e2330]">
                      {ach.triggerType === 'bottom_tier' && '需要：阅读冰山最底层的一个词条'}
                      {ach.triggerType === 'all_clear'   && '需要：读完某张冰山的所有词条'}
                      {ach.triggerType === 'manual'      && '需要：由管理员手动发放'}
                    </div>
                  )}
                </div>
              </div>

              {/* 已解锁底部光晕线 */}
              {isUnlocked && (
                <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${ach.color}88, transparent)` }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return '刚刚';
  const d    = Math.floor(diff / 86400000);
  if (d > 30) return `${Math.floor(d / 30)} 月前`;
  if (d >= 1) return `${d} 天前`;
  const h    = Math.floor(diff / 3600000);
  if (h >= 1) return `${h} 小时前`;
  return '刚刚';
}

const SCAN_LINES: React.CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,255,65,0.013) 3px, rgba(0,255,65,0.013) 4px)',
};
const NO_LINES: React.CSSProperties = {};

function StatCard({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="border border-border-subtle bg-surface-2 px-3 py-2.5 text-center">
      <div className="text-[10px] font-mono text-text-mid mb-1 tracking-widest">{label}</div>
      <div className="text-sm font-mono font-bold tabular-nums text-text-hi" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
    </div>
  );
}

export function UserCenter({
  user, icebergs, isOwner, viewerRole, viewerIsFounder,
  appealEligible, promotionEligible, promotionPending,
  socialStats,
  achievements = [], achievementDefs = [], userReadCount = 0,
  awards = [], userboxIds = [], watchlistCount = 0,
  presenceStatus = 'offline',
}: Props) {
  const [activeTab, setActiveTab]     = useState<Tab>('icebergs');
  const [features, setFeatures]       = useState<Record<string, boolean>>({});

  // 通知面板
  const [showNotifPanel, setShowNotifPanel]   = useState(false);
  const { mounted: notifMounted, isLeaving: notifLeaving }   = useModalAnimation(showNotifPanel);
  const [notifications, setNotifications]     = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount]         = useState(0);
  const [notifLoaded, setNotifLoaded]         = useState(false);
  const [markingAll, setMarkingAll]           = useState(false);
  const notifPanelRef                         = useRef<HTMLDivElement>(null);

  // 弹窗
  const [actionModal, setActionModal]               = useState<'warn' | 'restrict' | 'ban' | null>(null);
  const { mounted: actionMounted, isLeaving: actionLeaving } = useModalAnimation(actionModal !== null);
  const [showAppeal, setShowAppeal]                 = useState(false);
  const { mounted: appealMounted, isLeaving: appealLeaving }   = useModalAnimation(showAppeal);
  const [appealStatement, setAppealStatement]       = useState('');
  const [appealBusy, setAppealBusy]                 = useState(false);
  const [actionForm, setActionForm]                 = useState<Record<string, string>>({});
  const [actionBusy, setActionBusy]                 = useState(false);
  const [showPromotion, setShowPromotion]           = useState(false);
  const { mounted: promoMounted, isLeaving: promoLeaving }     = useModalAnimation(showPromotion);
  const [showAwardModal, setShowAwardModal]         = useState(false);
  const { mounted: awardMounted, isLeaving: awardLeaving }     = useModalAnimation(showAwardModal);
  const [promotionStatement, setPromotionStatement] = useState('');
  const [promotionBusy, setPromotionBusy]           = useState(false);
  const [promotionSent, setPromotionSent]           = useState(false);
  const [following, setFollowing]                   = useState(false);
  const [followerCount, setFollowerCount]           = useState(0);
  const [followBusy, setFollowBusy]                 = useState(false);
  const [showAllAchievements, setShowAllAch]        = useState(false);
  const qLevel      = getQualityLevel(user.qualityScore, user.role);
  const levelColor  = LEVEL_COLORS[qLevel.level] ?? '#6b7280';
  const displayName = user.nickname || user.username;
  const roleBadge   = ROLE_BADGES[user.role] ?? { label: user.role, color: '#6b7280' };
  const presence = PRESENCE_META[presenceStatus] ?? PRESENCE_META.offline;

  const isEditorViewer = viewerRole === 'EDITOR' || viewerRole === 'ADMIN';
  const isAdminViewer  = viewerRole === 'ADMIN';
  const showStats      = isOwner || user.privacyShowStats;

  // 浅色模式检测（供 inline style 条件渲染使用）
  const [isLight, setIsLight] = useState(false);
  useEffect(() => {
    const update = () => setIsLight(document.documentElement.classList.contains('light'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // 关注状态
  useEffect(() => {
    if (isOwner) return;
    fetch(`/api/users/${user.id}/follow`, { method: 'POST' }).then(r => r.json()).then(d => {
      if (d.success) { setFollowing(d.data.following); setFollowerCount(d.data.followerCount); }
    }).catch(() => {});
  }, [user.id, isOwner]);

  const toggleFollow = async () => {
    setFollowBusy(true);
    try {
      const res = await fetch(`/api/users/${user.id}/follow`, { method: 'POST' });
      const data = await res.json();
      if (data.success) { setFollowing(data.data.following); setFollowerCount(data.data.followerCount); }
    } finally { setFollowBusy(false); }
  };

  // 从 DB 数据构建成就映射（unlockedAt 用于 tooltip）
  const achievementMap: Record<string, string> = Object.fromEntries(
    achievements.map(a => [a.achievementId, a.unlockedAt])
  );
  // 站长虚拟注入 origin 成就（无需写库，由 isFounder 决定）
  if (user.isFounder && !('origin' in achievementMap)) {
    achievementMap['origin'] = user.createdAt;
  }
  // 社区成就计数：founderOnly 徽章仅在解锁时才计入（不让非站长被它撑槽位）
  const unlockedCommunityCount = COMMUNITY_BADGES.filter(b => b.id in achievementMap && (!b.founderOnly || user.isFounder)).length;

  // 用户框展示数据 — 从 USERBOX_LIBRARY 映射
  const allBoxDefs: Record<string, { id: string; text: string; leftText: string; leftBg: string; leftFg: string; requires?: string }> = {};
  USERBOX_LIBRARY.forEach(cat => cat.boxes.forEach(box => { allBoxDefs[box.id] = box as any; }));
  const userboxDefs = (userboxIds || []).map(id => allBoxDefs[id]).filter(Boolean);

  const tabs: { id: Tab; label: string; code: string; amber?: boolean }[] = [
    { id: 'icebergs',  label: '冰山图',   code: 'ICEBERGS'  },
    { id: 'drafts',    label: '草稿',     code: 'DRAFTS'    },
    { id: 'watchlist', label: '收藏',     code: 'WATCHLIST' },
    { id: 'explore',   label: '探索成就', code: 'EXPLORE'   },
    ...(isOwner ? [{ id: 'score' as Tab, label: '积分', code: 'SCORE' }] : []),
    ...(isOwner ? [{ id: 'settings' as Tab, label: '设置', code: 'SETTINGS' }] : []),
    ...(isOwner && isEditorViewer
      ? [{ id: 'admin' as Tab, label: '管理', code: 'RESTRICTED', amber: true }]
      : []),
  ];

  const setTabAndSyncUrl = (nextTab: Tab) => {
    setActiveTab(nextTab);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (nextTab === 'icebergs') url.searchParams.delete('tab');
    else url.searchParams.set('tab', nextTab);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const queryTab = url.searchParams.get('tab');
    const linked = url.searchParams.get('linked');
    const queryError = url.searchParams.get('error');
    let mutated = false;
    let nextTab: Tab | null = null;

    if (queryTab && tabs.some((t) => t.id === queryTab)) {
      nextTab = queryTab as Tab;
    }

    const linkedProvider = linked === 'github' || linked === 'google' ? linked : null;
    if (linkedProvider) {
      if (tabs.some((t) => t.id === 'settings')) {
        nextTab = 'settings';
        url.searchParams.set('tab', 'settings');
      }
      url.searchParams.delete('linked');
      mutated = true;

      void (async () => {
        try {
          const res = await fetch('/api/auth/sessions');
          const data = await res.json().catch(() => ({}));
          const reallyLinked = Boolean(data?.success && data?.data?.authMethods?.[linkedProvider]);
          if (reallyLinked) {
            toast(`${linkedProvider === 'github' ? 'GitHub' : 'Google'} 绑定成功`);
          } else {
            toast(`${linkedProvider === 'github' ? 'GitHub' : 'Google'} 绑定未完成，请重试`, 'error');
          }
        } catch {
          toast('第三方绑定状态校验失败，请刷新后重试', 'error');
        }
      })();
    }

    if (queryError === 'oauth_provider_already_linked') {
      toast('当前账号已绑定该第三方，请勿重复绑定', 'error');
      url.searchParams.delete('error');
      mutated = true;
    }

    if (nextTab) {
      setActiveTab(nextTab);
    }
    if (mutated) {
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  // 加载通知
  useEffect(() => {
    if (!isOwner) return;
    fetch('/api/notifications')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setNotifications(d.data.notifications);
          setUnreadCount(d.data.unreadCount);
          setNotifLoaded(true);
        }
      })
      .catch(() => {});
  }, [isOwner]);

  // 加载功能开关
  useEffect(() => {
    if (!isOwner) return;
    fetch('/api/features')
      .then(r => r.json())
      .then(d => {
        if (d.success) setFeatures(d.data);
      })
      .catch(() => {});
  }, [isOwner]);

  // 点外部关闭通知面板
  useEffect(() => {
    if (!showNotifPanel) return;
    const handler = (e: MouseEvent) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node)) {
        setShowNotifPanel(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotifPanel]);

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await fetch('/api/notifications/read-all', { method: 'PUT' });
      setNotifications(n => n.map(x => ({ ...x, read: true })));
      setUnreadCount(0);
    } finally { setMarkingAll(false); }
  };

  const markOneRead = async (id: string, link: string | null) => {
    await fetch(`/api/notifications/${id}`, { method: 'PUT' });
    setNotifications(n => n.map(x => x.id === id ? { ...x, read: true } : x));
    setUnreadCount(c => Math.max(0, c - 1));
    if (link) window.location.href = link;
  };

  const submitAppeal = async () => {
    if (appealStatement.trim().length < 20) return;
    setAppealBusy(true);
    try {
      const res  = await fetch(`/api/users/${user.id}/appeal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement: appealStatement }),
      });
      const data = await res.json();
      if (data.success) { toast('申诉已提交，等待管理员审核'); setShowAppeal(false); setAppealStatement(''); }
      else toast(data.error?.message ?? '提交失败', 'error');
    } finally { setAppealBusy(false); }
  };

  const submitPromotion = async () => {
    setPromotionBusy(true);
    try {
      const res  = await fetch('/api/promotion/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement: promotionStatement }),
      });
      const data = await res.json();
      if (data.success) { toast('晋升申请已提交，等待编辑审批'); setShowPromotion(false); setPromotionStatement(''); setPromotionSent(true); }
      else toast(data.error?.message ?? '提交失败', 'error');
    } finally { setPromotionBusy(false); }
  };

  const execAction = async () => {
    if (!actionModal) return;
    setActionBusy(true);
    try {
      let url = ''; let body: Record<string, unknown> = {};
      if (actionModal === 'warn')     { url = `/api/users/${user.id}/warn`;     body = { level: Number(actionForm.level ?? 1), reason: actionForm.reason }; }
      else if (actionModal === 'restrict') { url = `/api/users/${user.id}/restrict`; body = { reason: actionForm.reason }; }
      else if (actionModal === 'ban') { url = `/api/users/${user.id}/ban`;      body = { type: actionForm.banType ?? 'TEMP', days: Number(actionForm.days ?? 7), reason: actionForm.reason }; }
      const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) { toast('操作已执行'); setActionModal(null); setActionForm({}); window.location.reload(); }
      else toast(data.error?.message ?? '操作失败', 'error');
    } finally { setActionBusy(false); }
  };

  // Computed values for dashboard
  const qualityLevel  = qLevel.level;
  const levelLabel    = LEVEL_LABELS[qualityLevel] ?? '访客';
  const topAchievements = achievementDefs.filter(d => d.key in achievementMap);
  const totalUnlocked   = Object.keys(achievementMap).length;
  const readCount       = userReadCount;

  function formatJoinDate(dateStr: string) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">

      {/* ── 账户状态栏 ───────────────────────────────────────────────────── */}
      {isOwner && user.status !== 'ACTIVE' && (() => {
        const cfg: Record<string, { color: string; bg: string; icon: string; msg: string }> = {
          WARNED_1:    { color: '#f59e0b', bg: '#f59e0b12', icon: '!',  msg: '你的账户有一条警告记录 (WARNED_1)，90 天内无新违规将自动清除。' },
          WARNED_2:    { color: '#f97316', bg: '#f9731612', icon: '!!', msg: '你的账户有公开违规记录 (WARNED_2)，档案页面会显示警告标记。' },
          READ_ONLY:   { color: '#3b82f6', bg: '#3b82f612', icon: '⊘',  msg: '账户处于只读状态，无法创建、编辑内容或参与投票。' },
          TEMP_BANNED: { color: '#ef4444', bg: '#ef444412', icon: '✕',  msg: `账户已被临时封禁${user.banUntil ? '，解封时间：' + new Date(user.banUntil).toLocaleDateString('zh-CN') : ''}。` },
          PERM_BANNED: { color: '#7f1d1d', bg: '#7f1d1d20', icon: '✕',  msg: '账户已被永久封禁。' },
        };
        const c = cfg[user.status];
        if (!c) return null;
        const canAppeal = appealEligible && ['WARNED_2', 'READ_ONLY', 'TEMP_BANNED', 'PERM_BANNED'].includes(user.status);
        return (
          <div className="border mb-5 px-4 py-3 font-mono boot-animate" style={{ borderColor: `${c.color}40`, background: c.bg, animationDelay: '0ms' }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2">
                <span className="text-base font-bold flex-shrink-0" style={{ color: c.color }}>[{c.icon}]</span>
                <div>
                  <span className="text-sm" style={{ color: c.color }}>{user.status}</span>
                  <p className="text-xs text-text-body mt-0.5 leading-relaxed">{c.msg}</p>
                </div>
              </div>
              {canAppeal && (
                <button onClick={() => setShowAppeal(true)} className="flex-shrink-0 px-3 py-1.5 text-xs border transition-colors" style={{ borderColor: `${c.color}50`, color: c.color }}>
                  提交申诉
                </button>
              )}
              {user.status === 'WARNED_2' && !canAppeal && !appealEligible && (
                <span className="flex-shrink-0 text-xs text-text-mid font-mono">申诉冷却中</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── 管理操作栏（对他人）──────────────────────────────────────────── */}
      {!isOwner && isEditorViewer && (
        <div className="border border-border-subtle bg-surface-2 mb-5 px-4 py-3 flex items-center gap-3 flex-wrap boot-animate" style={{ animationDelay: '0ms' }}>
          <span className="text-xs font-mono text-text-mid mr-auto tracking-wider">管理操作</span>
          {(isAdminViewer || viewerIsFounder) && (
            <button onClick={() => setShowAwardModal(true)} className="px-3 py-1.5 text-xs font-mono border border-warning/25 text-warning hover:bg-warning/10 transition-colors">✦ 授予勋章</button>
          )}
          <button onClick={() => { setActionModal('warn'); setActionForm({ level: '1' }); }} className="px-3 py-1.5 text-xs font-mono border border-warning/20 text-warning hover:bg-warning/10 transition-colors">发警告</button>
          {isAdminViewer && (
            <>
              <button onClick={() => { setActionModal('restrict'); setActionForm({}); }} className="px-3 py-1.5 text-xs font-mono border border-[#3b82f630] text-info hover:bg-info/10 transition-colors">只读限制</button>
              <button onClick={() => { setActionModal('ban'); setActionForm({ banType: 'TEMP', days: '7' }); }} className="px-3 py-1.5 text-xs font-mono border border-[#ef444430] text-danger hover:bg-danger/10 transition-colors">封禁</button>
            </>
          )}
        </div>
      )}

      {isOwner && viewerIsFounder && (
        <div className="border border-border-subtle bg-surface-2 mb-5 px-4 py-3 flex items-center gap-3 flex-wrap boot-animate" style={{ animationDelay: '0ms' }}>
          <span className="text-xs font-mono text-text-mid mr-auto tracking-wider">站长操作</span>
          <button
            onClick={() => setShowAwardModal(true)}
            className="px-3 py-1.5 text-xs font-mono border border-warning/25 text-warning hover:bg-warning/10 transition-colors"
          >
            ✦ 自授勋章
          </button>
        </div>
      )}

      {/* ── 档案头部 ──────────────────────────────────── */}
      <div className="border border-border bg-surface-2 mb-6 overflow-hidden boot-animate" style={{ animationDelay: '20ms' }}>

        <div className="p-5 md:p-6">
          <div className="flex items-start gap-5">
            {/* 头像 — 质量分色环 */}
            <div className="flex-shrink-0">
              <div className="relative p-1 rounded-full" style={{ background: `conic-gradient(${levelColor} 0deg, ${levelColor} ${Math.round(qLevel.progress * 360)}deg, transparent ${Math.round(qLevel.progress * 360)}deg)` }}>
                <div className="p-0.5 rounded-full bg-surface-2">
                  {user.avatar ? (
                    <img src={user.avatar} alt={displayName} className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover block"
                      onError={e => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'flex'; }} />
                  ) : null}
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-surface-3 items-center justify-center" style={{ display: user.avatar ? 'none' : 'flex' }}>
                    <span className="font-mono text-3xl font-bold" style={{ color: levelColor }}>{displayName.charAt(0).toUpperCase()}</span>
                  </div>
                </div>
              </div>
              <div className="text-[10px] font-mono border px-2 py-0.5 mt-2 text-center inline-block w-full" style={{ color: roleBadge.color, borderColor: `${roleBadge.color}50`, background: `${roleBadge.color}10` }}>
                {roleBadge.label}
              </div>
            </div>

            {/* 信息 */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl font-mono font-bold text-text-hi">{displayName}</h1>
                {user.nickname && <span className="text-xs font-mono text-text-mid">@{user.username}</span>}
                {user.isFounder && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 border" style={{ color: '#f59e0b', borderColor: '#f59e0b50', background: '#f59e0b10' }}>✦ FOUNDER</span>
                )}
                {isOwner && <span className="text-[10px] font-mono border border-border-subtle text-text-mid px-1.5 py-0.5 bg-surface-3">YOU</span>}
              </div>

              {user.bio
                ? <p className="text-xs text-text-body leading-relaxed mb-3 border-l-2 border-border pl-3">{user.bio}</p>
                : isOwner
                  ? <p className="text-[10px] font-mono text-text-lo mb-3 italic">点击「设置」添加简介</p>
                  : <div className="mb-3" />
              }

              {/* 关注按钮 */}
              {!isOwner && (
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={toggleFollow} disabled={followBusy}
                    className={`text-[10px] font-mono border px-2.5 py-0.5 transition-colors ${
                      following ? 'border-success/30 text-success bg-success/5 hover:border-danger hover:text-danger' : 'border-brand/30 text-brand hover:bg-brand/10'
                    }`}>
                    {following ? '已关注' : '+ 关注'}
                  </button>
                  {followerCount > 0 && (
                    <span className="text-[10px] font-mono text-text-lo">{followerCount} 粉丝</span>
                  )}
                </div>
              )}

              {/* 用户框 */}
              {userboxDefs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {userboxDefs.map(box => (
                    <span key={box.id} className="inline-flex items-center text-[10px] font-mono border rounded overflow-hidden"
                      title={box.text}>
                      <span className="px-1.5 py-0.5 font-bold" style={{ background: box.leftBg, color: box.leftFg }}>{box.leftText}</span>
                      <span className="px-1.5 py-0.5 text-text-body border-l border-border-subtle bg-surface-3">{box.text}</span>
                    </span>
                  ))}
                </div>
              )}
              {isOwner && userboxDefs.length === 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 border rounded text-text-lo border-border-subtle">
                    📌 在「设置」→「用户框」中选择展示的成就
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-text-lo bg-surface-3 border border-border-subtle px-2 py-0.5 rounded">
                  加入 {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                </span>
                {showStats && (
                  <>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-text-hi bg-surface-3 border border-border-subtle px-2 py-0.5 rounded">
                      {user._count.icebergs} 冰山图
                    </span>
                    {socialStats && (
                      <>
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-text-hi bg-surface-3 border border-border-subtle px-2 py-0.5 rounded">
                          {socialStats.totalViews.toLocaleString()} 阅读
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-text-hi bg-surface-3 border border-border-subtle px-2 py-0.5 rounded">
                          +{socialStats.totalVotes} 票
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 等级 — 环形进度 */}
            {showStats && (
              <div className="flex-shrink-0 hidden sm:flex flex-col items-center gap-1.5">
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
                    <circle cx="36" cy="36" r="30" fill="none" stroke="var(--color-border)" strokeWidth="4" />
                    <circle cx="36" cy="36" r="30" fill="none" stroke={levelColor} strokeWidth="4"
                      strokeDasharray={`${qLevel.progress * 188.5} 188.5`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-mono font-bold tabular-nums leading-none" style={{ color: levelColor }}>{qLevel.level}</span>
                    <span className="text-[8px] font-mono text-text-lo">{qLevel.label}</span>
                  </div>
                </div>
                {qLevel.nextScore && (
                  <div className="text-[9px] font-mono text-text-lo">{user.qualityScore}/{qLevel.nextScore}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 成就条 */}
        {topAchievements.length > 0 && (
          <div className="border-t border-border-subtle px-5 py-2 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-text-mid tracking-widest">成就</span>
            {(showAllAchievements ? topAchievements : topAchievements.slice(0, 4)).map(ach => (
              <span key={ach.key} className="text-[10px] font-mono px-1.5 py-0.5 border rounded"
                style={{ color: ach.color, borderColor: `${ach.color}40`, background: `${ach.color}10` }}>
                {ach.icon} {ach.labelZh}
              </span>
            ))}
            {totalUnlocked > 4 && (
              <button onClick={() => setShowAllAch(!showAllAchievements)} className="text-[10px] font-mono text-text-mid ml-auto hover:text-brand transition-colors">
                {showAllAchievements ? '收起' : `+${totalUnlocked - 4} 更多`}
              </button>
            )}
            {isOwner && (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/achievements/recheck', { method: 'POST' });
                    const data = await res.json();
                    alert(data.data?.message || data.error?.message || '复核完成');
                    window.location.reload();
                  } catch {
                    alert('检测失败，请稍后重试');
                  }
                }}
                className="text-[10px] font-mono text-text-mid hover:text-brand border border-border-subtle px-1.5 py-0.5 ml-1 transition-colors"
              >
                🔄 检测
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions Bar (owner only) */}
      {isOwner && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <a href="/iceberg/new" className="px-3 py-1.5 bg-brand text-[#0A0A0A] text-xs font-mono font-bold hover:bg-brand-hover transition-colors">+ 创建冰山图</a>
          <a href="/feedback" className="px-3 py-1.5 border border-border-subtle text-xs font-mono text-text-body hover:border-brand hover:text-brand transition-colors">! 反馈</a>
          <a href={`/user/${user.id}?tab=settings`} className="px-3 py-1.5 border border-border-subtle text-xs font-mono text-text-body hover:border-brand hover:text-brand transition-colors">⚙ 设置</a>
          {unreadCount > 0 && (
            <a href="#" onClick={(e) => { e.preventDefault(); setShowNotifPanel(true); }} className="px-3 py-1.5 border border-border-subtle text-xs font-mono text-text-body hover:border-brand hover:text-brand transition-colors ml-auto">
              通知({unreadCount})
            </a>
          )}
          {promotionEligible && features.feature_promotion !== false && (
            <button onClick={() => setShowPromotion(true)} className="px-3 py-1.5 border border-warning/30 text-xs font-mono text-warning hover:border-warning hover:bg-warning/5 transition-colors">
              申请晋升
            </button>
          )}
        </div>
      )}

        <div className="flex-1 min-w-0">

          {/* Tab 导航 */}
          <div className="flex border-b border-border-subtle mb-6 boot-animate" style={{ animationDelay: '60ms' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setTabAndSyncUrl(tab.id)}
                className={`px-4 md:px-5 py-3 text-sm font-mono transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? tab.amber ? 'border-warning text-warning' : 'border-brand text-brand'
                    : 'border-transparent text-text-lo hover:text-text-body'
                }`}
              >
                {tab.label}
                {tab.amber
                  ? <span className="ml-1.5 text-[10px] opacity-50">[RESTRICTED]</span>
                  : <span className="ml-1.5 opacity-30 text-xs">// {tab.code}</span>
                }
              </button>
            ))}
          </div>

          <div className="boot-animate" style={{ animationDelay: '100ms' }}>
            {activeTab === 'icebergs'  && <UserIcebergs icebergs={icebergs.filter((i: any) => i.status === 'PUBLISHED')} isOwner={isOwner} />}
            {activeTab === 'drafts' && isOwner && <UserIcebergs icebergs={icebergs.filter((i: any) => i.status === 'DRAFT')} isOwner={isOwner} />}
            {activeTab === 'watchlist' && <UserWatchlist userId={user.id} isOwner={isOwner} publiclyVisible={user.privacyShowWatchlist} />}
            {activeTab === 'explore'   && <ExploreTab achievementDefs={achievementDefs} achievementMap={achievementMap} userReadCount={userReadCount} isLight={isLight} />}
            {activeTab === 'score' && isOwner && <ScoreLogTab userId={user.id} />}
            {activeTab === 'settings' && isOwner && (
              <div className="space-y-6">
                {/* 账号设置 */}
                <div className="border border-border-subtle bg-surface-2">
                  <div className="px-5 py-3 border-b border-border-subtle bg-surface-1 flex items-center gap-2">
                    <span className="text-brand font-mono text-xs">⚙</span>
                    <span className="font-mono text-xs text-text-hi tracking-widest">账号设置</span>
                  </div>
                  <div className="p-5">
                    <UserSettings userId={user.id} initial={{ nickname: user.nickname, bio: user.bio, avatar: user.avatar, privacyShowStats: user.privacyShowStats, privacyShowWatchlist: user.privacyShowWatchlist }} features={features} />
                  </div>
                </div>

                {/* 用户框定制 */}
                {features.feature_userboxes !== false && (
                <div className="border border-border-subtle bg-surface-2">
                  <div className="px-5 py-3 border-b border-border-subtle bg-surface-1 flex items-center gap-2">
                    <span className="text-warning font-mono text-xs">🎨</span>
                    <span className="font-mono text-xs text-text-hi tracking-widest">用户框定制</span>
                  </div>
                  <div className="p-5">
                <UserboxPicker
                  userId={user.id}
                  currentIds={userboxIds}
                  unlockedAchievementIds={Object.keys(achievementMap)}
                  maxSlots={user.isFounder ? Infinity : Math.min(USERBOX_BASE_SLOTS + unlockedCommunityCount, USERBOX_MAX_SLOTS)}
                  isFounder={user.isFounder}
                />
              </div>
            </div>
                )}
          </div>
        )}
        {activeTab === 'admin' && isOwner && (viewerRole || viewerIsFounder) && <AdminPanel role={viewerRole ?? 'USER'} isFounder={viewerIsFounder} />}
      </div>
    </div>
      {notifMounted && (
        <div className={`${notifLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/60 flex items-start justify-center z-50 pt-16 px-4`}>
          <div ref={notifPanelRef} className={`${notifLeaving ? 'modal-content-out' : 'modal-content'} bg-surface-4 border border-border w-full max-w-md font-mono max-h-[75vh] flex flex-col`}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle">
              <div>
                <span className="text-[11px] text-text-mid tracking-[0.2em]">// NOTIFICATIONS</span>
                {unreadCount > 0 && (
                  <span className="ml-2 bg-[#ef4444] text-white text-[10px] px-1.5 py-0.5">{unreadCount} 未读</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} disabled={markingAll} className="text-xs text-text-mid hover:text-brand transition-colors">
                    {markingAll ? '标记中...' : '全部已读'}
                  </button>
                )}
                <button onClick={() => setShowNotifPanel(false)} className="text-text-mid hover:text-text-hi transition-colors text-lg leading-none">×</button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {!notifLoaded ? (
                <div className="py-10 text-center text-sm text-text-mid animate-pulse">加载中...</div>
              ) : notifications.length === 0 ? (
                <div className="py-12 text-center text-sm text-text-lo">// 暂无通知</div>
              ) : (
                notifications.map(n => {
                  const ni = NOTIF_ICONS[n.type] ?? { icon: '·', color: '#4b5563' };
                  return (
                    <button
                      key={n.id}
                      onClick={() => markOneRead(n.id, n.link)}
                      className={`w-full text-left flex items-start gap-3 px-5 py-4 border-b border-border-minimal hover:bg-surface-4 transition-colors ${!n.read ? 'bg-surface-1' : ''}`}
                    >
                      <span className="text-sm flex-shrink-0 mt-0.5" style={{ color: ni.color }}>[{ni.icon}]</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm leading-snug mb-1 ${n.read ? 'text-text-body' : 'text-text-hi'}`}>{n.title}</div>
                        {n.body && <div className="text-xs text-text-lo leading-relaxed line-clamp-2">{n.body}</div>}
                        <div className="text-[11px] text-text-mid mt-1">{timeAgo(n.createdAt)}</div>
                      </div>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-brand flex-shrink-0 mt-2" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 管理操作模态框 ───────────────────────────────────────────────── */}
      {actionMounted && actionModal && (
        <div className={`${actionLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${actionLeaving ? 'modal-content-out' : 'modal-content'} bg-surface-4 border border-border w-full max-w-sm p-6 font-mono`}>
            <div className="text-sm text-text-lo mb-1.5">对象：@{displayName}</div>
            <div className="text-base text-text-hi mb-5">
              {actionModal === 'warn' && '发出警告'}{actionModal === 'restrict' && '设为只读'}{actionModal === 'ban' && '封禁用户'}
            </div>
            {actionModal === 'warn' && (
              <div className="mb-4 flex gap-2">
                {(['1', '2'] as const).map(l => (
                  <button key={l} onClick={() => setActionForm(f => ({ ...f, level: l }))}
                    className={`flex-1 py-2 text-sm border transition-colors ${actionForm.level === l ? 'border-warning text-warning' : 'border-border text-text-lo hover:border-border'}`}>
                    WARNED_{l}
                  </button>
                ))}
              </div>
            )}
            {actionModal === 'ban' && (
              <div className="mb-4 space-y-2">
                <div className="flex gap-2">
                  {(['TEMP', 'PERM'] as const).map(t => (
                    <button key={t} onClick={() => setActionForm(f => ({ ...f, banType: t }))}
                      className={`flex-1 py-2 text-sm border transition-colors ${actionForm.banType === t ? 'border-danger text-danger' : 'border-border text-text-lo hover:border-border'}`}>
                      {t === 'TEMP' ? '临时' : '永久'}
                    </button>
                  ))}
                </div>
                {actionForm.banType !== 'PERM' && (
                  <input type="number" min={1} value={actionForm.days ?? '7'} onChange={e => setActionForm(f => ({ ...f, days: e.target.value }))}
                    className="w-full px-3 py-2 bg-surface-2 border border-border text-sm text-text-hi focus:border-brand focus:outline-none"
                    placeholder="封禁天数" />
                )}
              </div>
            )}
            <div className="mb-5">
              <div className="text-xs text-text-lo mb-1.5">理由</div>
              <textarea value={actionForm.reason ?? ''} onChange={e => setActionForm(f => ({ ...f, reason: e.target.value }))}
                rows={2} className="w-full px-3 py-2.5 bg-surface-2 border border-border text-sm text-text-hi focus:border-brand focus:outline-none resize-none"
                placeholder="理由（至少 5 字）" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setActionModal(null); setActionForm({}); }} className="flex-1 py-2.5 border border-border text-sm hover:border-border transition-colors">取消</button>
              <button onClick={execAction} disabled={actionBusy || (actionForm.reason ?? '').trim().length < 5}
                className="flex-1 py-2.5 bg-danger/20 border border-[#ef444450] text-danger text-sm hover:bg-danger/20 transition-colors disabled:opacity-50">
                {actionBusy ? '执行中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 晋升申请模态框 ───────────────────────────────────────────────── */}
      {promoMounted && (
        <div className={`${promoLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${promoLeaving ? 'modal-content-out' : 'modal-content'} bg-surface-4 border border-border w-full max-w-md p-6 font-mono`}>
            <div className="text-xs text-text-mid mb-1.5 tracking-widest">PROMOTION REQUEST</div>
            <div className="text-base text-text-hi mb-1.5">申请晋升至 CONTRIBUTOR</div>
            <div className="text-sm text-text-lo mb-5">可附上申请说明（可选），编辑审核后将通知结果。</div>
            <div className="mb-1.5 flex justify-between">
              <span className="text-xs text-text-lo">申请说明（可选，200 字以内）</span>
              <span className="text-xs text-text-lo">{promotionStatement.length}/200</span>
            </div>
            <textarea value={promotionStatement} onChange={e => setPromotionStatement(e.target.value.slice(0, 200))}
              rows={4} className="w-full px-3 py-2.5 bg-surface-2 border border-border text-sm text-text-hi focus:border-brand focus:outline-none resize-none mb-5"
              placeholder="简述申请理由（非必填）" />
            <div className="flex gap-3">
              <button onClick={() => { setShowPromotion(false); setPromotionStatement(''); }} className="flex-1 py-2.5 border border-border text-sm hover:border-border transition-colors">取消</button>
              <button onClick={submitPromotion} disabled={promotionBusy}
                className="flex-1 py-2.5 bg-brand/10 border border-brand/25 text-brand text-sm hover:bg-brand/15 transition-colors disabled:opacity-50">
                {promotionBusy ? '提交中...' : '提交申请'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 授予勋章模态框 ──────────────────────────────────────────────── */}
      {awardMounted && (
        <AwardModal
          userId={user.id}
          isLeaving={awardLeaving}
          onClose={() => setShowAwardModal(false)}
          existingAwards={awards}
          isLight={isLight}
        />
      )}

      {/* ── 申诉模态框 ───────────────────────────────────────────────────── */}
      {appealMounted && (
        <div className={`${appealLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${appealLeaving ? 'modal-content-out' : 'modal-content'} bg-surface-4 border border-border w-full max-w-md p-6 font-mono`}>
            <div className="text-xs text-text-mid mb-1.5 tracking-widest">APPEAL REQUEST</div>
            <div className="text-base text-text-hi mb-1.5">提交申诉</div>
            <div className="text-sm text-text-lo mb-5">详细说明情况，管理员审核后将通知结果。</div>
            <div className="mb-1.5 flex justify-between">
              <span className="text-xs text-text-lo">申诉说明</span>
              <span className={`text-xs ${appealStatement.trim().length < 20 ? 'text-danger' : 'text-success'}`}>{appealStatement.trim().length} / 20+</span>
            </div>
            <textarea value={appealStatement} onChange={e => setAppealStatement(e.target.value)}
              rows={5} className="w-full px-3 py-2.5 bg-surface-2 border border-border text-sm text-text-hi focus:border-brand focus:outline-none resize-none mb-5"
              placeholder="请详细说明申诉原因，包括对相关事件的解释和今后的改进承诺..." />
            <div className="flex gap-3">
              <button onClick={() => { setShowAppeal(false); setAppealStatement(''); }} className="flex-1 py-2.5 border border-border text-sm hover:border-border transition-colors">取消</button>
              <button onClick={submitAppeal} disabled={appealBusy || appealStatement.trim().length < 20}
                className="flex-1 py-2.5 bg-brand/10 border border-brand/25 text-brand text-sm hover:bg-brand/15 transition-colors disabled:opacity-50">
                {appealBusy ? '提交中...' : '提交申诉'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── 授予勋章弹窗 ──────────────────────────────────────────────────────────
function AwardModal({ userId, isLeaving, onClose, existingAwards, isLight }: {
  userId: string;
  isLeaving: boolean;
  onClose: () => void;
  existingAwards: { id: string; type: string }[];
  isLight: boolean;
}) {
  const [selectedType, setSelectedType] = useState('');
  const [message, setMessage]           = useState('');
  const [busy, setBusy]                 = useState(false);
  const [revokingType, setRevokingType] = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [awardedByType, setAwardedByType] = useState<Record<string, string>>(
    () => Object.fromEntries(existingAwards.map((a) => [a.type, a.id])),
  );
  const submit = async () => {
    if (!selectedType) return;
    setBusy(true); setError(null);
    try {
      const res  = await fetch(`/api/users/${userId}/awards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selectedType, message: message.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        const awardId = data.data?.id as string | undefined;
        if (awardId) {
          setAwardedByType((prev) => ({ ...prev, [selectedType]: awardId }));
        }
        setSelectedType('');
        setMessage('');
      }
      else setError(data.error?.message ?? '授予失败');
    } finally { setBusy(false); }
  };

  const revoke = async (type: string, awardId: string) => {
    if (!window.confirm('确认撤回该勋章？')) return;
    setRevokingType(type);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/awards?awardId=${encodeURIComponent(awardId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error?.message ?? '撤回失败');
        return;
      }
      setAwardedByType((prev) => {
        const next = { ...prev };
        delete next[type];
        return next;
      });
      if (selectedType === type) setSelectedType('');
    } catch {
      setError('撤回失败，请稍后重试');
    } finally {
      setRevokingType(null);
    }
  };

  return (
    <div className={`${isLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3 sm:p-4`}>
      <div className={`${isLeaving ? 'modal-content-out' : 'modal-content'} bg-surface-4 border border-border border-l-4 border-l-[#f59e0b] w-full max-w-[26rem] max-h-[82vh] overflow-y-auto p-4 sm:p-5 font-mono`}>
        <div className="text-[10px] text-text-mid mb-1.5 tracking-widest">[ AWARD SYSTEM ]</div>
        <div className="text-base text-text-hi mb-1.5"><span className="text-warning">#</span> 授予勋章</div>
        <div className="text-xs text-text-lo mb-3">选择勋章类型并填写颁奖留言（可选）。已授予的勋章可直接撤回。</div>

        {error && (
          <div className="mb-3 p-2.5 bg-[#1a0808] border border-danger/25 text-danger text-[11px]">&gt; ERROR: {error}</div>
        )}

        <div className="space-y-1.5 mb-4 max-h-64 overflow-y-auto pr-1">
          {AWARD_TYPES.map(a => {
            const awardId = awardedByType[a.id];
            const already = Boolean(awardId);
            return (
              <div key={a.id} className="flex items-center gap-2">
                <button
                  disabled={already || busy || revokingType === a.id}
                  onClick={() => setSelectedType(a.id)}
                  className={`flex-1 flex items-center gap-2.5 px-2.5 py-2 border transition-all text-left ${
                    already ? 'opacity-60 cursor-not-allowed border-border-subtle bg-[#11141a]' :
                    selectedType === a.id ? 'border-warning bg-warning/5' : 'border-border-subtle hover:border-border'
                  }`}
                >
                  <span className="text-base flex-shrink-0" style={{ color: a.color }}>{a.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{ color: selectedType === a.id ? a.color : (isLight ? '#374151' : '#e5e5e5') }}>{a.labelZh}</div>
                    <div className="text-[10px] text-text-lo truncate">{a.desc}</div>
                  </div>
                  {already && <span className="text-[10px] text-text-mid">已授予</span>}
                  {selectedType === a.id && !already && <span className="text-[10px]" style={{ color: a.color }}>✓</span>}
                </button>
                {already && awardId && (
                  <button
                    type="button"
                    onClick={() => revoke(a.id, awardId)}
                    disabled={busy || revokingType === a.id}
                    className="px-2 py-1.5 text-[10px] border border-[#7f1d1d] text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                  >
                    {revokingType === a.id ? '撤回中...' : '撤回'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mb-1.5 flex justify-between">
          <span className="text-xs text-text-lo">颁奖留言（可选，200 字以内）</span>
          <span className="text-xs text-text-lo">{message.length}/200</span>
        </div>
        <textarea
          value={message} onChange={e => setMessage(e.target.value.slice(0, 200))}
          rows={2}
          className="w-full px-3 py-2.5 bg-surface-2 border border-border text-sm text-text-hi focus:border-warning focus:outline-none resize-none mb-4"
          placeholder="写下对该用户贡献的认可…"
        />

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 border border-border text-sm text-text-body hover:border-border transition-colors">取消</button>
          <button
            onClick={submit} disabled={busy || !selectedType}
            className="flex-1 py-2 text-sm font-bold transition-colors disabled:opacity-50"
            style={{
              background: selectedType ? `${AWARD_TYPES.find(a=>a.id===selectedType)?.color}15` : '',
              borderWidth: 1, borderStyle: 'solid',
              borderColor: selectedType ? `${AWARD_TYPES.find(a=>a.id===selectedType)?.color}50` : '#30363d',
              color: selectedType ? AWARD_TYPES.find(a=>a.id===selectedType)?.color : '#30363d',
            }}
          >
            {busy ? '授予中...' : '✦ 确认授予'}
          </button>
        </div>
      </div>
    </div>
  );
}


