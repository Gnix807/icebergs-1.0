import { useState, useEffect, useRef, type FormEvent } from 'react';
import { renderMarkdown } from '../lib/markdown';

type AnnType = 'info' | 'warning' | 'maintenance' | 'update';

// ── 公告模板 ─────────────────────────────────────────────
interface Template {
  label: string;
  desc: string;
  type: AnnType;
  title: string;
  content: string;
}

const TEMPLATES: Template[] = [
  {
    label: '计划维护',
    desc: '提前告知用户服务停机窗口',
    type: 'maintenance',
    title: '计划维护通知 · [日期]',
    content: `## 维护说明

本次维护将于 **[具体日期] [开始时间]** 进行，预计持续 **[时长，例如 2 小时]**，维护结束后服务将自动恢复。

### 维护内容

- [本次维护/升级的主要内容]
- [可选：第二项]

### 影响范围

维护期间以下功能将暂时不可用：

- 用户登录与注册
- 内容发布与编辑
- [其他受影响功能]

浏览和阅读功能在维护期间**不受影响**。

### 注意事项

请在维护开始前保存正在编辑的内容，以免丢失。维护完成后我们将更新本公告状态。

感谢您的理解与耐心等待。`,
  },
  {
    label: '版本更新',
    desc: '发布新功能、优化与修复清单',
    type: 'update',
    title: '版本更新 v[版本号] · [日期]',
    content: `## 更新说明

本次更新已于 **[日期]** 上线，以下为变更详情。

### 新功能

- **[功能名称]** — [一句话说明这个功能做什么]
- **[功能名称]** — [说明]

### 优化与改进

- [优化项描述，例如：提升了列表页加载速度]
- [优化项描述]

### 问题修复

- 修复了 [问题描述，例如：评论区在特定情况下无法加载的问题]
- 修复了 [问题描述]

### 已知问题

- [如有已知未解决问题，在此说明并给出临时绕过方式]

---

如在使用中遇到新的问题，欢迎通过[反馈页](/feedback)告知我们。`,
  },
  {
    label: '规则变更',
    desc: '通知社区规则或政策调整',
    type: 'warning',
    title: '平台规则变更通知 · [生效日期]',
    content: `## 变更说明

经管理团队讨论，以下规则将于 **[生效日期]** 起正式执行。变更前已发布的内容不受追溯影响。

### 变更内容

**涉及条款：** [对应规则页章节名称]

**变更前：**
> [原规则原文或概述]

**变更后：**
> [新规则原文或概述]

### 变更原因

[说明为什么需要调整，例如：近期出现了哪类问题，或社区反馈了哪些需求]

### 对用户的影响

- [具体说明哪些行为受到影响]
- [如有灰色地带，给出明确指引]

如有疑问或异议，请在[反馈页](/feedback)留言，或联系任意管理员。`,
  },
  {
    label: '紧急通知',
    desc: '突发事件、异常状况实时播报',
    type: 'warning',
    title: '【紧急】[问题简述]',
    content: `## 情况说明

**发现时间：** [时间]
**当前状态：** 🔴 处理中 / 🟡 部分恢复 / 🟢 已解决

我们发现 **[受影响的功能/服务]** 出现 **[问题描述，例如：无法正常访问 / 数据加载异常]**，目前正在紧急排查中。

### 影响范围

- 受影响用户：[全部用户 / 部分用户，如何判断]
- 受影响功能：[列举]
- 数据安全：[说明用户数据是否受到影响]

### 处理进展

| 时间 | 进展 |
|---|---|
| [时间] | 发现问题，开始排查 |
| [时间] | [进展更新] |

### 临时措施

[如果有临时绕过方案，在此说明；如果没有，写"暂无，请等待修复"]

我们会持续更新本公告，预计 **[预计恢复时间]** 恢复正常。感谢您的耐心等待。`,
  },
  {
    label: '社区活动',
    desc: '征稿、投票、主题活动等',
    type: 'info',
    title: '[活动名称] · [时间段]',
    content: `## 活动介绍

[用 2-3 句话介绍这次活动的背景和目的，例如：为了鼓励大家分享冷门领域的知识，我们发起了本次……]

### 参与方式

1. [第一步，例如：创建一张以「[主题]」为主题的冰山图]
2. [第二步，例如：在评论区回复本公告，附上你的冰山图链接]
3. [第三步，可选]

### 活动时间

- **开始：** [开始日期]
- **截止：** [截止日期 时间]
- **结果公布：** [公布日期]

### 奖励

[说明奖励，例如：优秀作品将在首页展示，作者获得……；或者没有物质奖励时，直接说明]

### 注意事项

- 提交内容须符合平台规则，NSFW 内容需打标
- [其他注意事项]

期待看到大家的作品！`,
  },
  {
    label: '里程碑/感谢',
    desc: '用户数、内容数等里程碑庆祝',
    type: 'info',
    title: '感谢每一位探索者 · [里程碑内容]',
    content: `## 一个小里程碑

[用一段有温度的文字描述这个里程碑，例如：今天，冰山图宇宙迎来了第 [数量] 位注册用户 / 第 [数量] 张已发布的冰山图。这个数字对我们来说意义非凡……]

### 感谢

感谢每一位在这里创作、探索、评论的用户。

正是你们让这个地方不只是一个工具，而是一个真正意义上的社区。

### 现在的我们

| | |
|---|---|
| 已发布冰山图 | [数量] |
| 注册用户 | [数量] |
| 词条总数 | [数量（可选）] |

### 接下来

[简短说明下一步计划，或者对社区的期待]

— 管理团队`,
  },
];


interface Author { id: string; username: string; nickname: string | null; }
interface Announcement {
  id: string;
  title: string;
  content: string;
  type: AnnType;
  pinned: boolean;
  banner: boolean;
  createdAt: string;
  updatedAt: string;
  author: Author;
}

interface Props {
  isAdmin: boolean;
  initialList: Announcement[];
  mode?: 'all' | 'announcements' | 'changelog';
}

const TYPE_META: Record<AnnType, { label: string; color: string; border: string; bg: string }> = {
  info:        { label: '公告',     color: '#3b82f6', border: '#3b82f620', bg: '#3b82f608' },
  update:      { label: '更新',     color: '#22c55e', border: '#22c55e20', bg: '#22c55e08' },
  warning:     { label: '注意',     color: '#f59e0b', border: '#f59e0b20', bg: '#f59e0b08' },
  maintenance: { label: '维护',     color: '#ef4444', border: '#ef444420', bg: '#ef444408' },
};

function renderMd(src: string): string {
  return renderMarkdown(src);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

const EMPTY_FORM = { title: '', content: '', type: 'info' as AnnType, pinned: false, banner: false };

function isAnnType(value: string | null): value is AnnType {
  return value === 'info' || value === 'warning' || value === 'maintenance' || value === 'update';
}

export function AnnouncementManager({ isAdmin, initialList, mode = 'all' }: Props) {
  const allowedTypes: AnnType[] = mode === 'announcements'
    ? ['info']
    : mode === 'changelog'
      ? ['update', 'maintenance', 'warning']
      : ['info', 'update', 'warning', 'maintenance'];

  const defaultCreateType: AnnType = allowedTypes.includes('update') ? 'update' : allowedTypes[0];
  const createMainLabel = mode === 'changelog' ? '+ 发布更新日志' : '+ 新建公告';
  const detailBasePath = mode === 'changelog' ? '/changelog' : '/announcements';

  const [list, setList] = useState<Announcement[]>(initialList);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, type: defaultCreateType }));
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | AnnType>('all');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const autoOpenFromUrlDone = useRef(false);

  useEffect(() => {
    if (showForm) setTimeout(() => titleRef.current?.focus(), 50);
  }, [showForm]);

  function buildDefaultForm(type: AnnType) {
    const safeType = allowedTypes.includes(type) ? type : defaultCreateType;
    if (safeType === 'update') {
      const tpl = TEMPLATES.find((t) => t.type === 'update');
      if (tpl) return { title: tpl.title, content: tpl.content, type: safeType, pinned: false, banner: false };
    }
    return { ...EMPTY_FORM, type: safeType };
  }

  function openCreate(type: AnnType = defaultCreateType) {
    setEditingId(null);
    setForm(buildDefaultForm(type));
    setErr('');
    setShowForm(true);
  }

  function openEdit(ann: Announcement) {
    setEditingId(ann.id);
    const safeType = allowedTypes.includes(ann.type) ? ann.type : defaultCreateType;
    setForm({ title: ann.title, content: ann.content, type: safeType, pinned: ann.pinned, banner: ann.banner ?? false });
    setErr('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setErr('');
  }

  useEffect(() => {
    if (!isAdmin || autoOpenFromUrlDone.current || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('create') !== '1') return;
    const typeParam = url.searchParams.get('type');
    const picked: AnnType = isAnnType(typeParam) ? typeParam : defaultCreateType;
    const defaultType: AnnType = allowedTypes.includes(picked) ? picked : defaultCreateType;
    openCreate(defaultType);
    autoOpenFromUrlDone.current = true;
  }, [isAdmin, defaultCreateType, mode]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErr('');
    try {
      const url = editingId ? `/api/announcements/${editingId}` : '/api/announcements';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) { setErr(data.error?.message ?? '操作失败'); return; }

      const ann: Announcement = data.data.announcement;
      setList(prev => {
        const next = editingId
          ? prev.map(a => a.id === editingId ? ann : a)
          : [ann, ...prev];
        return next.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      });
      closeForm();
    } catch {
      setErr('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setList(prev => prev.filter(a => a.id !== id));
      setDeleteConfirm(null);
    }
  }

  const visibleList = list.filter((ann) => {
    if (!allowedTypes.includes(ann.type)) return false;
    if (typeFilter !== 'all' && ann.type !== typeFilter) return false;
    if (pinnedOnly && !ann.pinned) return false;
    return true;
  });

  return (
    <div>
      {/* 管理员：新建按钮 */}
      {isAdmin && !showForm && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            onClick={() => openCreate(defaultCreateType)}
            className="font-mono text-xs px-4 py-2 border border-brand text-brand bg-surface-1 hover:bg-brand/10 transition-colors"
          >
            {createMainLabel}
          </button>
        </div>
      )}

      {/* 编辑表单 */}
      {showForm && (
        <div className="mb-8 border border-border-subtle bg-surface-2">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface-1">
            <span className="font-mono text-xs text-text-hi">
              {editingId ? '// 编辑公告' : '// 新建公告'}
            </span>
            <button onClick={closeForm} className="font-mono text-xs text-text-mid hover:text-text-body">✕</button>
          </div>
          <form onSubmit={handleSubmit} className="p-4 space-y-4">

            {/* 模板选择器（仅新建时显示） */}
            {!editingId && mode !== 'announcements' && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowTemplates(v => !v)}
                  className="font-mono text-[10px] text-text-mid hover:text-text-body border border-border hover:border-border px-3 py-1.5 transition-colors"
                >
                  {showTemplates ? '▲ 收起模板' : '▼ 从模板开始'}
                </button>

                {showTemplates && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {TEMPLATES.filter((tpl) => allowedTypes.includes(tpl.type)).map(tpl => {
                      const m = TYPE_META[tpl.type];
                      return (
                        <button
                          key={tpl.label}
                          type="button"
                          onClick={() => {
                            if (!allowedTypes.includes(tpl.type)) return;
                            setForm({ title: tpl.title, content: tpl.content, type: tpl.type, pinned: false, banner: false });
                            setShowTemplates(false);
                            setTimeout(() => titleRef.current?.focus(), 50);
                          }}
                          className="text-left border border-border bg-surface-1 px-3 py-2.5 hover:border-border transition-colors group"
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <span
                              className="font-mono text-[9px] px-1 py-0.5 border flex-shrink-0"
                              style={{ color: m.color, borderColor: m.border }}
                            >
                              {m.label}
                            </span>
                            <span className="font-mono text-xs text-text-hi group-hover:text-brand transition-colors">
                              {tpl.label}
                            </span>
                          </div>
                          <p className="font-mono text-[10px] text-text-lo group-hover:text-text-mid transition-colors leading-snug">
                            {tpl.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 标题 */}
            <div>
              <label className="block font-mono text-[10px] text-text-mid mb-1 tracking-widest">TITLE</label>
              <input
                ref={titleRef}
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="公告标题"
                maxLength={100}
                className="w-full bg-surface-1 border border-border text-text-hi font-mono text-sm px-3 py-2 focus:outline-none focus:border-brand placeholder-[#3d444d]"
              />
            </div>

            {/* 类型 + 置顶 */}
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <label className="block font-mono text-[10px] text-text-mid mb-1 tracking-widest">TYPE</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as AnnType }))}
                  className="w-full bg-surface-1 border border-border text-text-hi font-mono text-xs px-3 py-2 focus:outline-none focus:border-brand"
                >
                  {allowedTypes.map((typeKey) => (
                    <option key={typeKey} value={typeKey}>{TYPE_META[typeKey].label}</option>
                  ))}
                </select>
              </div>
              <p className="mt-1 font-mono text-[10px] text-text-lo">
                {mode === 'announcements'
                  ? '提示：公告页仅展示“公告”类型；更新日志请前往日志管理发布。'
                  : '提示：更新 / 注意 / 维护 类型会同步显示在「更新日志」页面。'}
              </p>
              <div className="flex flex-col gap-2 pt-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pinned-cb"
                    checked={form.pinned}
                    onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))}
                    className="accent-[#00FF41]"
                  />
                  <label htmlFor="pinned-cb" className="font-mono text-xs text-text-body cursor-pointer">置顶</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="banner-cb"
                    checked={form.banner}
                    onChange={e => setForm(f => ({ ...f, banner: e.target.checked }))}
                    className="accent-[#f59e0b]"
                  />
                  <label htmlFor="banner-cb" className="font-mono text-xs text-text-body cursor-pointer">
                    横幅展示
                    <span className="ml-1 text-[10px] text-text-lo">（全站顶部）</span>
                  </label>
                </div>
              </div>
            </div>

            {/* 内容 */}
            <div>
              <label className="block font-mono text-[10px] text-text-mid mb-1 tracking-widest">CONTENT (Markdown)</label>
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="支持 Markdown 格式…"
                rows={8}
                maxLength={10000}
                className="w-full bg-surface-1 border border-border text-text-hi font-mono text-xs px-3 py-2 focus:outline-none focus:border-brand placeholder-[#3d444d] resize-y"
              />
              <div className="text-right font-mono text-[10px] text-text-lo mt-0.5">
                {form.content.length} / 10000
              </div>
            </div>

            {err && <p className="font-mono text-xs text-danger">{err}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="font-mono text-xs px-4 py-2 border border-brand text-brand bg-surface-1 hover:bg-brand/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting
                  ? '[ 保存中... ]'
                  : editingId
                    ? '[ 保存修改 ]'
                    : (form.type === 'info' ? '[ 发布公告 ]' : '[ 发布日志 ]')}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="font-mono text-xs px-4 py-2 border border-border text-text-mid hover:border-[#8b949e] hover:text-text-body transition-colors"
              >
                [ 取消 ]
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 筛选条 */}
      <div className="mb-4 border border-border-subtle bg-surface-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-mono text-text-mid tracking-widest mr-1">FILTER</span>
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`text-[10px] font-mono px-2 py-1 border transition-colors ${
              typeFilter === 'all'
                ? 'border-brand text-brand bg-brand/10'
                : 'border-border text-text-body hover:border-brand hover:text-brand'
            }`}
          >
            全部
          </button>
          {(Object.keys(TYPE_META) as AnnType[]).map((key) => {
            if (!allowedTypes.includes(key)) return null;
            const meta = TYPE_META[key];
            const active = typeFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTypeFilter(key)}
                className="text-[10px] font-mono px-2 py-1 border transition-colors"
                style={
                  active
                    ? { color: meta.color, borderColor: meta.color, background: `${meta.color}18` }
                    : { color: '#8b949e', borderColor: '#30363d' }
                }
              >
                {meta.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setPinnedOnly((v) => !v)}
            className={`text-[10px] font-mono px-2 py-1 border transition-colors ${
              pinnedOnly
                ? 'border-warning text-warning bg-warning/10'
                : 'border-border text-text-body hover:border-warning hover:text-warning'
            }`}
          >
            仅看置顶
          </button>
          <span className="ml-auto text-[10px] font-mono text-text-mid">
            共 {visibleList.length} 条
          </span>
        </div>
      </div>

      {/* 公告列表 */}
      {visibleList.length === 0 ? (
        <div className="border border-border-subtle bg-surface-2 p-8 text-center">
          <p className="font-mono text-xs text-text-lo">// 当前筛选下暂无公告</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleList.map(ann => {
            const meta = TYPE_META[ann.type] ?? TYPE_META.info;
            const isEdited = ann.updatedAt !== ann.createdAt;
            return (
              <div
                key={ann.id}
                className="border bg-surface-2 relative overflow-hidden"
                style={{ borderColor: ann.pinned ? meta.color + '40' : '#21262d', background: ann.pinned ? meta.bg : undefined }}
              >
                {ann.pinned && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{ backgroundColor: meta.color }}
                    aria-hidden="true"
                  />
                )}
                {/* 头部 */}
                <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border-subtle">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {ann.pinned && (
                      <span className="font-mono text-[10px] text-warning flex-shrink-0">📌</span>
                    )}
                    {ann.pinned && (
                      <span className="font-mono text-[9px] px-1.5 py-0.5 border border-warning/25 text-warning bg-warning/10 flex-shrink-0">
                        置顶
                      </span>
                    )}
                    <span
                      className="font-mono text-[10px] px-1.5 py-0.5 border flex-shrink-0"
                      style={{ color: meta.color, borderColor: meta.border }}
                    >
                      {meta.label}
                    </span>
                    <a
                      href={`${detailBasePath}/${ann.id}`}
                      className="font-mono text-sm text-text-hi hover:text-brand transition-colors truncate"
                    >
                      {ann.title}
                    </a>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => openEdit(ann)}
                        className="font-mono text-[10px] text-text-mid hover:text-text-body transition-colors"
                      >
                        [ 编辑 ]
                      </button>
                      {deleteConfirm === ann.id ? (
                        <span className="flex gap-1">
                          <button
                            onClick={() => handleDelete(ann.id)}
                            className="font-mono text-[10px] text-danger hover:text-red-300 transition-colors"
                          >
                            [ 确认删除 ]
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="font-mono text-[10px] text-text-mid hover:text-text-body transition-colors"
                          >
                            [ 取消 ]
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(ann.id)}
                          className="font-mono text-[10px] text-text-mid hover:text-danger transition-colors"
                        >
                          [ 删除 ]
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* 内容预览 */}
                {(() => {
                  const isLong = ann.content.length > 250;
                  return (
                    <div className="px-4 pt-4 pb-3">
                      <div
                        className="markdown-content text-sm overflow-hidden"
                        style={{ maxHeight: isLong ? '6rem' : undefined }}
                        dangerouslySetInnerHTML={{ __html: renderMd(ann.content) }}
                      />
                      {isLong && (
                        <div className="mt-1">
                          <a
                            href={`${detailBasePath}/${ann.id}`}
                            className="font-mono text-[11px] text-brand hover:underline"
                          >
                            阅读全文 →
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 底部元信息 */}
                <div className="px-4 py-2 border-t border-border-subtle flex items-center gap-3 font-mono text-[10px] text-text-lo">
                  <span>{ann.author.nickname ?? ann.author.username}</span>
                  <span>·</span>
                  <span>{formatDate(ann.createdAt)}</span>
                  {isEdited && <span className="text-text-lo">· 已编辑</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
