import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Item } from '../../stores/icebergStore';
import { LABEL_DEFS } from '../../lib/labels';

interface ItemCardProps {
  item: Item;
  onEdit: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  isSelected?: boolean;
}

const LABEL_CATEGORIES: { key: string; color: string }[] = [
  { key: '标记', color: '#f59e0b' },
  { key: '内容', color: '#22c55e' },
  { key: '来源', color: '#3b82f6' },
];

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

export function ItemCard({ item, onEdit, onDelete, isSelected = false }: ItemCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { type: 'item', tierId: item.tierId },
  });

  const displayLabels = parseLabels(item.labels);
  const hasNsfw = displayLabels.includes('NSFW');
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.72 : 1,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        onEdit(item.id);
      }}
      className={`group relative rounded-xl border px-3.5 pb-3.5 pt-1 transition-[border-color,box-shadow,opacity,background-color] ${
        hasNsfw
          ? 'border-[#ef444430] bg-[#1a0808] hover:border-[#ef444460] hover:shadow-lg'
          : 'border-border-subtle bg-surface-2/80 hover:border-brand/45 hover:bg-surface-2 hover:shadow-[0_10px_28px_rgba(0,0,0,0.10)]'
      } ${isSelected ? 'border-brand bg-brand/[0.025] shadow-[0_0_0_3px_rgba(0,255,65,0.08)]' : ''} ${
        isDragging ? 'border-brand shadow-2xl' : ''
      }`}
    >
      <div className="flex h-10 items-center justify-center sm:h-8">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          className="group/handle inline-flex h-11 w-11 shrink-0 touch-none select-none items-center justify-center rounded-lg text-text-lo outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-brand active:cursor-grabbing sm:h-8 sm:w-9"
          title="按住并拖动词条"
          aria-label={`拖动词条“${item.title}”调整顺序`}
        >
          <span className="grid h-6 w-8 cursor-grab grid-cols-3 grid-rows-2 place-items-center rounded-md border border-border bg-surface-1 shadow-sm transition-[border-color,background-color,box-shadow] group-hover/handle:border-brand/70 group-hover/handle:bg-brand/5 group-hover/handle:shadow-[0_0_0_3px_rgba(0,255,65,0.06)] group-active/handle:cursor-grabbing">
            {Array.from({ length: 6 }).map((_, index) => (
              <span key={index} className="h-0.5 w-0.5 rounded-full bg-current" />
            ))}
          </span>
        </button>
      </div>

      <div className="flex items-start justify-between gap-3">
        <h4 className={`min-w-0 flex-1 font-mono text-xs leading-5 ${hasNsfw ? 'text-danger' : 'text-brand'}`}>
          {item.title}
        </h4>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(item.id);
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-md px-2 font-mono text-[10px] text-text-body transition-colors hover:bg-brand/5 hover:text-brand sm:min-h-8"
          >
            编辑
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(item.id);
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-md px-2 font-mono text-[10px] text-text-lo transition-colors hover:bg-danger/5 hover:text-danger sm:min-h-8"
          >
            删除
          </button>
        </div>
      </div>

      {displayLabels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {displayLabels.map((label) => {
            const definition = LABEL_DEFS.find((entry) => entry.key === label);
            const categoryColor = LABEL_CATEGORIES.find((category) => category.key === definition?.category)?.color ?? '#6b7280';
            return (
              <span
                key={label}
                className="rounded-full border px-1.5 py-0.5 font-mono text-[9px] leading-tight"
                style={{
                  color: categoryColor,
                  borderColor: `${categoryColor}40`,
                  background: `${categoryColor}08`,
                }}
              >
                {definition?.emoji && <span className="mr-0.5">{definition.emoji}</span>}
                {label}
              </span>
            );
          })}
        </div>
      )}

      {item.desc && (
        <p className="mt-1.5 line-clamp-2 select-text font-mono text-[11px] leading-relaxed text-text-hi">
          {item.desc}
        </p>
      )}

      <p className="mt-2 font-mono text-[10px] text-text-lo">
        拖动上方把手排序<span className="hidden md:inline"> · 双击卡片编辑</span>
      </p>
    </div>
  );
}
