import { useCallback, useEffect, useState } from 'react';
import { toast } from '../ui/Toast';

interface Application {
  id: string;
  userId: string;
  capability: string;
  kind: string;
  statement: string;
  createdAt: string;
  decisions: { reviewerId: string; decision: string; reason: string }[];
  user: { id: string; username: string; nickname: string | null } | null;
}

interface ReviewAudit {
  id: string;
  reviewerId: string;
  sampleRate: number;
  isSelfReview: boolean;
  createdAt: string;
}

interface CapabilityRow {
  id: string;
  userId: string;
  capability: string;
  status: string;
  suspendedUntil: string | null;
  user: { id: string; username: string; nickname: string | null } | null;
}

const LABELS: Record<string, string> = {
  PUBLICATION_REVIEW: '发布审核',
  CONTENT_CURATION: '内容策展',
  COMMUNITY_MODERATION: '社区管理',
  SITE_ADMINISTRATION: '站点管理',
};

export function AdminCapabilities({ isFounder = false }: { isFounder?: boolean }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [audits, setAudits] = useState<ReviewAudit[]>([]);
  const [activeCapabilities, setActiveCapabilities] = useState<CapabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [applicationResponse, auditResponse, activeResponse] = await Promise.all([
        fetch('/api/capabilities?scope=applications').then((response) => response.json()),
        fetch('/api/review-audits').then((response) => response.json()),
        fetch('/api/capabilities?scope=active').then((response) => response.json()),
      ]);
      if (applicationResponse.success) setApplications(applicationResponse.data);
      if (auditResponse.success) setAudits(auditResponse.data);
      if (activeResponse.success) setActiveCapabilities(activeResponse.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (application: Application, decision: 'APPROVE' | 'REJECT', breakGlass = false) => {
    const reason = (reasonById[application.id] || '').trim();
    if (reason.length < (breakGlass ? 20 : 5)) {
      toast(breakGlass ? '紧急兜底理由至少 20 字' : '决定理由至少 5 字', 'error');
      return;
    }
    setBusyId(application.id);
    try {
      const response = await fetch(`/api/capabilities/${application.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decide', decision, reason, breakGlass }),
      });
      const payload = await response.json();
      if (!payload.success && payload.error?.code !== 'SECOND_APPROVAL_REQUIRED') {
        throw new Error(payload.error?.message || '处理失败');
      }
      toast(payload.success ? '申请已完成处理' : '决定已记录，等待第二名管理员复核');
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : '处理失败', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const resolveAudit = async (audit: ReviewAudit, outcome: 'PASS' | 'ERROR' | 'SERIOUS') => {
    const reason = (reasonById[audit.id] || '').trim();
    if (outcome !== 'PASS' && reason.length < 5) {
      toast('发现问题时必须填写至少 5 字说明', 'error');
      return;
    }
    setBusyId(audit.id);
    try {
      const response = await fetch('/api/review-audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditId: audit.id, outcome, reason }),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error?.message || '审计失败');
      toast('审计结果已记录');
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : '审计失败', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const protectCapability = async (row: CapabilityRow, action: 'suspend' | 'request-revocation') => {
    const reason = (reasonById[row.id] || '').trim();
    const minimum = action === 'suspend' ? 10 : 20;
    if (reason.length < minimum) {
      toast(`理由至少需要 ${minimum} 字`, 'error');
      return;
    }
    setBusyId(row.id);
    try {
      const response = await fetch(`/api/capabilities/${row.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          userId: row.userId,
          capability: row.capability,
          reason,
        }),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error?.message || '操作失败');
      toast(action === 'suspend' ? '已紧急暂停 72 小时' : '永久撤销请求已进入双人复核');
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作失败', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="py-10 text-center text-xs font-mono text-text-lo">加载职责队列…</div>;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3">
          <h2 className="text-sm font-mono font-semibold text-text-hi">当前能力与紧急保护</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-text-mid">
            单名站点管理员只能紧急暂停 72 小时；永久撤销必须进入下方双人复核。
          </p>
        </div>
        <div className="space-y-2">
          {activeCapabilities.map((row) => (
            <div key={row.id} className="border border-border-subtle bg-surface-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-mono text-text-hi">
                  @{row.user?.nickname || row.user?.username || row.userId}
                  <span className="ml-2 text-brand">{LABELS[row.capability] || row.capability}</span>
                </div>
                <span className="text-[10px] font-mono text-text-lo">
                  {row.status === 'TRIAL' ? '试用中' : row.status === 'SUSPENDED' ? '已暂停' : '有效'}
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  value={reasonById[row.id] || ''}
                  onChange={(event) => setReasonById((current) => ({ ...current, [row.id]: event.target.value }))}
                  className="min-w-0 flex-1 border border-border bg-surface-1 px-3 py-2 text-xs text-text-hi outline-none focus:border-brand"
                  placeholder="填写证据与处置理由"
                />
                <button onClick={() => protectCapability(row, 'suspend')} disabled={busyId === row.id || row.status === 'SUSPENDED'} className="border border-warning/30 px-3 py-2 text-xs font-mono text-warning disabled:opacity-40">暂停 72 小时</button>
                <button onClick={() => protectCapability(row, 'request-revocation')} disabled={busyId === row.id} className="border border-danger/30 px-3 py-2 text-xs font-mono text-danger disabled:opacity-40">申请永久撤销</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-mono font-semibold text-text-hi">能力申请与撤销</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-text-mid">
            正常授予和永久撤销需要两名站点管理员作出相同决定；每人的理由都会写入不可变审计日志。
          </p>
        </div>
        {applications.length === 0 ? (
          <div className="border border-dashed border-border px-4 py-8 text-center text-xs text-text-lo">暂无待处理申请</div>
        ) : (
          <div className="space-y-3">
            {applications.map((application) => (
              <article key={application.id} className="border border-border-subtle bg-surface-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono text-text-hi">
                      @{application.user?.nickname || application.user?.username || application.userId}
                    </div>
                    <div className="mt-1 text-[10px] font-mono text-brand">
                      {application.kind === 'REVOCATION' ? '永久撤销' : '能力申请'} · {LABELS[application.capability] || application.capability}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-text-lo">
                    已有 {application.decisions.length}/2 人决定
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-text-body">{application.statement}</p>
                <textarea
                  value={reasonById[application.id] || ''}
                  onChange={(event) => setReasonById((current) => ({ ...current, [application.id]: event.target.value }))}
                  rows={2}
                  className="mt-3 w-full border border-border bg-surface-1 px-3 py-2 text-xs text-text-hi outline-none focus:border-brand"
                  placeholder="填写本人的独立判断与理由"
                />
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button onClick={() => decide(application, 'REJECT')} disabled={busyId === application.id} className="border border-danger/30 px-3 py-2 text-xs font-mono text-danger hover:bg-danger/10 disabled:opacity-50">拒绝</button>
                  <button onClick={() => decide(application, 'APPROVE')} disabled={busyId === application.id} className="border border-brand/30 px-3 py-2 text-xs font-mono text-brand hover:bg-brand/10 disabled:opacity-50">批准</button>
                  {isFounder && (
                    <button onClick={() => decide(application, 'APPROVE', true)} disabled={busyId === application.id} className="border border-warning/30 px-3 py-2 text-xs font-mono text-warning hover:bg-warning/10 disabled:opacity-50">人数不足时紧急兜底</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-mono font-semibold text-text-hi">发布决定抽查</h2>
          <p className="mt-1 text-[10px] text-text-mid">自审 100% 入队；试用审核员 30%，正式审核员 10%。</p>
        </div>
        {audits.length === 0 ? (
          <div className="border border-dashed border-border px-4 py-8 text-center text-xs text-text-lo">暂无待审计决定</div>
        ) : (
          <div className="space-y-2">
            {audits.map((audit) => (
              <div key={audit.id} className="border border-border-subtle bg-surface-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                  <span className="text-text-body">审核者 {audit.reviewerId}</span>
                  <span className={audit.isSelfReview ? 'text-warning' : 'text-text-lo'}>
                    {audit.isSelfReview ? '自审 · 100% 复核' : `${audit.sampleRate}% 抽查`}
                  </span>
                </div>
                <textarea
                  value={reasonById[audit.id] || ''}
                  onChange={(event) => setReasonById((current) => ({ ...current, [audit.id]: event.target.value }))}
                  rows={2}
                  className="mt-3 w-full border border-border bg-surface-1 px-3 py-2 text-xs text-text-hi outline-none focus:border-brand"
                  placeholder="通过可留空；发现问题必须说明证据"
                />
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button onClick={() => resolveAudit(audit, 'PASS')} disabled={busyId === audit.id} className="border border-success/30 px-3 py-2 text-xs font-mono text-success">通过</button>
                  <button onClick={() => resolveAudit(audit, 'ERROR')} disabled={busyId === audit.id} className="border border-warning/30 px-3 py-2 text-xs font-mono text-warning">一般错误</button>
                  <button onClick={() => resolveAudit(audit, 'SERIOUS')} disabled={busyId === audit.id} className="border border-danger/30 px-3 py-2 text-xs font-mono text-danger">严重问题并下架</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
