import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getIcebergList } from '../../lib/api-client';
import { ICEBERG_TOPICS, getIcebergTopicLabel, isPresetIcebergTopic } from '../../lib/icebergTopic';

interface IcebergListItem {
  id: string;
  slug: string;
  title: string;
  description?: string;
  topic: string;
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
    <div className="archive-card flex flex-col p-5">
      <div className="flex gap-px mb-4 h-[5px] opacity-25">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex-1" style={{ backgroundColor: tierColors[i] }} />
        ))}
      </div>
      <div className="h-4 w-3/4 skeleton-shimmer mb-2" />
      <div className="h-3 w-full skeleton-shimmer mb-1.5" />
      <div className="h-3 w-2/3 skeleton-shimmer mb-4" />
      <div className="space-y-1.5 mb-3">
        <div className="h-2.5 w-4/5 skeleton-shimmer" />
        <div className="h-2.5 w-3/5 skeleton-shimmer" />
      </div>
      <div className="mt-auto pt-2.5 border-t border-border-subtle flex justify-between">
        <div className="h-2.5 w-16 skeleton-shimmer" />
        <div className="h-2.5 w-20 skeleton-shimmer" />
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
  const [topic,    setTopic]    = useState<'all' | string>('all');
  const [customTopicInput, setCustomTopicInput] = useState('');

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

  useEffect(() => {
    if (topic !== 'all' && !isPresetIcebergTopic(topic)) {
      setCustomTopicInput(topic);
    } else {
      setCustomTopicInput('');
    }
  }, [topic]);

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
        topic: topic === 'all' ? undefined : topic,
      });
      setIcebergs(res.items);
      setMeta(res.meta);
    } catch {
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, sort, page, showNsfw, topic]);

  useEffect(() => { load(); }, [load]);

  // 切排序时回到第 1 页
  const handleSort = (s: Sort) => {
    setSort(s);
    setPage(1);
  };

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:flex-wrap sm:items-center">
        {/* 搜索框 */}
        <div className="relative w-full sm:flex-1 sm:min-w-[180px] sm:max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-lo"
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
            className="mobile-touch-target w-full pl-8 pr-11 py-1.5 bg-surface-2 border border-border text-xs font-mono text-text-hi placeholder:text-text-lo focus:border-brand focus:outline-none transition-colors"
            aria-label="搜索冰山图"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="mobile-touch-target absolute right-0 top-1/2 flex -translate-y-1/2 items-center justify-center text-text-lo hover:text-text-hi transition-colors text-xs"
              aria-label="清除搜索"
            >
              ✕
            </button>
          )}
        </div>

        {/* 分类 */}
        <div className="mobile-filter-rail flex w-full items-center gap-1 sm:flex-wrap">
          <button
            onClick={() => { setTopic('all'); setPage(1); }}
            className={`mobile-touch-target shrink-0 px-3 py-1.5 text-[10px] font-mono border transition-colors ${
              topic === 'all'
                ? 'border-brand/25 text-brand bg-brand/5'
                : 'border-border-subtle text-text-mid hover:border-border hover:text-text-hi'
            }`}
          >
            全部
          </button>
          {ICEBERG_TOPICS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setTopic(opt.value); setPage(1); }}
              className={`mobile-touch-target shrink-0 px-3 py-1.5 text-[10px] font-mono border transition-colors ${
                topic === opt.value
                  ? 'border-info/25 text-info bg-info/5'
                  : 'border-border-subtle text-text-mid hover:border-border hover:text-text-hi'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <div className="flex shrink-0 items-center gap-1 sm:ml-2">
            <input
              type="text"
              value={customTopicInput}
              onChange={(e) => setCustomTopicInput(e.target.value.slice(0, 24))}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const next = customTopicInput.trim();
                setTopic(next || 'all');
                setPage(1);
              }}
              placeholder="自定义分类"
              className="mobile-touch-target w-[140px] px-2 py-1.5 bg-surface-2 border border-border text-[10px] font-mono text-text-hi placeholder:text-text-lo focus:border-brand focus:outline-none transition-colors sm:w-[120px]"
            />
            <button
              onClick={() => {
                const next = customTopicInput.trim();
                setTopic(next || 'all');
                setPage(1);
              }}
              className="mobile-touch-target px-2.5 py-1.5 text-[10px] font-mono border border-border-subtle text-text-body hover:border-brand hover:text-brand transition-colors"
            >
              筛选
            </button>
          </div>
        </div>

        {/* 排序 + NSFW 开关 */}
        <div className="mobile-filter-rail flex w-full items-center gap-1 sm:ml-auto sm:w-auto sm:flex-wrap">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleSort(opt.value)}
              className={`mobile-touch-target shrink-0 px-3 py-1.5 text-[10px] font-mono border transition-colors ${
                sort === opt.value
                  ? 'border-brand/25 text-brand bg-brand/5'
                  : 'border-border-subtle text-text-mid hover:border-border hover:text-text-hi'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => { setShowNsfw(v => !v); setPage(1); }}
            className={`mobile-touch-target shrink-0 px-3 py-1.5 text-[10px] font-mono border transition-colors ${
              showNsfw
                ? 'border-danger/25 text-danger bg-danger/5'
                : 'border-border-subtle text-text-mid hover:border-danger/25 hover:text-danger'
            }`}
            title={showNsfw ? '已显示 NSFW 内容，点击隐藏' : '默认已过滤 NSFW 内容，点击显示'}
          >
            NSFW {showNsfw ? '✓' : '✕'}
          </button>
        </div>
      </div>

      {/* 结果计数 */}
      {!loading && meta && (
        <div className="text-[10px] font-mono text-text-lo mb-4">
          {debouncedQ
            ? `"${debouncedQ}" — 找到 ${meta.total} 条结果`
            : `共 ${meta.total} 篇冰山图`
          }
          {topic !== 'all' && (
            <span className="ml-2">· 分类：{getIcebergTopicLabel(topic)}</span>
          )}
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
        <div className="py-16 text-center font-mono text-danger text-sm">{error}</div>
      ) : icebergs.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-border-subtle bg-surface-2/30">
          <div className="font-mono text-text-lo text-3xl mb-4 leading-none select-none">∅</div>
          {debouncedQ ? (
            <>
              <p className="text-text-body font-mono text-sm mb-1">// 没有找到相关冰山图</p>
              <p className="text-text-lo font-mono text-xs mb-5">
                搜索词：<span className="text-text-mid">{debouncedQ}</span>
              </p>
              <button
                onClick={() => setQ('')}
                className="px-4 py-1.5 border border-border text-text-body font-mono text-xs hover:border-brand hover:text-brand transition-colors"
              >
                × 清除搜索
              </button>
            </>
          ) : (
            <>
              <p className="text-text-body font-mono text-sm mb-1">
                // {topic === 'all' ? '暂无冰山图' : `暂无「${getIcebergTopicLabel(topic)}」分类冰山图`}
              </p>
              <p className="text-text-lo font-mono text-xs mb-5">成为第一个探索者</p>
              <a
                href="/iceberg/new"
                className="inline-block px-4 py-1.5 border border-brand text-brand font-mono text-xs hover:bg-brand/10 transition-colors"
              >
                + 创建冰山图
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
                className="archive-card group flex flex-col p-4 sm:p-5"
              >
                {/* 层级深度条 */}
                <div className="flex gap-px mb-4 tier-strip opacity-50 group-hover:opacity-95 transition-all duration-200">
                  {Array.from({ length: tierCount }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1"
                      style={{ backgroundColor: tierColors[i % tierColors.length] }}
                    />
                  ))}
                </div>

                {/* 标题 */}
                <div className="mb-1.5">
                  <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-mono border border-info/25 text-info bg-info/5">
                    {getIcebergTopicLabel(iceberg.topic || 'other')}
                  </span>
                </div>
                <h3 className="font-mono text-sm font-semibold text-text-hi group-hover:text-brand transition-colors mb-2 line-clamp-1">
                  <span className="text-text-lo mr-1">#</span>
                  {debouncedQ ? highlightMatch(iceberg.title, debouncedQ) : iceberg.title}
                </h3>

                {/* 摘要 */}
                {iceberg.description && (
                  <p className="text-xs text-text-body mb-3 line-clamp-2 leading-relaxed">
                    {iceberg.description}
                  </p>
                )}

                {/* 首层词条预览 */}
                {previewItems.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {previewItems.map((item, i) => (
                      <div key={i} className="flex items-center gap-1.5 font-mono truncate">
                        <span className="text-text-lo group-hover:text-text-lo transition-colors flex-shrink-0 text-xs">›</span>
                        <span className="text-[10px] text-text-lo group-hover:text-text-mid transition-colors truncate">{item.title}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2.5 text-[10px] font-mono">
                  <div className="flex items-center gap-3 text-text-lo">
                    <span>{tierCount} 层</span>
                    <span className="flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                      {iceberg.viewCount}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-text-lo">
                    {iceberg.author && (
                      <span className="text-text-lo truncate max-w-[80px]">
                        @{iceberg.author.nickname ?? iceberg.author.username}
                      </span>
                    )}
                    <span title={new Date(iceberg.createdAt).toLocaleDateString('zh-CN')}>
                      {relativeTime(iceberg.createdAt)}
                    </span>
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
            className="mobile-touch-target shrink-0 px-3 py-1.5 text-[10px] font-mono border border-border-subtle text-text-mid hover:border-border hover:text-text-hi disabled:opacity-30 transition-colors"
          >
            ← 上一页
          </button>

          <span className="flex min-h-11 min-w-16 items-center justify-center border border-border-subtle px-2 text-[10px] font-mono text-text-mid sm:hidden" aria-current="page">
            {page} / {meta.totalPages}
          </span>

          {/* 页码（小屏使用上方紧凑页码摘要） */}
          <div className="hidden items-center gap-2 sm:flex">
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
                    ? 'border-brand/25 text-brand bg-brand/5'
                    : 'border-border-subtle text-text-mid hover:border-border hover:text-text-hi'
                }`}
              >
                {p}
              </button>
            );
          })}
          </div>

          <button
            onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
            disabled={page >= meta.totalPages}
            className="mobile-touch-target shrink-0 px-3 py-1.5 text-[10px] font-mono border border-border-subtle text-text-mid hover:border-border hover:text-text-hi disabled:opacity-30 transition-colors"
          >
            下一页 →
          </button>
        </div>
      )}
    </div>
  );
}

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 0) {
    const futureDays = Math.ceil(Math.abs(diff) / 86400000);
    return futureDays <= 1 ? '今天' : `${futureDays} 天后`;
  }
  const days = Math.floor(diff / 86400000);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7)  return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

// 高亮搜索词（纯文本 span，不用 dangerouslySetInnerHTML）
function highlightMatch(text: string, query: string): React.ReactNode {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-brand/20 text-brand rounded-sm not-italic">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
