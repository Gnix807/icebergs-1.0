import { useEffect, useRef, useState } from 'react';
import type { Item } from '../../stores/icebergStore';
import { renderMarkdownWithMath } from '../../lib/markdown';
import { LABEL_DEFS } from '../../lib/labels';

interface ItemEditorFormProps {
  item: Item;
  onSave: (itemId: string, updates: Partial<Item>) => Promise<boolean> | boolean;
  onCancel: () => void;
  surface?: 'inspector' | 'mobile';
}

const LABEL_CATEGORIES: { key: string; label: string; color: string }[] = [
  { key: '标记', label: '性质标记', color: '#f59e0b' },
  { key: '内容', label: '内容主题', color: '#22c55e' },
  { key: '来源', label: '信息来源', color: '#3b82f6' },
];

const PREDEFINED_KEYS = new Set(LABEL_DEFS.map((definition) => definition.key));

function parseLabels(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return [];
}

function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.max(element.scrollHeight, 180)}px`;
  }, [value]);
  return ref;
}

export function ItemEditorForm({
  item,
  onSave,
  onCancel,
  surface = 'inspector',
}: ItemEditorFormProps) {
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDesc, setEditDesc] = useState(item.desc);
  const [editLabels, setEditLabels] = useState<string[]>(() => parseLabels(item.labels));
  const [customInput, setCustomInput] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({ 标记: true });
  const [isSaving, setIsSaving] = useState(false);
  const descRef = useAutoResize(editDesc);

  useEffect(() => {
    setEditTitle(item.title);
    setEditDesc(item.desc);
    setEditLabels(parseLabels(item.labels));
    setCustomInput('');
    setPreviewMode(false);
    setExpandedCats({ 标记: true });
  }, [item.id]);

  const toggleLabel = (key: string) => {
    setEditLabels((current) => (
      current.includes(key) ? current.filter((label) => label !== key) : [...current, key]
    ));
  };

  const addCustomLabel = () => {
    const value = customInput.trim();
    if (!value || value.length > 20 || editLabels.includes(value) || editLabels.length >= 10) return;
    setEditLabels((current) => [...current, value]);
    setCustomInput('');
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSave(item.id, {
        title: editTitle,
        desc: editDesc,
        labels: editLabels,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`flex min-h-0 flex-1 flex-col bg-surface-1 ${surface === 'mobile' ? 'h-full' : ''}`}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div>
          <label className="mb-1.5 block font-mono text-[11px] text-text-mid" htmlFor={`item-title-${item.id}`}>
            词条标题
          </label>
          <input
            id={`item-title-${item.id}`}
            type="text"
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            className="w-full border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-text-hi outline-none transition-colors focus:border-brand"
            placeholder="词条标题"
            autoFocus
          />
        </div>

        <div>
          <div className="flex items-center border-b border-border">
            <button type="button" onClick={() => setPreviewMode(false)}
              className={`min-h-11 border-b-2 px-3 py-1 font-mono text-[11px] transition-colors sm:min-h-0 ${!previewMode ? 'border-brand text-brand' : 'border-transparent text-text-mid hover:text-text-body'}`}>
              编辑
            </button>
            <button type="button" onClick={() => setPreviewMode(true)}
              className={`min-h-11 border-b-2 px-3 py-1 font-mono text-[11px] transition-colors sm:min-h-0 ${previewMode ? 'border-brand text-brand' : 'border-transparent text-text-mid hover:text-text-body'}`}>
              预览
            </button>
            <span className="ml-auto pr-1 font-mono text-[10px] text-text-lo">Markdown + LaTeX</span>
          </div>
          {previewMode ? (
            <div
              className="markdown-content min-h-[180px] overflow-auto border border-t-0 border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-text-body"
              dangerouslySetInnerHTML={{ __html: editDesc ? renderMarkdownWithMath(editDesc) : '<span style="color:#6b7280">暂无内容</span>' }}
            />
          ) : (
            <textarea
              ref={descRef}
              value={editDesc}
              onChange={(event) => setEditDesc(event.target.value)}
              className="w-full resize-none border border-t-0 border-border bg-surface-2 px-3 py-2 font-mono text-xs text-text-hi outline-none transition-colors placeholder:text-text-lo focus:border-brand"
              style={{ minHeight: '180px' }}
              placeholder={"描述（支持 Markdown 与 LaTeX 公式）\n\n例：行内公式 $E=mc^2$，块级公式 $$\\int_{-\\infty}^{\\infty}$$"}
              aria-label="词条描述"
            />
          )}
        </div>

        <div className="space-y-3 border border-border-subtle bg-surface-2/50 p-3">
          <div className="font-mono text-[11px] text-text-mid">标签（最多 10 个）</div>
          <div className="space-y-1">
            {LABEL_CATEGORIES.map((category) => {
              const definitions = LABEL_DEFS.filter((definition) => definition.category === category.key);
              const selected = definitions.filter((definition) => editLabels.includes(definition.key));
              const expanded = expandedCats[category.key];
              return (
                <div key={category.key}>
                  <button
                    type="button"
                    onClick={() => setExpandedCats((current) => ({ ...current, [category.key]: !current[category.key] }))}
                    className="flex min-h-11 w-full select-none items-center justify-between px-2 py-1.5 font-mono text-[10px] text-text-lo transition-colors hover:text-text-body sm:min-h-0"
                    aria-expanded={expanded}
                  >
                    <span>
                      <span className="inline-block w-3 text-center transition-transform duration-200"
                        style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>{' '}
                      {category.label}
                    </span>
                    {selected.length > 0 && (
                      <span className="text-[9px] text-text-mid">{selected.map((definition) => definition.emoji).join('')}</span>
                    )}
                  </button>
                  {expanded && (
                    <div className="flex flex-wrap gap-1.5 px-1 pb-1.5">
                      {definitions.map((definition) => {
                        const active = editLabels.includes(definition.key);
                        return (
                          <button key={definition.key} type="button" onClick={() => toggleLabel(definition.key)}
                            className="min-h-11 border px-2 py-1 font-mono text-[11px] transition-colors sm:min-h-0"
                            style={{
                              color: active ? category.color : '#6b7280',
                              borderColor: active ? category.color : '#30363d',
                              background: active ? `${category.color}12` : 'transparent',
                            }}
                            aria-pressed={active}>
                            <span className="mr-1">{definition.emoji}</span>{definition.key}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {editLabels.filter((label) => !PREDEFINED_KEYS.has(label)).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {editLabels.filter((label) => !PREDEFINED_KEYS.has(label)).map((label) => (
                <span key={label}
                  className="flex items-center gap-1 border border-dashed border-border px-2 py-1 font-mono text-xs text-text-body">
                  {label}
                  <button type="button"
                    onClick={() => setEditLabels((current) => current.filter((currentLabel) => currentLabel !== label))}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm leading-none text-text-lo transition-colors hover:text-danger sm:min-h-0 sm:min-w-0"
                    aria-label={`移除标签 ${label}`}>×</button>
                </span>
              ))}
            </div>
          )}

          {editLabels.length < 10 && (
            <div className="flex gap-2">
              <input type="text" value={customInput} onChange={(event) => setCustomInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addCustomLabel();
                  }
                }}
                placeholder="自定义标签，回车添加…" maxLength={20}
                className="min-w-0 flex-1 border border-border bg-surface-1 px-3 py-1.5 font-mono text-xs text-text-hi outline-none placeholder:text-text-lo focus:border-brand"
                aria-label="自定义标签" />
              <button type="button" onClick={addCustomLabel} disabled={!customInput.trim()}
                className="min-h-11 border border-border px-3 py-1.5 font-mono text-xs text-text-body transition-colors hover:border-brand hover:text-brand disabled:opacity-30 sm:min-h-0">
                添加
              </button>
            </div>
          )}

          {editLabels.includes('NSFW') && (
            <div className="font-mono text-xs text-danger opacity-80">! 含 NSFW 标签的词条需在提交时确认</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border-subtle bg-surface-1 px-4 py-3">
        <button type="button" onClick={() => void handleSave()} disabled={isSaving || !editTitle.trim()}
          className="min-h-11 bg-brand px-4 py-2 font-mono text-xs font-bold text-[#0A0A0A] transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50">
          {isSaving ? '保存中…' : '保存'}
        </button>
        <button type="button" onClick={onCancel} disabled={isSaving}
          className="min-h-11 border border-border px-4 py-2 font-mono text-xs text-text-body transition-colors hover:border-[#8b949e] disabled:opacity-50">
          取消
        </button>
      </div>
    </div>
  );
}
