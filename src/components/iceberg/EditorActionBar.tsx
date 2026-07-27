interface EditorActionBarProps {
  onSave: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  isSaving: boolean;
  isSubmitting: boolean;
  submitText: string;
  variant: 'desktop' | 'mobile';
}

export function EditorActionBar({
  onSave,
  onSubmit,
  canSubmit,
  isSaving,
  isSubmitting,
  submitText,
  variant,
}: EditorActionBarProps) {
  const buttons = (
    <div className="grid w-full grid-cols-2 gap-2.5">
      <button type="button" onClick={onSave} disabled={isSaving}
        className="min-h-11 rounded-lg border border-border bg-surface-0/70 px-3 py-2 font-mono text-xs text-text-body transition-[border-color,color,background-color] hover:border-brand hover:bg-brand/5 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50">
        {isSaving ? '[ 保存中... ]' : '[ 保存草稿 ]'}
      </button>
      <button type="button" onClick={onSubmit} disabled={isSubmitting || !canSubmit}
        className="min-h-11 rounded-lg bg-brand px-3 py-2 font-mono text-xs font-bold text-[#0A0A0A] shadow-[0_8px_24px_rgba(0,255,65,0.18)] transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-brand-hover hover:shadow-[0_10px_28px_rgba(0,255,65,0.26)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
        {submitText}
      </button>
    </div>
  );

  if (variant === 'mobile') {
    return (
      <div className="editor-mobile-actions fixed inset-x-0 z-[44] border-t border-border-subtle bg-surface-1/90 px-3 py-2.5 shadow-[0_-8px_30px_rgba(0,0,0,0.18)] backdrop-blur lg:hidden">
        {buttons}
      </div>
    );
  }

  return <div className="border-t border-border-subtle bg-surface-1/80 p-4">{buttons}</div>;
}
