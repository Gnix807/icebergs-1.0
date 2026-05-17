import { useState, useEffect } from 'react';

interface Feedback {
  id: string;
  type: string;
  content: string;
  contact: string | null;
  icebergId: string | null;
  itemName: string | null;
  status: string;
  resolvedNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const TYPE_MAP: Record<string, { label: string; color: string }> = {
  error:   { label: '内容有误', color: '#ef4444' },
  bug:     { label: 'Bug',     color: '#f59e0b' },
  feature: { label: '功能建议', color: '#3b82f6' },
  other:   { label: '其他',    color: '#6b7280' },
};

const STATUS_MAP = {
  pending:  { label: '待处理', color: '#f59e0b' },
  resolved: { label: '已处理', color: '#22c55e' },
  wontfix:  { label: '不处理', color: '#6b7280' },
};

function timeStr(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function AdminFeedback() {
  const [list, setList]         = useState<Feedback[]>([]);
  const [loading, setLoading]   = useState(true);
  const [typeFilter, setTypeFilter]     = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [resolving, setResolving]       = useState<string | null>(null);
  const [noteMap, setNoteMap]           = useState<Record<string, string>>({});
  const [saving, setSaving]             = useState<string | null>(null);
  const [deleting, setDeleting]         = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/feedback')
      .then(r => r.json())
      .then(d => { if (d.success) setList(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const shown = list.filter(f => {
    if (typeFilter !== 'all' && f.type !== typeFilter) return false;
    if (statusFilter !== 'all' && f.status !== statusFilter) return false;
    return true;
  });

  async function updateStatus(id: string, status: 'pending' | 'resolved' | 'wontfix') {
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolvedNote: noteMap[id] ?? '' }),
      });
      const d = await res.json();
      if (d.success) {
        setList(prev => prev.map(f => f.id === id ? { ...f, ...d.data } : f));
        setResolving(null);
      }
    } finally {
      setSaving(null);
    }
  }

  async function deleteFeedback(id: string) {
    if (!window.confirm('确认删除这条反馈？删除后不可恢复。')) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!d.success) {
        alert(d.error?.message || '删除失败');
        return;
      }

      setList(prev => prev.filter(f => f.id !== id));
      setNoteMap(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (resolving === id) setResolving(null);
    } catch {
      alert('删除失败，请稍后重试');
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return <div className="py-10 text-center font-mono text-sm text-text-mid animate-pulse">// 加载中...</div>;
  }

  const pendingCount  = list.filter(f => f.status === 'pending').length;
  const resolvedCount = list.filter(f => f.status === 'resolved').length;
  const wontfixCount  = list.filter(f => f.status === 'wontfix').length;

  return (
    <div>
      {/* 类型筛选 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs font-mono text-text-mid mr-1">类型</span>
        {(['all', 'error', 'bug', 'feature', 'other'] as const).map(t => {
          const tc = t === 'all' ? { label: '全部', color: '#9ca3af' } : (TYPE_MAP[t] ?? { label: t, color: '#6b7280' });
          const count = t === 'all' ? list.length : list.filter(f => f.type === t).length;
          return (
            <button key={t} onClick={() => setTypeFilter(t)}
              className="text-xs font-mono px-2 py-1 border transition-colors"
              style={{
                borderColor: typeFilter === t ? tc.color : '#30363d',
                color:       typeFilter === t ? tc.color : '#6b7280',
                background:  typeFilter === t ? `${tc.color}10` : 'transparent',
              }}>
              {tc.label} ({count})
            </button>
          );
        })}
      </div>

      {/* 状态筛选 */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-xs font-mono text-text-mid mr-1">状态</span>
        {[
          { key: 'all',      label: '全部',   color: '#9ca3af', count: list.length },
          { key: 'pending',  label: '待处理', color: '#f59e0b', count: pendingCount },
          { key: 'resolved', label: '已处理', color: '#22c55e', count: resolvedCount },
          { key: 'wontfix',  label: '不处理', color: '#6b7280', count: wontfixCount },
        ].map(s => (
          <button key={s.key} onClick={() => setStatusFilter(s.key)}
            className="text-xs font-mono px-2 py-1 border transition-colors"
            style={{
              borderColor: statusFilter === s.key ? s.color : '#30363d',
              color:       statusFilter === s.key ? s.color : '#6b7280',
              background:  statusFilter === s.key ? `${s.color}10` : 'transparent',
            }}>
            {s.label} ({s.count})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="py-12 text-center text-text-lo font-mono text-sm">// 暂无反馈</div>
      ) : (
        <div className="space-y-3">
          {shown.map(fb => {
            const tc = TYPE_MAP[fb.type] ?? { label: fb.type, color: '#6b7280' };
            const sc = STATUS_MAP[fb.status as keyof typeof STATUS_MAP] ?? STATUS_MAP.pending;
            const isResolvingThis = resolving === fb.id;
            return (
              <div key={fb.id}
                className="border bg-surface-2 p-4 space-y-2"
                style={{ borderColor: fb.status === 'pending' ? '#21262d' : `${sc.color}30` }}>

                {/* 元信息行 */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono px-1.5 py-0.5 border"
                    style={{ color: tc.color, borderColor: `${tc.color}50` }}>
                    {tc.label}
                  </span>
                  <span className="text-xs font-mono px-1.5 py-0.5 border"
                    style={{ color: sc.color, borderColor: `${sc.color}50` }}>
                    {sc.label}
                  </span>
                  {fb.icebergId && (
                    <a href={`/iceberg/${fb.icebergId}`}
                      className="text-xs font-mono text-text-lo hover:text-text-body transition-colors" target="_blank">
                      图谱: {fb.icebergId.slice(-8)}
                    </a>
                  )}
                  {fb.itemName && (
                    <span className="text-xs font-mono text-danger">词条: {fb.itemName}</span>
                  )}
                  <span className="ml-auto text-[10px] font-mono text-text-mid">{timeStr(fb.createdAt)}</span>
                </div>

                {/* 内容 */}
                <p className="text-sm font-mono text-text-body leading-relaxed whitespace-pre-wrap">{fb.content}</p>

                {/* 联系方式 */}
                {fb.contact && (
                  <div className="text-xs font-mono text-text-lo">
                    联系: <span className="text-text-body">{fb.contact}</span>
                  </div>
                )}

                {/* 已有备注 */}
                {fb.resolvedNote && !isResolvingThis && (
                  <div className="text-xs font-mono text-text-lo border-l-2 border-border pl-2">
                    备注: {fb.resolvedNote}
                  </div>
                )}

                {/* 处理操作区 */}
                {isResolvingThis ? (
                  <div className="pt-1 space-y-2">
                    <textarea
                      placeholder="处理备注（可选）"
                      rows={2}
                      value={noteMap[fb.id] ?? ''}
                      onChange={e => setNoteMap(prev => ({ ...prev, [fb.id]: e.target.value }))}
                      className="w-full px-2 py-1.5 bg-surface-0 border border-border text-xs font-mono text-text-body resize-none focus:border-brand focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => updateStatus(fb.id, 'resolved')} disabled={saving === fb.id}
                        className="text-xs font-mono px-3 py-1 border border-success text-success hover:bg-success/20 transition-colors disabled:opacity-50">
                        ✓ 标记已处理
                      </button>
                      <button onClick={() => updateStatus(fb.id, 'wontfix')} disabled={saving === fb.id}
                        className="text-xs font-mono px-3 py-1 border border-[#6b7280] text-text-body hover:bg-[#8b949e20] transition-colors disabled:opacity-50">
                        ⊘ 不处理
                      </button>
                      <button onClick={() => setResolving(null)}
                        className="text-xs font-mono px-3 py-1 border border-border text-text-lo hover:text-text-body transition-colors">
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    {fb.status !== 'pending' ? (
                      <button onClick={() => updateStatus(fb.id, 'pending')} disabled={saving === fb.id}
                        className="text-xs font-mono px-3 py-1 border border-border text-text-lo hover:border-warning hover:text-warning transition-colors disabled:opacity-50">
                        ↩ 重新开放
                      </button>
                    ) : (
                      <button onClick={() => setResolving(fb.id)}
                        className="text-xs font-mono px-3 py-1 border border-border text-text-lo hover:border-success hover:text-success transition-colors">
                        → 处理
                      </button>
                    )}
                    <button
                      onClick={() => deleteFeedback(fb.id)}
                      disabled={deleting === fb.id}
                      className="text-xs font-mono px-3 py-1 border border-[#7f1d1d] text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                    >
                      {deleting === fb.id ? '删除中...' : '删除'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
