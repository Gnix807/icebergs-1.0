import { useState, useRef, useEffect, type TouchEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Item } from '../../stores/icebergStore';
import { renderMarkdownWithMath } from '../../lib/markdown';
import { LABEL_DEFS, labelEmoji } from '../../lib/labels';

interface ItemCardProps {
  item: Item;
  onUpdate: (itemId: string, updates: Partial<Item>) => void;
  onDelete: (itemId: string) => void;
}

const LABEL_CATEGORIES: { key: string; label: string; color: string }[] = [
  { key: '标记', label: '性质标记', color: '#f59e0b' },
  { key: '内容', label: '内容主题', color: '#22c55e' },
  { key: '来源', label: '信息来源', color: '#3b82f6' },
];

const PREDEFINED_KEYS = new Set(LABEL_DEFS.map(d => d.key));

function parseLabels(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

/** textarea 高度自动跟随内容 */
function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 120)}px`;
  }, [value]);
  return ref;
}

export function ItemCard({ item, onUpdate, onDelete }: ItemCardProps) {
  const [isEditing, setIsEditing]     = useState(false);
  const [editTitle, setEditTitle]     = useState(item.title);
  const [editDesc, setEditDesc]       = useState(item.desc);
  const [editLabels, setEditLabels]   = useState<string[]>(() => parseLabels(item.labels));
  const [customInput, setCustomInput] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({ '标记': true });

  const descRef = useAutoResize(editDesc);

  // 长按进入编辑（移动端）
  const longPressTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos   = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touchStartPos.current = { x: t.clientX, y: t.clientY };
    longPressTimer.current = setTimeout(() => { setIsEditing(true); }, 600);
  };
  const handleTouchMove = (e: TouchEvent) => {
    if (!touchStartPos.current || !longPressTimer.current) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - touchStartPos.current.x) > 10 ||
        Math.abs(t.clientY - touchStartPos.current.y) > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    touchStartPos.current = null;
  };

  useEffect(() => () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }, []);

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: item.id, data: { type: 'item', tierId: item.tierId } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const displayLabels = parseLabels(item.labels);
  const hasNsfw = displayLabels.includes('NSFW');

  const handleSave = () => {
    onUpdate(item.id, { title: editTitle, desc: editDesc, labels: editLabels });
    setIsEditing(false);
    setPreviewMode(false);
  };

  const handleCancel = () => {
    setEditTitle(item.title);
    setEditDesc(item.desc);
    setEditLabels(parseLabels(item.labels));
    setCustomInput('');
    setIsEditing(false);
    setPreviewMode(false);
  };

  const toggleLabel = (key: string) => {
    setEditLabels(prev => prev.includes(key) ? prev.filter(l => l !== key) : [...prev, key]);
  };
  const toggleCat = (key: string) => {
    setExpandedCats(prev => ({ ...prev, [key]: !prev[key] }));
  };
  const addCustomLabel = () => {
    const val = customInput.trim();
    if (!val || val.length > 20 || editLabels.includes(val) || editLabels.length >= 10) return;
    setEditLabels(prev => [...prev, val]);
    setCustomInput('');
  };

  // ── 编辑模式 ─────────────────────────────────────────────
  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style} className="bg-surface-1 border border-brand/60 p-4 space-y-3">
        {/* 标题 */}
        <input
          type="text"
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          className="w-full px-3 py-2 bg-surface-2 border border-border text-sm focus:border-brand focus:outline-none font-mono text-text-hi"
          placeholder="词条标题"
          autoFocus
          aria-label="词条标题"
        />

        {/* 描述：Write / Preview 标签页 */}
        <div>
          <div className="flex items-center gap-0 mb-0 border-b border-border">
            <button
              type="button"
              onClick={() => setPreviewMode(false)}
              className={`px-3 py-1 text-[11px] font-mono border-b-2 -mb-px transition-colors ${
                !previewMode
                  ? 'border-brand text-brand'
                  : 'border-transparent text-text-mid hover:text-text-body'
              }`}
            >
              编辑
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode(true)}
              className={`px-3 py-1 text-[11px] font-mono border-b-2 -mb-px transition-colors ${
                previewMode
                  ? 'border-brand text-brand'
                  : 'border-transparent text-text-mid hover:text-text-body'
              }`}
            >
              预览
            </button>
            <span className="ml-auto text-[10px] font-mono text-text-lo pr-1">Markdown + LaTeX</span>
          </div>

          {previewMode ? (
            <div
              className="min-h-[120px] px-3 py-2 bg-surface-2 border border-border border-t-0 text-xs text-text-body leading-relaxed markdown-content overflow-auto"
              dangerouslySetInnerHTML={{ __html: editDesc ? renderMarkdownWithMath(editDesc) : '<span style="color:#3d444d">暂无内容</span>' }}
            />
          ) : (
            <textarea
              ref={descRef}
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              className="w-full px-3 py-2 bg-surface-2 border border-border border-t-0 text-xs focus:border-brand focus:outline-none resize-none font-mono text-text-hi placeholder:text-text-lo"
              style={{ minHeight: '120px' }}
              placeholder={"描述（支持 Markdown 与 LaTeX 公式）\n\n例：行内公式 $E=mc^2$，块级公式 $$\\int_{-\\infty}^{\\infty}$$"}
              aria-label="词条描述"
            />
          )}
        </div>

        {/* 标签 */}
        <div className="border border-border-subtle bg-surface-1 p-3 space-y-3">
          <div className="text-[11px] font-mono text-text-mid">标签（最多 10 个）</div>

          {/* 预设标签（按类别分组，可折叠） */}
          <div className="space-y-1">
            {LABEL_CATEGORIES.map(cat => {
              const boxes = LABEL_DEFS.filter(d => d.category === cat.key);
              const selectedInCat = boxes.filter(b => editLabels.includes(b.key));
              const expanded = expandedCats[cat.key];
              return (
                <div key={cat.key}>
                  <div
                    onClick={() => toggleCat(cat.key)}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-mono text-text-lo hover:text-text-body transition-colors cursor-pointer select-none">
                    <span>
                      <span className="inline-block w-3 text-center transition-transform duration-200 ease-out" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
                      {' '}{cat.label}
                    </span>
                    {selectedInCat.length > 0 && (
                      <span className="text-[9px] text-text-mid">{selectedInCat.map(b => b.emoji).join('')}</span>
                    )}
                  </div>
                  {expanded && (
                    <div className="flex gap-1.5 flex-wrap px-1 pb-1.5" style={{ animation: 'slideDown 200ms ease-out' }}>
                      {boxes.map(d => {
                        const active = editLabels.includes(d.key);
                        return (
                          <button key={d.key} type="button" onClick={() => toggleLabel(d.key)}
                            className="text-[11px] font-mono px-2 py-1 border transition-all"
                            style={{
                              color: active ? cat.color : '#6b7280',
                              borderColor: active ? cat.color : '#30363d',
                              background: active ? `${cat.color}12` : 'transparent',
                            }}>
                            <span className="mr-1">{d.emoji}</span>{d.key}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 自定义标签已选 */}
          {editLabels.filter(l => !PREDEFINED_KEYS.has(l)).length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {editLabels.filter(l => !PREDEFINED_KEYS.has(l)).map(label => (
                <span key={label} className="flex items-center gap-1 text-xs font-mono px-2 py-1 border border-dashed border-border text-text-body">
                  {label}
                  <button type="button" onClick={() => setEditLabels(prev => prev.filter(l => l !== label))}
                    className="text-text-lo hover:text-danger transition-colors leading-none text-sm">×</button>
                </span>
              ))}
            </div>
          )}

          {/* 添加自定义标签 */}
          {editLabels.length < 10 && (
            <div className="flex gap-2">
              <input type="text" value={customInput} onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomLabel(); } }}
                placeholder="自定义标签，回车添加…" maxLength={20}
                className="flex-1 min-w-0 px-3 py-1.5 bg-surface-2 border border-border text-xs font-mono text-text-hi placeholder:text-text-lo focus:border-brand focus:outline-none"
                aria-label="自定义标签" />
              <button type="button" onClick={addCustomLabel} disabled={!customInput.trim()}
                className="px-3 py-1.5 text-xs font-mono border border-border text-text-body hover:border-brand hover:text-brand disabled:opacity-30 transition-colors">
                添加
              </button>
            </div>
          )}

          {editLabels.includes('NSFW') && (
            <div className="text-xs font-mono text-danger opacity-80">! 含 NSFW 标签的词条需在提交时确认</div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2 pt-1 border-t border-border-subtle">
          <button onClick={handleSave}
            className="px-4 py-1.5 bg-brand text-[#0A0A0A] text-xs font-mono font-bold hover:bg-brand-hover transition-colors">
            保存
          </button>
          <button onClick={handleCancel}
            className="px-4 py-1.5 border border-border text-xs font-mono text-text-body hover:border-[#8b949e] transition-colors">
            取消
          </button>
        </div>
      </div>
    );
  }

  // ── 显示模式 ─────────────────────────────────────────────
  return (
    <div
      ref={setNodeRef}
      style={style}
      onDoubleClick={() => setIsEditing(true)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsEditing(true); } }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`border p-3 group select-none cursor-grab active:cursor-grabbing transition-colors ${
        hasNsfw
          ? 'bg-[#1a0808] border-[#ef444430] hover:border-[#ef444460]'
          : 'bg-surface-2 border-[#2d333b] hover:border-brand/50'
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className={`font-mono text-xs flex-1 ${hasNsfw ? 'text-danger' : 'text-brand'}`}>
          {item.title}
        </h4>
        {/* 桌面 hover 显示 / 移动端常显 */}
        <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={e => { e.stopPropagation(); setIsEditing(true); }}
            className="text-sm text-text-body hover:text-brand active:text-brand transition-colors px-1 py-0.5 touch-manipulation" title="编辑">
            ✎
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(item.id); }}
            className="text-sm text-text-body hover:text-danger active:text-danger transition-colors px-1 py-0.5 touch-manipulation" title="删除">
            ✕
          </button>
        </div>
      </div>

      {displayLabels.length > 0 && (
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {displayLabels.map(label => {
            const def = LABEL_DEFS.find(d => d.key === label);
            const catColor = LABEL_CATEGORIES.find(c => c.key === def?.category)?.color ?? '#6b7280';
            return (
              <span key={label} className="text-[9px] font-mono px-1 py-px border leading-tight"
                style={{ color: catColor, borderColor: `${catColor}40`, background: `${catColor}08` }}>
                {def?.emoji && <span className="mr-0.5">{def.emoji}</span>}{label}
              </span>
            );
          })}
        </div>
      )}

      {item.desc && (
        <p className="text-[11px] text-text-hi mt-1.5 line-clamp-3 font-mono leading-relaxed">
          {item.desc}
        </p>
      )}

      {/* 操作提示：桌面显示"双击编辑"，移动端显示"长按编辑" */}
      <p className="text-[11px] font-mono mt-2 opacity-0 group-hover:opacity-100 transition-opacity
        hidden md:block text-[#3a5c45]">
        双击编辑 · 拖拽排序
      </p>
      <p className="text-[11px] font-mono mt-2 text-[#3a5c45] md:hidden">
        长按编辑 · 拖拽排序
      </p>
    </div>
  );
}
