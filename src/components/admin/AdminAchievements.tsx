import { useState, useEffect } from 'react';
import { toast } from '../ui/Toast';
import { Trash2, ChevronDown } from 'lucide-react';
import type { Condition, BlockCondition, ConditionOp } from '../../lib/types';

// ── 积木定义 ─────────────────────────────────────────────

interface BlockDef {
  key: string;
  label: string;
  ops: ConditionOp[];
  valueType: 'number' | 'boolean' | 'text' | 'triggerType' | 'dayOfWeek' | 'month' | 'varPair';
}

const BLOCK_CATEGORIES: { label: string; blocks: BlockDef[] }[] = [
  {
    label: '① 时间 / 日历',
    blocks: [
      { key: 'currentHour',       label: '当前小时',       ops: ['==','!=','>','>=','<','<='], valueType: 'number' },
      { key: 'currentMinute',     label: '当前分钟',       ops: ['=='],                        valueType: 'number' },
      { key: 'currentDayOfWeek',  label: '星期几',         ops: ['==','!='],                   valueType: 'dayOfWeek' },
      { key: 'currentDayOfMonth', label: '几号',           ops: ['=='],                        valueType: 'number' },
      { key: 'currentMonth',      label: '月份',           ops: ['=='],                        valueType: 'month' },
      { key: 'daysSinceRegister', label: '距注册天数',     ops: ['>=','=='],                   valueType: 'number' },
    ],
  },
  {
    label: '② 跨图探索',
    blocks: [
      { key: 'visitedIcebergCount', label: '探索冰山图数',   ops: ['>=','=='],  valueType: 'number' },
      { key: 'consecutiveDays',     label: '连续访问天数',   ops: ['>=','=='],  valueType: 'number' },
      { key: 'sessionMinutes',      label: '本次会话时长(分)',ops: ['>='],       valueType: 'number' },
    ],
  },
  {
    label: '③ 词条深度',
    blocks: [
      { key: 'currentTierOrder',       label: '词条所在第几层',    ops: ['==','>=','<='], valueType: 'number' },
      { key: 'currentIcebergTierCount',label: '当前图共几层',      ops: ['==','>=','<='], valueType: 'number' },
      { key: 'currentIcebergItemCount',label: '当前图总词条数',    ops: ['>=','=='],      valueType: 'number' },
      { key: 'currentIcebergReadCount',label: '当前图已读词条数',  ops: ['>=','=='],      valueType: 'number' },
      { key: 'currentItemDescContains',label: '词条描述含文字',    ops: ['contains'],     valueType: 'text' },
      { key: 'currentItemDescLength',  label: '词条描述长度',      ops: ['==','>=','<='], valueType: 'number' },
      { key: 'currentItemTitleContains',label:'词条标题含文字',    ops: ['contains'],     valueType: 'text' },
      { key: 'currentItemLabelContains',label:'词条标签含',        ops: ['contains'],     valueType: 'text' },
      { key: 'currentItemLabelCount',  label: '词条标签数量',      ops: ['>=','=='],      valueType: 'number' },
      { key: 'currentItemIsEmpty',     label: '词条描述是否为空',  ops: ['=='],           valueType: 'boolean' },
      { key: 'isBottomTier',           label: '是否最底层',        ops: ['=='],           valueType: 'boolean' },
      { key: 'isFirstVisitIceberg',    label: '是否首次访问该图',  ops: ['=='],           valueType: 'boolean' },
      { key: 'all_clear',              label: '当前图全部读完',    ops: ['=='],           valueType: 'boolean' },
    ],
  },
  {
    label: '④ 用户成长',
    blocks: [
      { key: 'totalRead',              label: '累计阅读词条数',  ops: ['==','>=','<='], valueType: 'number' },
      { key: 'watchlistCount',         label: '收藏冰山图数',    ops: ['>=','=='],      valueType: 'number' },
      { key: 'totalVotesCast',         label: '累计投票次数',    ops: ['>=','=='],      valueType: 'number' },
      { key: 'createdIcebergCount',    label: '已发布冰山图数',  ops: ['>=','=='],      valueType: 'number' },
      { key: 'qualityLevel',           label: '质量等级(0-3)',   ops: ['>=','=='],      valueType: 'number' },
      { key: 'unlockedAchievementCount',label:'已解锁成就数',    ops: ['<=','>=','=='], valueType: 'number' },
      { key: 'warningCount',           label: '已收到警告次数',  ops: ['>=','=='],      valueType: 'number' },
      { key: 'hasUnreadNotification',  label: '是否有未读通知',  ops: ['=='],           valueType: 'boolean' },
      { key: 'hasEverSearched',        label: '是否曾使用搜索',  ops: ['=='],           valueType: 'boolean' },
    ],
  },
  {
    label: '⑤ 数学彩蛋',
    blocks: [
      { key: 'searchCount',   label: '搜索次数',      ops: ['==','>=','<='], valueType: 'number' },
      { key: 'randomCount',   label: '随机跳转次数',  ops: ['==','>=','<='], valueType: 'number' },
      { key: 'nightReadCount',label: '深夜阅读次数',  ops: ['>=','=='],      valueType: 'number' },
      { key: 'isDivisibleBy', label: '总阅读量能被N整除', ops: ['=='],       valueType: 'number' },
      { key: 'isPrime',       label: '总阅读量是质数', ops: ['=='],          valueType: 'boolean' },
      { key: 'triggerType',   label: '触发方式',       ops: ['=='],          valueType: 'triggerType' },
      { key: 'varDiff',       label: '两变量之差绝对值', ops: ['<=','=='],   valueType: 'varPair' },
    ],
  },
  {
    label: '⑥ 行为反转',
    blocks: [
      { key: 'varEqual', label: '变量A 等于 变量B', ops: ['=='], valueType: 'varPair' },
    ],
  },
];

const ALL_BLOCKS = BLOCK_CATEGORIES.flatMap(c => c.blocks);
const BLOCK_BY_KEY = Object.fromEntries(ALL_BLOCKS.map(b => [b.key, b]));
const VAR_OPTIONS = [
  'totalRead','searchCount','randomCount','nightReadCount',
  'visitedIcebergCount','consecutiveDays','totalVotesCast','currentIcebergReadCount',
];
const DAY_OPTIONS = ['周日','周一','周二','周三','周四','周五','周六'];
const MONTH_OPTIONS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

// ── 单条积木编辑器 ────────────────────────────────────────

function BlockRow({ cond, onChange, onRemove }: {
  cond: BlockCondition; onChange: (c: BlockCondition) => void; onRemove: () => void;
}) {
  const def = BLOCK_BY_KEY[cond.block];
  const renderValueInput = () => {
    if (!def) return null;
    switch (def.valueType) {
      case 'boolean':
        return (
          <select value={String(cond.value)} onChange={e => onChange({ ...cond, value: e.target.value === 'true' })}
            className="bg-surface-1 border border-border text-text-hi text-xs px-2 py-1 font-mono w-20">
            <option value="true">是</option><option value="false">否</option>
          </select>
        );
      case 'dayOfWeek':
        return (
          <select value={Number(cond.value)} onChange={e => onChange({ ...cond, value: Number(e.target.value) })}
            className="bg-surface-1 border border-border text-text-hi text-xs px-2 py-1 font-mono">
            {DAY_OPTIONS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        );
      case 'month':
        return (
          <select value={Number(cond.value)} onChange={e => onChange({ ...cond, value: Number(e.target.value) })}
            className="bg-surface-1 border border-border text-text-hi text-xs px-2 py-1 font-mono">
            {MONTH_OPTIONS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        );
      case 'triggerType':
        return (
          <select value={String(cond.value)} onChange={e => onChange({ ...cond, value: e.target.value })}
            className="bg-surface-1 border border-border text-text-hi text-xs px-2 py-1 font-mono">
            {['read','search','random','vote','visit'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        );
      case 'varPair':
        return (
          <>
            <select value={cond.varA ?? ''} onChange={e => onChange({ ...cond, varA: e.target.value })}
              className="bg-surface-1 border border-border text-text-hi text-xs px-2 py-1 font-mono">
              <option value="">变量A</option>
              {VAR_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            {cond.block === 'varDiff' && (
              <>
                <select value={cond.varB ?? ''} onChange={e => onChange({ ...cond, varB: e.target.value })}
                  className="bg-surface-1 border border-border text-text-hi text-xs px-2 py-1 font-mono">
                  <option value="">变量B</option>
                  {VAR_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <input type="number" value={Number(cond.value)} onChange={e => onChange({ ...cond, value: Number(e.target.value) })}
                  className="bg-surface-1 border border-border text-text-hi text-xs px-2 py-1 font-mono w-16" placeholder="阈值" />
              </>
            )}
            {cond.block === 'varEqual' && (
              <select value={cond.varB ?? ''} onChange={e => onChange({ ...cond, varB: e.target.value })}
                className="bg-surface-1 border border-border text-text-hi text-xs px-2 py-1 font-mono">
                <option value="">变量B</option>
                {VAR_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
          </>
        );
      case 'text':
        return (
          <input type="text" value={String(cond.value)} onChange={e => onChange({ ...cond, value: e.target.value })}
            className="bg-surface-1 border border-border text-text-hi text-xs px-2 py-1 font-mono w-32" placeholder="文字" />
        );
      default:
        return (
          <input type="number" value={Number(cond.value)} onChange={e => onChange({ ...cond, value: Number(e.target.value) })}
            className="bg-surface-1 border border-border text-text-hi text-xs px-2 py-1 font-mono w-20" />
        );
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select value={cond.block} onChange={e => {
        const newDef = BLOCK_BY_KEY[e.target.value];
        onChange({ block: e.target.value, op: newDef?.ops[0] ?? '==',
          value: newDef?.valueType === 'boolean' ? true : newDef?.valueType === 'text' ? '' : 0 });
      }} className="bg-surface-1 border border-brand/40 text-brand text-xs px-2 py-1 font-mono">
        {BLOCK_CATEGORIES.map(cat => (
          <optgroup key={cat.label} label={cat.label}>
            {cat.blocks.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          </optgroup>
        ))}
      </select>
      {def && !['varEqual','isPrime','all_clear'].includes(cond.block) && (
        <select value={cond.op} onChange={e => onChange({ ...cond, op: e.target.value as ConditionOp })}
          className="bg-surface-1 border border-border text-text-body text-xs px-2 py-1 font-mono">
          {def.ops.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {renderValueInput()}
      <button onClick={onRemove} className="text-text-lo hover:text-danger text-xs px-1 font-mono transition-colors">
        <Trash2 size={13} strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ── 自然语言预览 ──────────────────────────────────────────

function ConditionPreview({ conditions }: { conditions: Condition[] }) {
  const parts: string[] = [];
  for (const c of conditions) {
    if ('logic' in c) {
      parts.push(c.logic === 'AND' ? '且' : '或');
    } else {
      const def = BLOCK_BY_KEY[c.block];
      const label = def?.label ?? c.block;
      const opLabel = c.op === 'contains' ? '包含' : c.op;
      if (['isPrime','all_clear'].includes(c.block)) parts.push(`「${label}」`);
      else if (c.block === 'varEqual') parts.push(`「${c.varA} 等于 ${c.varB}」`);
      else if (c.block === 'varDiff') parts.push(`「|${c.varA} - ${c.varB}| ${opLabel} ${c.value}」`);
      else parts.push(`「${label} ${opLabel} ${c.value}」`);
    }
  }
  if (parts.length === 0) return <span className="text-text-lo text-xs">（未设置条件）</span>;
  return <span className="text-text-body text-xs font-mono">当 {parts.join(' ')} 时解锁</span>;
}

// ── 条件积木编辑器 ────────────────────────────────────────

function ConditionBuilder({ conditions, onChange }: { conditions: Condition[]; onChange: (c: Condition[]) => void }) {
  const blocks = conditions.filter((c): c is BlockCondition => !('logic' in c));
  const logics = conditions.filter((c): c is { logic: 'AND' | 'OR' } => 'logic' in c);

  const rebuild = (newBlocks: BlockCondition[], newLogics: { logic: 'AND' | 'OR' }[]) => {
    const result: Condition[] = [];
    for (let i = 0; i < newBlocks.length; i++) {
      result.push(newBlocks[i]);
      if (i < newBlocks.length - 1) result.push(newLogics[i] ?? { logic: 'AND' });
    }
    onChange(result);
  };

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => (
        <div key={i}>
          <BlockRow cond={block} onChange={u => rebuild(blocks.map((b, idx) => idx === i ? u : b), logics)}
            onRemove={() => rebuild(blocks.filter((_, idx) => idx !== i), logics.filter((_, idx) => idx !== i))} />
          {i < blocks.length - 1 && (
            <button onClick={() => rebuild(blocks, logics.map((l, idx) =>
              idx === i ? { logic: l.logic === 'AND' ? 'OR' as const : 'AND' as const } : l))}
              className="mt-1 text-[10px] font-mono px-2 py-0.5 border transition-colors border-border text-text-body hover:border-brand hover:text-brand">
              {logics[i]?.logic ?? 'AND'} ▼
            </button>
          )}
        </div>
      ))}
      <button onClick={() => rebuild([...blocks, { block: 'totalRead', op: '>=', value: 1 }], [...logics, { logic: 'AND' }])}
        className="text-xs font-mono text-text-body border border-dashed border-border hover:border-brand hover:text-brand px-3 py-1 transition-colors">
        + 添加积木
      </button>
      {conditions.length > 0 && (
        <div className="mt-2 px-2 py-1.5 bg-surface-1 border border-border-subtle">
          <ConditionPreview conditions={conditions} />
        </div>
      )}
    </div>
  );
}

// ── 行内编辑表单 ──────────────────────────────────────────

const EMPTY_FORM = {
  key: '', icon: '', label: '', labelZh: '', desc: '',
  color: '#6b7280', triggerType: 'manual', triggerTarget: 0,
  sortOrder: 0, isHidden: false, conditions: '[]', category: '阅读',
};

function InlineForm({ editId, initialForm, initialConditions, onSave, onCancel }: {
  editId: string | null;
  initialForm: typeof EMPTY_FORM;
  initialConditions: Condition[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const [form, setForm]             = useState({ ...initialForm });
  const [conditions, setConditions] = useState<Condition[]>(initialConditions);
  const [busy, setBusy]             = useState(false);

  // 切换编辑目标时同步数据
  useEffect(() => { setForm({ ...initialForm }); setConditions(initialConditions); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editId]);

  const submit = async () => {
    if (!form.key.trim() || !form.icon.trim() || !form.labelZh.trim() || !form.desc.trim()) {
      toast('请填写所有必填字段', 'error'); return;
    }
    setBusy(true);
    try {
      const url    = editId ? `/api/admin/achievements/${editId}` : '/api/admin/achievements';
      const method = editId ? 'PUT' : 'POST';
      const payload = { ...form, label: form.label || form.labelZh, conditions: JSON.stringify(conditions) };
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) { toast(editId ? '成就已更新' : '成就已创建'); onSave(); }
      else toast(data.error?.message ?? '操作失败', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="border-t border-border-subtle bg-surface-1 px-4 py-4 space-y-3">
      {[
        { label: '唯一Key *', field: 'key', disabled: !!editId },
        { label: '图标(emoji) *', field: 'icon' },
        { label: '中文标题 *', field: 'labelZh' },
        { label: '英文标题', field: 'label' },
        { label: '描述 *', field: 'desc' },
      ].map(({ label, field, disabled }) => (
        <div key={field}>
          <div className="text-[10px] font-mono text-text-body mb-1">{label}</div>
          <input value={(form as any)[field]}
            onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
            disabled={disabled}
            className="w-full bg-surface-2 border border-border text-text-hi text-xs px-2 py-1.5 font-mono disabled:opacity-50" />
        </div>
      ))}

      <div className="flex gap-3">
        <div className="flex-1">
          <div className="text-[10px] font-mono text-text-body mb-1">颜色</div>
          <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
            className="w-full h-8 bg-surface-2 border border-border cursor-pointer" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-mono text-text-body mb-1">排序</div>
          <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
            className="w-full bg-surface-2 border border-border text-text-hi text-xs px-2 py-1.5 font-mono" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-mono text-text-body mb-1">分类</div>
          <select value={(form as any).category || '阅读'} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full bg-surface-2 border border-border text-text-hi text-xs px-2 py-1.5 font-mono">
            {['阅读','创作','投票','收藏','质量','坚持','搜索','随机','深夜','时刻','标签','词条','隐藏','其他'].map(c =>
              <option key={c} value={c}>{c}</option>
            )}
          </select>
        </div>
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-1 text-xs font-mono text-text-body cursor-pointer">
            <input type="checkbox" checked={form.isHidden} onChange={e => setForm(f => ({ ...f, isHidden: e.target.checked }))} />
            隐藏成就
          </label>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-mono text-text-body mb-2 border-b border-border-subtle pb-1">触发条件积木</div>
        <ConditionBuilder conditions={conditions} onChange={setConditions} />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel}
          className="px-3 py-1.5 text-xs font-mono border border-border text-text-body hover:border-[#8b949e] transition-colors">
          取消
        </button>
        <button onClick={submit} disabled={busy}
          className="px-3 py-1.5 text-xs font-mono bg-brand text-[#0A0A0A] font-bold hover:bg-brand-hover disabled:opacity-50 transition-colors">
          {busy ? '保存中...' : (editId ? '更新' : '创建')}
        </button>
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────

interface AchievementDef {
  id: string; key: string; icon: string; label: string; labelZh: string;
  desc: string; color: string; triggerType: string; triggerTarget: number;
  sortOrder: number; isHidden: boolean; conditions: string; category?: string | null;
  createdAt: string;
}

export function AdminAchievements() {
  const [achievements, setAchievements] = useState<AchievementDef[]>([]);
  const [loading, setLoading]           = useState(true);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [deleting, setDeleting]         = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState('全部');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/achievements');
      const data = await res.json();
      if (data.success) setAchievements(data.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggle = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const deleteAch = async (ach: AchievementDef) => {
    if (!confirm(`确认删除「${ach.labelZh}」？`)) return;
    setDeleting(ach.id);
    try {
      const res  = await fetch(`/api/admin/achievements/${ach.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast('已删除'); if (expandedId === ach.id) setExpandedId(null); load(); }
      else toast(data.error?.message ?? '删除失败', 'error');
    } finally { setDeleting(null); }
  };

  const getFormData = (ach?: AchievementDef) => {
    if (!ach) return { form: { ...EMPTY_FORM }, conditions: [] as Condition[] };
    let conditions: Condition[] = [];
    try { conditions = JSON.parse(ach.conditions || '[]'); } catch { /* ignore */ }
    return {
      form: {
        key: ach.key, icon: ach.icon, label: ach.label, labelZh: ach.labelZh,
        desc: ach.desc, color: ach.color, triggerType: ach.triggerType,
        triggerTarget: ach.triggerTarget, sortOrder: ach.sortOrder,
        isHidden: ach.isHidden, conditions: ach.conditions, category: ach.category,
      },
      conditions,
    };
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-mono text-text-body">
          探索成就定义 — <span className="text-brand">{achievements.length}</span> 条
        </div>
        <button
          onClick={() => toggle('new')}
          className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
            expandedId === 'new'
              ? 'border-brand text-brand'
              : 'border-border text-text-body hover:border-brand hover:text-brand'
          }`}
        >
          {expandedId === 'new' ? '▲ 收起' : '+ 新建成就'}
        </button>
      </div>

      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-1 mb-3">
        {(() => {
          const cats = ['全部', ...new Set(achievements.map(a => a.category).filter(Boolean) as string[])].sort();
          return cats.map(cat => (
            <button key={cat} onClick={() => setFilterCategory(cat)}
              className={`text-[10px] font-mono px-2 py-1 border transition-colors ${
                filterCategory === cat ? 'border-brand text-brand bg-brand/10' : 'border-border-subtle text-text-mid hover:border-brand'
              }`}>
              {cat}{cat !== '全部' && <span className="ml-0.5 opacity-40">{achievements.filter(a => a.category === cat).length}</span>}
            </button>
          ));
        })()}
      </div>

      {/* 新建表单（行内展开，在列表上方） */}
      <div style={{ display: 'grid', gridTemplateRows: expandedId === 'new' ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
        <div style={{ overflow: 'hidden' }}>
          <div className="border border-brand/30 bg-surface-2 mb-4">
            <div className="px-4 py-2.5 border-b border-border-subtle flex items-center justify-between">
              <span className="text-xs font-mono text-brand">// 新建成就</span>
            </div>
            <InlineForm
              editId={null}
              initialForm={{ ...EMPTY_FORM }}
              initialConditions={[]}
              onSave={() => { setExpandedId(null); load(); }}
              onCancel={() => setExpandedId(null)}
            />
          </div>
        </div>
      </div>

      {/* 成就列表 */}
      {loading ? (
        <div className="text-xs text-text-lo font-mono">加载中...</div>
      ) : (
        <div className="space-y-1">
          {achievements.filter(a => filterCategory === '全部' || a.category === filterCategory).map(ach => {
            const isOpen = expandedId === ach.id;
            let preview: string[] = [];
            try {
              const conds: Condition[] = JSON.parse(ach.conditions || '[]');
              preview = conds.filter((c): c is BlockCondition => !('logic' in c))
                .slice(0, 2).map(c => BLOCK_BY_KEY[c.block]?.label ?? c.block);
            } catch { /* ignore */ }
            const { form, conditions } = getFormData(ach);

            return (
              <div key={ach.id} className={`border transition-colors ${isOpen ? 'border-border' : 'border-border-subtle'} bg-surface-2`}
                style={{ borderLeftColor: ach.color, borderLeftWidth: '3px' }}>
                {/* 条目行 */}
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className="text-xl flex-shrink-0">{ach.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-text-hi">{ach.labelZh}</span>
                      {ach.isHidden && <span className="text-[9px] text-text-body border border-border px-1">隐藏</span>}
                      {ach.category && <span className="text-[9px] text-text-lo border border-border-subtle px-1">{ach.category}</span>}
                    </div>
                    <div className="text-[10px] text-text-lo font-mono mt-0.5">
                      {preview.length > 0 ? preview.join(' + ') : ach.triggerType}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button
                      onClick={() => toggle(ach.id)}
                      className={`flex items-center gap-1 text-[10px] font-mono transition-colors ${isOpen ? 'text-brand' : 'text-text-body hover:text-brand'}`}
                    >
                      编辑
                      <ChevronDown size={12} strokeWidth={2}
                        style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
                    </button>
                    <button onClick={() => deleteAch(ach)} disabled={deleting === ach.id}
                      className="text-[10px] font-mono text-text-body hover:text-danger transition-colors">
                      {deleting === ach.id ? '...' : '删除'}
                    </button>
                  </div>
                </div>

                {/* 行内展开表单 */}
                <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
                  <div style={{ overflow: 'hidden' }}>
                    <InlineForm
                      editId={ach.id}
                      initialForm={form}
                      initialConditions={conditions}
                      onSave={() => { setExpandedId(null); load(); }}
                      onCancel={() => setExpandedId(null)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
