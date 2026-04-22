import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getIcebergList } from '../../lib/api-client';

interface IcebergListItem {
  id: string;
  slug: string;
  title: string;
  description?: string;
  viewCount: number;
  status: string;
  createdAt: string;
  author?: { id: string; username: string; nickname: string | null };
  _count?: { tiers: number };
  tiers?: Array<{ items: Array<{ title: string }> }>;
}

interface Meta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type Sort = 'newest' | 'oldest' | 'popular';

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: 'newest',  label: '最新' },
  { value: 'popular', label: '最热' },
  { value: 'oldest',  label: '最早' },
];

const tierColors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];

function CardSkeleton() {
  return (
    <div className="archive-card flex flex-col p-5 animate-pulse">
      <div className="flex gap-px mb-4 h-3 opacity-30">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex-1" style={{ backgroundColor: tierColors[i] }} />
        ))}
      </div>
      <div className="h-4 w-3/4 bg-[#1f2937] rounded mb-2" />
      <div className="h-3 w-full bg-[#1f2937] rounded mb-1.5" />
      <div className="h-3 w-2/3 bg-[#1f2937] rounded mb-3" />
      <div className="space-y-1.5 mb-3">
        <div className="h-2.5 w-4/5 bg-[#111827] rounded" />
        <div className="h-2.5 w-3/5 bg-[#111827] rounded" />
      </div>
      <div className="mt-auto pt-2.5 border-t border-[#1a1a1a] flex justify-between">
        <div className="h-2.5 w-16 bg-[#1f2937] rounded" />
        <div className="h-2.5 w-20 bg-[#1f2937] rounded" />
      </div>
    </div>
  );
}

export function IcebergList() {
  const [icebergs, setIcebergs] = useState<IcebergListItem[]>([]);
  const [meta,     setMeta]     = useState<Meta | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [q,        setQ]        = useState('');
  const [sort,     setSort]     = useState<Sort>('newest');
  const [page,     setPage]     = useState(1);
  const [showNsfw, setShowNsfw] = useState(false);

  // 防抖搜索
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getIcebergList({
        status: 'PUBLISHED',
        q: debouncedQ || undefined,
        sort,
        page,
        limit: 18,
        nsfw: showNsfw ? 'show' : 'hide',
      });
      setIcebergs(res.items);
      setMeta(res.meta);
    } catch {
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, sort, page, showNsfw]);

  useEffect(() => { load(); }, [load]);

  // 切排序时回到第 1 页
  const handleSort = (s: Sort) => {
    setSort(s);
    setPage(1);
  };

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* 搜索框 */}
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#374151]"
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜索标题或描述…"
            className="w-full pl-8 pr-3 py-1.5 bg-[#0a0c10] border border-[#2A2A2A] text-xs font-mono text-[#e5e5e5] placeholder-[#374151] focus:border-[#00FF41] focus:outline-none transition-colors"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#374151] hover:text-[#9ca3af] transition-colors text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* 排序 + NSFW 开关 */}
        <div className="flex items-center gap-1 ml-auto flex-wrap">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleSort(opt.value)}
              className={`px-3 py-1.5 text-[10px] font-mono border transition-colors ${
                sort === opt.value
                  ? 'border-[#00FF4140] text-[#00FF41] bg-[#00FF4108]'
                  : 'border-[#1a1a1a] text-[#4b5563] hover:border-[#2A2A2A] hover:text-[#9ca3af]'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => { setShowNsfw(v => !v); setPage(1); }}
            className={`px-3 py-1.5 text-[10px] font-mono border transition-colors ${
              showNsfw
                ? 'border-[#ef444440] text-[#ef4444] bg-[#ef444408]'
                : 'border-[#1a1a1a] text-[#4b5563] hover:border-[#ef444440] hover:text-[#ef4444]'
            }`}
            title={showNsfw ? '已显示 NSFW 内容，点击隐藏' : '默认已过滤 NSFW 内容，点击显示'}
          >
            NSFW {showNsfw ? '✓' : '✕'}
          </button>
        </div>
      </div>

      {/* 结果计数 */}
      {!loading && meta && (
        <div className="text-[10px] font-mono text-[#374151] mb-4">
          {debouncedQ
            ? `"${debouncedQ}" — 找到 ${meta.total} 条结果`
            : `共 ${meta.total} 篇冰山图`
          }
          {meta.totalPages > 1 && (
            <span className="ml-2">· 第 {meta.page}/{meta.totalPages} 页</span>
          )}
        </div>
      )}

      {/* 列表 */}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="py-16 text-center font-mono text-[#ef4444] text-sm">{error}</div>
      ) : icebergs.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-[#2A2A2A]">
          {debouncedQ ? (
            <>
              <p className="text-[#6b7280] font-mono text-sm mb-2">没有找到相关冰山图</p>
              <button
                onClick={() => setQ('')}
                className="text-[#00FF41] font-mono text-xs hover:underline"
              >
                清除搜索
              </button>
            </>
          ) : (
            <>
              <p className="text-[#6b7280] font-mono text-sm mb-4">暂无冰山图</p>
              <a href="/iceberg/new" className="text-[#00FF41] font-mono text-sm hover:underline">
                立即创建 →
              </a>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {icebergs.map(iceberg => {
            const tierCount = Math.max(iceberg._count?.tiers ?? 1, 1);
            const previewItems = iceberg.tiers?.[0]?.items ?? [];
            return (
              <a
                key={iceberg.id}
                href={`/iceberg/${iceberg.slug || iceberg.id}`}
                className="archive-card group flex flex-col p-5"
              >
                {/* 层级深度条 — 段数 = 实际层数，悬停时变亮 */}
                <div className="flex gap-px mb-4 h-3 opacity-50 group-hover:opacity-90 transition-opacity duration-200">
                  {Array.from({ length: tierCount }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1"
                      style={{ backgroundColor: tierColors[i % tierColors.length] }}
                    />
                  ))}
                </div>

                {/* 标题 */}
                <h3 className="font-mono text-sm font-semibold text-[#e5e5e5] group-hover:text-[#00FF41] transition-colors mb-2 line-clamp-1">
                  <span className="text-[#374151] mr-1">#</span>
                  {debouncedQ ? highlightMatch(iceberg.title, debouncedQ) : iceberg.title}
                </h3>

                {/* 摘要 */}
                {iceberg.description && (
                  <p className="text-xs text-[#6b7280] mb-3 line-clamp-2 leading-relaxed">
                    {iceberg.description}
                  </p>
                )}

                {/* 首层词条预览 */}
                {previewItems.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {previewItems.map((item, i) => (
                      <div key={i} className="flex items-center gap-1.5 font-mono truncate">
                        <span className="text-[#2A2A2A] group-hover:text-[#374151] transition-colors flex-shrink-0 text-xs">›</span>
                        <span className="text-[10px] text-[#374151] group-hover:text-[#4b5563] transition-colors truncate">{item.title}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="mt-auto pt-2.5 border-t border-[#1a1a1a] flex items-center justify-between text-[10px] font-mono">
                  <div className="flex items-center gap-3 text-[#374151]">
                    <span>{tierCount} 层</span>
                    <span className="flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                      {iceberg.viewCount}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[#2A2A2A]">
                    {iceberg.author && (
                      <span className="text-[#374151] truncate max-w-[80px]">
                        @{iceberg.author.nickname ?? iceberg.author.username}
                      </span>
                    )}
                    <span>{new Date(iceberg.createdAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {meta && meta.totalPages > 1 && !loading && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-[10px] font-mono border border-[#1a1a1a] text-[#4b5563] hover:border-[#2A2A2A] hover:text-[#9ca3af] disabled:opacity-30 transition-colors"
          >
            ← 上一页
          </button>

          {/* 页码 */}
          {Array.from({ length: Math.min(meta.totalPages, 7) }, (_, i) => {
            const tp = meta.totalPages;
            let p: number;
            if (tp <= 7) {
              p = i + 1;
            } else if (page <= 4) {
              p = i + 1;
            } else if (page >= tp - 3) {
              p = tp - 6 + i;
            } else {
              p = page - 3 + i;
            }
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 text-[10px] font-mono border transition-colors ${
                  p === page
                    ? 'border-[#00FF4140] text-[#00FF41] bg-[#00FF4108]'
                    : 'border-[#1a1a1a] text-[#4b5563] hover:border-[#2A2A2A] hover:text-[#9ca3af]'
                }`}
              >
                {p}
              </button>
            );
          })}

          <button
            onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
            disabled={page >= meta.totalPages}
            className="px-3 py-1.5 text-[10px] font-mono border border-[#1a1a1a] text-[#4b5563] hover:border-[#2A2A2A] hover:text-[#9ca3af] disabled:opacity-30 transition-colors"
          >
            下一页 →
          </button>
        </div>
      )}
    </div>
  );
}

// 高亮搜索词（纯文本 span，不用 dangerouslySetInnerHTML）
function highlightMatch(text: string, query: string): React.ReactNode {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#00FF4120] text-[#00FF41] rounded-sm not-italic">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
