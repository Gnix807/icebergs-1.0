import { useState, useEffect, useCallback } from 'react';
import { toast } from '../ui/Toast';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { AdminListSkeleton } from '../ui/Skeleton';

interface AppealRow {
  id: string;
  type: string;
  statement: string;
  status: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    nickname: string | null;
    status: string;
    role: string;
  };
}

const TYPE_LABEL: Record<string, string> = {
  WARNED_2_CLEAR: '申请清除 WARNED_2',
  READ_ONLY:      '申请解除只读',
  TEMP_BAN:       '申请解除临时封禁',
  PERM_BAN:       '申请解除永久封禁',
};

export function AdminAppeals() {
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [modal, setModal] = useState<{ appeal: AppealRow; action: 'approve' | 'reject' } | null>(null);
  const { mounted: modalMounted, isLeaving: modalLeaving } = useModalAnimation(modal !== null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/appeals?status=${statusFilter}`);
      const data = await res.json();
      if (data.success) setAppeals(data.data.appeals);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handle = async () => {
    if (!modal) return;
    if (!note.trim() || note.trim().length < 3) {
      toast('请填写处理意见', 'error');
      return;
    }
    setActing(true);
    try {
      const res = await fetch(`/api/admin/appeals/${modal.appeal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: modal.action, note: note.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast(modal.action === 'approve' ? '申诉已批准' : '申诉已驳回');
        setAppeals(a => a.filter(x => x.id !== modal.appeal.id));
        setModal(null);
        setNote('');
      } else {
        toast(data.error?.message ?? '操作失败', 'error');
      }
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['PENDING', 'APPROVED', 'REJECTED'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-[10px] font-mono border transition-colors ${
                statusFilter === s
                  ? 'border-[#00FF41] text-[#00FF41]'
                  : 'border-[#2A2A2A] text-[#4b5563] hover:border-[#374151]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button onClick={load} className="text-xs font-mono text-[#374151] hover:text-[#00FF41] transition-colors">[刷新]</button>
      </div>

      {loading ? (
        <AdminListSkeleton rows={3} />
      ) : appeals.length === 0 ? (
        <div className="py-12 text-center text-[#2A2A2A] font-mono text-sm border border-[#1a1a1a]">
          // 暂无 {statusFilter} 申诉
        </div>
      ) : (
        <div className="space-y-3">
          {appeals.map(a => (
            <div key={a.id} className="border border-[#1f2937] bg-[#0a0c10] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <a href={`/user/${a.user.id}`} className="font-mono text-sm text-[#e5e5e5] hover:text-[#00FF41] transition-colors">
                      @{a.user.nickname ?? a.user.username}
                    </a>
                    <span className="text-[10px] font-mono border border-[#f59e0b30] text-[#f59e0b] px-1">
                      {TYPE_LABEL[a.type] ?? a.type}
                    </span>
                    <span className="text-[10px] font-mono text-[#374151]">
                      {new Date(a.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                  <p className="text-xs text-[#6b7280] leading-relaxed line-clamp-3">{a.statement}</p>
                </div>

                {a.status === 'PENDING' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setModal({ appeal: a, action: 'approve' }); setNote(''); }}
                      className="px-2.5 py-1 text-[10px] font-mono border border-[#22c55e30] text-[#22c55e] hover:bg-[#22c55e15] transition-colors"
                    >
                      批准
                    </button>
                    <button
                      onClick={() => { setModal({ appeal: a, action: 'reject' }); setNote(''); }}
                      className="px-2.5 py-1 text-[10px] font-mono border border-[#ef444430] text-[#ef4444] hover:bg-[#ef444415] transition-colors"
                    >
                      驳回
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalMounted && modal && (
        <div className={`${modalLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${modalLeaving ? 'modal-content-out' : 'modal-content'} bg-[#0d0f14] border border-[#2A2A2A] w-full max-w-sm p-5 font-mono`}>
            <div className="text-sm text-[#e5e5e5] mb-1">
              {modal.action === 'approve' ? '批准申诉' : '驳回申诉'}
            </div>
            <div className="text-xs text-[#4b5563] mb-4">
              @{modal.appeal.user.nickname ?? modal.appeal.user.username} · {TYPE_LABEL[modal.appeal.type]}
            </div>

            <div className="mb-4">
              <div className="text-[10px] text-[#4b5563] mb-1">处理意见</div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-[#0a0c10] border border-[#2A2A2A] text-xs text-[#e5e5e5] focus:border-[#00FF41] focus:outline-none resize-none"
                placeholder="处理意见（将告知申请人）"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setModal(null); setNote(''); }}
                className="flex-1 py-2 border border-[#2A2A2A] text-xs hover:border-[#374151] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handle}
                disabled={acting || note.trim().length < 3}
                className={`flex-1 py-2 text-xs border transition-colors disabled:opacity-40 ${
                  modal.action === 'approve'
                    ? 'bg-[#22c55e15] border-[#22c55e40] text-[#22c55e] hover:bg-[#22c55e25]'
                    : 'bg-[#ef444415] border-[#ef444440] text-[#ef4444] hover:bg-[#ef444425]'
                }`}
              >
                {acting ? '处理中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
