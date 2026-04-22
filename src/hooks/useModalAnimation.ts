import { useState, useEffect, useRef } from 'react';

type Phase = 'hidden' | 'visible' | 'leaving';

const DURATION = 200;

/**
 * 为弹窗提供进入/退出动画支持。
 * - mounted: 是否保留 DOM（替换 `{show && <Modal />}` 中的 show）
 * - isLeaving: 为 true 时给 overlay/content 添加 modal-overlay-out / modal-content-out 类
 */
export function useModalAnimation(show: boolean) {
  const [phase, setPhase] = useState<Phase>(show ? 'visible' : 'hidden');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (show) {
      setPhase('visible');
    } else if (phaseRef.current !== 'hidden') {
      setPhase('leaving');
      const t = setTimeout(() => setPhase('hidden'), DURATION);
      return () => clearTimeout(t);
    }
  }, [show]);

  return {
    mounted: phase !== 'hidden',
    isLeaving: phase === 'leaving',
  };
}
