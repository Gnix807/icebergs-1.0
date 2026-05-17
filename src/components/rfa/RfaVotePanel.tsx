/**
 * React island — RfA 投票面板
 * 展示申请人信息、投票汇总，支持投票/修改投票/撤销申请
 */
import { useState } from 'react';
import { toast } from '../ui/Toast';

interface Vote {
  id: string;
  vote: string;
  weight: number;
  comment: string | null;
  createdAt: string;
  voter: { id: string; username: string; nickname: string | null; role: string };
}

interface Summary {
  approveCount: number;
  opposeCount:  number;
  abstainCount: number;
  approveWeight: number;
  opposeWeight:  number;
  totalWeight:   number;
}

interface Props {
  rfaId:       string;
  rfaStatus:   string;
  closesAt:    string;
  applicantId: string;
  votes:       Vote[];
  summary:     Summary;
  userId:      string | null;
  userRole:    string | null;
  isFounder:   boolean;
  myVote:      string | null;   // 'APPROVE' | 'OPPOSE' | 'ABSTAIN' | null
}

const VOTE_WEIGHT: Record<string, number> = {
  CONTRIBUTOR: 1, EDITOR: 2, MODERATOR: 3, ADMIN: 5,
};
const VOTE_LABEL: Record<string, string> = {
  APPROVE: '支持', OPPOSE: '反对', ABSTAIN: '弃权',
};
const VOTE_COLOR: Record<string, string> = {
  APPROVE: '#22c55e', OPPOSE: '#ef4444', ABSTAIN: '#6b7280',
};

function getWeight(role: string | null, isFounder: boolean): number {
  if (isFounder) return 7;
  return VOTE_WEIGHT[role ?? ''] ?? 0;
}

export function RfaVotePanel({
  rfaId, rfaStatus, closesAt,
  applicantId, votes: initVotes, summary: initSummary,
  userId, userRole, isFounder, myVote: initMyVote,
}: Props) {
  const [votes,   setVotes]   = useState(initVotes);
  const [summary, setSummary] = useState(initSummary);
  const [myVote,  setMyVote]  = useState(initMyVote);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [pendingVote, setPendingVote] = useState<string | null>(null);

  const isOpen     = rfaStatus === 'OPEN';
  const myWeight   = getWeight(userRole, isFounder);
  const canVote    = isOpen && !!userId && userId !== applicantId && myWeight > 0;
  const closesDate = new Date(closesAt);
  const daysLeft   = Math.max(0, Math.ceil((closesDate.getTime() - Date.now()) / 86400_000));

  const refreshVotes = async () => {
    const res = await fetch(`/api/rfa/${rfaId}`);
    const data = await res.json();
    if (data.success) {
      setVotes(data.data.rfa.votes);
      setSummary(data.data.rfa.summary);
    }
  };

  const castVote = async (vote: string) => {
    if (!canVote) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/rfa/${rfaId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote, comment: comment.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        toast(`已投 ${VOTE_LABEL[vote]}（权重 ${data.data.weight}）`);
        setMyVote(vote);
        setComment('');
        setShowCommentInput(false);
        setPendingVote(null);
        await refreshVotes();
      } else {
        toast(data.error?.message ?? '投票失败', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVoteClick = (vote: string) => {
    if (!userId) {
      (window as any).__openLogin?.();
      return;
    }
    setPendingVote(vote);
    setShowCommentInput(true);
  };

  const totalVotes = summary.approveCount + summary.opposeCount + summary.abstainCount;
  const passRatio  = summary.totalWeight > 0
    ? (summary.approveWeight / summary.totalWeight * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6">
      {/* 状态栏 */}
      <div className="border border-border-subtle bg-surface-2 px-4 py-3 flex flex-wrap gap-4 text-xs font-mono">
        <div>
          状态：
          <span className={`ml-1 ${rfaStatus === 'OPEN' ? 'text-brand' : rfaStatus === 'APPROVED' ? 'text-purple' : rfaStatus === 'REJECTED' ? 'text-danger' : 'text-text-body'}`}>
            {rfaStatus === 'OPEN' ? '投票进行中' : rfaStatus === 'APPROVED' ? '已通过' : rfaStatus === 'REJECTED' ? '未通过' : '已撤销'}
          </span>
        </div>
        {isOpen && (
          <div className="text-text-lo">
            剩余 <span className="text-warning">{daysLeft}</span> 天
            （{closesDate.toLocaleDateString('zh-CN')} 截止）
          </div>
        )}
        <div className="text-text-lo">
          支持权重比：<span className="text-success">{passRatio}%</span>
          <span className="ml-1 text-text-lo">（{summary.approveWeight}/{summary.totalWeight}）</span>
        </div>
        <div className="text-text-lo">
          共 <span className="text-text-hi">{totalVotes}</span> 票
          <span className="ml-1">（支持 {summary.approveCount} / 反对 {summary.opposeCount} / 弃权 {summary.abstainCount}）</span>
        </div>
      </div>

      {/* 投票操作 */}
      {canVote && (
        <div className="border border-border-subtle bg-surface-2 p-4 space-y-3">
          <div className="text-[10px] font-mono text-text-lo">
            你的投票权重：<span className="text-warning">{myWeight}</span>
            {myVote && <span className="ml-3 text-text-body">当前：<span style={{ color: VOTE_COLOR[myVote] }}>{VOTE_LABEL[myVote]}</span>（可修改）</span>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['APPROVE', 'OPPOSE', 'ABSTAIN'] as const).map(v => (
              <button
                key={v}
                onClick={() => handleVoteClick(v)}
                disabled={loading}
                className={`px-4 py-1.5 text-xs font-mono border transition-colors disabled:opacity-50 ${
                  myVote === v
                    ? v === 'APPROVE' ? 'border-success text-success bg-success/10'
                    : v === 'OPPOSE'  ? 'border-danger text-danger bg-danger/10'
                    : 'border-[#6b7280] text-text-body bg-[#8b949e15]'
                    : 'border-border text-text-lo hover:border-border hover:text-text-body'
                }`}
              >
                {VOTE_LABEL[v]}
              </button>
            ))}
          </div>

          {showCommentInput && pendingVote && (
            <div className="space-y-2">
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value.slice(0, 300))}
                rows={2}
                className="w-full px-3 py-2 bg-surface-2 border border-border text-xs font-mono text-text-hi focus:border-brand focus:outline-none resize-none"
                placeholder="附言（可选，最多 300 字）"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowCommentInput(false); setPendingVote(null); }}
                  className="flex-1 py-1.5 text-xs font-mono border border-border text-text-lo hover:border-border transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => castVote(pendingVote)}
                  disabled={loading}
                  style={{ borderColor: VOTE_COLOR[pendingVote] + '60', color: VOTE_COLOR[pendingVote] }}
                  className="flex-1 py-1.5 text-xs font-mono border bg-transparent hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? '提交中...' : `确认投 ${VOTE_LABEL[pendingVote]}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!userId && isOpen && (
        <div className="text-xs font-mono text-text-lo border border-border-subtle px-4 py-3">
          <button
            onClick={() => (window as any).__openLogin?.()}
            className="text-brand hover:underline"
          >
            登录
          </button>
          {' '}后（需 CONTRIBUTOR 及以上）方可投票
        </div>
      )}

      {/* 投票列表 */}
      <div>
        <div className="text-[10px] font-mono text-text-mid mb-3">— 投票记录 —</div>
        {votes.length === 0 ? (
          <div className="text-[10px] font-mono text-text-lo py-4 text-center">// 暂无投票</div>
        ) : (
          <div className="space-y-2">
            {votes.map(v => (
              <div key={v.id} className="border border-border-subtle px-4 py-3 flex items-start gap-3">
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
                      className="text-xs font-mono text-text-body hover:text-brand transition-colors"
                    >
                      @{v.voter.nickname ?? v.voter.username}
                    </a>
                    <span className="text-[10px] font-mono text-text-mid">{v.voter.role}</span>
                    <span className="text-[10px] font-mono text-text-lo">×{v.weight}</span>
                    <span className="text-[10px] font-mono text-text-lo ml-auto">
                      {new Date(v.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                  {v.comment && (
                    <p className="text-[11px] font-mono text-text-lo mt-1 leading-relaxed">{v.comment}</p>
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
