import { useState, useEffect, useCallback } from 'react';
import { toast } from '../ui/Toast';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { AdminListSkeleton } from '../ui/Skeleton';

interface ElectionRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  applyDeadline: string;
  voteDeadline: string;
  confirmedAt: string | null;
  winnerId: string | null;
  createdAt: string;
  _count: { candidates: number; votes: number };
}

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

const STATUS_LABEL: Record<string, string> = {
  OPEN_APPLY: '候选报名中',
  VOTING:     '投票中',
  CLOSED:     '已关闭',
  CONFIRMED:  '已确认',
};
const STATUS_COLOR: Record<string, string> = {
  OPEN_APPLY: '#22c55e',
  VOTING:     '#3b82f6',
  CLOSED:     '#f59e0b',
  CONFIRMED:  '#8b5cf6',
};

export function AdminElections() {
  const [elections, setElections] = useState<ElectionRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Record<string, Candidate[]>>({});
  const [acting, setActing]       = useState(false);

  // 新建选举表单
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ title: '', description: '', applyDays: '7', voteDays: '14' });

  // 确认胜者
  const [confirmModal, setConfirmModal] = useState<{ election: ElectionRow; candidates: Candidate[] } | null>(null);
  const { mounted: confirmMounted, isLeaving: confirmLeaving } = useModalAnimation(confirmModal !== null);
  const [selectedWinner, setSelectedWinner] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/elections');
      const data = await res.json();
      if (data.success) setElections(data.data.elections);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadCandidates = async (id: string) => {
    if (candidates[id]) return;
    const res  = await fetch(`/api/elections/${id}`);
    const data = await res.json();
    if (data.success) {
      setCandidates(c => ({ ...c, [id]: data.data.candidates }));
    }
  };

  const toggle = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    await loadCandidates(id);
  };

  const createElection = async () => {
    setActing(true);
    try {
      const res = await fetch('/api/elections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:       form.title.trim() || undefined,
          description: form.description.trim() || undefined,
          applyDays:   parseInt(form.applyDays, 10),
          voteDays:    parseInt(form.voteDays, 10),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast('选举已发起');
        setShowForm(false);
        setForm({ title: '', description: '', applyDays: '7', voteDays: '14' });
        load();
      } else {
        toast(data.error?.message ?? '发起失败', 'error');
      }
    } finally {
      setActing(false);
    }
  };

  const advanceStatus = async (election: ElectionRow, action: 'start_voting' | 'close') => {
    setActing(true);
    try {
      const res = await fetch(`/api/elections/${election.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        toast('状态已更新');
        load();
        setCandidates(c => { const n = { ...c }; delete n[election.id]; return n; });
      } else {
        toast(data.error?.message ?? '操作失败', 'error');
      }
    } finally {
      setActing(false);
    }
  };

  const openConfirm = async (election: ElectionRow) => {
    await loadCandidates(election.id);
    const cs = candidates[election.id] ?? [];
    setConfirmModal({ election, candidates: cs.filter(c => c.status === 'RUNNING') });
    setSelectedWinner('');
  };

  const confirmWinner = async () => {
    if (!confirmModal) return;
    setActing(true);
    try {
      const res = await fetch(`/api/elections/${confirmModal.election.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedWinner ? { winnerId: selectedWinner } : {}),
      });
      const data = await res.json();
      if (data.success) {
        toast('已确认结果并晋升管理员');
        setConfirmModal(null);
        load();
        setCandidates(c => { const n = { ...c }; delete n[confirmModal.election.id]; return n; });
      } else {
        toast(data.error?.message ?? '确认失败', 'error');
      }
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono text-text-mid">// 站长选举管理</div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-3 py-1.5 text-xs font-mono border border-brand/25 text-brand hover:bg-brand/10 transition-colors"
        >
          {showForm ? '取消' : '+ 发起选举'}
        </button>
      </div>

      {/* 新建表单 */}
      {showForm && (
        <div className="border border-border bg-surface-2 p-4 space-y-3">
          <div className="text-xs font-mono text-text-body mb-2">发起新一届选举</div>
          <div>
            <div className="text-[10px] text-text-lo mb-1">选举标题（留空则用默认）</div>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="站长选举"
              className="w-full px-3 py-1.5 bg-surface-2 border border-border text-xs font-mono text-text-hi focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <div className="text-[10px] text-text-lo mb-1">选举说明（可选）</div>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 bg-surface-2 border border-border text-xs font-mono text-text-hi focus:border-brand focus:outline-none resize-none"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="text-[10px] text-text-lo mb-1">报名期（天）</div>
              <input type="number" min={1} value={form.applyDays}
                onChange={e => setForm(f => ({ ...f, applyDays: e.target.value }))}
                className="w-full px-3 py-1.5 bg-surface-2 border border-border text-xs font-mono text-text-hi focus:border-brand focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <div className="text-[10px] text-text-lo mb-1">投票期（天）</div>
              <input type="number" min={1} value={form.voteDays}
                onChange={e => setForm(f => ({ ...f, voteDays: e.target.value }))}
                className="w-full px-3 py-1.5 bg-surface-2 border border-border text-xs font-mono text-text-hi focus:border-brand focus:outline-none"
              />
            </div>
          </div>
          <button
            onClick={createElection}
            disabled={acting}
            className="w-full py-2 text-xs font-mono bg-brand/10 border border-brand/25 text-brand hover:bg-brand/15 transition-colors disabled:opacity-50"
          >
            {acting ? '发起中...' : '确认发起'}
          </button>
        </div>
      )}

      {loading ? (
        <AdminListSkeleton rows={2} />
      ) : elections.length === 0 ? (
        <div className="text-text-mid font-mono text-sm py-8 text-center">// 暂无选举记录</div>
      ) : (
        <div className="space-y-2">
          {elections.map(e => (
            <div key={e.id} className="border border-border-subtle bg-surface-2">
              {/* 选举头部 */}
              <div
                onClick={() => toggle(e.id)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-4 transition-colors"
              >
                <span
                  className="text-[10px] font-mono border px-1.5 py-0.5 flex-shrink-0"
                  style={{ color: STATUS_COLOR[e.status], borderColor: `${STATUS_COLOR[e.status]}40` }}
                >
                  {STATUS_LABEL[e.status] ?? e.status}
                </span>
                <span className="flex-1 font-mono text-sm text-text-hi truncate">{e.title}</span>
                <span className="text-[10px] font-mono text-text-mid flex-shrink-0">
                  {e._count.candidates} 候选 · {e._count.votes} 票
                </span>
                <span className="text-[10px] font-mono text-text-lo flex-shrink-0">
                  {new Date(e.createdAt).toLocaleDateString('zh-CN')}
                </span>
                <span className="text-text-mid font-mono">{expanded === e.id ? '▲' : '▼'}</span>
              </div>

              {/* 展开详情 */}
              {expanded === e.id && (
                <div className="border-t border-border-subtle px-4 py-3 space-y-3">
                  {/* 时间线 */}
                  <div className="text-[10px] font-mono text-text-mid space-y-0.5">
                    <div>报名截止：{new Date(e.applyDeadline).toLocaleString('zh-CN')}</div>
                    <div>投票截止：{new Date(e.voteDeadline).toLocaleString('zh-CN')}</div>
                    {e.confirmedAt && <div>确认时间：{new Date(e.confirmedAt).toLocaleString('zh-CN')}</div>}
                  </div>

                  {/* 候选人列表 */}
                  <div>
                    <div className="text-[10px] font-mono text-text-lo mb-1.5">候选人</div>
                    {(candidates[e.id] ?? []).length === 0 ? (
                      <div className="text-[10px] font-mono text-text-lo">暂无候选人</div>
                    ) : (
                      <div className="space-y-1">
                        {(candidates[e.id] ?? []).map(c => (
                          <div key={c.id} className="flex items-center gap-2 text-[11px] font-mono">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              c.status === 'RUNNING' ? 'bg-[#22c55e]' :
                              c.status === 'ELECTED' ? 'bg-[#8b5cf6]' :
                              c.status === 'DEFEATED' ? 'bg-[#374151]' : 'bg-[#ef4444]'
                            }`} />
                            <span className="text-text-hi">@{c.nickname ?? c.username}</span>
                            <span className="text-text-mid">{c.role}</span>
                            {c.votes !== null && (
                              <span className="text-warning ml-auto">{c.votes} 票</span>
                            )}
                            <span className="text-text-lo">{c.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex gap-2 pt-1">
                    <a
                      href={`/elections/${e.id}`}
                      className="px-3 py-1.5 text-[10px] font-mono border border-border text-text-lo hover:border-border hover:text-text-body transition-colors"
                    >
                      公开页面 ↗
                    </a>
                    {e.status === 'OPEN_APPLY' && (
                      <button
                        onClick={() => advanceStatus(e, 'start_voting')}
                        disabled={acting}
                        className="btn-info px-3 py-1.5 text-[10px] font-mono border border-[#3b82f630] text-info hover:bg-info/10 transition-colors disabled:opacity-50"
                      >
                        提前开始投票
                      </button>
                    )}
                    {e.status === 'VOTING' && (
                      <button
                        onClick={() => advanceStatus(e, 'close')}
                        disabled={acting}
                        className="btn-warn px-3 py-1.5 text-[10px] font-mono border border-warning/20 text-warning hover:bg-warning/10 transition-colors disabled:opacity-50"
                      >
                        提前关闭投票
                      </button>
                    )}
                    {e.status === 'CLOSED' && (
                      <button
                        onClick={() => openConfirm(e)}
                        disabled={acting}
                        className="btn-purple px-3 py-1.5 text-[10px] font-mono border border-[#8b5cf630] text-purple hover:bg-purple/10 transition-colors disabled:opacity-50"
                      >
                        确认结果并晋升
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 确认胜者模态框 */}
      {confirmMounted && confirmModal && (
        <div className={`${confirmLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${confirmLeaving ? 'modal-content-out' : 'modal-content'} bg-surface-4 border border-border w-full max-w-sm p-5 font-mono`}>
            <div className="text-sm text-text-hi mb-1">确认选举结果</div>
            <div className="text-[10px] text-text-lo mb-4">选择胜者（留空则自动取票数最高者）</div>
            <div className="space-y-1.5 mb-4">
              <button
                onClick={() => setSelectedWinner('')}
                className={`w-full py-2 text-xs border transition-colors text-left px-3 ${
                  !selectedWinner
                    ? 'border-[#8b5cf6] text-purple bg-purple/10'
                    : 'border-border text-text-lo hover:border-border'
                }`}
              >
                自动（票数最高者）
              </button>
              {confirmModal.candidates.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedWinner(c.userId)}
                  className={`w-full py-2 text-xs border transition-colors text-left px-3 ${
                    selectedWinner === c.userId
                      ? 'border-[#8b5cf6] text-purple bg-purple/10'
                      : 'border-border text-text-lo hover:border-border'
                  }`}
                >
                  @{c.nickname ?? c.username}
                  {c.votes !== null && <span className="ml-2 text-warning">{c.votes} 票</span>}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="btn-ghost flex-1 py-2 border border-border text-xs hover:border-border transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmWinner}
                disabled={acting}
                className="btn-purple flex-1 py-2 bg-purple/20 border border-[#8b5cf650] text-purple text-xs hover:bg-purple/20 transition-colors disabled:opacity-50"
              >
                {acting ? '处理中...' : '确认晋升'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
