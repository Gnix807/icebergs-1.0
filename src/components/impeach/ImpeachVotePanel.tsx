/**
 * React island — 弹劾案投票面板
 */
import { useState } from 'react';
import { toast } from '../ui/Toast';

interface ImpeachVote {
  id: string;
  vote: string;
  weight: number;
  comment: string | null;
  createdAt: string;
  voter: { id: string; username: string; nickname: string | null; role: string; isFounder: boolean };
}

interface Summary {
  supportCount: number;
  opposeCount:  number;
  abstainCount: number;
  supportWeight: number;
  opposeWeight:  number;
  totalWeight:   number;
}

interface Props {
  impeachId:   string;
  status:      string;
  closesAt:    string;
  targetRole:  string;
  targetId:    string;
  votes:       ImpeachVote[];
  summary:     Summary;
  userId:      string | null;
  userRole:    string | null;
  isFounder:   boolean;
  myVote:      string | null;
}

const VOTE_WEIGHT: Record<string, number> = {
  EDITOR: 1, MODERATOR: 2, ADMIN: 3,
};
const VOTE_LABEL: Record<string, string> = {
  SUPPORT: '支持弹劾', OPPOSE: '反对弹劾', ABSTAIN: '弃权',
};
const VOTE_COLOR: Record<string, string> = {
  SUPPORT: '#ef4444', OPPOSE: '#22c55e', ABSTAIN: '#6b7280',
};

function getWeight(role: string | null, isFounder: boolean): number {
  if (isFounder) return 5;
  return VOTE_WEIGHT[role ?? ''] ?? 0;
}

function canVote(role: string | null, isFounder: boolean, targetRole: string): boolean {
  const w = getWeight(role, isFounder);
  if (w <= 0) return false;
  if (targetRole === 'ADMIN' && role === 'EDITOR' && !isFounder) return false;
  return true;
}

export function ImpeachVotePanel({
  impeachId, status, closesAt, targetRole, targetId,
  votes: initVotes, summary: initSummary,
  userId, userRole, isFounder, myVote: initMyVote,
}: Props) {
  const [votes,   setVotes]   = useState(initVotes);
  const [summary, setSummary] = useState(initSummary);
  const [myVote,  setMyVote]  = useState(initMyVote);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [pending,   setPending]   = useState<string | null>(null);

  const isOpen    = status === 'OPEN';
  const myWeight  = getWeight(userRole, isFounder);
  const eligible  = isOpen && !!userId && userId !== targetId && canVote(userRole, isFounder, targetRole);
  const closesDate = new Date(closesAt);
  const daysLeft   = Math.max(0, Math.ceil((closesDate.getTime() - Date.now()) / 86400_000));

  const passRatio = summary.totalWeight > 0
    ? (summary.supportWeight / summary.totalWeight * 100).toFixed(1)
    : '0.0';
  const totalVotes = summary.supportCount + summary.opposeCount + summary.abstainCount;

  const refresh = async () => {
    const res  = await fetch(`/api/impeach/${impeachId}`);
    const data = await res.json();
    if (data.success) {
      setVotes(data.data.request.votes);
      setSummary(data.data.summary);
    }
  };

  const castVote = async (v: string) => {
    if (!eligible) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/impeach/${impeachId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote: v, comment: comment.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        toast(`已投「${VOTE_LABEL[v]}」（权重 ${data.data.weight}）`);
        setMyVote(v);
        setComment('');
        setShowInput(false);
        setPending(null);
        await refresh();
      } else {
        toast(data.error?.message ?? '投票失败', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClick = (v: string) => {
    if (!userId) { (window as any).__openLogin?.(); return; }
    setPending(v);
    setShowInput(true);
  };

  return (
    <div className="space-y-6">
      {/* 状态栏 */}
      <div className="border border-[#21262d] bg-[#161b22] px-4 py-3 flex flex-wrap gap-4 text-xs font-mono">
        {isOpen && (
          <div className="text-[#3d444d]">
            剩余 <span className="text-[#f59e0b]">{daysLeft}</span> 天
            <span className="ml-1 text-[#3d444d]">（{closesDate.toLocaleDateString('zh-CN')} 截止）</span>
          </div>
        )}
        <div className="text-[#3d444d]">
          支持票权重比：<span className="text-[#ef4444]">{passRatio}%</span>
          <span className="ml-1 text-[#3d444d]">（{summary.supportWeight}/{summary.totalWeight}）</span>
        </div>
        <div className="text-[#3d444d]">
          共 <span className="text-[#cdd9e5]">{totalVotes}</span> 票
          <span className="ml-1">（支持 {summary.supportCount} / 反对 {summary.opposeCount} / 弃权 {summary.abstainCount}）</span>
        </div>
      </div>

      {/* 投票操作 */}
      {eligible && (
        <div className="border border-[#21262d] bg-[#161b22] p-4 space-y-3">
          <div className="text-[10px] font-mono text-[#3d444d]">
            你的投票权重：<span className="text-[#f59e0b]">{myWeight}</span>
            {myVote && (
              <span className="ml-3 text-[#8b949e]">
                当前：<span style={{ color: VOTE_COLOR[myVote] }}>{VOTE_LABEL[myVote]}</span>（可修改）
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['SUPPORT', 'OPPOSE', 'ABSTAIN'] as const).map(v => (
              <button
                key={v}
                onClick={() => handleClick(v)}
                disabled={loading}
                className={`px-4 py-1.5 text-xs font-mono border transition-colors disabled:opacity-40 ${
                  myVote === v
                    ? `border-[${VOTE_COLOR[v]}] text-[${VOTE_COLOR[v]}]`
                    : 'border-[#30363d] text-[#3d444d] hover:border-[#30363d] hover:text-[#8b949e]'
                }`}
                style={myVote === v ? { borderColor: VOTE_COLOR[v] + '80', color: VOTE_COLOR[v], background: VOTE_COLOR[v] + '12' } : {}}
              >
                {VOTE_LABEL[v]}
              </button>
            ))}
          </div>

          {showInput && pending && (
            <div className="space-y-2">
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value.slice(0, 300))}
                rows={2}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] text-xs font-mono text-[#cdd9e5] focus:border-[#00FF41] focus:outline-none resize-none"
                placeholder="附言（可选，最多 300 字）"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowInput(false); setPending(null); }}
                  className="flex-1 py-1.5 text-xs font-mono border border-[#30363d] text-[#3d444d] hover:border-[#30363d] transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => castVote(pending)}
                  disabled={loading}
                  style={{ borderColor: VOTE_COLOR[pending] + '60', color: VOTE_COLOR[pending] }}
                  className="flex-1 py-1.5 text-xs font-mono border bg-transparent hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {loading ? '提交中...' : `确认「${VOTE_LABEL[pending]}」`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!userId && isOpen && (
        <div className="text-xs font-mono text-[#3d444d] border border-[#21262d] px-4 py-3">
          <button onClick={() => (window as any).__openLogin?.()} className="text-[#00FF41] hover:underline">
            登录
          </button>
          {targetRole === 'ADMIN' ? ' 后（需 MODERATOR 及以上）方可投票' : ' 后（需 EDITOR 及以上）方可投票'}
        </div>
      )}

      {/* 投票列表 */}
      <div>
        <div className="text-[10px] font-mono text-[#6e7681] mb-3">— 投票记录 —</div>
        {votes.length === 0 ? (
          <div className="text-[10px] font-mono text-[#3d444d] py-4 text-center">// 暂无投票</div>
        ) : (
          <div className="space-y-2">
            {votes.map(v => (
              <div key={v.id} className="border border-[#21262d] px-4 py-3 flex items-start gap-3">
                <span
                  className="text-[10px] font-mono border px-1.5 py-0.5 flex-shrink-0 mt-0.5"
                  style={{ color: VOTE_COLOR[v.vote], borderColor: VOTE_COLOR[v.vote] + '40' }}
                >
                  {VOTE_LABEL[v.vote]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={`/user/${v.voter.id}`}
                      className="text-xs font-mono text-[#8b949e] hover:text-[#00FF41] transition-colors"
                    >
                      @{v.voter.nickname ?? v.voter.username}
                    </a>
                    <span className="text-[10px] font-mono text-[#6e7681]">
                      {v.voter.isFounder ? 'FOUNDER' : v.voter.role}
                    </span>
                    <span className="text-[10px] font-mono text-[#3d444d]">×{v.weight}</span>
                    <span className="text-[10px] font-mono text-[#3d444d] ml-auto">
                      {new Date(v.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                  {v.comment && (
                    <p className="text-[11px] font-mono text-[#3d444d] mt-1 leading-relaxed">{v.comment}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
