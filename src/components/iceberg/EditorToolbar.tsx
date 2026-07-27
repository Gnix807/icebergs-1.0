interface EditorToolbarProps {
  title: string;
  status: string;
  icebergId: string;
  isNew: boolean;
  isSaving: boolean;
  isDirty: boolean;
  lastSaved: Date | null;
  historyCount: number;
  canRestore: boolean;
  isRestoring: boolean;
  showBackConfirm: boolean;
  onBack: () => void;
  onConfirmLeave: () => void;
  onContinueEditing: () => void;
  onRestore: () => void;
  onShowHistory: () => void;
}

function getStatusMeta(status: string) {
  if (status === 'PUBLISHED') return { label: '已发布', className: 'border-success/40 bg-success/10 text-success' };
  if (status === 'PENDING_REVIEW') return { label: '待审核', className: 'border-warning/40 bg-warning/10 text-warning' };
  if (status === 'REJECTED') return { label: '已驳回', className: 'border-danger/40 bg-danger/10 text-danger' };
  if (status === 'ARCHIVED') return { label: '已归档', className: 'border-border bg-surface-1 text-text-mid' };
  return { label: '草稿', className: 'border-border bg-surface-1 text-text-body' };
}

function getSaveLabel(isSaving: boolean, isDirty: boolean, lastSaved: Date | null) {
  if (isSaving) return { text: '保存中…', className: 'text-info' };
  if (isDirty) return { text: '有未保存修改', className: 'text-warning' };
  if (!lastSaved) return { text: '已保存', className: 'text-success' };
  const seconds = Math.round((Date.now() - lastSaved.getTime()) / 1000);
  const time = seconds < 60
    ? `${seconds}秒前`
    : seconds < 3600
      ? `${Math.round(seconds / 60)}分钟前`
      : lastSaved.toLocaleTimeString();
  return { text: `已保存 ${time}`, className: 'text-success' };
}

export function EditorToolbar({
  title,
  status,
  icebergId,
  isNew,
  isSaving,
  isDirty,
  lastSaved,
  historyCount,
  canRestore,
  isRestoring,
  showBackConfirm,
  onBack,
  onConfirmLeave,
  onContinueEditing,
  onRestore,
  onShowHistory,
}: EditorToolbarProps) {
  const statusMeta = getStatusMeta(status);
  const saveMeta = getSaveLabel(isSaving, isDirty, lastSaved);

  return (
    <div className="editor-workspace-toolbar sticky top-0 z-30 border-b border-border-subtle bg-surface-1/90 shadow-[0_12px_32px_rgba(0,0,0,0.08)] backdrop-blur lg:rounded-xl lg:border">
      <div className="flex min-h-16 items-center gap-2.5 px-3 py-2.5 lg:px-4">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={onBack}
            className={`inline-flex min-h-11 items-center rounded-lg border bg-surface-0/70 px-3 font-mono text-xs transition-[border-color,color,background-color,box-shadow] ${
              showBackConfirm
                ? 'border-warning bg-warning/5 text-warning'
                : 'border-border text-text-body hover:border-brand/70 hover:bg-brand/5 hover:text-brand'
            }`}
          >
            ‹ 返回
          </button>
          {showBackConfirm && (
            <div className="absolute left-0 top-full z-50 mt-2 w-52 rounded-xl border border-warning/30 bg-surface-1 p-3 font-mono text-xs shadow-2xl">
              <p className="mb-2 leading-snug text-warning">有未保存的内容</p>
              <div className="grid gap-2">
                <button type="button" onClick={onConfirmLeave}
                  className="min-h-11 rounded-lg border border-danger/40 px-2 text-danger transition-colors hover:bg-danger/10">
                  确认离开
                </button>
                <button type="button" onClick={onContinueEditing}
                  className="min-h-11 rounded-lg border border-border px-2 text-text-body transition-colors hover:border-brand">
                  继续编辑
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-brand/10 text-[10px] text-brand sm:inline-flex">◆</span>
            <h1 className="truncate font-mono text-sm font-semibold tracking-tight text-text-hi">
              {title || '未命名冰山图'}
            </h1>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] ${statusMeta.className}`}>
              {statusMeta.label}
            </span>
          </div>
          <div className={`mt-1 flex items-center gap-1.5 font-mono text-[10px] ${saveMeta.className}`}>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            {saveMeta.text}
          </div>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <a
            href={isNew ? '/iceberg/import' : `/iceberg/import?target=${encodeURIComponent(icebergId)}`}
            aria-disabled={isDirty || isSaving}
            title={isDirty || isSaving ? '请等待当前修改保存后再离开编辑器' : undefined}
            onClick={(event) => {
              if (isDirty || isSaving) event.preventDefault();
            }}
            className={`inline-flex min-h-9 items-center rounded-lg border border-border bg-surface-0/70 px-3 font-mono text-[10px] transition-colors ${
              isDirty || isSaving
                ? 'cursor-not-allowed text-text-lo opacity-50'
                : 'text-text-body hover:border-brand hover:text-brand'
            }`}
          >
            {isDirty || isSaving ? (isNew ? '保存后导入' : '保存后同步') : isNew ? '导入' : '同步源站'}
          </a>
          <button type="button" onClick={onRestore} disabled={!canRestore}
            className="min-h-9 rounded-lg border border-border bg-surface-0/70 px-3 font-mono text-[10px] text-text-body transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40">
            {isRestoring ? '恢复中…' : '恢复上一版'}
          </button>
          <button type="button" onClick={onShowHistory}
            className="min-h-9 rounded-lg border border-border bg-surface-0/70 px-3 font-mono text-[10px] text-text-body transition-colors hover:border-brand hover:text-brand">
            历史 {historyCount}
          </button>
        </div>

        {!isNew && (
          <a href={`/iceberg/import?target=${encodeURIComponent(icebergId)}`}
            aria-disabled={isDirty || isSaving}
            onClick={(event) => {
              if (isDirty || isSaving) event.preventDefault();
            }}
            className={`inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-0/70 px-2.5 font-mono text-[10px] sm:hidden ${
              isDirty || isSaving
                ? 'cursor-not-allowed text-text-lo opacity-50'
                : 'text-text-body'
            }`}
            aria-label="从 Iceberg Threads 同步更新">
            {isDirty || isSaving ? '待保存' : '同步'}
          </a>
        )}
        <button type="button" onClick={onShowHistory}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-0/70 font-mono text-[10px] text-text-body sm:hidden"
          aria-label={`版本历史，共 ${historyCount} 个版本`}>
          ⧗
        </button>
      </div>
    </div>
  );
}
