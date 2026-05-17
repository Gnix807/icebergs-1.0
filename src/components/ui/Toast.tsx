import { useState, useEffect, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let _counter = 0;

/** 在任意 React 组件或 vanilla JS 中触发 toast
 *  window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, type } }))
 */
export function toast(message: string, type: ToastType = 'success') {
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, type } }));
}

const ICONS: Record<ToastType, string> = {
  success: '>',
  error: '!',
  info: '#',
};

const STYLES: Record<ToastType, string> = {
  success: 'border-brand text-brand shadow-[0_0_12px_rgba(0,255,65,0.25)]',
  error:   'border-danger text-danger shadow-[0_0_12px_rgba(239,68,68,0.25)]',
  info:    'border-[#6b7280] text-text-body',
};

export function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const add = useCallback((message: string, type: ToastType) => {
    const id = ++_counter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type = 'success' } = (e as CustomEvent<{ message: string; type: ToastType }>).detail;
      add(message, type);
    };
    window.addEventListener('app:toast', handler);
    return () => window.removeEventListener('app:toast', handler);
  }, [add]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9998] flex flex-col-reverse gap-2 items-center pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast-item px-4 py-2.5 font-mono text-sm border bg-surface-2 pointer-events-auto ${STYLES[t.type]}`}
        >
          <span className="mr-2 opacity-60">{ICONS[t.type]}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
