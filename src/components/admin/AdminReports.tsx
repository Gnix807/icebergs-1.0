import { useState, useEffect, useCallback } from 'react';
import { toast } from '../ui/Toast';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { AdminListSkeleton } from '../ui/Skeleton';

interface Report {
  id: string;
  type: string;
  targetId: string;
  reason: string;
  detail: string | null;
  status: string;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  filer: { id: string; username: string; nickname: string | null };
  handler: { id: string; username: string; nickname: string | null } | null;
}

const STATUS_TABS = [
  { id: 'PENDING',             label: '待处理' },
  { id: 'RESOLVED_ACTION',     label: '已处理' },
  { id: 'RESOLVED_DISMISSED',  label: '已驳回' },
];

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  iceberg:       { label: '冰山图', color: '#3b82f6' },
  user:          { label: '用户',   color: '#f59e0b' },
  rfa_candidate: { label: 'RfA候选', color: '#8b5cf6' },
};

function targetLink(type: string, targetId: string) {
  if (type === 'iceberg') return `/iceberg/${targetId}`;
  if (type === 'user')    return `/user/${targetId}`;
  return '#';
}

export function AdminReports() {
  const [activeStatus, setActiveStatus] = useState('PENDING');
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ report: Report; action: 'RESOLVED_ACTION' | 'RESOLVED_DISMISSED' } | null>(null);
  const { mounted: modalMounted, isLeaving: modalLeaving } = useModalAnimation(modal !== null);
  const [resolution, setResolution] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports?status=${status}`);
      const data = await res.json();
      if (data.success) {
        setReports(data.data.reports);
        setTotal(data.data.total);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(activeStatus); }, [activeStatus, load]);

  const handle = async () => {
    if (!modal) return;
    if (resolution.trim().length < 3) { toast('请填写处理说明', 'error'); return; }
    setActing(true);
    try {
      const res = await fetch(`/api/admin/reports/${modal.report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: modal.action, resolution }),
      });
      const data = await res.json();
      if (data.success) {
        toast(modal.action === 'RESOLVED_ACTION' ? '已标记为已处理' : '已驳回举报');
        setReports(r => r.filter(x => x.id !== modal.report.id));
        setTotal(t => t - 1);
        setModal(null);
        setResolution('');
      } else {
        toast(data.error?.message ?? '操作失败', 'error');
      }
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 状态 Tab */}
      <div className="flex items-center gap-1 border-b border-[#21262d] mb-4">
        {STATUS_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveStatus(t.id)}
            className={`px-4 py-2 text-xs font-mono transition-colors border-b-2 -mb-px ${
              activeStatus === t.id
                ? 'border-[#00FF41] text-[#00FF41]'
                : 'border-transparent text-[#3d444d] hover:text-[#8b949e]'
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] font-mono text-[#6e7681]">共 {total} 条</span>
        <button onClick={() => load(activeStatus)} className="ml-3 text-xs font-mono text-[#6e7681] hover:text-[#00FF41] transition-colors">[刷新]</button>
      </div>

      {loading && <AdminListSkeleton rows={3} />}

      {!loading && reports.length === 0 && (
        <div className="py-12 text-center text-[#3d444d] font-mono text-sm border border-[#21262d]">
          // 暂无{STATUS_TABS.find(t => t.id === activeStatus)?.label}举报
        </div>
      )}

      {!loading && reports.map(r => {
        const typeInfo = TYPE_LABELS[r.type] ?? { label: r.type, color: '#6b7280' };
        return (
          <div key={r.id} className="border border-[#21262d] bg-[#161b22] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">

                {/* 类型 + 目标 */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-[10px] font-mono border px-1.5 py-0.5"
                    style={{ color: typeInfo.color, borderColor: `${typeInfo.color}40` }}
                  >
                    {typeInfo.label}
                  </span>
                  <a
                    href={targetLink(r.type, r.targetId)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono text-[#8b949e] hover:text-[#00FF41] transition-colors truncate"
                  >
                    ID: {r.targetId.slice(-8).toUpperCase()}
                  </a>
                </div>

                {/* 举报理由 */}
                <p className="text-xs text-[#cdd9e5] font-mono mb-1">{r.reason}</p>
                {r.detail && (
                  <p className="text-[11px] text-[#8b949e] leading-relaxed line-clamp-2 border-l-2 border-[#30363d] pl-2 mb-2">
                    {r.detail}
                  </p>
                )}

                {/* 元信息 */}
                <div className="flex flex-wrap gap-3 text-[10px] font-mono text-[#6e7681]">
                  <span>
                    举报人: <a href={`/user/${r.filer.id}`} className="hover:text-[#00FF41] transition-colors">
                      @{r.filer.nickname ?? r.filer.username}
                    </a>
                  </span>
                  <span>{new Date(r.createdAt).toLocaleDateString('zh-CN')}</span>
                  {r.handler && (
                    <span>处理人: @{r.handler.nickname ?? r.handler.username}</span>
                  )}
                </div>

                {/* 处理结果（已处理时显示） */}
                {r.resolution && (
                  <p className="mt-2 text-[11px] text-[#3d444d] border-l-2 border-[#30363d] pl-2">
                    处理说明：{r.resolution}
                  </p>
                )}
              </div>

              {/* 操作按钮（仅待处理时显示）*/}
              {activeStatus === 'PENDING' && (
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => { setModal({ report: r, action: 'RESOLVED_ACTION' }); setResolution(''); }}
                    className="px-3 py-1.5 text-xs font-mono bg-[#ef444415] border border-[#ef444440] text-[#ef4444] hover:bg-[#ef444425] transition-colors"
                  >
                    采取行动
                  </button>
                  <button
                    onClick={() => { setModal({ report: r, action: 'RESOLVED_DISMISSED' }); setResolution(''); }}
                    className="px-3 py-1.5 text-xs font-mono bg-[#30363d15] border border-[#30363d40] text-[#8b949e] hover:bg-[#30363d25] transition-colors"
                  >
                    驳回
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* 处理模态框 */}
      {modalMounted && modal && (
        <div className={`${modalLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${modalLeaving ? 'modal-content-out' : 'modal-content'} bg-[#0d0f14] border border-[#30363d] w-full max-w-sm p-5 font-mono`}>
            <div className="text-[10px] text-[#6e7681] mb-1 tracking-widest">REPORT RESOLUTION</div>
            <div className="text-sm text-[#cdd9e5] mb-1">
              {modal.action === 'RESOLVED_ACTION' ? '采取行动' : '驳回举报'}
            </div>
            <div className="text-xs text-[#3d444d] mb-4">
              {modal.report.type === 'iceberg' ? '冰山图' : '用户'} ·{' '}
              {modal.report.reason}
            </div>

            <div className="mb-1 text-[10px] text-[#3d444d]">
              {modal.action === 'RESOLVED_ACTION' ? '已采取的行动说明' : '驳回理由'}
            </div>
            <textarea
              value={resolution}
              onChange={e => setResolution(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] text-xs text-[#cdd9e5] focus:border-[#00FF41] focus:outline-none resize-none mb-4"
              placeholder={modal.action === 'RESOLVED_ACTION' ? '说明已对目标内容/用户采取的措施...' : '说明驳回原因...'}
            />

            <div className="flex gap-3">
              <button
                onClick={() => { setModal(null); setResolution(''); }}
                className="flex-1 py-2 border border-[#30363d] text-xs hover:border-[#30363d] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handle}
                disabled={acting || resolution.trim().length < 3}
                className={`flex-1 py-2 text-xs border transition-colors disabled:opacity-40 ${
                  modal.action === 'RESOLVED_ACTION'
                    ? 'bg-[#ef444415] border-[#ef444440] text-[#ef4444] hover:bg-[#ef444425]'
                    : 'bg-[#30363d15] border-[#30363d40] text-[#8b949e] hover:bg-[#30363d25]'
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
