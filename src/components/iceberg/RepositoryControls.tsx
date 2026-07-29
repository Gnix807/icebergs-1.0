import { useEffect, useState } from 'react';

export interface RepositoryBranchSummary {
  id: string;
  name: string;
  title: string;
  protected: boolean;
  headCommitId: string;
  isCurrent?: boolean;
}

export interface RepositoryUiState {
  role: 'MAINTAINER' | 'CONTRIBUTOR' | 'VIEWER' | 'NONE';
  defaultBranchId: string;
  currentBranch: RepositoryBranchSummary;
  branches: RepositoryBranchSummary[];
  headCommit: { id: string; shortHash: string; message: string } | null;
  openPull?: { number: number; title: string } | null;
  dirty: boolean;
  workspaceSaving: boolean;
}

export interface RepositoryConflict {
  path: string;
  field: string;
  kind: 'metadata' | 'tier' | 'item';
  entityId?: string;
  ours: unknown;
  theirs: unknown;
}

export interface RepositoryConflictState {
  conflicts: RepositoryConflict[];
  headCommitId: string;
  message: string;
}

interface Props {
  state: RepositoryUiState;
  icebergSlug: string;
  onSelectBranch: (branchId: string) => Promise<void>;
  onCreateBranch: (title: string) => Promise<boolean>;
  onCommit: (message: string) => Promise<boolean>;
  onCreatePull: (title: string, body: string) => Promise<boolean>;
  conflict: RepositoryConflictState | null;
  onResolveConflicts: (resolutions: Array<{
    path: string;
    field: string;
    choice: 'ours' | 'theirs';
  }>) => Promise<boolean>;
  onDismissConflict: () => void;
}

type Dialog = 'branch' | 'commit' | 'pull' | null;

export function RepositoryControls({
  state,
  icebergSlug,
  onSelectBranch,
  onCreateBranch,
  onCommit,
  onCreatePull,
  conflict,
  onResolveConflicts,
  onDismissConflict,
}: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflictChoices, setConflictChoices] = useState<Record<string, 'ours' | 'theirs'>>({});
  const isMain = state.currentBranch.id === state.defaultBranchId;
  useEffect(() => setConflictChoices({}), [conflict]);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const ok = dialog === 'branch'
        ? await onCreateBranch(title.trim())
        : dialog === 'commit'
          ? await onCommit(title.trim())
          : await onCreatePull(title.trim(), body.trim());
      if (ok) {
        setDialog(null);
        setTitle('');
        setBody('');
      }
    } finally {
      setBusy(false);
    }
  };

  const open = (next: Dialog, suggested = '') => {
    setDialog(next);
    setTitle(suggested);
    setBody('');
  };

  return (
    <>
      <div className="editor-repository-bar border-x border-b border-border-subtle bg-surface-1/80 px-3 py-2.5 lg:mx-1 lg:rounded-b-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-lo">
            Repository
          </span>
          <label className="relative min-w-0">
            <span className="sr-only">当前分支</span>
            <select
              value={state.currentBranch.id}
              onChange={(event) => void onSelectBranch(event.target.value)}
              className="min-h-9 max-w-[15rem] rounded-lg border border-border bg-surface-0 px-2.5 font-mono text-[10px] text-text-hi outline-none transition-colors hover:border-brand focus:border-brand"
            >
              {state.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.protected ? '◆ ' : '◇ '}{branch.title} · {branch.name}
                </option>
              ))}
            </select>
          </label>
          {state.headCommit && (
            <span className="rounded-md border border-border bg-surface-0 px-2 py-1 font-mono text-[9px] text-text-mid"
              title={state.headCommit.message}>
              {state.headCommit.shortHash}
            </span>
          )}
          <span className={`inline-flex items-center gap-1 font-mono text-[9px] ${
            state.workspaceSaving ? 'text-info' : state.dirty ? 'text-warning' : 'text-success'
          }`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {state.workspaceSaving ? '工作副本保存中' : state.dirty ? '有未提交改动' : '工作副本已同步'}
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => open('branch')}
              className="min-h-9 rounded-lg border border-border bg-surface-0 px-3 font-mono text-[10px] text-text-body transition-colors hover:border-brand hover:text-brand">
              + 开始改动
            </button>
            <button type="button" disabled={!state.dirty || state.workspaceSaving}
              onClick={() => open('commit')}
              className="min-h-9 rounded-lg border border-brand/40 bg-brand/10 px-3 font-mono text-[10px] font-semibold text-brand transition-colors hover:bg-brand/15 disabled:cursor-not-allowed disabled:opacity-40">
              提交版本
            </button>
            {!isMain && !state.openPull && (
              <button type="button" disabled={state.dirty}
                onClick={() => open('pull', state.currentBranch.title)}
                className="min-h-9 rounded-lg bg-brand px-3 font-mono text-[10px] font-bold text-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-40">
                发起合并请求
              </button>
            )}
            {state.openPull && (
              <a href={`/iceberg/${encodeURIComponent(icebergSlug)}/collaboration?pull=${state.openPull.number}`}
                className="inline-flex min-h-9 items-center rounded-lg border border-purple/40 bg-purple/10 px-3 font-mono text-[10px] text-purple">
                PR #{state.openPull.number}
              </a>
            )}
            <a href={`/iceberg/${encodeURIComponent(icebergSlug)}/collaboration`}
              className="inline-flex min-h-9 items-center rounded-lg border border-border bg-surface-0 px-3 font-mono text-[10px] text-text-body transition-colors hover:border-brand hover:text-brand">
              协作中心
            </a>
          </div>
        </div>
      </div>

      {dialog && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-1 p-5 shadow-2xl">
            <div className="mb-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
                {dialog === 'branch' ? 'New Branch' : dialog === 'commit' ? 'New Commit' : 'Pull Request'}
              </div>
              <h2 className="mt-1 font-mono text-lg text-text-hi">
                {dialog === 'branch' ? '开始一项独立改动' : dialog === 'commit' ? '提交当前版本' : '发起合并请求'}
              </h2>
            </div>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] text-text-mid">
                {dialog === 'commit' ? '提交说明' : '改动标题'}
              </span>
              <input
                autoFocus
                value={title}
                maxLength={dialog === 'commit' ? 240 : 160}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) void submit();
                }}
                className="min-h-11 w-full rounded-lg border border-border bg-surface-0 px-3 font-mono text-sm text-text-hi outline-none focus:border-brand"
                placeholder={dialog === 'commit' ? '例如：补充第二层词条来源' : '例如：补充民俗传说词条'}
              />
            </label>
            {dialog === 'pull' && (
              <label className="mt-3 block">
                <span className="mb-1.5 block font-mono text-[10px] text-text-mid">说明（可选）</span>
                <textarea value={body} maxLength={20_000} rows={5}
                  onChange={(event) => setBody(event.target.value)}
                  className="w-full resize-y rounded-lg border border-border bg-surface-0 px-3 py-2 font-mono text-xs text-text-body outline-none focus:border-brand"
                  placeholder="说明这次改动的目的、范围和需要重点审阅的地方。" />
              </label>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setDialog(null)}
                className="min-h-10 rounded-lg border border-border px-4 font-mono text-xs text-text-body hover:border-brand">
                取消
              </button>
              <button type="button" disabled={busy || title.trim().length < 2} onClick={() => void submit()}
                className="min-h-10 rounded-lg bg-brand px-4 font-mono text-xs font-bold text-[#0A0A0A] disabled:opacity-40">
                {busy ? '处理中…' : dialog === 'branch' ? '创建分支' : dialog === 'commit' ? '提交版本' : '创建 PR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {conflict && (
        <div className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
          role="dialog" aria-modal="true" aria-labelledby="repository-conflict-title">
          <div className="flex max-h-[min(48rem,calc(100dvh-1.5rem))] w-full max-w-3xl flex-col rounded-2xl border border-warning/40 bg-surface-1 shadow-2xl">
            <div className="border-b border-border-subtle p-4 sm:p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-warning">Merge Conflict</p>
              <h2 id="repository-conflict-title" className="mt-1 font-mono text-lg text-text-hi">选择每处冲突要保留的内容</h2>
              <p className="mt-2 text-xs leading-relaxed text-text-mid">
                分支在你编辑期间有了新提交。未冲突的改动已经自动合并；以下内容需要明确选择。
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              {conflict.conflicts.map((item, index) => {
                const key = `${item.path}:${item.field}`;
                const choice = conflictChoices[key];
                return (
                  <article key={`${key}:${index}`} className="rounded-xl border border-border-subtle bg-surface-0 p-3">
                    <code className="block break-all text-[10px] text-warning">{item.path}.{item.field}</code>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {([
                        ['ours', '当前分支', item.ours],
                        ['theirs', '我的改动', item.theirs],
                      ] as const).map(([value, label, content]) => (
                        <button key={value} type="button"
                          onClick={() => setConflictChoices((previous) => ({ ...previous, [key]: value }))}
                          className={`min-w-0 rounded-lg border p-3 text-left transition-colors ${
                            choice === value ? 'border-brand bg-brand/10' : 'border-border hover:border-brand/50'
                          }`}>
                          <span className={`font-mono text-[10px] ${choice === value ? 'text-brand' : 'text-text-mid'}`}>
                            {label}
                          </span>
                          <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-[10px] text-text-body">
                            {content == null ? '（删除）' : JSON.stringify(content, null, 2)}
                          </pre>
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-border-subtle p-4 sm:flex-row sm:justify-end">
              <button type="button" disabled={busy} onClick={onDismissConflict}
                className="min-h-11 rounded-lg border border-border px-4 font-mono text-xs text-text-body hover:border-brand">
                稍后处理
              </button>
              <button type="button"
                disabled={busy || Object.keys(conflictChoices).length !== conflict.conflicts.length}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onResolveConflicts(conflict.conflicts.map((item) => ({
                      path: item.path,
                      field: item.field,
                      choice: conflictChoices[`${item.path}:${item.field}`],
                    })));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="min-h-11 rounded-lg bg-brand px-5 font-mono text-xs font-bold text-[#0A0A0A] disabled:opacity-40">
                {busy ? '正在提交…' : `解决并提交（${Object.keys(conflictChoices).length}/${conflict.conflicts.length}）`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
