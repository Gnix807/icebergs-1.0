import { useState, useEffect, useCallback } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ItemCard } from './ItemCard';
import type { Tier, Item } from '../../stores/icebergStore';

interface TierCardProps {
  tier: Tier;
  tierIndex: number;
  onUpdateTier: (tierId: string, updates: Partial<Tier>) => void;
  onDeleteTier: (tierId: string) => void;
  onAddItem: (tierId: string, item: Item) => void;
  onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
  onDeleteItem: (itemId: string) => void;
}

const TIER_COLORS = [
  '#22c55e', // Tier 1: green
  '#3b82f6', // Tier 2: blue
  '#f59e0b', // Tier 3: amber
  '#ef4444', // Tier 4: red
  '#ec4899', // Tier 5: pink
  '#8b5cf6', // Tier 6: purple
  '#6b7280', // Tier 7+: gray
];

export function TierCard({
  tier,
  tierIndex,
  onUpdateTier,
  onDeleteTier,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}: TierCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(tier.name);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState(tier.desc ?? '');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLight, setIsLight] = useState(false);
  useEffect(() => {
    const update = () => setIsLight(document.documentElement.classList.contains('light'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: tier.id,
    data: { type: 'tier-drop', tierId: tier.id },
  });
  const {
    attributes: tierDragAttributes,
    listeners: tierDragListeners,
    setNodeRef: setSortableNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tier.id,
    data: { type: 'tier', tierId: tier.id },
  });

  const setNodeRef = useCallback((node: HTMLDivElement | null) => {
    setDropNodeRef(node);
    setSortableNodeRef(node);
  }, [setDropNodeRef, setSortableNodeRef]);

  const tierColor = TIER_COLORS[Math.min(tierIndex, TIER_COLORS.length - 1)];
  const tierStyle = {
    borderLeftColor: tierColor,
    borderLeftWidth: '3px',
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  const handleSaveName = () => {
    onUpdateTier(tier.id, { name: editName });
    setIsEditing(false);
  };

  const handleSaveDesc = () => {
    onUpdateTier(tier.id, { desc: editDesc });
    setIsEditingDesc(false);
  };

  const handleAddItem = () => {
    const newItem: Item = {
      id: `item_${Date.now()}`,
      title: '新词条',
      desc: '',
      order: tier.items.length,
      tierId: tier.id,
      labels: [],
    };
    onAddItem(tier.id, newItem);
  };

  const tierNum = String(tierIndex + 1).padStart(2, '0');

  return (
    <div
      ref={setNodeRef}
      className={`border border-border-subtle bg-surface-1 transition-colors ${isOver ? 'border-brand/30' : ''}`}
      style={tierStyle}
    >
      {/* ── Tier 标题栏 ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle"
           style={{ background: `linear-gradient(90deg, ${tierColor}0d 0%, transparent 60%)` }}>
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            {...tierDragAttributes}
            {...tierDragListeners}
            className="font-mono text-[10px] px-1 text-text-lo hover:text-text-body cursor-grab active:cursor-grabbing"
            title="拖拽排序层级"
          >
            ⋮⋮
          </button>
          <button onClick={() => setIsCollapsed(!isCollapsed)}
            className="font-mono text-xs transition-colors flex-shrink-0"
            style={{ color: tierColor }}>
            {isCollapsed ? '▶' : '▼'}
          </button>

          <span className="text-[10px] font-mono flex-shrink-0" style={{ color: `${tierColor}99` }}>
            TIER-{tierNum}
          </span>

          <span className="text-[#21262d] flex-shrink-0 font-mono text-xs">//</span>

          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              className="bg-transparent border-b border-brand font-mono text-sm text-text-hi focus:outline-none min-w-0 flex-1"
              autoFocus
            />
          ) : (
            <h3 className="font-mono text-sm text-text-hi cursor-pointer hover:text-brand transition-colors truncate"
              onClick={() => setIsEditing(true)} title="点击编辑层级名称">
              {tier.name}
            </h3>
          )}

          <span className="text-[10px] font-mono text-text-lo flex-shrink-0">
            [{tier.items.length}]
          </span>
        </div>

        <button onClick={() => onDeleteTier(tier.id)}
          className="text-[10px] font-mono text-text-lo hover:text-danger transition-colors flex-shrink-0 ml-3 border border-transparent hover:border-danger/25 px-1.5 py-0.5">
          DEL
        </button>
      </div>

      {/* ── 层级描述 ── */}
      <div className="px-4 py-1.5 border-b border-border-subtle/50">
        {isEditingDesc ? (
          <input
            type="text"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            onBlur={handleSaveDesc}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveDesc(); if (e.key === 'Escape') setIsEditingDesc(false); }}
            className="w-full bg-transparent border-b border-brand/40 font-mono text-xs text-text-body focus:outline-none placeholder:text-text-lo"
            placeholder="// 层级描述…"
            autoFocus
          />
        ) : (
          <button onClick={() => setIsEditingDesc(true)}
            className="text-xs font-mono text-left w-full transition-colors"
            style={{ color: editDesc ? '#6b7280' : (isLight ? '#c9d1d9' : '#2d333b') }}>
            {editDesc ? `// ${editDesc}` : '// 点击添加层级描述…'}
          </button>
        )}
      </div>

      {/* ── Items ── */}
      {!isCollapsed && (
        <div className="p-3">
          {tier.items.length === 0 && (
            <div
              className={`mb-2 rounded border border-dashed px-3 py-2 text-[11px] font-mono transition-colors ${
                isOver ? 'border-brand text-brand bg-brand/5' : 'border-border text-text-mid'
              }`}
            >
              {isOver ? '释放以移动词条到此层' : '将词条拖到这里'}
            </div>
          )}
          <SortableContext items={tier.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {tier.items.map((item) => (
                <ItemCard key={item.id} item={item} onUpdate={onUpdateItem} onDelete={onDeleteItem} />
              ))}
            </div>
          </SortableContext>

          <button onClick={handleAddItem}
            className="mt-3 w-full py-2 border border-dashed font-mono text-xs transition-colors"
            style={{ borderColor: `${tierColor}40`, color: `${tierColor}80` }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = tierColor; (e.currentTarget as HTMLButtonElement).style.color = tierColor; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${tierColor}40`; (e.currentTarget as HTMLButtonElement).style.color = `${tierColor}80`; }}>
            + 新建词条
          </button>
        </div>
      )}
    </div>
  );
}
