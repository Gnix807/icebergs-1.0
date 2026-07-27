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
  const pendingReview = icebergs.filter(i => i.status === 'PENDING_REVIEW');
  const rejected = icebergs.filter(i => i.status === 'REJECTED');
  const archived = icebergs.filter(i => i.status === 'ARCHIVED');

  if (icebergs.length === 0) {
    return (
      <div className="user-empty-state py-16 text-center border border-dashed border-border">
        <div className="user-empty-state-icon mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border-subtle bg-surface-2 text-xl text-brand" aria-hidden="true">◇</div>
        <p className="text-text-hi font-mono text-sm mb-1.5">暂无冰山图</p>
        <p className="mx-auto mb-4 max-w-sm text-xs text-text-lo">这里会展示已经创建或发布的冰山图。</p>
        {isOwner && (
          <a href="/iceberg/new" className="mobile-touch-target inline-flex items-center rounded-lg border border-brand/25 bg-brand/10 px-4 py-2 text-brand font-mono text-xs hover:bg-brand/15">
            立即创建 →
          </a>
        )}
      </div>
    );
  }

  const statusLabel = (status: string) => {
    if (status === 'PUBLISHED') return 'published';
    if (status === 'PENDING_REVIEW') return 'pending';
    if (status === 'REJECTED') return 'rejected';
    if (status === 'ARCHIVED') return 'archived';
    return 'draft';
  };

  const statusClass = (status: string) => {
    if (status === 'PUBLISHED') return 'text-success border border-success/30';
    if (status === 'PENDING_REVIEW') return 'text-warning border border-warning/30';
    if (status === 'REJECTED') return 'text-danger border border-danger/30';
    if (status === 'ARCHIVED') return 'text-text-body border border-[#6b7280]/30';
    return 'text-[#60a5fa] border border-[#60a5fa]/30';
  };

  const renderList = (items: Iceberg[], label?: string) => {
    if (items.length === 0) return null;
    return (
      <div className="user-content-section mb-6">
        {label && (
          <div className="user-section-label text-xs font-mono text-text-mid mb-2.5 tracking-widest">{label}</div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {items.map(iceberg => (
            <div
              key={iceberg.id}
              className="user-iceberg-card archive-card group flex min-h-36 items-start gap-3 p-4 sm:gap-4"
            >
              <a href={`/iceberg/${iceberg.slug || iceberg.id}`} className="min-w-0 flex-1 block">
                <h3 className="font-mono text-sm font-semibold text-text-hi group-hover:text-brand transition-colors truncate">
                  <span className="text-text-mid mr-1">#</span>{iceberg.title}
                </h3>
                {iceberg.description && (
                  <p className="text-xs text-text-body mt-1.5 line-clamp-2 leading-relaxed">{iceberg.description}</p>
                )}
                <div className="flex gap-3 mt-3 text-xs text-text-lo font-mono">
                  <span>{iceberg._count.tiers} 层</span>
                  <span className="flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    {iceberg.viewCount}
                  </span>
                </div>
              </a>
              <div className="flex-shrink-0 text-right">
                <span className={`text-xs font-mono px-1.5 py-0.5 ${statusClass(iceberg.status)}`}>
                  {statusLabel(iceberg.status)}
                </span>
                <div className="text-xs text-text-mid font-mono mt-1">
                  {new Date(iceberg.createdAt).toLocaleDateString('zh-CN')}
                </div>
                {isOwner && (
                  <a
                    href={`/iceberg/edit/${iceberg.id}`}
                    className="mobile-touch-target mt-1 flex items-center justify-end text-xs text-text-lo hover:text-brand font-mono transition-colors"
                  >
                    编辑
                  </a>
                )}
              </div>
            </div>
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
      {renderList(
        published,
        published.length > 0 && (drafts.length > 0 || pendingReview.length > 0 || rejected.length > 0 || archived.length > 0)
          ? '// 已发布'
          : undefined,
      )}
      {renderList(drafts, '// 草稿')}
      {renderList(pendingReview, '// 待审核')}
      {renderList(rejected, '// 需修改后重提')}
      {renderList(archived, '// 已归档')}
      <div className="mt-4 pt-4 border-t border-border-subtle">
        <a href="/iceberg/new" className="mobile-touch-target inline-flex items-center text-xs text-brand font-mono hover:underline">
          + 新建冰山图
        </a>
      </div>
    </div>
  );
}
