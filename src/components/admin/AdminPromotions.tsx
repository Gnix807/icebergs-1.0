import { useState, useEffect, useCallback } from 'react';
import { toast } from '../ui/Toast';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { AdminListSkeleton } from '../ui/Skeleton';

interface PromotionReq {
  id: string;
  targetRole: string;
  statement: string | null;
  status: string;
  createdAt: string;
  expiresAt: string;
  user: {
    id: string;
    username: string;
    nickname: string | null;
    qualityScore: number;
    createdAt: string;
    role: string;
    status: string;
    _count: { icebergs: number };
  };
}

export function AdminPromotions() {
  const [requests, setRequests] = useState<PromotionReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ req: PromotionReq; action: 'approve' | 'reject' } | null>(null);
  const { mounted: modalMounted, isLeaving: modalLeaving } = useModalAnimation(modal !== null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/promotion/requests');
      const data = await res.json();
      if (data.success) setRequests(data.data.requests);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handle = async () => {
    if (!modal) return;
    if (modal.action === 'reject' && note.trim().length < 3) {
      toast('请填写拒绝理由', 'error');
      return;
    }
    setActing(true);
    try {
      const res = await fetch(`/api/promotion/${modal.req.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: modal.action, note }),
      });
      const data = await res.json();
      if (data.success) {
        toast(modal.action === 'approve' ? '已批准，用户角色已提升为 CONTRIBUTOR' : '已拒绝');
        setRequests(r => r.filter(x => x.id !== modal.req.id));
        setModal(null);
        setNote('');
      } else {
        toast(data.error?.message ?? '操作失败', 'error');
      }
    } finally {
      setActing(false);
    }
  };

  if (loading) return <AdminListSkeleton rows={3} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-[#4b5563]">// 晋升申请 · {requests.length} 条待审</span>
        <button onClick={load} className="text-xs font-mono text-[#374151] hover:text-[#00FF41] transition-colors">[刷新]</button>
      </div>

      {requests.length === 0 && (
        <div className="py-12 text-center text-[#2A2A2A] font-mono text-sm border border-[#1a1a1a]">
          // 暂无待审晋升申请
        </div>
      )}

      {requests.map(r => {
        const ageDays = Math.floor((Date.now() - new Date(r.user.createdAt).getTime()) / (24 * 60 * 60 * 1000));
        const expiresSoon = new Date(r.expiresAt).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000;
        return (
          <div key={r.id} className={`border bg-[#0a0c10] p-4 ${expiresSoon ? 'border-[#f59e0b40]' : 'border-[#1f2937]'}`}>
            {expiresSoon && (
              <div className="text-[10px] font-mono text-[#f59e0b] mb-2">! 即将过期</div>
            )}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <a href={`/user/${r.user.id}`} className="font-mono text-sm text-[#e5e5e5] hover:text-[#00FF41] transition-colors">
                  @{r.user.nickname ?? r.user.username}
                </a>
                <div className="flex flex-wrap gap-3 mt-1 text-[10px] font-mono text-[#374151]">
                  <span>质量分 {r.user.qualityScore}</span>
                  <span>{r.user._count.icebergs} 冰山图</span>
                  <span>注册 {ageDays} 天</span>
                  <span>→ {r.targetRole}</span>
                  <span>{new Date(r.createdAt).toLocaleDateString('zh-CN')}</span>
                </div>
                {r.statement && (
                  <p className="mt-2 text-xs text-[#6b7280] leading-relaxed line-clamp-2 border-l-2 border-[#2A2A2A] pl-2">
                    {r.statement}
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => { setModal({ req: r, action: 'approve' }); setNote(''); }}
                  className="btn-primary px-3 py-1.5 text-xs font-mono bg-[#00FF4115] border border-[#00FF4140] text-[#00FF41] hover:bg-[#00FF4125] transition-colors"
                >
                  批准
                </button>
                <button
                  onClick={() => { setModal({ req: r, action: 'reject' }); setNote(''); }}
                  className="btn-danger px-3 py-1.5 text-xs font-mono bg-[#ef444415] border border-[#ef444440] text-[#ef4444] hover:bg-[#ef444425] transition-colors"
                >
                  拒绝
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {modalMounted && modal && (
        <div className={`${modalLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${modalLeaving ? 'modal-content-out' : 'modal-content'} bg-[#0d0f14] border border-[#2A2A2A] w-full max-w-sm p-5 font-mono`}>
            <div className="text-sm text-[#e5e5e5] mb-1">
              {modal.action === 'approve' ? '批准晋升' : '拒绝申请'}
            </div>
            <div className="text-xs text-[#4b5563] mb-4">
              @{modal.req.user.nickname ?? modal.req.user.username} → {modal.req.targetRole}
            </div>
            {modal.action === 'reject' && (
              <div className="mb-4">
                <div className="text-[10px] text-[#4b5563] mb-1">拒绝理由（用户可见）</div>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-[#0a0c10] border border-[#2A2A2A] text-xs text-[#e5e5e5] focus:border-[#00FF41] focus:outline-none resize-none"
                  placeholder="请说明拒绝原因..."
                />
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setModal(null); setNote(''); }} className="btn-ghost flex-1 py-2 border border-[#2A2A2A] text-xs hover:border-[#374151] transition-colors">
                取消
              </button>
              <button
                onClick={handle}
                disabled={acting || (modal.action === 'reject' && note.trim().length < 3)}
                className={`flex-1 py-2 text-xs border transition-colors disabled:opacity-40 ${
                  modal.action === 'approve'
                    ? 'btn-primary bg-[#00FF4115] border-[#00FF4140] text-[#00FF41] hover:bg-[#00FF4125]'
                    : 'btn-danger bg-[#ef444415] border-[#ef444440] text-[#ef4444] hover:bg-[#ef444425]'
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
