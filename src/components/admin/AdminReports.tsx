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

type ResolveAction = 'RESOLVED_ACTION' | 'RESOLVED_DISMISSED';
type ReportTypeFilter = 'all' | 'iceberg' | 'user' | 'rfa_candidate';

const STATUS_TABS = [
  { id: 'PENDING',             label: '待处理' },
  { id: 'RESOLVED_ACTION',     label: '已处理' },
  { id: 'RESOLVED_DISMISSED',  label: '已驳回' },
];

const TYPE_TABS: Array<{ id: ReportTypeFilter; label: string }> = [
  { id: 'all', label: '全部类型' },
  { id: 'iceberg', label: '冰山图' },
  { id: 'user', label: '用户' },
  { id: 'rfa_candidate', label: 'RfA候选' },
];

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  iceberg:       { label: '冰山图',  color: '#3b82f6' },
  user:          { label: '用户',    color: '#f59e0b' },
  rfa_candidate: { label: 'RfA候选', color: '#8b5cf6' },
};

const RESOLUTION_TEMPLATES: Record<ResolveAction, { label: string; text: string }[]> = {
  RESOLVED_ACTION: [
    { label: '内容下线', text: '经核查确认违规，相关内容已下线。请创作者注意遵守平台内容规范，避免再次违规。' },
    { label: '部分编辑', text: '已对目标内容进行编辑处理，删除了违规部分，其余内容保留。请创作者后续注意。' },
    { label: '书面警告', text: '已向当事人发出书面警告（WARNED_1），账户功能暂时不受影响。如再次违规将升级为限制措施。' },
    { label: '限制账户', text: '已对涉事账户采取限制措施（READ_ONLY）。如需申诉，请在个人主页通知区提交申诉请求。' },
    { label: '人身攻击', text: '涉及人身攻击/辱骂内容，已删除并记录。社区讨论中请保持理性与尊重。' },
    { label: 'NSFW漏标', text: '该内容含有未标注的 NSFW 素材，已退回并要求补打 NSFW 标签后重新提交。' },
    { label: '虚假内容', text: '确认存在虚假编造内容，已删除并通知创作者。冰山图应以事实为基础，禁止凭空捏造。' },
    { label: '记录在案', text: '已执行处理并记录在案。如发现同一用户反复违规，将提交 ADMIN 进一步审核。' },
  ],
  RESOLVED_DISMISSED: [
    { label: '未违规', text: '经核查，目标内容未违反当前平台规则，举报不予成立。感谢你对社区秩序的关注。' },
    { label: '观点分歧', text: '举报描述的情况属于内容观点分歧而非规则违规，平台不予干预。建议通过评论区理性讨论。' },
    { label: '重复举报', text: '该问题已有其他举报记录并处理完毕，本条为重复举报，已归档。' },
    { label: '证据不足', text: '举报信息不足以支持核查结论，请提供更具体的违规内容描述或截图后再提交。' },
    { label: '超出范围', text: '目标内容涉及的问题不在本平台管辖范围内，已归档。如涉及法律问题，建议直接联系相关部门。' },
    { label: '目标不符', text: '经审查，举报内容与实际目标内容不符，可能为误操作。举报已记录但暂不处理。' },
    { label: '已自删', text: '该内容已被创作者自行修改/删除，举报目标不存在，已归档关闭。' },
  ],
};

function targetLink(type: string, targetId: string) {
  if (type === 'iceberg') return `/iceberg/${targetId}`;
  if (type === 'user') return `/user/${targetId}`;
  if (type === 'rfa_candidate') return '/rfa';
  return '#';
}

export function AdminReports() {
  const [activeStatus, setActiveStatus] = useState('PENDING');
  const [typeFilter, setTypeFilter] = useState<ReportTypeFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');

  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [modal, setModal] = useState<{ report: Report; action: ResolveAction } | null>(null);
  const { mounted: modalMounted, isLeaving: modalLeaving } = useModalAnimation(modal !== null);
  const [resolution, setResolution] = useState('');
  const [acting, setActing] = useState(false);

  const [batchModal, setBatchModal] = useState<{ action: ResolveAction } | null>(null);
  const { mounted: batchMounted, isLeaving: batchLeaving } = useModalAnimation(batchModal !== null);
  const [batchResolution, setBatchResolution] = useState('');
  const [batchActing, setBatchActing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedKeyword(keyword.trim()), 240);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status });
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (debouncedKeyword) params.set('q', debouncedKeyword);
      const res = await fetch(`/api/admin/reports?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setReports(data.data.reports);
        setTotal(data.data.total);
        setSelectedIds([]);
      }
    } finally {
      setLoading(false);
    }
  }, [typeFilter, debouncedKeyword]);

  useEffect(() => {
    load(activeStatus);
  }, [activeStatus, load]);

  const pendingMode = activeStatus === 'PENDING';
  const allSelected = pendingMode && reports.length > 0 && reports.every((r) => selectedIds.includes(r.id));

  const toggleSelectAll = () => {
    if (!pendingMode) return;
    setSelectedIds((prev) => (allSelected ? [] : reports.map((r) => r.id)));
  };

  const toggleSelect = (id: string) => {
    if (!pendingMode) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSingleResolve = async () => {
    if (!modal) return;
    if (resolution.trim().length < 3) {
      toast('请填写处理说明', 'error');
      return;
    }
    setActing(true);
    try {
      const body = { action: modal.action, resolution };
      const res = await fetch(`/api/admin/reports/${modal.report.id}?data=${encodeURIComponent(JSON.stringify(body))}`);
      const data = await res.json();
      if (data.success) {
        toast(modal.action === 'RESOLVED_ACTION' ? '已标记为已处理' : '已驳回举报');
        setReports((prev) => prev.filter((x) => x.id !== modal.report.id));
        setTotal((t) => Math.max(0, t - 1));
        setSelectedIds((prev) => prev.filter((id) => id !== modal.report.id));
        setModal(null);
        setResolution('');
      } else {
        toast(data.error?.message ?? '操作失败', 'error');
      }
    } finally {
      setActing(false);
    }
  };

  const handleBatchResolve = async () => {
    if (!batchModal) return;
    if (selectedIds.length === 0) {
      toast('请先勾选要处理的举报', 'error');
      return;
    }
    if (batchResolution.trim().length < 3) {
      toast('请填写处理说明', 'error');
      return;
    }
    setBatchActing(true);
    try {
      const body = {
        ids: selectedIds,
        action: batchModal.action,
        resolution: batchResolution,
      };
      const res = await fetch(`/api/admin/reports/batch?data=${encodeURIComponent(JSON.stringify(body))}`);
      const data = await res.json();
      if (data.success) {
        const selectedSet = new Set(selectedIds);
        const updated = Number(data.data?.updated ?? 0);
        const skipped = Number(data.data?.skipped ?? 0);
        setReports((prev) => prev.filter((r) => !selectedSet.has(r.id)));
        setTotal((t) => Math.max(0, t - updated));
        setSelectedIds([]);
        setBatchModal(null);
        setBatchResolution('');
        toast(`批量处理完成：成功 ${updated} 条${skipped > 0 ? `，跳过 ${skipped} 条` : ''}`);
      } else {
        toast(data.error?.message ?? '批量操作失败', 'error');
      }
    } finally {
      setBatchActing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 状态 Tab */}
      <div className="flex items-center gap-1 border-b border-border-subtle mb-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveStatus(tab.id)}
            className={`px-4 py-2 text-xs font-mono transition-colors border-b-2 -mb-px ${
              activeStatus === tab.id
                ? 'border-brand text-brand'
                : 'border-transparent text-text-lo hover:text-text-body'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] font-mono text-text-mid">共 {total} 条</span>
        <button
          onClick={() => load(activeStatus)}
          className="ml-3 text-xs font-mono text-text-mid hover:text-brand transition-colors"
        >
          [刷新]
        </button>
      </div>

      {/* 筛选条 */}
      <div className="border border-border-subtle bg-surface-2 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTypeFilter(tab.id)}
              className={`px-2.5 py-1 text-[10px] font-mono border transition-colors ${
                typeFilter === tab.id
                  ? 'border-brand text-brand bg-brand/10'
                  : 'border-border text-text-body hover:border-brand hover:text-brand'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索理由/详情/目标ID"
            className="ml-auto min-w-[220px] flex-1 max-w-xs px-2.5 py-1.5 bg-surface-1 border border-border text-xs font-mono text-text-hi focus:outline-none focus:border-brand placeholder:text-text-lo"
          />
        </div>
      </div>

      {/* 待处理批量工具条 */}
      {pendingMode && !loading && reports.length > 0 && (
        <div className="border border-border-subtle bg-surface-1 px-3 py-2.5 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-mono text-text-body cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="accent-[#00FF41]"
            />
            全选当前页
          </label>
          <span className="text-[10px] font-mono text-text-mid">已选 {selectedIds.length} 条</span>
          <button
            onClick={() => {
              setBatchModal({ action: 'RESOLVED_ACTION' });
              setBatchResolution('');
            }}
            disabled={selectedIds.length === 0}
            className="btn-danger px-2.5 py-1 text-xs font-mono transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            批量采取行动
          </button>
          <button
            onClick={() => {
              setBatchModal({ action: 'RESOLVED_DISMISSED' });
              setBatchResolution('');
            }}
            disabled={selectedIds.length === 0}
            className="btn-ghost px-2.5 py-1 text-xs font-mono transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            批量驳回
          </button>
        </div>
      )}

      {loading && <AdminListSkeleton rows={3} />}

      {!loading && reports.length === 0 && (
        <div className="py-12 text-center text-text-lo font-mono text-sm border border-border-subtle">
          // 暂无{STATUS_TABS.find((t) => t.id === activeStatus)?.label}举报
        </div>
      )}

      {!loading && reports.map((report) => {
        const typeInfo = TYPE_LABELS[report.type] ?? { label: report.type, color: '#6b7280' };
        const checked = selectedIds.includes(report.id);
        return (
          <div key={report.id} className="border border-border-subtle bg-surface-2 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {pendingMode && (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelect(report.id)}
                    className="mt-1 accent-[#00FF41] cursor-pointer"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-[10px] font-mono border px-1.5 py-0.5"
                      style={{ color: typeInfo.color, borderColor: `${typeInfo.color}40` }}
                    >
                      {typeInfo.label}
                    </span>
                    <a
                      href={targetLink(report.type, report.targetId)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-mono text-text-body hover:text-brand transition-colors truncate"
                    >
                      ID: {report.targetId.slice(-8).toUpperCase()}
                    </a>
                  </div>

                  <p className="text-xs text-text-hi font-mono mb-1">{report.reason}</p>
                  {report.detail && (
                    <p className="text-[11px] text-text-body leading-relaxed line-clamp-2 border-l-2 border-border pl-2 mb-2">
                      {report.detail}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-3 text-[10px] font-mono text-text-mid">
                    <span>
                      举报人:
                      <a href={`/user/${report.filer.id}`} className="ml-1 hover:text-brand transition-colors">
                        @{report.filer.nickname ?? report.filer.username}
                      </a>
                    </span>
                    <span>{new Date(report.createdAt).toLocaleDateString('zh-CN')}</span>
                    {report.handler && <span>处理人: @{report.handler.nickname ?? report.handler.username}</span>}
                  </div>

                  {report.resolution && (
                    <p className="mt-2 text-[11px] text-text-lo border-l-2 border-border pl-2">
                      处理说明：{report.resolution}
                    </p>
                  )}
                </div>
              </div>

              {pendingMode && (
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      setModal({ report, action: 'RESOLVED_ACTION' });
                      setResolution('');
                    }}
                    className="btn-danger px-3 py-1.5 text-xs font-mono transition-colors"
                  >
                    采取行动
                  </button>
                  <button
                    onClick={() => {
                      setModal({ report, action: 'RESOLVED_DISMISSED' });
                      setResolution('');
                    }}
                    className="btn-ghost px-3 py-1.5 text-xs font-mono transition-colors"
                  >
                    驳回
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* 单条处理模态框 */}
      {modalMounted && modal && (
        <div className={`${modalLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${modalLeaving ? 'modal-content-out' : 'modal-content'} bg-surface-4 border border-border w-full max-w-sm p-5 font-mono`}>
            <div className="text-[10px] text-text-mid mb-1 tracking-widest">REPORT RESOLUTION</div>
            <div className="text-sm text-text-hi mb-1">
              {modal.action === 'RESOLVED_ACTION' ? '采取行动' : '驳回举报'}
            </div>
            <div className="text-xs text-text-lo mb-3">
              {modal.report.type === 'iceberg' ? '冰山图' : '用户'} · {modal.report.reason}
            </div>

            <div className="mb-1 text-[10px] text-text-lo">
              {modal.action === 'RESOLVED_ACTION' ? '已采取的行动说明' : '驳回理由'}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {RESOLUTION_TEMPLATES[modal.action].map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => setResolution(tpl.text)}
                  className="text-[10px] px-2 py-1 border border-border text-text-body hover:border-brand hover:text-brand transition-colors"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-surface-2 border border-border text-xs text-text-hi focus:border-brand focus:outline-none resize-none mb-4"
              placeholder={modal.action === 'RESOLVED_ACTION' ? '说明已对目标内容/用户采取的措施...' : '说明驳回原因...'}
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setModal(null);
                  setResolution('');
                }}
                className="btn-ghost flex-1 py-2 text-xs transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSingleResolve}
                disabled={acting || resolution.trim().length < 3}
                className={`flex-1 py-2 text-xs transition-colors disabled:opacity-50 ${
                  modal.action === 'RESOLVED_ACTION'
                    ? 'btn-danger'
                    : 'btn-ghost'
                }`}
              >
                {acting ? '处理中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量处理模态框 */}
      {batchMounted && batchModal && (
        <div className={`${batchLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${batchLeaving ? 'modal-content-out' : 'modal-content'} bg-surface-4 border border-border w-full max-w-md p-5 font-mono`}>
            <div className="text-[10px] text-text-mid mb-1 tracking-widest">BATCH REPORT RESOLUTION</div>
            <div className="text-sm text-text-hi mb-1">
              {batchModal.action === 'RESOLVED_ACTION' ? '批量采取行动' : '批量驳回举报'}
            </div>
            <div className="text-xs text-text-lo mb-3">将处理 {selectedIds.length} 条举报</div>

            <div className="mb-1 text-[10px] text-text-lo">处理说明</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {RESOLUTION_TEMPLATES[batchModal.action].map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => setBatchResolution(tpl.text)}
                  className="text-[10px] px-2 py-1 border border-border text-text-body hover:border-brand hover:text-brand transition-colors"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
            <textarea
              value={batchResolution}
              onChange={(e) => setBatchResolution(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-surface-2 border border-border text-xs text-text-hi focus:border-brand focus:outline-none resize-none mb-4"
              placeholder="填写统一处理说明，所有选中记录将使用此说明"
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setBatchModal(null);
                  setBatchResolution('');
                }}
                className="btn-ghost flex-1 py-2 text-xs transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleBatchResolve}
                disabled={batchActing || batchResolution.trim().length < 3 || selectedIds.length === 0}
                className={`flex-1 py-2 text-xs transition-colors disabled:opacity-50 ${
                  batchModal.action === 'RESOLVED_ACTION'
                    ? 'btn-danger'
                    : 'btn-ghost'
                }`}
              >
                {batchActing ? '处理中...' : '确认批量处理'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
