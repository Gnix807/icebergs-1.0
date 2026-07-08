import { useState, useEffect } from 'react';

interface SitemapStats {
  publishedCount: number;
  totalIcebergs: number;
}

interface AuditItem {
  slug: string;
  title: string;
  issues: string[];
}

export function AdminSeo() {
  const [stats, setStats] = useState<SitemapStats | null>(null);

  useEffect(() => {
    fetch('/api/admin/seo/stats')
      .then(r => r.json())
      .then(d => { if (d.success) setStats(d.data); })
      .catch(() => {});
  }, []);

  const pageUrls = [
    { path: '/', label: '首页' },
    { path: '/topic', label: '主题门户' },
    { path: '/leaderboard', label: '排行榜' },
    { path: '/featured', label: '精选' },
    { path: '/iceberg/list', label: '冰山广场' },
    { path: '/guide', label: '使用指南' },
  ];

  return (
    <div className="space-y-8">
      {/* ── Sitemap 统计 ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-text-mid tracking-widest">// SITEMAP</span>
          <span className="text-[10px] font-mono text-text-lo">站点地图统计</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border border-border-subtle bg-surface-2 p-4">
            <div className="text-[10px] font-mono text-text-mid mb-1">已发布冰山图</div>
            <div className="text-xl font-mono font-bold text-brand">
              {stats ? stats.publishedCount.toLocaleString() : '—'}
            </div>
          </div>
          <div className="border border-border-subtle bg-surface-2 p-4">
            <div className="text-[10px] font-mono text-text-mid mb-1">冰山图总数</div>
            <div className="text-xl font-mono font-bold text-text-hi">
              {stats ? stats.totalIcebergs.toLocaleString() : '—'}
            </div>
          </div>
          <div className="border border-border-subtle bg-surface-2 p-4">
            <div className="text-[10px] font-mono text-text-mid mb-1">Sitemap XML</div>
            <div className="text-xs font-mono mt-1">
              <a href="/sitemap.xml" target="_blank" rel="noopener"
                className="text-brand hover:underline">/sitemap.xml ↗</a>
              <span className="text-text-mid ml-2">·</span>
              <a href="/robots.txt" target="_blank" rel="noopener"
                className="text-text-mid hover:underline ml-2">/robots.txt ↗</a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Meta 标签预览 ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-text-mid tracking-widest">// META PREVIEW</span>
          <span className="text-[10px] font-mono text-text-lo">OG / Twitter 卡片预览</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pageUrls.map(p => (
            <a key={p.path} href={p.path} target="_blank" rel="noopener"
              className="block border border-border-subtle bg-surface-2 p-3 hover:border-brand transition-colors group">
              <div className="text-xs font-mono font-bold text-text-hi group-hover:text-brand">{p.label}</div>
              <div className="text-[10px] font-mono text-text-lo mt-0.5">{p.path}</div>
              <div className="mt-2 flex gap-1.5">
                <span className="text-[9px] font-mono px-1.5 py-0.5 bg-surface-1 text-text-mid border border-border-subtle">Facebook</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 bg-surface-1 text-text-mid border border-border-subtle">Twitter</span>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* ── SEO 审计 ── */}
      <SeoAudit />
    </div>
  );
}

function SeoAudit() {
  const [audit, setAudit] = useState<AuditItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runAudit = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin/seo/audit');
      const d = await r.json();
      if (d.success) setAudit(d.data);
      else setError(d.error?.message || '审计失败');
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-text-mid tracking-widest">// AUDIT</span>
          <span className="text-[10px] font-mono text-text-lo">SEO 健康检查</span>
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          className="text-[10px] font-mono px-3 py-1 border border-border hover:border-brand text-text-mid hover:text-brand transition-colors disabled:opacity-40"
        >
          {loading ? '检查中…' : audit ? '重新检查' : '开始检查'}
        </button>
      </div>

      {error && (
        <div className="p-3 border border-danger/20 bg-danger/5 text-xs font-mono text-danger">{error}</div>
      )}

      {audit && audit.length === 0 && (
        <div className="p-4 border border-brand/20 bg-brand/5 text-xs font-mono text-text-body">
          所有冰山图 SEO 状态良好，没有发现明显问题。
        </div>
      )}

      {audit && audit.length > 0 && (
        <div className="border border-border-subtle overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-2">
                <th className="px-3 py-2 text-text-mid font-normal">冰山图</th>
                <th className="px-3 py-2 text-text-mid font-normal">问题</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((item, i) => (
                <tr key={item.slug} className={i % 2 === 0 ? 'bg-surface-2' : ''}>
                  <td className="px-3 py-2">
                    <a href={`/iceberg/${item.slug}`} target="_blank" rel="noopener"
                      className="text-text-hi hover:text-brand">{item.title}</a>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {item.issues.map((issue, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 border border-warning/30 text-warning bg-warning/5">
                          {issue}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!audit && !loading && (
        <div className="border border-border-subtle bg-surface-2 p-4 text-xs font-mono text-text-mid">
          点击"开始检查"，扫描：缺少描述的冰山图 · 标题过短(≤3字) · 描述中的坏链 · 0词条的冰山图
        </div>
      )}
    </div>
  );
}
