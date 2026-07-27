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
  onEditItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  selectedItemId?: string | null;
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
  onEditItem,
  onDeleteItem,
  selectedItemId,
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
    setActivatorNodeRef: setTierActivatorNodeRef,
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
    borderLeftWidth: '4px',
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
      className={`overflow-hidden rounded-xl border border-border-subtle bg-surface-1 shadow-[0_8px_28px_rgba(0,0,0,0.06)] transition-[border-color,box-shadow,background-color] ${isOver ? 'border-brand/40 bg-brand/[0.015] shadow-[0_0_0_3px_rgba(0,255,65,0.07)]' : 'hover:border-border'}`}
      style={tierStyle}
    >
      {/* ── Tier 标题栏 ── */}
      <div className="flex items-center justify-between gap-1 border-b border-border-subtle px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2.5"
           style={{ background: `linear-gradient(90deg, ${tierColor}14 0%, ${tierColor}05 42%, transparent 78%)` }}>
        <div className="flex flex-1 items-center gap-1 min-w-0 sm:gap-2">
          <button
            ref={setTierActivatorNodeRef}
            type="button"
            {...tierDragAttributes}
            {...tierDragListeners}
            className="inline-flex min-h-11 min-w-11 touch-none cursor-grab items-center justify-center rounded-lg font-mono text-[10px] text-text-lo transition-colors hover:bg-surface-0/60 hover:text-text-body active:cursor-grabbing sm:min-h-8 sm:min-w-8"
            title="拖拽排序层级"
            aria-label="拖拽排序"
          >
            ⋮⋮
          </button>
          <button onClick={() => setIsCollapsed(!isCollapsed)}
            className="inline-flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-lg font-mono text-xs transition-colors hover:bg-surface-0/60 sm:min-h-8 sm:min-w-8"
            style={{ color: tierColor }}
            aria-label={isCollapsed ? '展开层级' : '折叠层级'}>
            {isCollapsed ? '▶' : '▼'}
          </button>

          <span className="hidden text-[10px] font-mono flex-shrink-0 sm:inline" style={{ color: `${tierColor}99` }}>
            TIER-{tierNum}
          </span>

          <span className="hidden text-[#21262d] flex-shrink-0 font-mono text-xs sm:inline">//</span>

          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              className="bg-transparent border-b border-brand font-mono text-sm text-text-hi focus:outline-none min-w-0 flex-1"
              autoFocus
              aria-label="层级名称"
            />
          ) : (
            <h3 className="font-mono text-sm text-text-hi cursor-pointer hover:text-brand transition-colors truncate"
              onClick={() => setIsEditing(true)} title="点击编辑层级名称">
              {tier.name}
            </h3>
          )}

          <span className="flex-shrink-0 rounded-full border border-border-subtle bg-surface-0/60 px-2 py-0.5 font-mono text-[9px] text-text-lo">
            {tier.items.length}
          </span>
        </div>

        <button onClick={() => onDeleteTier(tier.id)}
          className="inline-flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-lg border border-transparent px-2 py-0.5 font-mono text-[10px] text-text-lo transition-colors hover:border-danger/20 hover:bg-danger/5 hover:text-danger sm:ml-3 sm:min-h-8 sm:min-w-0">
          删除
        </button>
      </div>

      {/* ── 层级描述 ── */}
      <div className="border-b border-border-subtle/50 px-4 py-2">
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
            aria-label="层级描述"
          />
        ) : (
          <button onClick={() => setIsEditingDesc(true)}
            className="min-h-11 w-full text-left font-mono text-xs transition-colors sm:min-h-0"
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
              className={`mb-2 rounded-lg border border-dashed px-3 py-2.5 text-[11px] font-mono transition-colors ${
                isOver ? 'border-brand text-brand bg-brand/5' : 'border-border text-text-mid'
              }`}
            >
              {isOver ? '释放以移动词条到此层' : '将词条拖到这里'}
            </div>
          )}
          <SortableContext items={tier.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {tier.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onEdit={onEditItem}
                  onDelete={onDeleteItem}
                  isSelected={selectedItemId === item.id}
                />
              ))}
            </div>
          </SortableContext>

          <button onClick={handleAddItem}
            className="mt-3 min-h-11 w-full rounded-lg border border-dashed py-2 font-mono text-xs transition-[border-color,color,background-color]"
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
