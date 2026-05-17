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

const APPEAL_NOTE_TEMPLATES: Record<'approve' | 'reject', Array<{ label: string; text: string }>> = {
  approve: [
    {
      label: '标准恢复',
      text: '经核查情况属实，现已为你解除对应限制，请后续继续遵守社区规则。',
    },
    {
      label: '充分采纳',
      text: '申诉理由充分，管理组已批准并恢复账号相关权限。',
    },
  ],
  reject: [
    {
      label: '证据不足',
      text: '经复核后维持原处理，当前证据不足以支持解除限制。',
    },
    {
      label: '需补充材料',
      text: '申诉说明未能证明误判，建议补充更具体证据后再提交。',
    },
  ],
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
                  ? 'border-brand text-brand'
                  : 'border-border text-text-lo hover:border-border'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button onClick={load} className="text-xs font-mono text-text-mid hover:text-brand transition-colors">[刷新]</button>
      </div>

      {loading ? (
        <AdminListSkeleton rows={3} />
      ) : appeals.length === 0 ? (
        <div className="py-12 text-center text-text-lo font-mono text-sm border border-border-subtle">
          // 暂无 {statusFilter} 申诉
        </div>
      ) : (
        <div className="space-y-3">
          {appeals.map(a => (
            <div key={a.id} className="border border-border-subtle bg-surface-2 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <a href={`/user/${a.user.id}`} className="font-mono text-sm text-text-hi hover:text-brand transition-colors">
                      @{a.user.nickname ?? a.user.username}
                    </a>
                    <span className="text-[10px] font-mono border border-warning/20 text-warning px-1">
                      {TYPE_LABEL[a.type] ?? a.type}
                    </span>
                    <span className="text-[10px] font-mono text-text-mid">
                      {new Date(a.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                  <p className="text-xs text-text-body leading-relaxed line-clamp-3">{a.statement}</p>
                </div>

                {a.status === 'PENDING' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setModal({ appeal: a, action: 'approve' }); setNote(''); }}
                      className="px-2.5 py-1 text-[10px] font-mono border border-[#22c55e30] text-success hover:bg-success/10 transition-colors"
                    >
                      批准
                    </button>
                    <button
                      onClick={() => { setModal({ appeal: a, action: 'reject' }); setNote(''); }}
                      className="px-2.5 py-1 text-[10px] font-mono border border-[#ef444430] text-danger hover:bg-danger/10 transition-colors"
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
          <div className={`${modalLeaving ? 'modal-content-out' : 'modal-content'} bg-surface-4 border border-border w-full max-w-lg p-5 font-mono`}>
            <div className="text-sm text-text-hi mb-1">
              {modal.action === 'approve' ? '批准申诉' : '驳回申诉'}
            </div>
            <div className="text-xs text-text-lo mb-4">
              @{modal.appeal.user.nickname ?? modal.appeal.user.username} · {TYPE_LABEL[modal.appeal.type]}
            </div>

            <div className="mb-4">
              <div className="text-[10px] text-text-lo mb-1">处理意见</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {APPEAL_NOTE_TEMPLATES[modal.action].map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => setNote(tpl.text)}
                    className={`text-[10px] px-2 py-1 border transition-colors ${
                      note === tpl.text
                        ? 'border-brand text-brand bg-brand/10'
                        : 'border-border text-text-body hover:border-brand hover:text-brand'
                    }`}
                    title={tpl.text}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-surface-2 border border-border text-xs text-text-hi focus:border-brand focus:outline-none resize-none"
                placeholder="处理意见（将告知申请人）"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setModal(null); setNote(''); }}
                className="flex-1 py-2 border border-border text-xs hover:border-border transition-colors"
              >
                取消
              </button>
              <button
                onClick={handle}
                disabled={acting || note.trim().length < 3}
                className={`flex-1 py-2 text-xs border transition-colors disabled:opacity-40 ${
                  modal.action === 'approve'
                    ? 'bg-success/10 border-success/25 text-success hover:bg-success/15'
                    : 'bg-danger/10 border-danger/25 text-danger hover:bg-danger/15'
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
