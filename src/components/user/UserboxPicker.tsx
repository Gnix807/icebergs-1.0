import { useState } from 'react';
import { USERBOX_LIBRARY, USERBOX_MAX_SLOTS } from '../../lib/awards';

interface Props {
  userId: string;
  currentIds: string[];
  unlockedAchievementIds: string[];
  maxSlots: number;
  isFounder?: boolean;
}

const ALL_USERBOXES = USERBOX_LIBRARY.reduce(
  (boxes, category) => boxes.concat(category.boxes),
  [] as (typeof USERBOX_LIBRARY)[number]['boxes'],
);

export function UserboxPicker({
  userId,
  currentIds,
  unlockedAchievementIds,
  maxSlots,
  isFounder = false,
}: Props) {
  const unlockedSet = new Set(unlockedAchievementIds);
  const validCurrent = currentIds.filter(id => {
    const def = ALL_USERBOXES.find(b => b.id === id);
    return def && (isFounder || !def.requires || unlockedSet.has(def.requires));
  });

  const [selected, setSelected] = useState<Set<string>>(new Set(validCurrent));
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const toggle = (id: string, locked: boolean) => {
    if (locked) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (isFounder || next.size < maxSlots) {
        next.add(id);
      }
      return next;
    });
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = JSON.stringify({ ids: [...selected] });
      const res  = await fetch(`/api/users/${userId}/userboxes?data=${encodeURIComponent(body)}`);
      const data = await res.json();
      if (data.success) setSaved(true);
    } finally { setSaving(false); }
  };

  const atLimit = !isFounder && selected.size >= maxSlots;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="text-sm font-mono text-text-hi">用户框定制</div>
        </div>
        <button
          onClick={save} disabled={saving}
          className={`flex-shrink-0 px-4 py-2 text-xs font-mono border transition-colors disabled:opacity-50 ${saved ? 'border-success/25 text-success' : 'border-brand/25 text-brand hover:bg-brand/10'}`}
        >
          {saving ? '保存中...' : saved ? '✓ 已保存' : '保存'}
        </button>
      </div>
      {/* 槽位说明 */}
      <div className="flex items-center gap-2 mb-4">
        {isFounder ? (
          <span className="text-[10px] font-mono" style={{ color: '#f59e0b' }}>◆ FOUNDER — 无限制</span>
        ) : (
          <>
            <div className="flex gap-1">
              {Array.from({ length: maxSlots }).map((_, i) => (
                <div
                  key={i}
                  className="w-4 h-1.5 transition-colors"
                  style={{ background: i < selected.size ? '#00FF41' : '#21262d' }}
                />
              ))}
            </div>
            <span className="text-[10px] font-mono text-text-mid">
              {selected.size}/{maxSlots} 槽位
              {maxSlots < USERBOX_MAX_SLOTS && <span className="ml-1 text-text-lo">— 解锁更多社区成就可扩展至 {USERBOX_MAX_SLOTS} 个</span>}
            </span>
          </>
        )}
      </div>

      <div className="space-y-4">
        {USERBOX_LIBRARY.map(cat => (
          <div key={cat.category}>
            <div className="text-[10px] font-mono text-text-mid tracking-widest mb-2">// {cat.category}</div>
            <div className="space-y-1">
              {cat.boxes.map(box => {
                const on     = selected.has(box.id);
                const locked = !isFounder && !!(box.requires && !unlockedSet.has(box.requires));
                const full   = !on && atLimit && !locked;
                return (
                  <button
                    key={box.id}
                    onClick={() => toggle(box.id, locked)}
                    disabled={locked || full}
                    title={locked ? `需要：${box.requiresLabel}` : full ? '已达槽位上限' : undefined}
                    className={`w-full flex items-stretch border transition-all ${
                      locked                           ? 'border-border-subtle opacity-30 cursor-not-allowed' :
                      on                               ? 'border-brand/25' :
                      full                             ? 'border-border-subtle opacity-30 cursor-not-allowed' :
                                                          'border-border-subtle opacity-60 hover:opacity-90'
                    }`}
                    style={{ minHeight: '32px' }}
                  >
                    <div
                      className="w-12 flex items-center justify-center flex-shrink-0 text-[11px] font-mono font-bold"
                      style={{ background: locked ? '#111518' : box.leftBg, color: locked ? '#30363d' : box.leftFg }}
                    >
                      {locked ? '🔒' : box.leftText}
                    </div>
                    <div className="flex-1 flex items-center px-2.5 bg-surface-0 min-w-0 border-l border-border-minimal">
                      <span className="text-[11px] font-mono text-text-body truncate">{box.text}</span>
                      {locked && (
                        <span className="ml-auto flex-shrink-0 text-[9px] font-mono text-text-lo pl-2 truncate">
                          需要 {box.requiresLabel}
                        </span>
                      )}
                    </div>
                    <div className="w-8 flex items-center justify-center flex-shrink-0 bg-surface-0">
                      <span className="text-[10px] font-mono" style={{ color: on ? '#00FF41' : '#30363d' }}>
                        {on ? '✓' : locked ? '' : '+'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
