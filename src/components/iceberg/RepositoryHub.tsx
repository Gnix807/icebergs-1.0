import { useEffect, useMemo, useState } from 'react';
import { toast } from '../ui/Toast';
import { RepositoryIssues } from './RepositoryIssues';

interface Props {
  icebergId: string;
}

type Tab = 'issues' | 'pulls' | 'history' | 'branches' | 'collaborators';

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

function changeLabel(change: any) {
  if (change.change === 'added') return '新增';
  if (change.change === 'deleted') return '删除';
  if (change.change === 'moved') return '移动';
  return '修改';
}

function changeClass(change: any) {
  if (change.change === 'added') return 'border-success/35 bg-success/5 text-success';
  if (change.change === 'deleted') return 'border-danger/35 bg-danger/5 text-danger';
  if (change.change === 'moved') return 'border-warning/35 bg-warning/5 text-warning';
  return 'border-info/35 bg-info/5 text-info';
}

export function RepositoryHub({ icebergId }: Props) {
  const [state, setState] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('pulls');
  const [rows, setRows] = useState<any[]>([]);
  const [selectedPull, setSelectedPull] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reviewBody, setReviewBody] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [commentPath, setCommentPath] = useState<string | null>(null);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState('CONTRIBUTOR');
  const [issueLaunchKey, setIssueLaunchKey] = useState(0);

  const api = `/api/icebergs/${encodeURIComponent(icebergId)}/repository`;

  const loadState = async () => {
    setLoading(true);
    try {
      const res = await fetch(api, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || '加载失败');
      setState(data.data);
      const params = new URLSearchParams(location.search);
      const initialIssue = Number(params.get('issue'));
      if (initialIssue > 0 || params.has('newIssue')) {
        setTab('issues');
      } else {
        const initialPull = Number(params.get('pull'));
        if (initialPull > 0) await loadPull(initialPull);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '协作中心加载失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadRows = async (nextTab: Tab) => {
    setTab(nextTab);
    setSelectedPull(null);
    if (nextTab === 'issues') {
      setRows([]);
      return;
    }
    if (nextTab === 'branches') {
      setRows(state?.repository?.branches ?? []);
      return;
    }
    const view = nextTab === 'pulls' ? 'pulls' : nextTab === 'history' ? 'history' : 'collaborators';
    const res = await fetch(`${api}?view=${view}`, { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) setRows(data.data);
    else toast(data?.error?.message || '加载失败', 'error');
  };

  const loadPull = async (number: number) => {
    const res = await fetch(`${api}?view=pull&number=${number}`, { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      setTab('pulls');
      setSelectedPull(data.data);
      history.replaceState(null, '', `${location.pathname}?pull=${number}`);
    } else toast(data?.error?.message || '合并请求加载失败', 'error');
  };

  useEffect(() => { void loadState(); }, [icebergId]);
  useEffect(() => {
    if (state?.repository && !selectedPull && tab !== 'issues') void loadRows(tab);
  }, [state?.repository?.icebergId]);

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        const details = data?.error?.details;
        if (data?.error?.code === 'MERGE_CONFLICT' && Array.isArray(details?.conflicts)) {
          toast(`发现 ${details.conflicts.length} 处冲突，请在分支编辑器中处理后重新提交`, 'error');
        } else {
          toast(data?.error?.message || '操作失败', 'error');
        }
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

  const submitReview = async (reviewState: string) => {
    if (!selectedPull) return;
    const result = await post({
      action: 'review',
      number: selectedPull.number,
      state: reviewState,
      body: reviewBody,
    });
    if (result) {
      setReviewBody('');
      await loadPull(selectedPull.number);
      toast(result.alreadyReviewed
        ? (reviewState === 'APPROVED' ? '当前版本已经批准，无需重复操作' : '当前版本已经要求修改')
        : (reviewState === 'APPROVED' ? '已批准合并请求' : '审阅意见已提交'));
    }
  };

  const submitComment = async () => {
    if (!selectedPull || !commentBody.trim()) return;
    const change = selectedPull.changes.find((item: any) => item.path === commentPath);
    const result = await post({
      action: 'comment',
      number: selectedPull.number,
      body: commentBody,
      path: change?.path,
      entityId: change?.entityId,
      field: change?.field,
    });
    if (result) {
      setCommentBody('');
      setCommentPath(null);
      await loadPull(selectedPull.number);
      toast('评论已发布');
    }
  };

  const mergePull = async () => {
    if (!selectedPull || !confirm(`确认合并 #${selectedPull.number}？合并后会更新主草稿，但不会直接发布。`)) return;
    const result = await post({ action: 'merge', number: selectedPull.number });
    if (result) {
      await loadPull(selectedPull.number);
      await loadState();
      toast('合并请求已合并到主版本');
    }
  };

  const activeReviews = useMemo(() => {
    if (!selectedPull) return [];
    const latestDecisions = new Set<string>();
    return [...selectedPull.reviews].reverse().filter((review: any) => {
      if (review.headCommitId !== selectedPull.headCommitId || review.dismissedAt) return false;
      if (review.state !== 'APPROVED' && review.state !== 'CHANGES_REQUESTED') return true;
      if (latestDecisions.has(review.reviewerId)) return false;
      latestDecisions.add(review.reviewerId);
      return true;
    }).reverse();
  }, [selectedPull]);
  const currentReviewState = selectedPull?.currentUserReview?.state;

  if (loading) {
    return <div className="py-24 text-center font-mono text-xs text-text-mid">正在载入版本库…</div>;
  }
  if (!state) {
    return <div className="py-24 text-center font-mono text-xs text-danger">协作中心暂不可用</div>;
  }
  if (state.invitation) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-brand/30 bg-brand/5 p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">Collaboration Invite</p>
        <h1 className="mt-2 font-mono text-xl text-text-hi">邀请你参与《{state.iceberg.title}》</h1>
        <p className="mt-2 text-xs text-text-body">
          角色：{state.invitation.role === 'MAINTAINER' ? '维护者' : '贡献者'}
        </p>
        <div className="mt-5 flex gap-2">
          <button disabled={busy} onClick={async () => {
            if (await post({ action: 'respond-invite', accept: true })) {
              toast('已加入协作');
              await loadState();
            }
          }} className="min-h-11 rounded-lg bg-brand px-5 font-mono text-xs font-bold text-[#0A0A0A]">
            接受邀请
          </button>
          <button disabled={busy} onClick={async () => {
            if (await post({ action: 'respond-invite', accept: false })) location.href = `/iceberg/${state.iceberg.slug}`;
          }} className="min-h-11 rounded-lg border border-border px-5 font-mono text-xs text-text-body">
            拒绝
          </button>
        </div>
      </div>
    );
  }
  if (!state.enabled) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/5 p-5 font-mono text-xs text-warning">
        GitHub 式版本控制尚未在当前环境启用。生产环境需开启 `feature_git_collaboration`。
      </div>
    );
  }

  const repo = state.repository;
  const canMaintain = state.role === 'MAINTAINER';
  const canEdit = state.role === 'MAINTAINER'
    || state.role === 'CONTRIBUTOR'
    || state.role === 'PROPOSER';
  const tabs: [Tab, string][] = state.role === 'VIEWER'
    ? [['issues', '问题与建议'], ['pulls', '已合并请求'], ['history', '公开提交']]
    : state.role === 'PROPOSER'
      ? [['issues', '问题与建议'], ['pulls', '我的提案'], ['history', '公开提交'], ['branches', '我的分支']]
    : [
      ['issues', '问题与建议'],
      ['pulls', '合并请求'],
      ['history', '提交历史'],
      ['branches', '分支'],
      ['collaborators', '协作者'],
    ];

  return (
    <div className="repository-hub">
      <header className="mb-6 rounded-2xl border border-border-subtle bg-surface-1 p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-brand">Repository</p>
            <h1 className="mt-1 font-mono text-xl text-text-hi">{state.iceberg.title}</h1>
            <p className="mt-2 text-xs text-text-mid">
              主版本 <span className="font-mono text-text-body">{state.mainShortHash}</span>
              {' · '}{state.role === 'MAINTAINER'
                ? '维护者'
                : state.role === 'CONTRIBUTOR'
                  ? '贡献者'
                  : state.role === 'PROPOSER'
                    ? '提案者'
                    : '访客'}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {tab !== 'issues' && state.canCreateIssue ? (
              <button type="button" onClick={() => {
                setSelectedPull(null);
                setTab('issues');
                history.replaceState(null, '', `${location.pathname}?newIssue=1`);
                setIssueLaunchKey((value) => value + 1);
              }} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-warning/50 bg-warning/5 px-4 font-mono text-xs text-warning transition-colors hover:bg-warning/10">
                提出 Issue
              </button>
            ) : tab !== 'issues' && !state.isAuthenticated ? (
              <a href="/login"
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 font-mono text-xs text-text-mid hover:border-brand hover:text-brand">
                登录后提出 Issue
              </a>
            ) : null}
            {canEdit && (
              <a href={`/iceberg/edit/${encodeURIComponent(state.iceberg.id)}`}
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-brand px-4 font-mono text-xs font-bold text-[#0A0A0A]">
                {state.role === 'MAINTAINER' ? '编辑主版本' : '开始改动'}
              </a>
            )}
          </div>
        </div>
      </header>

      <nav className="repository-tab-nav mb-5 flex gap-1 overflow-x-auto rounded-xl border border-border-subtle bg-surface-1 p-1.5 shadow-sm" aria-label="版本协作页面">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => {
            history.replaceState(null, '', location.pathname);
            void loadRows(key);
          }}
            aria-current={tab === key ? 'page' : undefined}
            className={`repository-tab-button min-h-10 shrink-0 rounded-lg px-4 font-mono text-xs ${
              tab === key ? 'is-active bg-brand/10 text-brand shadow-sm' : 'text-text-mid hover:bg-surface-2 hover:text-text-hi'
            }`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'issues' ? (
        <RepositoryIssues
          api={api}
          icebergSlug={state.iceberg.slug}
          canCreateIssue={!!state.canCreateIssue}
          isAuthenticated={!!state.isAuthenticated}
          launchKey={issueLaunchKey}
        />
      ) : tab === 'pulls' && selectedPull ? (
        <section>
          <button onClick={() => { setSelectedPull(null); history.replaceState(null, '', location.pathname); void loadRows('pulls'); }}
            className="mb-4 font-mono text-xs text-text-mid hover:text-brand">‹ 返回合并请求</button>
          <div className="rounded-2xl border border-border-subtle bg-surface-1 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] ${
                selectedPull.status === 'MERGED' ? 'border-purple/40 text-purple' : 'border-success/40 text-success'
              }`}>{selectedPull.status}</span>
              <span className="font-mono text-xs text-text-mid">#{selectedPull.number}</span>
            </div>
            <h2 className="mt-2 font-mono text-lg text-text-hi">{selectedPull.title}</h2>
            {selectedPull.body && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-text-body">{selectedPull.body}</p>}
            <p className="mt-3 font-mono text-[10px] text-text-lo">
              {selectedPull.author?.nickname || selectedPull.author?.username} · {formatDate(selectedPull.createdAt)}
            </p>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-3">
              <h3 className="font-mono text-xs text-text-hi">结构化差异 · {selectedPull.changes.length} 项</h3>
              {selectedPull.changes.length === 0 && (
                <div className="rounded-xl border border-border-subtle p-5 text-xs text-text-mid">没有内容差异。</div>
              )}
              {selectedPull.changes.map((change: any) => (
                <article key={`${change.path}-${change.change}`}
                  className="rounded-xl border border-border-subtle bg-surface-1 p-4">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] ${changeClass(change)}`}>
                      {changeLabel(change)}
                    </span>
                    <code className="min-w-0 truncate text-[10px] text-text-mid">{change.path}</code>
                    {selectedPull.status === 'OPEN' && (
                      <button onClick={() => setCommentPath(change.path)}
                        className="ml-auto font-mono text-[9px] text-text-lo hover:text-brand">评论</button>
                    )}
                  </div>
                  {(change.before !== undefined || change.after !== undefined) && (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <pre className="max-h-44 overflow-auto rounded-lg border border-danger/20 bg-danger/5 p-2 text-[10px] text-text-body whitespace-pre-wrap">
                        {JSON.stringify(change.before, null, 2)}
                      </pre>
                      <pre className="max-h-44 overflow-auto rounded-lg border border-success/20 bg-success/5 p-2 text-[10px] text-text-body whitespace-pre-wrap">
                        {JSON.stringify(change.after, null, 2)}
                      </pre>
                    </div>
                  )}
                </article>
              ))}
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
                <h3 className="font-mono text-xs text-text-hi">审阅状态</h3>
                <div className="mt-3 space-y-2">
                  {activeReviews.length === 0 && <p className="text-[10px] text-text-lo">暂无当前版本审阅</p>}
                  {activeReviews.map((review: any) => (
                    <div key={review.id} className="rounded-lg border border-border p-2">
                      <p className={`font-mono text-[10px] ${
                        review.state === 'APPROVED' ? 'text-success' : review.state === 'CHANGES_REQUESTED' ? 'text-danger' : 'text-text-mid'
                      }`}>{review.state} · {review.reviewer?.nickname || review.reviewer?.username}</p>
                      {review.body && <p className="mt-1 text-[10px] text-text-body">{review.body}</p>}
                      {canMaintain && review.state === 'CHANGES_REQUESTED' && !review.dismissedAt && (
                        <button onClick={async () => {
                          const reason = prompt('填写解除“要求修改”的理由（会保留在审阅记录中）');
                          if (!reason?.trim()) return;
                          if (await post({
                            action: 'review',
                            number: selectedPull.number,
                            state: 'DISMISSED',
                            reviewId: review.id,
                            body: reason,
                          })) await loadPull(selectedPull.number);
                        }} className="mt-1 font-mono text-[9px] text-warning hover:text-brand">
                          填写理由并解除
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {canMaintain && selectedPull.status === 'OPEN' && (
                  <>
                    <textarea value={reviewBody} onChange={(event) => setReviewBody(event.target.value)}
                      rows={3} placeholder="审阅意见（可选）"
                      className="mt-3 w-full rounded-lg border border-border bg-surface-0 p-2 text-xs text-text-body outline-none focus:border-brand" />
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button disabled={busy || currentReviewState === 'APPROVED'} onClick={() => void submitReview('APPROVED')}
                        className="min-h-10 rounded-lg border border-success/40 text-[10px] text-success disabled:cursor-not-allowed disabled:opacity-50">
                        {currentReviewState === 'APPROVED' ? '已批准' : '批准'}
                      </button>
                      <button disabled={busy || currentReviewState === 'CHANGES_REQUESTED'} onClick={() => void submitReview('CHANGES_REQUESTED')}
                        className="min-h-10 rounded-lg border border-danger/40 text-[10px] text-danger disabled:cursor-not-allowed disabled:opacity-50">
                        {currentReviewState === 'CHANGES_REQUESTED' ? '已要求修改' : '要求修改'}
                      </button>
                    </div>
                    <button disabled={busy} onClick={() => void mergePull()}
                      className="mt-2 min-h-11 w-full rounded-lg bg-brand font-mono text-xs font-bold text-[#0A0A0A]">
                      合并到主版本
                    </button>
                  </>
                )}
              </div>

              <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
                <h3 className="font-mono text-xs text-text-hi">讨论</h3>
                <div className="mt-3 space-y-2">
                  {selectedPull.comments.map((comment: any) => (
                    <div key={comment.id} className={`rounded-lg border p-2 ${comment.resolvedAt ? 'border-border opacity-60' : 'border-border-subtle'}`}>
                      <p className="font-mono text-[9px] text-text-lo">
                        {comment.author?.nickname || comment.author?.username}
                        {comment.path ? ` · ${comment.path}` : ''}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[10px] text-text-body">{comment.body}</p>
                      {!comment.resolvedAt && selectedPull.status === 'OPEN' && (
                        <button onClick={async () => {
                          if (await post({ action: 'resolve-comment', commentId: comment.id })) await loadPull(selectedPull.number);
                        }} className="mt-1 font-mono text-[9px] text-brand">标记已解决</button>
                      )}
                    </div>
                  ))}
                </div>
                {selectedPull.status === 'OPEN' && (
                  <>
                    {commentPath && <p className="mt-3 text-[9px] text-brand">评论位置：{commentPath}</p>}
                    <textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)}
                      rows={3} placeholder="留下总体或逐项评论"
                      className="mt-2 w-full rounded-lg border border-border bg-surface-0 p-2 text-xs text-text-body outline-none focus:border-brand" />
                    <button disabled={busy || !commentBody.trim()} onClick={() => void submitComment()}
                      className="mt-2 min-h-10 w-full rounded-lg border border-brand/40 text-xs text-brand disabled:opacity-40">
                      发布评论
                    </button>
                  </>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : tab === 'pulls' ? (
        <div className="space-y-3">
          {rows.length === 0 && <div className="rounded-xl border border-dashed border-border p-10 text-center text-xs text-text-mid">暂无合并请求</div>}
          {rows.map((pull) => (
            <button key={pull.id} onClick={() => void loadPull(pull.number)}
              className="block w-full rounded-xl border border-border-subtle bg-surface-1 p-4 text-left transition-colors hover:border-brand/50">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-brand">#{pull.number}</span>
                <span className="font-mono text-[9px] text-text-lo">{pull.status}</span>
              </div>
              <h3 className="mt-1 font-mono text-sm text-text-hi">{pull.title}</h3>
              <p className="mt-1 text-[10px] text-text-mid">{pull.author?.nickname || pull.author?.username} · {formatDate(pull.updatedAt)}</p>
            </button>
          ))}
        </div>
      ) : tab === 'history' ? (
        <div className="space-y-2">
          {rows.map((commit) => (
            <div key={commit.id} className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-1 p-4 sm:flex-row sm:items-center">
              <code className="rounded-md border border-border bg-surface-0 px-2 py-1 text-[10px] text-brand">{commit.shortHash}</code>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-text-hi">{commit.message}</p>
                <p className="mt-1 text-[9px] text-text-lo">{commit.author?.nickname || commit.author?.username} · {formatDate(commit.createdAt)}</p>
              </div>
              {canMaintain && commit.id !== repo.headCommit?.id && (
                <button disabled={busy} onClick={async () => {
                  if (!confirm(`以新提交恢复到 ${commit.shortHash}？历史不会被删除。`)) return;
                  const result = await post({
                    action: 'revert',
                    branchId: repo.defaultBranchId,
                    commitId: commit.id,
                    expectedHeadCommitId: repo.mainHeadCommitId,
                    message: `恢复到 ${commit.shortHash}：${commit.message}`,
                  });
                  if (result) { toast('已创建恢复提交'); await loadState(); await loadRows('history'); }
                }} className="min-h-9 rounded-lg border border-border px-3 font-mono text-[10px] text-text-body hover:border-brand">
                  恢复
                </button>
              )}
            </div>
          ))}
        </div>
      ) : tab === 'branches' ? (
        <div className="grid gap-3 md:grid-cols-2">
          {(state.repository.branches ?? []).map((branch: any) => (
            <div key={branch.id} className="rounded-xl border border-border-subtle bg-surface-1 p-4">
              <p className="font-mono text-xs text-text-hi">{branch.protected ? '◆' : '◇'} {branch.title}</p>
              <p className="mt-1 truncate font-mono text-[10px] text-text-lo">{branch.name}</p>
              <code className="mt-3 inline-block text-[9px] text-brand">{String(branch.headCommitId).slice(0, 10)}</code>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {canMaintain && (
            <div className="mb-5 rounded-xl border border-border-subtle bg-surface-1 p-4">
              <h3 className="font-mono text-xs text-text-hi">邀请仓库协作者</h3>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input value={inviteUsername} onChange={(event) => setInviteUsername(event.target.value)}
                  placeholder="用户名"
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface-0 px-3 font-mono text-xs text-text-hi outline-none focus:border-brand" />
                <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}
                  className="min-h-11 rounded-lg border border-border bg-surface-0 px-3 font-mono text-xs text-text-body">
                  <option value="CONTRIBUTOR">贡献者</option>
                  <option value="MAINTAINER">维护者</option>
                </select>
                <button disabled={busy || !inviteUsername.trim()} onClick={async () => {
                  const result = await post({ action: 'invite', username: inviteUsername, role: inviteRole });
                  if (result) { setInviteUsername(''); toast('邀请已发送'); await loadRows('collaborators'); }
                }} className="min-h-11 rounded-lg bg-brand px-5 font-mono text-xs font-bold text-[#0A0A0A] disabled:opacity-40">
                  发送邀请
                </button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {rows.map((collaborator) => (
              <div key={collaborator.id} className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-1 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-text-hi">
                    @{collaborator.user?.username || collaborator.userId}
                  </p>
                  <p className="mt-1 text-[9px] text-text-lo">{collaborator.status}</p>
                </div>
                <span className="font-mono text-[10px] text-brand">{collaborator.role}</span>
                {canMaintain && (
                  <button disabled={busy} onClick={async () => {
                    if (!confirm('确认移除该协作者？其历史提交仍会保留。')) return;
                    if (await post({ action: 'update-collaborator', collaboratorId: collaborator.id, remove: true })) {
                      await loadRows('collaborators');
                    }
                  }} className="font-mono text-[10px] text-danger">移除</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
