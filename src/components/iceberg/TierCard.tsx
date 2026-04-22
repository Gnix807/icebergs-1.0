import React, { useState } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
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

  const { setNodeRef, isOver } = useDroppable({
    id: tier.id,
  });

  const tierColor = TIER_COLORS[Math.min(tierIndex, TIER_COLORS.length - 1)];

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

  return (
    <div
      ref={setNodeRef}
      className={`border-l-4 rounded-r bg-[#121212] transition-colors ${
        isOver ? 'bg-[#1a2a1a]' : ''
      }`}
      style={{ borderLeftColor: tierColor }}
    >
      {/* Tier Header */}
      <div className="px-4 py-3 border-b border-[#2A2A2A]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-[#6b7280] hover:text-[#e5e5e5]"
            >
              {isCollapsed ? '▶' : '▼'}
            </button>

            {isEditing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                className="px-2 py-1 bg-[#0A0A0A] border border-[#2A2A2A] rounded font-mono text-sm focus:border-[#00FF41] focus:outline-none"
                autoFocus
              />
            ) : (
              <h3
                className="font-mono text-sm cursor-pointer hover:text-[#00FF41]"
                onClick={() => setIsEditing(true)}
                title="点击编辑层级名称"
              >
                {tier.name}
              </h3>
            )}

            <span className="text-xs text-[#6b7280] font-mono">
              [{tier.items.length} 词条]
            </span>
          </div>

          <button
            onClick={() => onDeleteTier(tier.id)}
            className="btn-danger text-xs text-[#6b7280] hover:text-[#ef4444]"
          >
            删除层级
          </button>
        </div>

        {/* 层级描述 */}
        <div className="mt-1.5 ml-6">
          {isEditingDesc ? (
            <input
              type="text"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              onBlur={handleSaveDesc}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveDesc(); if (e.key === 'Escape') setIsEditingDesc(false); }}
              className="w-full px-2 py-1 bg-[#0A0A0A] border border-[#2A2A2A] font-mono text-xs text-[#9ca3af] focus:border-[#00FF41] focus:outline-none"
              placeholder="添加层级描述（可选）"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setIsEditingDesc(true)}
              className="text-xs font-mono text-left w-full transition-colors"
              style={{ color: editDesc ? '#6b7280' : '#2A2A2A' }}
              title="点击编辑层级描述"
            >
              {editDesc || '+ 添加描述'}
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      {!isCollapsed && (
        <div className="p-4">
          <SortableContext
            items={tier.items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid grid-cols-2 gap-3">
              {tier.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onUpdate={onUpdateItem}
                  onDelete={onDeleteItem}
                />
              ))}
            </div>
          </SortableContext>

          <button
            onClick={handleAddItem}
            className="btn-primary mt-4 w-full py-2 border border-dashed border-[#2A2A2A] rounded text-sm text-[#6b7280] hover:border-[#00FF41] hover:text-[#00FF41] transition-colors"
          >
            + 添加词条
          </button>
        </div>
      )}
    </div>
  );
}
