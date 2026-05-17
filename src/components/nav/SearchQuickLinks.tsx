type QuickLink = {
  href: string;
  label: string;
  hint: string;
};

const HOT_QUESTIONS: QuickLink[] = [
  { href: '/iceberg/list', label: '找某个主题', hint: '冰山广场' },
  { href: '/leaderboard', label: '看热门内容', hint: '排行榜' },
  { href: '/feedback/progress', label: '看处理进度', hint: '反馈进展' },
  { href: '/changelog', label: '看版本变化', hint: '更新日志' },
];

interface Props {
  onNavigate?: () => void;
}

export function SearchQuickLinks({ onNavigate }: Props) {
  return (
    <div className="search-quick-links px-4 py-2 border-b">
      <div className="search-quick-links-title text-[10px] font-mono mb-2">热门问题快捷入口</div>
      <div className="flex flex-wrap gap-2">
        {HOT_QUESTIONS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className="search-quick-link-chip inline-flex items-center gap-1.5 px-2 py-1 border text-xs font-mono transition-colors"
          >
            <span>{item.label}</span>
            <span className="search-quick-link-dot">·</span>
            <span className="search-quick-link-hint">{item.hint}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
