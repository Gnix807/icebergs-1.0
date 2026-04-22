import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Item } from '../../stores/icebergStore';

interface ItemCardProps {
  item: Item;
  onUpdate: (itemId: string, updates: Partial<Item>) => void;
  onDelete: (itemId: string) => void;
}

const ITEM_LABELS: { key: string; color: string; borderColor: string }[] = [
  { key: 'NSFW',  color: '#ef4444', borderColor: '#ef444440' },
  { key: '争议',  color: '#f59e0b', borderColor: '#f59e0b40' },
  { key: '猜测',  color: '#6b7280', borderColor: '#6b728040' },
  { key: '未证实', color: '#3b82f6', borderColor: '#3b82f640' },
];

/** Handle labels from both parsed array and raw JSON string (from API) */
function parseLabels(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

const PREDEFINED_KEYS = ITEM_LABELS.map(l => l.key);

export function ItemCard({ item, onUpdate, onDelete }: ItemCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDesc, setEditDesc] = useState(item.desc);
  const [editLabels, setEditLabels] = useState<string[]>(() => parseLabels(item.labels));
  const [customInput, setCustomInput] = useState('');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const displayLabels = parseLabels(item.labels);

  const handleSave = () => {
    onUpdate(item.id, { title: editTitle, desc: editDesc, labels: editLabels });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(item.title);
    setEditDesc(item.desc);
    setEditLabels(parseLabels(item.labels));
    setCustomInput('');
    setIsEditing(false);
  };

  const toggleLabel = (key: string) => {
    setEditLabels(prev =>
      prev.includes(key) ? prev.filter(l => l !== key) : [...prev, key]
    );
  };

  const addCustomLabel = () => {
    const val = customInput.trim();
    if (!val || val.length > 20 || editLabels.includes(val) || editLabels.length >= 10) return;
    setEditLabels(prev => [...prev, val]);
    setCustomInput('');
  };

  const hasNsfw = displayLabels.includes('NSFW');

  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="bg-[#1A1A1A] border border-[#00FF41] p-3 space-y-2"
      >
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full px-2 py-1 bg-[#0A0A0A] border border-[#2A2A2A] text-sm focus:border-[#00FF41] focus:outline-none font-mono"
          placeholder="标题"
          autoFocus
        />
        <textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          className="w-full px-2 py-1 bg-[#0A0A0A] border border-[#2A2A2A] text-xs focus:border-[#00FF41] focus:outline-none resize-none font-mono"
          rows={3}
          placeholder="描述 (支持 Markdown)"
        />

        {/* 标签选择 */}
        <div>
          <div className="text-[9px] font-mono text-[#374151] mb-1">标签（可多选，最多 10 个）</div>
          {/* 预设标签 */}
          <div className="flex gap-1.5 flex-wrap">
            {ITEM_LABELS.map(({ key, color, borderColor }) => {
              const active = editLabels.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleLabel(key)}
                  className="text-[10px] font-mono px-1.5 py-0.5 border transition-all"
                  style={{
                    color: active ? color : '#4b5563',
                    borderColor: active ? borderColor : '#2A2A2A',
                    background: active ? `${color}12` : 'transparent',
                  }}
                >
                  {key}
                </button>
              );
            })}
          </div>
          {/* 自定义标签 chips */}
          {editLabels.filter(l => !PREDEFINED_KEYS.includes(l)).length > 0 && (
            <div className="flex gap-1 flex-wrap mt-1.5">
              {editLabels.filter(l => !PREDEFINED_KEYS.includes(l)).map(label => (
                <span
                  key={label}
                  className="flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 border border-dashed border-[#374151] text-[#9ca3af] bg-transparent"
                >
                  {label}
                  <button
                    type="button"
                    onClick={() => setEditLabels(prev => prev.filter(l => l !== label))}
                    className="ml-0.5 text-[#4b5563] hover:text-[#ef4444] transition-colors leading-none"
                    aria-label={`删除标签 ${label}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {/* 添加自定义标签 */}
          {editLabels.length < 10 && (
            <div className="flex gap-1 mt-1.5">
              <input
                type="text"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomLabel(); } }}
                placeholder="自定义标签…"
                maxLength={20}
                className="flex-1 min-w-0 px-2 py-0.5 bg-[#0A0A0A] border border-[#2A2A2A] text-[10px] font-mono text-[#e5e5e5] placeholder-[#374151] focus:border-[#374151] focus:outline-none"
              />
              <button
                type="button"
                onClick={addCustomLabel}
                disabled={!customInput.trim()}
                className="px-2 py-0.5 text-[10px] font-mono border border-[#2A2A2A] text-[#4b5563] hover:border-[#374151] hover:text-[#9ca3af] disabled:opacity-30 transition-colors"
              >
                添加
              </button>
            </div>
          )}
          {editLabels.includes('NSFW') && (
            <div className="text-[9px] font-mono text-[#ef4444] mt-1 opacity-80">
              ! 含 NSFW 标签的词条需在提交时确认
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="px-2 py-1 bg-[#00FF41] text-[#0A0A0A] text-xs font-mono font-medium hover:bg-[#00CC33] transition-colors"
          >
            保存
          </button>
          <button
            onClick={handleCancel}
            className="px-2 py-1 border border-[#2A2A2A] text-xs font-mono hover:border-[#6b7280] transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border p-3 group transition-colors cursor-pointer ${
        hasNsfw
          ? 'bg-[#1a0808] border-[#ef444420] hover:border-[#ef444460]'
          : 'bg-[#1A1A1A] border-[#2A2A2A] hover:border-[#00FF41]'
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className={`font-mono text-xs truncate flex-1 ${hasNsfw ? 'text-[#ef4444]' : 'text-[#00FF41]'}`}>
          {item.title}
        </h4>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            className="text-xs text-[#6b7280] hover:text-[#00FF41] transition-colors"
          >
            ✎
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            className="text-xs text-[#6b7280] hover:text-[#ef4444] transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 标签徽章 */}
      {displayLabels.length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {displayLabels.map(label => {
            const meta = ITEM_LABELS.find(l => l.key === label);
            return (
              <span
                key={label}
                className="text-[9px] font-mono px-1 py-px border leading-tight"
                style={{
                  color: meta?.color ?? '#6b7280',
                  borderColor: meta?.borderColor ?? '#6b728040',
                }}
              >
                {label}
              </span>
            );
          })}
        </div>
      )}

      {item.desc && (
        <p className="text-xs text-[#6b7280] mt-1 line-clamp-2 font-mono">
          {item.desc}
        </p>
      )}
    </div>
  );
}
