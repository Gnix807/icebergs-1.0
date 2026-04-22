interface Iceberg {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: string;
  viewCount: number;
  createdAt: string;
  _count: { tiers: number };
}

interface Props {
  icebergs: Iceberg[];
  isOwner: boolean;
}

export function UserIcebergs({ icebergs, isOwner }: Props) {
  const published = icebergs.filter(i => i.status === 'PUBLISHED');
  const drafts = icebergs.filter(i => i.status === 'DRAFT');
  const archived = icebergs.filter(i => i.status === 'ARCHIVED');

  if (icebergs.length === 0) {
    return (
      <div className="py-16 text-center border border-dashed border-[#2A2A2A]">
        <p className="text-[#6b7280] font-mono text-sm mb-3">暂无冰山图</p>
        {isOwner && (
          <a href="/iceberg/new" className="text-[#00FF41] font-mono text-sm hover:underline">
            立即创建 →
          </a>
        )}
      </div>
    );
  }

  const renderList = (items: Iceberg[], label?: string) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6">
        {label && (
          <div className="text-xs font-mono text-[#374151] mb-2 tracking-widest">{label}</div>
        )}
        <div className="space-y-2">
          {items.map(iceberg => (
            <a
              key={iceberg.id}
              href={`/iceberg/${iceberg.slug || iceberg.id}`}
              className="archive-card group flex items-start gap-4 p-4 block"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-mono text-sm text-[#e5e5e5] group-hover:text-[#00FF41] transition-colors truncate">
                  <span className="text-[#374151] mr-1">#</span>{iceberg.title}
                </h3>
                {iceberg.description && (
                  <p className="text-xs text-[#6b7280] mt-1 truncate">{iceberg.description}</p>
                )}
                <div className="flex gap-3 mt-2 text-xs text-[#4b5563] font-mono">
                  <span>{iceberg._count.tiers} 层</span>
                  <span className="flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    {iceberg.viewCount}
                  </span>
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                <span className={`text-xs font-mono px-1.5 py-0.5 ${
                  iceberg.status === 'PUBLISHED'
                    ? 'text-[#22c55e] border border-[#22c55e]/30'
                    : iceberg.status === 'ARCHIVED'
                    ? 'text-[#6b7280] border border-[#6b7280]/30'
                    : 'text-[#f59e0b] border border-[#f59e0b]/30'
                }`}>
                  {iceberg.status === 'PUBLISHED' ? 'published' : iceberg.status === 'ARCHIVED' ? 'archived' : 'draft'}
                </span>
                <div className="text-xs text-[#374151] font-mono mt-1">
                  {new Date(iceberg.createdAt).toLocaleDateString('zh-CN')}
                </div>
                {isOwner && (
                  <a
                    href={`/iceberg/edit/${iceberg.id}`}
                    onClick={e => e.stopPropagation()}
                    className="block text-xs text-[#4b5563] hover:text-[#00FF41] font-mono mt-1 transition-colors"
                  >
                    编辑
                  </a>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>
    );
  };

  if (!isOwner) {
    return <>{renderList(published)}</>;
  }

  return (
    <div>
      {renderList(published, published.length > 0 && (drafts.length > 0 || archived.length > 0) ? '// 已发布' : undefined)}
      {renderList(drafts, '// 草稿')}
      {renderList(archived, '// 已归档')}
      <div className="mt-4 pt-4 border-t border-[#1f2937]">
        <a href="/iceberg/new" className="text-xs text-[#00FF41] font-mono hover:underline">
          + 新建冰山图
        </a>
      </div>
    </div>
  );
}
