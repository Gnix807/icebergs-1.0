import { useState } from 'react';
import { toast } from '../ui/Toast';

interface Props {
  isLoggedIn: boolean;
  currentCapabilities: string[];
}

const OPTIONS = [
  { key: 'PUBLICATION_REVIEW', label: '发布审核', note: '检查准备公开的冰山图' },
  { key: 'CONTENT_CURATION', label: '内容整理', note: '维护精选和主题入口' },
  { key: 'COMMUNITY_MODERATION', label: '社区管理', note: '举报、警告、下架与申诉处理' },
  { key: 'SITE_ADMINISTRATION', label: '站点管理', note: '系统设置、权限管理和紧急处理' },
] as const;

export function CapabilityCenter({ isLoggedIn, currentCapabilities }: Props) {
  const [capability, setCapability] = useState<(typeof OPTIONS)[number]['key']>('CONTENT_CURATION');
  const [statement, setStatement] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (action: 'apply' | 'appeal' = 'apply') => {
    if (!isLoggedIn) {
      window.location.href = '/login';
      return;
    }
    if (statement.trim().length < 20) {
      toast('请提供至少 20 字的经历与申请说明', 'error');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/capabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, capability, statement }),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error?.message || '申请提交失败');
      toast(action === 'appeal' ? '权限申诉已提交，等待复核' : '站务申请已提交，等待复核');
      setStatement('');
    } catch (error) {
      toast(error instanceof Error ? error.message : '申请提交失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const evaluateReviewer = async () => {
    if (!isLoggedIn) {
      window.location.href = '/login';
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/capabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'evaluate-reviewer' }),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error?.message || '资格核验失败');
      const metrics = payload.data.metrics;
      toast(metrics.eligible ? '已满足门槛，进入 30 天试用期' : '已更新资格进度');
    } catch (error) {
      toast(error instanceof Error ? error.message : '资格核验失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border border-border-subtle bg-surface-2 p-4 sm:p-5">
      <div className="mb-4">
        <div className="text-[10px] font-mono tracking-widest text-brand">// CAPABILITY APPLICATION</div>
        <h2 className="mt-1 text-base font-mono font-semibold text-text-hi">申请参与站务</h2>
        <p className="mt-2 text-xs leading-relaxed text-text-body">
          这里申请的是具体工作，不是用户头衔。申请通过后，你只能处理对应的站务；成就和等级不会自动带来管理权限。
        </p>
      </div>

      {currentCapabilities.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {currentCapabilities.map((item) => (
            <span key={item} className="rounded-full border border-brand/25 bg-brand/5 px-2.5 py-1 text-[10px] font-mono text-brand">
              {OPTIONS.find((option) => option.key === item)?.label || item}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-2">
          {OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setCapability(option.key)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                capability === option.key
                  ? 'border-brand/40 bg-brand/10'
                  : 'border-border-subtle bg-surface-1 hover:border-border'
              }`}
            >
              <div className="text-xs font-mono text-text-hi">{option.label}</div>
              <div className="mt-0.5 text-[10px] text-text-lo">{option.note}</div>
            </button>
          ))}
        </div>
        <div>
          <textarea
            value={statement}
            onChange={(event) => setStatement(event.target.value.slice(0, 2000))}
            rows={8}
            className="w-full rounded-lg border border-border bg-surface-1 px-3 py-3 text-sm text-text-hi outline-none focus:border-brand"
            placeholder="说说你做过什么，以及为什么想参与这项工作（至少 20 字）"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-mono text-text-lo">{statement.length}/2000</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={evaluateReviewer}
                disabled={busy}
                className="rounded-lg border border-info/30 px-3 py-2 text-xs font-mono text-info hover:bg-info/10 disabled:opacity-50"
              >
                核验审核员资格
              </button>
              <button
                type="button"
                onClick={() => submit('appeal')}
                disabled={busy}
                className="rounded-lg border border-warning/30 px-3 py-2 text-xs font-mono text-warning hover:bg-warning/10 disabled:opacity-50"
              >
                提交权限申诉
              </button>
              <button
                type="button"
                onClick={() => submit('apply')}
                disabled={busy}
                className="rounded-lg bg-brand px-4 py-2 text-xs font-mono font-semibold text-[#0a0a0a] disabled:opacity-50"
              >
                {busy ? '处理中…' : isLoggedIn ? '提交站务申请' : '登录后申请'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
