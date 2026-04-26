/**
 * React island — 选举投票面板
 * 处理：报名参选 / 撤回参选 / 投票 / 换票
 */
import { useState } from 'react';
import { toast } from '../ui/Toast';

interface Candidate {
  id: string;
  userId: string;
  username: string;
  nickname: string | null;
  role: string;
  statement: string | null;
  status: string;
  votes: number | null;
}

interface Props {
  electionId: string;
  electionStatus: string;
  applyDeadline: string;
  voteDeadline: string;
  candidates: Candidate[];
  myVote: string | null;         // candidateId
  userId: string | null;         // 当前用户 id（null=未登录）
  userRole: string | null;
  userIsCandidate: boolean;      // 当前用户是否已报名
  userCandidateId: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  USER: 'USER', CONTRIBUTOR: 'CONTRIBUTOR', EDITOR: 'EDITOR',
  MODERATOR: 'MODERATOR', ADMIN: 'ADMIN',
};
const VOTE_WEIGHT: Record<string, number> = {
  USER: 1, CONTRIBUTOR: 2, EDITOR: 3, MODERATOR: 5, ADMIN: 7,
};

export function ElectionVotePanel({
  electionId, electionStatus,
  candidates: initCandidates,
  myVote: initMyVote,
  userId, userRole,
  userIsCandidate: initIsCandidate,
  userCandidateId: initCandidateId,
}: Props) {
  const [candidates, setCandidates] = useState(initCandidates);
  const [myVote,      setMyVote]     = useState(initMyVote);
  const [isCandidate, setIsCandidate] = useState(initIsCandidate);
  const [loading,     setLoading]    = useState(false);
  const [statement,   setStatement]  = useState('');
  const [showApplyForm, setShowApplyForm] = useState(false);

  const canApply = userId &&
    electionStatus === 'OPEN_APPLY' &&
    ['EDITOR', 'MODERATOR'].includes(userRole ?? '') &&
    !isCandidate;

  const canWithdraw = userId &&
    electionStatus === 'OPEN_APPLY' &&
    isCandidate;

  const canVote = userId &&
    electionStatus === 'VOTING';

  const showVoteCounts = electionStatus === 'CLOSED' || electionStatus === 'CONFIRMED';

  const applyCandidate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/elections/${electionId}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement: statement.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        toast('报名成功！');
        setIsCandidate(true);
        setShowApplyForm(false);
        // 刷新候选人列表
        const r2 = await fetch(`/api/elections/${electionId}`);
        const d2 = await r2.json();
        if (d2.success) setCandidates(d2.data.candidates);
      } else {
        toast(data.error?.message ?? '报名失败', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const withdrawCandidate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/elections/${electionId}/candidates`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        toast('已撤回参选');
        setIsCandidate(false);
        const r2 = await fetch(`/api/elections/${electionId}`);
        const d2 = await r2.json();
        if (d2.success) setCandidates(d2.data.candidates);
      } else {
        toast(data.error?.message ?? '撤回失败', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const castVote = async (candidateId: string) => {
    if (!canVote) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/elections/${electionId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId }),
      });
      const data = await res.json();
      if (data.success) {
        toast(`已投票（权重 ${data.data.weight}）`);
        setMyVote(candidateId);
      } else {
        toast(data.error?.message ?? '投票失败', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 参选操作栏 */}
      {canApply && !showApplyForm && (
        <button
          onClick={() => setShowApplyForm(true)}
          className="btn-success px-4 py-2 text-xs font-mono border border-[#22c55e40] text-[#22c55e] hover:bg-[#22c55e15] transition-colors"
        >
          + 我要参选
        </button>
      )}

      {showApplyForm && (
        <div className="border border-[#30363d] bg-[#161b22] p-4 space-y-3">
          <div className="text-xs font-mono text-[#8b949e]">提交参选申请</div>
          <div>
            <div className="text-[10px] text-[#3d444d] mb-1">竞选宣言（可选，最多 500 字）</div>
            <textarea
              value={statement}
              onChange={e => setStatement(e.target.value.slice(0, 500))}
              rows={4}
              className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] text-xs font-mono text-[#cdd9e5] focus:border-[#00FF41] focus:outline-none resize-none"
              placeholder="介绍你的参选理由和治理理念..."
            />
            <div className="text-right text-[10px] font-mono text-[#3d444d]">{statement.length}/500</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowApplyForm(false)}
              className="btn-ghost flex-1 py-1.5 text-xs font-mono border border-[#30363d] text-[#3d444d] hover:border-[#30363d] transition-colors"
            >
              取消
            </button>
            <button
              onClick={applyCandidate}
              disabled={loading}
              className="btn-success flex-1 py-1.5 text-xs font-mono border border-[#22c55e40] text-[#22c55e] hover:bg-[#22c55e15] transition-colors disabled:opacity-40"
            >
              {loading ? '提交中...' : '确认报名'}
            </button>
          </div>
        </div>
      )}

      {canWithdraw && (
        <button
          onClick={withdrawCandidate}
          disabled={loading}
          className="btn-danger px-4 py-2 text-xs font-mono border border-[#ef444430] text-[#ef4444] hover:bg-[#ef444415] transition-colors disabled:opacity-40"
        >
          撤回参选
        </button>
      )}

      {/* 投票权重提示 */}
      {canVote && userRole && (
        <div className="text-[10px] font-mono text-[#6e7681] border border-[#21262d] px-3 py-2">
          你的投票权重：<span className="text-[#f59e0b]">{VOTE_WEIGHT[userRole] ?? 1}</span>
          <span className="ml-1">（{ROLE_LABEL[userRole]}）</span>
          {myVote && <span className="ml-3 text-[#22c55e]">✓ 已投票（可换票）</span>}
        </div>
      )}

      {/* 候选人列表 */}
      <div className="space-y-3">
        {candidates.filter(c => c.status !== 'WITHDRAWN').length === 0 ? (
          <div className="text-[10px] font-mono text-[#3d444d] py-4 text-center">// 暂无候选人</div>
        ) : (
          candidates
            .filter(c => c.status !== 'WITHDRAWN')
            .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
            .map(c => {
              const isMyVoteTarget = myVote === c.id;
              const isElected = c.status === 'ELECTED';
              const isDefeated = c.status === 'DEFEATED';
              return (
                <div
                  key={c.id}
                  className={`border p-4 transition-colors ${
                    isElected  ? 'border-[#8b5cf6] bg-[#8b5cf608]' :
                    isDefeated ? 'border-[#21262d] bg-[#161b22] opacity-60' :
                    isMyVoteTarget ? 'border-[#3b82f6] bg-[#3b82f608]' :
                    'border-[#21262d] bg-[#161b22]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <a href={`/user/${c.userId}`}
                          className="font-mono text-sm text-[#cdd9e5] hover:text-[#00FF41] transition-colors">
                          @{c.nickname ?? c.username}
                        </a>
                        <span className="text-[10px] font-mono text-[#6e7681]">{c.role}</span>
                        {isElected && (
                          <span className="text-[10px] font-mono border px-1 text-[#8b5cf6] border-[#8b5cf640]">
                            ★ 当选
                          </span>
                        )}
                        {isMyVoteTarget && !isElected && (
                          <span className="text-[10px] font-mono text-[#3b82f6]">✓ 已投票</span>
                        )}
                      </div>
                      {c.statement && (
                        <p className="text-[11px] font-mono text-[#3d444d] leading-relaxed">
                          {c.statement}
                        </p>
                      )}
                    </div>

                    <div className="flex-shrink-0 text-right">
                      {showVoteCounts && c.votes !== null && (
                        <div className="text-sm font-mono text-[#f59e0b] mb-1">{c.votes} 票</div>
                      )}
                      {canVote && c.userId !== userId && c.status === 'RUNNING' && (
                        <button
                          onClick={() => castVote(c.id)}
                          disabled={loading}
                          className={`px-3 py-1.5 text-[10px] font-mono border transition-colors disabled:opacity-40 ${
                            isMyVoteTarget
                              ? 'btn-info border-[#3b82f6] text-[#3b82f6] bg-[#3b82f615]'
                              : 'btn-ghost border-[#30363d] text-[#3d444d] hover:border-[#30363d] hover:text-[#8b949e]'
                          }`}
                        >
                          {isMyVoteTarget ? '换票' : '投票'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
