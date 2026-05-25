import { useState, useEffect } from 'react';

type AnnType = 'info' | 'warning' | 'maintenance' | 'update';

interface BannerAnn {
  id: string;
  title: string;
  type: AnnType;
  createdAt: string;
}

interface Props {
  initial: BannerAnn | null;
}

const TYPE_META: Record<AnnType, { label: string; color: string; bg: string; border: string }> = {
  info:        { label: '公告',  color: '#3b82f6', bg: '#3b82f608', border: '#3b82f625' },
  update:      { label: '更新',  color: '#22c55e', bg: '#22c55e08', border: '#22c55e25' },
  warning:     { label: '注意',  color: '#f59e0b', bg: '#f59e0b08', border: '#f59e0b25' },
  maintenance: { label: '维护',  color: '#ef4444', bg: '#ef444408', border: '#ef444425' },
};

const STORAGE_KEY = (id: string) => `ann_banner_dismissed_${id}`;

export function AnnouncementBanner({ initial }: Props) {
  const [ann, setAnn] = useState<BannerAnn | null>(null);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!initial) return;
    const dismissed = localStorage.getItem(STORAGE_KEY(initial.id));
    if (!dismissed) {
      setAnn(initial);
      // 稍微延迟出现，避免与页面渲染抢帧
      setTimeout(() => setVisible(true), 80);
    }
  }, [initial]);

  function dismiss() {
    setLeaving(true);
    setTimeout(() => {
      if (ann) localStorage.setItem(STORAGE_KEY(ann.id), '1');
      setVisible(false);
      setAnn(null);
      setLeaving(false);
    }, 250);
  }

  if (!ann || !visible) return null;

  const meta = TYPE_META[ann.type] ?? TYPE_META.info;

  return (
    <div
      className="w-full border-b font-mono text-xs z-[9990] transition-all duration-250"
      style={{
        background: meta.bg,
        borderColor: meta.border,
        opacity: leaving ? 0 : 1,
        transform: leaving ? 'translateY(-100%)' : 'translateY(0)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-2.5 flex items-center gap-3">
        {/* 类型标签 */}
        <span
          className="px-1.5 py-0.5 border text-[10px] flex-shrink-0"
          style={{ color: meta.color, borderColor: meta.border }}
        >
          {meta.label}
        </span>

        {/* 标题 */}
        <a
          href={`/announcements/${ann.id}`}
          className="flex-1 truncate transition-colors"
          style={{ color: meta.color }}
          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
        >
          {ann.title}
        </a>

        {/* 详情链接 */}
        <a
          href={`/announcements/${ann.id}`}
          className="flex-shrink-0 text-[10px] transition-colors hidden sm:block"
          style={{ color: meta.color, opacity: 0.7 }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
        >
          查看详情 →        </a>

        {/* 关闭按钮 */}
        <button
          onClick={dismiss}
          aria-label="关闭横幅"
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center transition-colors"
          style={{ color: meta.color, opacity: 0.5 }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
        >
          ×        </button>
      </div>
    </div>
  );
}
