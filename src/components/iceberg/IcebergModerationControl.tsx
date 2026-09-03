import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { toast } from '../ui/Toast';

interface Props {
  icebergId: string;
  icebergTitle: string;
  status: string;
}

type ModerationAction = 'ARCHIVE' | 'RESTORE';

export function IcebergModerationControl({ icebergId, icebergTitle, status }: Props) {
  const action: ModerationAction | null = status === 'PUBLISHED'
    ? 'ARCHIVE'
    : status === 'ARCHIVED'
      ? 'RESTORE'
      : null;
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const { mounted: modalMounted, isLeaving } = useModalAnimation(open);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) setOpen(false);
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
      triggerRef.current?.focus();
    };
  }, [open]);

  if (!action) return null;

  const isArchive = action === 'ARCHIVE';
  const close = () => {
    if (busy) return;
    setOpen(false);
    setReason('');
  };

  const submit = async () => {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 5 || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/icebergs/${encodeURIComponent(icebergId)}/moderation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: normalizedReason }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        toast(data?.error?.message || '管理操作失败，请稍后重试', 'error');
        return;
      }
      toast(isArchive
        ? (data.data?.changed ? '冰山图已下架' : '冰山图已经处于下架状态')
        : (data.data?.changed ? '冰山图已恢复公开' : '冰山图已经公开'));
      setOpen(false);
      window.setTimeout(() => window.location.reload(), 350);
    } catch {
      toast('网络错误，请稍后重试', 'error');
    } finally {
      setBusy(false);
    }
  };

  const dialog = mounted && modalMounted ? createPortal(
    <div
      className={`${isLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 z-[10060] flex items-center justify-center bg-black/70 p-4`}
      role="presentation"
    >
      <div
        className="absolute inset-0"
        aria-hidden="true"
        onClick={close}
      />
      <section
        ref={dialogRef}
        className={`${isLeaving ? 'modal-content-out' : 'modal-content'} relative z-10 w-full max-w-lg border border-border bg-surface-1 shadow-2xl`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="iceberg-moderation-title"
        aria-describedby="iceberg-moderation-description"
      >
        <header className={`border-b px-5 py-4 ${isArchive ? 'border-danger/30' : 'border-brand/30'}`}>
          <p className={`font-mono text-[10px] uppercase tracking-[0.18em] ${isArchive ? 'text-danger' : 'text-brand'}`}>
            {isArchive ? 'Content moderation' : 'Restore publication'}
          </p>
          <h2 id="iceberg-moderation-title" className="mt-1 font-mono text-lg text-text-hi">
            {isArchive ? '下架这张冰山图？' : '恢复公开这张冰山图？'}
          </h2>
          <p id="iceberg-moderation-description" className="mt-2 break-words text-xs leading-relaxed text-text-mid">
            《{icebergTitle}》{isArchive
              ? '将不再对普通访客展示，内容、版本和讨论记录都会保留。'
              : '将重新使用最后一次审核通过的发布快照对外展示。'}
          </p>
        </header>

        <div className="p-5">
          <label htmlFor="iceberg-moderation-reason" className="block font-mono text-xs text-text-body">
            处理理由 <span className="text-danger">*</span>
          </label>
          <textarea
            id="iceberg-moderation-reason"
            autoFocus
            value={reason}
            minLength={5}
            maxLength={500}
            rows={5}
            onChange={(event) => setReason(event.target.value)}
            placeholder={isArchive ? '说明下架依据和需要创作者处理的问题…' : '说明恢复公开的依据…'}
            className="mt-2 w-full resize-y border border-border bg-surface-0 px-3 py-2.5 text-sm leading-relaxed text-text-hi outline-none transition-colors placeholder:text-text-lo focus:border-brand"
          />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-text-lo">
            <span>至少 5 个字，理由会记入审计记录并通知作者</span>
            <span>{reason.length}/500</span>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={close}
              className="mobile-touch-target min-h-11 whitespace-nowrap border border-border px-4 font-mono text-xs text-text-body transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy || reason.trim().length < 5}
              onClick={() => void submit()}
              className={`mobile-touch-target min-h-11 whitespace-nowrap px-5 font-mono text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                isArchive
                  ? 'border border-danger/50 bg-danger/10 text-danger hover:bg-danger/15'
                  : 'bg-brand text-[#0A0A0A] hover:bg-brand-hover'
              }`}
            >
              {busy ? '处理中…' : isArchive ? '确认下架' : '确认恢复公开'}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={`mobile-touch-target inline-flex min-h-10 items-center justify-center whitespace-nowrap border px-3 py-2 font-mono text-xs transition-colors ${
          isArchive
            ? 'border-danger/40 text-danger hover:bg-danger/10'
            : 'border-brand/50 text-brand hover:bg-brand/10'
        }`}
      >
        {isArchive ? '管理员下架' : '恢复公开'}
      </button>
      {dialog}
    </>
  );
}
