import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from '../ui/Toast';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { AdminListSkeleton } from '../ui/Skeleton';

interface ReviewItem {
  id: string;
  status: string;
  createdAt: string;
  overdue: boolean;
  selfAuthored?: boolean;
  iceberg: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    author: { id: string; username: string; nickname: string | null };
    tiers: { id: string; name: string; order: number; _count: { items: number } }[];
  };
}

export function AdminReviews() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; title: string } | null>(null);
  const rejectModalRef = useRef(rejectModal);
  rejectModalRef.current = rejectModal ?? rejectModalRef.current;
  const { mounted: rejectMounted, isLeaving: rejectLeaving } = useModalAnimation(rejectModal !== null);
  const [rejectReason, setRejectReason] = useState('');
  const [overrideModal, setOverrideModal] = useState<{ id: string; title: string } | null>(null);
  const overrideModalRef = useRef(overrideModal);
  overrideModalRef.current = overrideModal ?? overrideModalRef.current;
  const { mounted: overrideMounted, isLeaving: overrideLeaving } = useModalAnimation(overrideModal !== null);
  const [overrideReason, setOverrideReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reviews');
      const data = await res.json();
      if (data.success) setReviews(data.data.reviews);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (reviewId: string) => {
    setActing(reviewId);
    try {
      const res = await fetch(`/api/reviews/${reviewId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (data.success) {
        toast('已通过审核，冰山图已发布');
        setReviews(r => r.filter(x => x.id !== reviewId));
      } else {
        toast(data.error?.message ?? '操作失败', 'error');
      }
    } finally {
      setActing(null);
    }
  };

  const reject = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    setActing(rejectModal.id);
    try {
      const res = await fetch(`/api/reviews/${rejectModal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: rejectReason }),
      });
      const data = await res.json();
      if (data.success) {
        toast('已退回，冰山图返回草稿状态');
        setReviews(r => r.filter(x => x.id !== rejectModal.id));
        setRejectModal(null);
        setRejectReason('');
      } else {
        toast(data.error?.message ?? '操作失败', 'error');
      }
    } finally {
      setActing(null);
    }
  };

  const override = async () => {
    if (!overrideModal || overrideReason.trim().length < 5) return;
    setActing(overrideModal.id);
    try {
      const res = await fetch(`/api/reviews/${overrideModal.id}/override`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: overrideReason }),
      });
      const data = await res.json();
      if (data.success) {
        toast('已 Override，冰山图直接发布');
        setReviews(r => r.filter(x => x.id !== overrideModal.id));
        setOverrideModal(null);
        setOverrideReason('');
      } else {
        toast(data.error?.message ?? '操作失败', 'error');
      }
    } finally {
      setActing(null);
    }
  };

  if (loading) return <AdminListSkeleton rows={3} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-[#4b5563]">
          // 待审队列 · {reviews.length} 条
        </span>
        <button onClick={load} className="text-xs font-mono text-[#374151] hover:text-[#00FF41] transition-colors">
          [刷新]
        </button>
      </div>

      {reviews.length === 0 && (
        <div className="py-12 text-center text-[#2A2A2A] font-mono text-sm border border-[#1a1a1a]">
          // 审核队列为空
        </div>
      )}

      {reviews.map(r => (
        <div
          key={r.id}
          className={`border bg-[#0a0c10] p-4 ${r.overdue ? 'border-[#f59e0b40]' : 'border-[#1f2937]'}`}
        >
          <div className="flex gap-2 mb-2">
            {r.overdue && (
              <span className="text-[10px] font-mono text-[#f59e0b]">! 超时未处理 (72h+)</span>
            )}
            {r.selfAuthored && (
              <span className="text-[10px] font-mono text-[#a855f7] border border-[#a855f740] px-1.5 py-0.5">自己提交 · 需要 Override</span>
            )}
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <a
                href={`/iceberg/${r.iceberg.slug}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-sm text-[#e5e5e5] hover:text-[#00FF41] transition-colors"
              >
                {r.iceberg.title}
              </a>
              {r.iceberg.description && (
                <p className="text-xs text-[#4b5563] mt-1 line-clamp-2">{r.iceberg.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-[#374151]">
                <span>by @{r.iceberg.author.nickname ?? r.iceberg.author.username}</span>
                <span>{r.iceberg.tiers.length} 层</span>
                <span>{r.iceberg.tiers.reduce((s, t) => s + t._count.items, 0)} 词条</span>
                <span>{new Date(r.createdAt).toLocaleDateString('zh-CN')}</span>
              </div>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              {r.selfAuthored ? (
                <button
                  onClick={() => setOverrideModal({ id: r.id, title: r.iceberg.title })}
                  disabled={acting === r.id}
                  className="px-3 py-1.5 text-xs font-mono bg-[#a855f715] border border-[#a855f740] text-[#a855f7] hover:bg-[#a855f725] transition-colors disabled:opacity-40"
                >
                  直接发布
                </button>
              ) : (
                <>
                  <button
                    onClick={() => approve(r.id)}
                    disabled={acting === r.id}
                    className="btn-primary px-3 py-1.5 text-xs font-mono bg-[#00FF4115] border border-[#00FF4140] text-[#00FF41] hover:bg-[#00FF4125] transition-colors disabled:opacity-40"
                  >
                    通过
                  </button>
                  <button
                    onClick={() => setRejectModal({ id: r.id, title: r.iceberg.title })}
                    disabled={acting === r.id}
                    className="btn-danger px-3 py-1.5 text-xs font-mono bg-[#ef444415] border border-[#ef444440] text-[#ef4444] hover:bg-[#ef444425] transition-colors disabled:opacity-40"
                  >
                    退回
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* 退回理由模态框 */}
      {rejectMounted && (
        <div className={`${rejectLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${rejectLeaving ? 'modal-content-out' : 'modal-content'} bg-[#0d0f14] border border-[#2A2A2A] rounded w-full max-w-sm p-5 font-mono`}>
            <div className="text-sm mb-1 text-[#e5e5e5]">退回：{rejectModalRef.current?.title}</div>
            <div className="text-xs text-[#4b5563] mb-4">填写退回理由（作者可见）</div>

            <select
              className="w-full mb-3 px-3 py-2 bg-[#0a0c10] border border-[#2A2A2A] text-xs text-[#9ca3af] focus:border-[#00FF41] focus:outline-none"
              onChange={e => setRejectReason(e.target.value)}
              defaultValue=""
            >
              <option value="" disabled>选择模板（可选）</option>
              <option value="内容过于空洞，词条描述不足">内容过于空洞，词条描述不足</option>
              <option value="存在明显错误信息，请提供来源引用">存在明显错误信息，请提供来源引用</option>
              <option value="层级划分不合理，请参考创作指南">层级划分不合理，请参考创作指南</option>
              <option value="包含违规内容">包含违规内容</option>
              <option value="重复内容，请与已有冰山图合并">重复内容，请与已有冰山图合并</option>
            </select>

            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 bg-[#0a0c10] border border-[#2A2A2A] text-xs text-[#e5e5e5] focus:border-[#00FF41] focus:outline-none resize-none"
              rows={3}
              placeholder="自定义理由..."
            />

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setRejectModal(null); setRejectReason(''); }}
                className="btn-ghost flex-1 py-2 border border-[#2A2A2A] text-xs hover:border-[#4b5563] transition-colors"
              >
                取消
              </button>
              <button
                onClick={reject}
                disabled={!rejectReason.trim() || acting === rejectModalRef.current?.id}
                className="btn-danger flex-1 py-2 bg-[#ef444420] border border-[#ef444450] text-[#ef4444] text-xs hover:bg-[#ef444430] transition-colors disabled:opacity-40"
              >
                确认退回
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Override 模态框 */}
      {overrideMounted && (
        <div className={`${overrideLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${overrideLeaving ? 'modal-content-out' : 'modal-content'} bg-[#0d0f14] border border-[#2A2A2A] rounded w-full max-w-sm p-5 font-mono`}>
            <div className="text-sm mb-1 text-[#a855f7]">Override 直接发布</div>
            <div className="text-xs text-[#e5e5e5] mb-1">{overrideModalRef.current?.title}</div>
            <div className="text-xs text-[#4b5563] mb-4">
              此操作绕过回避制度，理由将永久记录在审核日志中（至少 5 字）
            </div>

            <textarea
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              className="w-full px-3 py-2 bg-[#0a0c10] border border-[#2A2A2A] text-xs text-[#e5e5e5] focus:border-[#a855f7] focus:outline-none resize-none"
              rows={3}
              placeholder="填写 Override 理由（如：仅我一人可审，队列清零需要）"
            />

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setOverrideModal(null); setOverrideReason(''); }}
                className="btn-ghost flex-1 py-2 border border-[#2A2A2A] text-xs hover:border-[#4b5563] transition-colors"
              >
                取消
              </button>
              <button
                onClick={override}
                disabled={overrideReason.trim().length < 5 || acting === overrideModalRef.current?.id}
                className="flex-1 py-2 bg-[#a855f720] border border-[#a855f750] text-[#a855f7] text-xs hover:bg-[#a855f730] transition-colors disabled:opacity-40"
              >
                确认发布
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
