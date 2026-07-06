import { useState, useEffect } from 'react';
import { toast } from '../ui/Toast';

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

const FEEDBACK_TEMPLATES: Record<'resolved' | 'wontfix', { label: string; text: string }[]> = {
  resolved: [
    { label: '已修复', text: '你反馈的问题已在近期更新中修复，感谢指出。' },
    { label: '内容已修正', text: '经核查，相关内容确有错误，已联系作者修正或由管理组直接更正。' },
    { label: '建议已采纳', text: '感谢你的建议，我们已在后续版本中实现了该功能。' },
    { label: '已添加功能', text: '该功能建议已加入开发计划，将在后续版本中上线。' },
    { label: '已处理', text: '收到反馈，已进行相应处理。' },
  ],
  wontfix: [
    { label: '非平台问题', text: '该问题属于浏览器或网络环境引起，非平台代码层面可修复，建议检查本地环境。' },
    { label: '设计如此', text: '你描述的行为是当前版本的预期设计，暂不考虑修改。如有更好的方案欢迎继续讨论。' },
    { label: '无法复现', text: '我们尝试了多种环境均未能复现你描述的问题，如果有更详细的复现步骤请补充后重新提交。' },
    { label: '优先级较低', text: '我们理解这个需求的价值，但目前资源有限，已记录但短期内暂不安排。' },
    { label: '已有方案', text: '该功能已有类似的替代方案可以实现，建议尝试现有功能。如有具体场景可以进一步讨论。' },
  ],
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
  const [deleteConfirming, setDeleteConfirming] = useState<string | null>(null);

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
    setDeleting(id);
    setDeleteConfirming(null);
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!d.success) {
        toast(d.error?.message || '删除失败', 'error');
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
      toast('删除失败，请稍后重试', 'error');
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
                    <div className="flex flex-wrap gap-1">
                      {FEEDBACK_TEMPLATES.resolved.map((tpl) => (
                        <button key={tpl.label} type="button"
                          onClick={() => setNoteMap(prev => ({ ...prev, [fb.id]: tpl.text }))}
                          className="text-[10px] px-1.5 py-0.5 border border-success/30 text-success hover:bg-success/10 transition-colors">
                          {tpl.label}
                        </button>
                      ))}
                      {FEEDBACK_TEMPLATES.wontfix.map((tpl) => (
                        <button key={tpl.label} type="button"
                          onClick={() => setNoteMap(prev => ({ ...prev, [fb.id]: tpl.text }))}
                          className="text-[10px] px-1.5 py-0.5 border border-[#6b7280]/30 text-text-mid hover:bg-surface-3 transition-colors">
                          {tpl.label}
                        </button>
                      ))}
                    </div>
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
                      onClick={() => deleteConfirming === fb.id ? deleteFeedback(fb.id) : setDeleteConfirming(fb.id)}
                      disabled={deleting === fb.id}
                      className={`text-xs font-mono px-3 py-1 border transition-colors disabled:opacity-50 ${deleteConfirming === fb.id ? 'border-danger bg-danger/10 text-danger' : 'border-[#7f1d1d] text-danger hover:bg-danger/10'}`}
                    >
                      {deleting === fb.id ? '删除中...' : deleteConfirming === fb.id ? '再次确认删除' : '删除'}
                    </button>
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
