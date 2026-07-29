import { useEffect, useMemo, useState } from 'react';
import {
  Bug,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  FileText,
  Lightbulb,
  MessageCircle,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { toast } from '../ui/Toast';

interface Props {
  api: string;
  icebergSlug: string;
  canCreateIssue: boolean;
  isAuthenticated: boolean;
  launchKey: number;
}

const ISSUE_KINDS: Record<string, { label: string; className: string }> = {
  CONTENT: { label: '内容问题', className: 'border-info/40 text-info' },
  BUG: { label: '功能问题', className: 'border-danger/40 text-danger' },
  SUGGESTION: { label: '改进建议', className: 'border-warning/40 text-warning' },
  OTHER: { label: '其他', className: 'border-border text-text-mid' },
};

type IssueFilter = 'OPEN' | 'CLOSED' | 'ALL';

function IssueKindIcon({ kind, size = 14 }: { kind: string; size?: number }) {
  if (kind === 'BUG') return <Bug size={size} aria-hidden="true" />;
  if (kind === 'SUGGESTION') return <Lightbulb size={size} aria-hidden="true" />;
  return <FileText size={size} aria-hidden="true" />;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

export function RepositoryIssues({
  api,
  icebergSlug,
  canCreateIssue,
  isAuthenticated,
  launchKey,
}: Props) {
  const [issues, setIssues] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('CONTENT');
  const [comment, setComment] = useState('');
  const [filter, setFilter] = useState<IssueFilter>('OPEN');
  const [search, setSearch] = useState('');
  const composerAnimation = useModalAnimation(composerOpen);

  const issueCounts = useMemo(() => ({
    open: issues.filter((issue) => issue.status === 'OPEN').length,
    closed: issues.filter((issue) => issue.status === 'CLOSED').length,
  }), [issues]);

  const visibleIssues = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('zh-CN');
    return issues.filter((issue) => {
      if (filter !== 'ALL' && issue.status !== filter) return false;
      if (!keyword) return true;
      return `${issue.title} ${issue.body || ''} ${issue.author?.nickname || ''} ${issue.author?.username || ''}`
        .toLocaleLowerCase('zh-CN')
        .includes(keyword);
    });
  }, [filter, issues, search]);

  const request = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        toast(data?.error?.message || '操作失败', 'error');
        return null;
      }
      return data.data;
    } catch (error) {
      toast(error instanceof Error ? error.message : '网络连接失败，请稍后重试', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${api}?view=issues`, { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.error?.message || 'Issue 加载失败');
      setIssues(data.data);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Issue 加载失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadIssue = async (number: number) => {
    setLoading(true);
    try {
      const response = await fetch(`${api}?view=issue&number=${number}`, { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.error?.message || 'Issue 加载失败');
      setSelected(data.data);
      history.replaceState(null, '', `${location.pathname}?issue=${number}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Issue 加载失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initialNumber = Number(params.get('issue'));
    if (initialNumber > 0) void loadIssue(initialNumber);
    else void loadList();
    if (params.has('newIssue') && canCreateIssue) setComposerOpen(true);
  }, [api]);

  useEffect(() => {
    if (launchKey <= 0) return;
    if (canCreateIssue) setComposerOpen(true);
    else toast(isAuthenticated ? '当前账号暂时无法提交 Issue' : '请先登录后提交 Issue', 'error');
  }, [launchKey]);

  useEffect(() => {
    if (!composerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setComposerOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, composerOpen]);

  const createIssue = async () => {
    if (title.trim().length < 2) return;
    const result = await request({
      action: 'create-issue',
      title: title.trim(),
      body: body.trim(),
      kind,
    });
    if (!result) return;
    setComposerOpen(false);
    setTitle('');
    setBody('');
    setKind('CONTENT');
    toast('Issue 已提交，不会自动创建分支');
    await loadIssue(result.number);
  };

  const submitComment = async () => {
    if (!selected || !comment.trim()) return;
    const result = await request({
      action: 'comment-issue',
      number: selected.number,
      body: comment.trim(),
    });
    if (!result) return;
    setComment('');
    await loadIssue(selected.number);
    toast('回复已发布');
  };

  const setStatus = async (status: 'OPEN' | 'CLOSED') => {
    if (!selected) return;
    const result = await request({
      action: 'set-issue-status',
      number: selected.number,
      status,
    });
    if (!result) return;
    await loadIssue(selected.number);
    toast(status === 'CLOSED' ? 'Issue 已关闭' : 'Issue 已重新打开');
  };

  if (loading && !selected && issues.length === 0) {
    return (
      <div className="repository-view-enter space-y-3" aria-label="正在载入 Issue">
        <div className="h-32 animate-pulse rounded-2xl border border-border-subtle bg-surface-1" />
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-xl border border-border-subtle bg-surface-1" />
        ))}
      </div>
    );
  }

  return (
    <section className="repository-issues">
      <div className="repository-issue-hero repository-view-enter mb-5 flex flex-col gap-5 rounded-2xl border border-border-subtle bg-surface-1 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="relative z-[1] max-w-2xl">
          <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-warning">
            <CircleDot size={13} aria-hidden="true" />
            Discussion workspace
          </div>
          <h2 className="font-mono text-lg font-semibold text-text-hi sm:text-xl">问题与建议</h2>
          <p className="mt-2 max-w-xl text-xs leading-relaxed text-text-mid">
            发现资料有误、页面异常或有改进想法，可以先在这里讨论。Issue 不会创建分支，也不会直接修改主版本。
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[10px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/5 px-2.5 py-1 text-success">
              <CircleDot size={11} aria-hidden="true" />
              {issueCounts.open} 个开放
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-0/60 px-2.5 py-1 text-text-mid">
              <CheckCircle2 size={11} aria-hidden="true" />
              {issueCounts.closed} 个已关闭
            </span>
          </div>
        </div>
        {canCreateIssue ? (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="relative z-[1] inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-warning/50 bg-warning/10 px-4 font-mono text-xs font-semibold text-warning shadow-[0_10px_30px_rgba(0,0,0,0.12)] transition-all hover:-translate-y-0.5 hover:border-warning hover:bg-warning/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
          >
            <Plus size={15} aria-hidden="true" />
            提出 Issue
          </button>
        ) : (
          <a
            href={isAuthenticated ? `/iceberg/${encodeURIComponent(icebergSlug)}` : '/login'}
            className="relative z-[1] inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-0/70 px-4 font-mono text-xs text-text-mid transition-all hover:-translate-y-0.5 hover:border-brand hover:text-brand"
          >
            {isAuthenticated ? '当前账号仅可查看' : '登录后提出 Issue'}
          </a>
        )}
      </div>

      {selected ? (
        <div key={`issue-${selected.number}`} className="repository-view-enter">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              history.replaceState(null, '', location.pathname);
              void loadList();
            }}
            className="mb-4 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 font-mono text-xs text-text-mid transition-colors hover:bg-surface-1 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ChevronLeft size={15} aria-hidden="true" />
            返回 Issue 列表
          </button>

          <article className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-1 shadow-[0_18px_55px_rgba(0,0,0,0.08)]">
            <div className={`h-1 ${selected.status === 'OPEN' ? 'bg-success' : 'bg-text-lo/40'}`} aria-hidden="true" />
            <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] ${
                selected.status === 'OPEN' ? 'border-success/40 bg-success/5 text-success' : 'border-border bg-surface-0 text-text-mid'
              }`}>
                {selected.status === 'OPEN'
                  ? <CircleDot size={11} aria-hidden="true" />
                  : <CheckCircle2 size={11} aria-hidden="true" />}
                {selected.status === 'OPEN' ? '开放' : '已关闭'}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] ${
                ISSUE_KINDS[selected.kind]?.className || ISSUE_KINDS.OTHER.className
              }`}>
                <IssueKindIcon kind={selected.kind} size={11} />
                {ISSUE_KINDS[selected.kind]?.label || ISSUE_KINDS.OTHER.label}
              </span>
              <span className="font-mono text-xs text-text-mid">#{selected.number}</span>
            </div>
            <h2 className="mt-4 break-words font-mono text-xl font-semibold leading-snug text-text-hi sm:text-2xl">{selected.title}</h2>
            {selected.body && (
              <p className="mt-4 whitespace-pre-wrap break-words border-l-2 border-border pl-4 text-sm leading-7 text-text-body">{selected.body}</p>
            )}
            <div className="mt-5 flex flex-col gap-3 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-full border border-border bg-surface-0 font-mono text-xs font-bold text-text-hi" aria-hidden="true">
                  {(selected.author?.nickname || selected.author?.username || '用').slice(0, 1)}
                </span>
                <p className="font-mono text-[10px] leading-relaxed text-text-lo">
                  <span className="block text-text-mid">{selected.author?.nickname || selected.author?.username || '用户'}</span>
                  {formatDate(selected.createdAt)}
                </p>
              </div>
              {selected.canManage && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setStatus(selected.status === 'OPEN' ? 'CLOSED' : 'OPEN')}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 font-mono text-[10px] text-text-body transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
                >
                  {selected.status === 'OPEN'
                    ? <CheckCircle2 size={13} aria-hidden="true" />
                    : <CircleDot size={13} aria-hidden="true" />}
                  {selected.status === 'OPEN' ? '关闭 Issue' : '重新打开 Issue'}
                </button>
              )}
            </div>
            </div>
          </article>

          <div className="repository-issue-timeline mt-6 space-y-3">
            <h3 className="mb-4 flex items-center gap-2 font-mono text-xs text-text-hi">
              <MessageCircle size={14} className="text-brand" aria-hidden="true" />
              讨论 · {selected.comments.length}
            </h3>
            {selected.comments.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-surface-0/40 p-7 text-center text-xs text-text-mid">
                还没有回复，欢迎补充线索或提出解决思路。
              </div>
            )}
            {selected.comments.map((item: any) => (
              <article key={item.id} className="repository-issue-comment relative rounded-xl border border-border-subtle bg-surface-1 p-4 sm:ml-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-border bg-surface-0 font-mono text-[10px] font-bold text-text-hi" aria-hidden="true">
                    {(item.author?.nickname || item.author?.username || '用').slice(0, 1)}
                  </span>
                  <p className="font-mono text-[10px] text-text-lo">
                    <span className="text-text-mid">{item.author?.nickname || item.author?.username || '用户'}</span>
                    {' · '}{formatDate(item.createdAt)}
                  </p>
                </div>
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-text-body">{item.body}</p>
              </article>
            ))}
          </div>

          {selected.status === 'OPEN' && canCreateIssue && (
            <div className="mt-5 rounded-xl border border-border-subtle bg-surface-1 p-4 shadow-[0_12px_35px_rgba(0,0,0,0.06)] sm:ml-5">
              <label className="block">
                <span className="mb-2 flex items-center gap-2 font-mono text-xs text-text-hi">
                  <MessageCircle size={14} className="text-brand" aria-hidden="true" />
                  参与讨论
                </span>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={20_000}
                  rows={4}
                  placeholder="补充复现方式、资料来源或你的建议。"
                  className="w-full resize-y rounded-lg border border-border bg-surface-0 px-3 py-3 text-xs leading-relaxed text-text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/10"
                />
              </label>
              <button
                type="button"
                disabled={busy || !comment.trim()}
                onClick={() => void submitComment()}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-4 font-mono text-xs font-bold text-[#0A0A0A] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
              >
                <MessageCircle size={14} aria-hidden="true" />
                {busy ? '发布中…' : '发布回复'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div key="issue-list" className="repository-view-enter">
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-1 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1 rounded-lg bg-surface-0/80 p-1" aria-label="筛选 Issue">
              {([
                ['OPEN', '开放', issueCounts.open],
                ['CLOSED', '已关闭', issueCounts.closed],
                ['ALL', '全部', issues.length],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`min-h-8 rounded-md px-3 font-mono text-[10px] transition-all ${
                    filter === value
                      ? 'bg-surface-2 text-text-hi shadow-sm ring-1 ring-border'
                      : 'text-text-mid hover:text-text-hi'
                  }`}
                >
                  {label} <span className="text-text-lo">{count}</span>
                </button>
              ))}
            </div>
            <label className="relative block min-w-0 sm:w-64">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-lo" aria-hidden="true" />
              <span className="sr-only">搜索 Issue</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索标题、内容或作者"
                className="min-h-10 w-full rounded-lg border border-border bg-surface-0 pl-9 pr-3 font-mono text-[10px] text-text-body outline-none transition-colors placeholder:text-text-lo focus:border-brand focus:ring-2 focus:ring-brand/10"
              />
            </label>
          </div>

          <div className="space-y-3" aria-live="polite">
          {visibleIssues.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-full border border-border bg-surface-1 text-text-lo">
                <Search size={17} aria-hidden="true" />
              </div>
              <p className="mt-3 font-mono text-xs text-text-mid">
                {issues.length === 0 ? '暂无 Issue' : '没有符合条件的 Issue'}
              </p>
              <p className="mt-2 text-[10px] text-text-lo">
                {issues.length === 0 ? '发现问题或有改进想法时，可以先在这里讨论。' : '试试更换筛选条件或搜索词。'}
              </p>
            </div>
          )}
          {visibleIssues.map((issue) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => void loadIssue(issue.number)}
              className="repository-issue-card group relative block w-full overflow-hidden rounded-xl border border-border-subtle bg-surface-1 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 sm:p-5"
            >
              <div className="flex gap-3 sm:gap-4">
                <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border ${
                  issue.status === 'OPEN'
                    ? 'border-success/30 bg-success/5 text-success'
                    : 'border-border bg-surface-0 text-text-lo'
                }`}>
                  {issue.status === 'OPEN'
                    ? <CircleDot size={17} aria-hidden="true" />
                    : <CheckCircle2 size={17} aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] ${
                      ISSUE_KINDS[issue.kind]?.className || ISSUE_KINDS.OTHER.className
                    }`}>
                      <IssueKindIcon kind={issue.kind} size={10} />
                      {ISSUE_KINDS[issue.kind]?.label || ISSUE_KINDS.OTHER.label}
                    </span>
                    <span className="font-mono text-[10px] text-text-lo">#{issue.number}</span>
                  </div>
                  <h3 className="mt-2 break-words font-mono text-sm font-semibold leading-relaxed text-text-hi transition-colors group-hover:text-brand">{issue.title}</h3>
                  {issue.body && (
                    <p className="repository-issue-excerpt mt-1 text-[11px] leading-relaxed text-text-mid">{issue.body}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] text-text-lo">
                    <span>{issue.author?.nickname || issue.author?.username || '用户'}</span>
                    <span>{formatDate(issue.updatedAt)}</span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle size={11} aria-hidden="true" />
                      {issue._count?.comments || 0}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="mt-2 shrink-0 text-text-lo transition-transform group-hover:translate-x-1 group-hover:text-brand" aria-hidden="true" />
              </div>
            </button>
          ))}
          </div>
        </div>
      )}

      {composerAnimation.mounted && (
        <div className="app-modal-viewport modern-modal-viewport fixed inset-0 z-[10050] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="new-issue-title">
          <button
            type="button"
            aria-label="关闭提出 Issue 窗口"
            disabled={busy}
            onClick={() => setComposerOpen(false)}
            className={`absolute inset-0 bg-black/65 backdrop-blur-sm ${composerAnimation.isLeaving ? 'modal-overlay-out' : 'modal-overlay'}`}
          />
          <div className={`app-modal-panel modern-modal-panel repository-issue-composer relative flex max-h-[min(44rem,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden border border-border ${composerAnimation.isLeaving ? 'modal-content-out' : 'modal-content'}`}>
            <div className="modern-modal-header flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4 sm:px-6">
              <div>
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-warning">
                  <CircleDot size={12} aria-hidden="true" />
                  New Issue
                </p>
                <h2 id="new-issue-title" className="mt-1 font-mono text-lg text-text-hi">提出问题或建议</h2>
                <p className="mt-2 max-w-xl text-[10px] leading-relaxed text-text-mid">
                  这里只发起讨论，不会拉取分支。确定要直接修改内容时，再使用“开始改动”。
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭"
                disabled={busy}
                onClick={() => setComposerOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-text-mid transition-colors hover:border-brand hover:bg-brand/5 hover:text-brand disabled:opacity-40"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="modern-modal-body min-h-0 flex-1 space-y-5 overflow-y-auto bg-surface-1 p-5 sm:p-6">
              <fieldset>
                <legend className="mb-2 font-mono text-[10px] text-text-mid">选择类型</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Object.entries(ISSUE_KINDS).map(([value, metadata]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={kind === value}
                      onClick={() => setKind(value)}
                      className={`flex min-h-20 flex-col items-start justify-between rounded-xl border p-3 text-left transition-all ${
                        kind === value
                          ? 'border-warning bg-warning/10 shadow-[0_8px_24px_rgba(0,0,0,0.08)]'
                          : 'border-border bg-surface-0 hover:border-warning/50 hover:bg-warning/5'
                      }`}
                    >
                      <IssueKindIcon kind={value} size={16} />
                      <span className={`font-mono text-[10px] ${kind === value ? 'text-warning' : 'text-text-mid'}`}>
                        {metadata.label}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[10px] text-text-mid">标题</span>
                <input
                  autoFocus
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={160}
                  placeholder="用一句话说明问题"
                  className="min-h-11 w-full rounded-lg border border-border bg-surface-0 px-3 font-mono text-sm text-text-hi outline-none transition-colors focus:border-warning focus:ring-2 focus:ring-warning/10"
                />
                <span className="mt-1 block text-right font-mono text-[9px] text-text-lo">{title.length}/160</span>
              </label>
              <label className="block">
                <span className="mb-1.5 block font-mono text-[10px] text-text-mid">详细说明（可选）</span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={20_000}
                  rows={7}
                  placeholder="说明出现在哪里、预期是什么，或补充资料来源。"
                  className="w-full resize-y rounded-lg border border-border bg-surface-0 px-3 py-3 text-xs leading-relaxed text-text-body outline-none transition-colors focus:border-warning focus:ring-2 focus:ring-warning/10"
                />
              </label>
            </div>
            <div className="modern-modal-footer flex flex-col-reverse gap-2 border-t border-border-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="hidden max-w-xs text-[9px] leading-relaxed text-text-lo sm:block">
                提交后可以继续补充回复；维护者可在问题解决后关闭 Issue。
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                disabled={busy}
                onClick={() => setComposerOpen(false)}
                className="min-h-10 rounded-lg border border-border px-4 font-mono text-xs text-text-body transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy || title.trim().length < 2}
                onClick={() => void createIssue()}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-warning px-4 font-mono text-xs font-bold text-[#0A0A0A] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
              >
                <Plus size={14} aria-hidden="true" />
                {busy ? '提交中…' : '提交 Issue'}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
