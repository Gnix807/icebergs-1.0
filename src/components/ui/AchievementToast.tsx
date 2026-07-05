import { useState, useEffect, useCallback } from 'react';

interface AchievementItem {
  key: string;
  icon: string;
  labelZh: string;
  desc: string;
  color: string;
}

// 全局队列，由 NavBar 推入
const queue: AchievementItem[] = [];
let globalEnqueue: ((items: AchievementItem[]) => void) | null = null;

export function enqueueAchievements(items: AchievementItem[]) {
  if (globalEnqueue) {
    globalEnqueue(items);
  } else {
    queue.push(...items);
  }
}


export function AchievementToast() {
  const [current, setCurrent] = useState<AchievementItem | null>(null);
  const [visible, setVisible] = useState(false);
  const [internalQueue, setInternalQueue] = useState<AchievementItem[]>([]);

  globalEnqueue = useCallback((items: AchievementItem[]) => {
    setInternalQueue(q => [...q, ...items]);
  }, []);

  // 启动时消费启动前入队的项目
  useEffect(() => {
    if (queue.length > 0) {
      setInternalQueue([...queue]);
      queue.length = 0;
    }
  }, []);

  // 监听 app:achievement CustomEvent（供 vanilla JS 内联脚本触发）
  useEffect(() => {
    const handler = (e: Event) => {
      const items = (e as CustomEvent<AchievementItem[]>).detail;
      if (Array.isArray(items) && items.length > 0) {
        setInternalQueue(q => [...q, ...items]);
      }
    };
    window.addEventListener('app:achievement', handler);
    return () => window.removeEventListener('app:achievement', handler);
  }, []);

  // Effect 1: 出队，只负责设置 current
  useEffect(() => {
    if (current || internalQueue.length === 0) return;
    const [next, ...rest] = internalQueue;
    setInternalQueue(rest);
    setCurrent(next);
  }, [current, internalQueue]);

  // Effect 2: current 变化后驱动动画 + 定时消除
  useEffect(() => {
    if (!current) { setVisible(false); return; }

    // double RAF：确保浏览器先绘制 visible=false（translateX 110%）再触发入场
    let raf2: number;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setVisible(true));
    });

    const hideTimer   = setTimeout(() => setVisible(false), 4000);
    const removeTimer = setTimeout(() => setCurrent(null),  4350);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [current]);

  if (!current) return null;

  return (
    <div
      className="fixed top-6 right-6 z-[9999] transition-all duration-300 ease-out"
      style={{
        width: 'min(85vw, 24rem)',
        transform: visible ? 'translateX(0)' : 'translateX(110%)',
        opacity: visible ? 1 : 0,
      }}
    >
      <div
        className="bg-surface-2 border border-border-subtle overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.8)]"
        style={{ borderLeftColor: current.color, borderLeftWidth: '4px' }}
      >
        {/* 顶部标签 */}
        <div className="px-3 py-1 bg-surface-2 border-b border-border-subtle">
          <span className="text-[10px] font-mono text-brand tracking-widest animate-pulse">
            ▶ 隐藏权限已解锁 // ACHIEVEMENT UNLOCKED
          </span>
        </div>
        {/* 内容 */}
        <div className="flex items-start gap-2.5 px-3 py-2.5">
          <span className="text-xl mt-0.5 flex-shrink-0">{current.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-text-hi font-mono truncate">
              {current.labelZh}
            </div>
            <div className="text-xs text-text-body mt-0.5 leading-relaxed line-clamp-2">
              {current.desc}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
