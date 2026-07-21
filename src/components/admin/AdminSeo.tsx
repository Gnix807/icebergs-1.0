import { useState, useEffect } from 'react';
import { toast } from '../ui/Toast';

interface Setting {
  key: string;
  value: string;
}

interface SeoFields {
  seo_google_verification: string;
  seo_baidu_verification: string;
  seo_bing_verification: string;
  seo_google_analytics: string;
  seo_baidu_analytics: string;
  seo_custom_head: string;
}

const DEFAULTS: SeoFields = {
  seo_google_verification: '',
  seo_baidu_verification: '',
  seo_bing_verification: '',
  seo_google_analytics: '',
  seo_baidu_analytics: '',
  seo_custom_head: '',
};

const FIELD_META: Record<keyof SeoFields, { label: string; hint: string; placeholder: string }> = {
  seo_google_verification: {
    label: 'Google 验证码',
    hint: 'Google Search Console → 设置 → 所有权验证 → HTML 标记 → content 属性的值',
    placeholder: '例如: AbCdEfGhIjKlMnOpQrStUvWxYz...',
  },
  seo_baidu_verification: {
    label: '百度验证码',
    hint: '百度搜索资源平台 → 站点管理 → 站点验证 → HTML 标签验证 → content 值',
    placeholder: '例如: codeva-xxxxxxxxxxxxxxxx',
  },
  seo_bing_verification: {
    label: 'Bing 验证码',
    hint: 'Bing Webmaster Tools → 添加站点 → HTML Meta Tag → content 值',
    placeholder: '例如: ABCDEF1234567890...',
  },
  seo_google_analytics: {
    label: 'Google Analytics ID',
    hint: 'Google Analytics → 管理 → 数据流 → 衡量 ID（G-XXXXXXXXXX）',
    placeholder: '例如: G-XXXXXXXXXX',
  },
  seo_baidu_analytics: {
    label: '百度统计 ID',
    hint: '百度统计 → 管理 → 获取代码 → 代码中 hm.src 的 ? 后面的 id 参数',
    placeholder: '例如: abcdef1234567890abcdef1234567890',
  },
  seo_custom_head: {
    label: '自定义 <head>',
    hint: '注入到每个页面 <head> 末尾的 HTML。可用于 360/搜狗/Yandex 等其他搜索引擎验证或自定义脚本',
    placeholder: '<meta name="xxx" content="yyy" />\n<script src="..."></script>',
  },
};

const SUBMIT_LINKS = [
  { label: 'Google Sitemap 提交', href: 'https://search.google.com/search-console/sitemaps' },
  { label: 'Bing Sitemap 提交', href: 'https://www.bing.com/webmasters/sitemaps' },
  { label: '百度 Sitemap 提交', href: 'https://ziyuan.baidu.com/linksubmit/index' },
];

export function AdminSeo() {
  const [fields, setFields] = useState<SeoFields>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const map: Record<string, string> = {};
          data.data.forEach((s: Setting) => { map[s.key] = s.value; });
          setFields({
            seo_google_verification: map.seo_google_verification || '',
            seo_baidu_verification: map.seo_baidu_verification || '',
            seo_bing_verification: map.seo_bing_verification || '',
            seo_google_analytics: map.seo_google_analytics || '',
            seo_baidu_analytics: map.seo_baidu_analytics || '',
            seo_custom_head: map.seo_custom_head || '',
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const update = (key: keyof SeoFields, value: string) => {
    setFields(prev => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/settings?data=${encodeURIComponent(JSON.stringify(fields))}`);
      const d = await res.json();
      if (d.success) {
        toast('SEO 配置已保存');
      } else {
        toast('保存失败: ' + (d.error?.message || '未知错误'));
      }
    } catch {
      toast('网络错误');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-xs font-mono text-text-mid p-8 text-center">加载中...</div>;
  }

  const fieldsList = Object.keys(DEFAULTS) as (keyof SeoFields)[];

  return (
    <div className="space-y-8">
      {/* ── 搜索引擎验证 ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-text-mid tracking-widest">// VERIFICATION</span>
          <span className="text-[10px] font-mono text-text-lo">搜索引擎站长验证</span>
        </div>

        {fieldsList.map(key => {
          const meta = FIELD_META[key];
          const hasValue = fields[key].length > 0;
          return (
            <div key={key} className="border border-border-subtle bg-surface-2 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-mono font-bold text-text-hi">{meta.label}</label>
                  <div className="text-[10px] font-mono text-text-mid mt-0.5">{meta.hint}</div>
                </div>
                {hasValue && (
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-brand/10 text-brand border border-brand/20">
                    ✓ 已配置
                  </span>
                )}
              </div>
              {key === 'seo_custom_head' ? (
                <textarea
                  value={fields[key]}
                  onChange={e => update(key, e.target.value)}
                  placeholder={meta.placeholder}
                  rows={4}
                  className="w-full bg-surface-1 border border-border px-3 py-2 text-xs font-mono text-text-body placeholder:text-text-lo focus:border-brand focus:outline-none resize-y"
                />
              ) : (
                <input
                  type="text"
                  value={fields[key]}
                  onChange={e => update(key, e.target.value)}
                  placeholder={meta.placeholder}
                  className="w-full bg-surface-1 border border-border px-3 py-2 text-xs font-mono text-text-body placeholder:text-text-lo focus:border-brand focus:outline-none"
                />
              )}
            </div>
          );
        })}

        <button
          onClick={save}
          disabled={saving}
          className="w-full py-2.5 bg-brand text-black text-xs font-mono font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {saving ? '保存中...' : '保存 SEO 配置'}
        </button>
      </div>

      {/* ── Sitemap 提交快捷入口 ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-text-mid tracking-widest">// SUBMIT</span>
          <span className="text-[10px] font-mono text-text-lo">Sitemap 提交入口</span>
        </div>
        <div className="text-[10px] font-mono text-text-mid mb-2">
          配置验证码后，进入对应平台提交 Sitemap：<code className="text-brand bg-brand/5 px-1">https://icebergs.gnix807.cn/sitemap.xml</code>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SUBMIT_LINKS.map(link => (
            <a key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block border border-border-subtle bg-surface-2 p-3 hover:border-brand transition-colors text-xs font-mono text-text-hi text-center"
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </div>

      {/* ── 页面注入预览 ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-text-mid tracking-widest">// PREVIEW</span>
            <span className="text-[10px] font-mono text-text-lo">注入到页面的代码预览</span>
          </div>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="text-[10px] font-mono text-text-mid hover:text-brand transition-colors"
          >
            {showPreview ? '收起' : '展开'}
          </button>
        </div>

        {showPreview && (
          <pre className="border border-border-subtle bg-surface-2 p-4 overflow-x-auto text-[10px] font-mono text-text-mid leading-relaxed whitespace-pre-wrap">
{`<!-- SEO 验证 + 分析 -->
${fields.seo_google_verification ? `<meta name="google-site-verification" content="${fields.seo_google_verification}" />` : '<!-- 未配置 Google 验证 -->'}
${fields.seo_baidu_verification ? `<meta name="baidu-site-verification" content="${fields.seo_baidu_verification}" />` : '<!-- 未配置百度验证 -->'}
${fields.seo_bing_verification ? `<meta name="msvalidate.01" content="${fields.seo_bing_verification}" />` : '<!-- 未配置 Bing 验证 -->'}
${fields.seo_google_analytics ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${fields.seo_google_analytics}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${fields.seo_google_analytics}');
</script>` : '<!-- 未配置 GA -->'}
${fields.seo_baidu_analytics ? `<script>
  var _hmt = _hmt || [];
  (function() {
    var hm = document.createElement("script");
    hm.src = "https://hm.baidu.com/hm.js?${fields.seo_baidu_analytics}";
    var s = document.getElementsByTagName("script")[0];
    s.parentNode.insertBefore(hm, s);
  })();
</script>` : '<!-- 未配置百度统计 -->'}
${fields.seo_custom_head || '<!-- 无自定义 head 内容 -->'}`}
          </pre>
        )}
      </div>

      {/* ── Sitemap 统计 ── */}
      <SeoStats />
    </div>
  );
}

function SeoStats() {
  const [stats, setStats] = useState<{ publishedCount: number; totalIcebergs: number } | null>(null);

  useEffect(() => {
    fetch('/api/admin/seo/stats')
      .then(r => r.json())
      .then(d => { if (d.success) setStats(d.data); })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-text-mid tracking-widest">// STATS</span>
        <span className="text-[10px] font-mono text-text-lo">站点统计</span>
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
          <div className="text-[10px] font-mono text-text-mid mb-1">Sitemap / Robots</div>
          <div className="text-xs font-mono mt-1 space-x-3">
            <a href="/sitemap.xml" target="_blank" rel="noopener"
              className="text-brand hover:underline">sitemap.xml ↗</a>
            <a href="/robots.txt" target="_blank" rel="noopener"
              className="text-text-mid hover:underline">robots.txt ↗</a>
          </div>
        </div>
      </div>
    </div>
  );
}
