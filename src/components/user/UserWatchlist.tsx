import { useState, useEffect } from 'react';

interface Iceberg {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: string;
  viewCount: number;
  createdAt: string;
  author: { id: string; username: string; nickname: string | null };
  _count: { tiers: number };
}

interface Props {
  userId: string;
  isOwner: boolean;
  publiclyVisible?: boolean;
}

export function UserWatchlist({ userId, isOwner, publiclyVisible = false }: Props) {
  const [icebergs, setIcebergs] = useState<Iceberg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
    fetch(`/api/users/${userId}/watchlist`)
      .then(r => r.json())
      .then(d => {
        if (d.success) setIcebergs(d.data);
        else setError(d.error?.message || '加载失败');
      })
      .catch(() => setError('加载失败'))
      .finally(() => setLoading(false));
  }, [userId, isOwner]);

  if (!isOwner && !publiclyVisible) {
    return (
      <div className="py-16 text-center border border-dashed border-border">
        <p className="text-text-body font-mono text-sm mb-1">收藏夹未公开</p>
        <p className="text-[10px] font-mono text-text-mid">// ACCESS RESTRICTED</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-16 bg-surface-2 border border-border-subtle animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center border border-dashed border-border">
        <p className="text-danger font-mono text-sm">{error}</p>
      </div>
    );
  }

  if (icebergs.length === 0) {
    return (
      <div className="py-16 text-center border border-dashed border-border">
        <p className="text-text-body font-mono text-sm mb-2">收藏夹为空</p>
        <a href="/iceberg/list" className="text-brand font-mono text-xs hover:underline">
          去探索冰山图 →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {icebergs.map(iceberg => (
        <a
          key={iceberg.id}
          href={`/iceberg/${iceberg.slug || iceberg.id}`}
          className="archive-card group flex items-start gap-4 p-4 block"
        >
          <div className="flex-1 min-w-0">
            <h3 className="font-mono text-sm text-text-hi group-hover:text-brand transition-colors truncate">
              <span className="text-text-mid mr-1">#</span>{iceberg.title}
            </h3>
            {iceberg.description && (
              <p className="text-xs text-text-body mt-1 truncate">{iceberg.description}</p>
            )}
            <div className="flex gap-3 mt-2 text-xs text-text-lo font-mono">
              <span>{iceberg._count.tiers} 层</span>
              <span className="flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                {iceberg.viewCount}
              </span>
              <span>by {iceberg.author.nickname || iceberg.author.username}</span>
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-xs text-warning font-mono">★ 已收藏</div>
            <div className="text-xs text-text-mid font-mono mt-1">
              {new Date(iceberg.createdAt).toLocaleDateString('zh-CN')}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
