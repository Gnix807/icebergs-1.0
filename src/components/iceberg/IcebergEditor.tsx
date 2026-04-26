import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { ChecklistItem } from '../../lib/types';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import * as dndCore from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { TierCard } from './TierCard';
import { useIcebergStore, type Tier, type Item } from '../../stores/icebergStore';
import { toast } from '../ui/Toast';

const { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } = dndCore;
type DragEndEvent = dndCore.DragEndEvent;

const EMPTY_ICEBERG = {
  id: 'new',
  slug: '',
  title: '未命名冰山图',
  description: '',
  authorId: '',
  status: 'DRAFT' as const,
  viewCount: 0,
  tiers: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const LOCALSTORAGE_KEY = 'iceberg_draft';

interface IcebergEditorProps {
  icebergId?: string;
}

export function IcebergEditor({ icebergId }: IcebergEditorProps) {
  const {
    iceberg,
    isDirty,
    lastSaved,
    setIceberg,
    updateTitle,
    updateDescription,
    addTier,
    updateTier,
    removeTier,
    addItem,
    updateItem,
    removeItem,
    moveItem,
    setDirty,
    setLastSaved,
  } = useIcebergStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [draftToRecover, setDraftToRecover] = useState<Iceberg | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { mounted: deleteMounted, isLeaving: deleteLeaving } = useModalAnimation(showDeleteConfirm);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);

  const SLUG_RE = /^[a-zA-Z0-9_-]{2,60}$/;

  function validateSlug(val: string): string | null {
    if (!val) return 'ID 不能为空';
    if (!SLUG_RE.test(val)) return 'ID 只能含字母、数字、连字符(-)或下划线(_)，长度 2-60';
    return null;
  }

  function handleSlugChange(val: string) {
    setCustomSlug(val);
    setSlugError(validateSlug(val));
  }

  // 新建时：标题变化自动填充 ID 建议（仅当 ID 还未手动修改时）
  const slugTouched = useRef(false);

  // 自查清单模态框
  const [showChecklist, setShowChecklist] = useState(false);
  const { mounted: checklistMounted, isLeaving: checklistLeaving } = useModalAnimation(showChecklist);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [nsfwConfirmed, setNsfwConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 初始化数据：新建时始终重置 store，避免残留旧冰山图
  useEffect(() => {
    if (!icebergId) {
      // 创建新冰山图 — 强制清空 store
      setIceberg({ ...EMPTY_ICEBERG, id: `temp_${Date.now()}` });
    } else if (!iceberg) {
      // 编辑模式但 store 为空时填充占位，等待 fetch 完成
      setIceberg({ ...EMPTY_ICEBERG, id: `temp_${Date.now()}` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 检查 localStorage 是否有未完成的草稿
  useEffect(() => {
    if (!icebergId || icebergId !== 'new') return;

    const savedDraft = localStorage.getItem(LOCALSTORAGE_KEY);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.title && draft.title !== '未命名冰山图') {
          setDraftToRecover(draft);
          setShowRecovery(true);
        }
      } catch {
        // ignore parse errors
      }
    }
  }, [icebergId]);

  // 恢复草稿
  const handleRecoverDraft = () => {
    if (draftToRecover) {
      setIceberg(draftToRecover);
      setDirty(true);
      setShowRecovery(false);
    }
  };

  // 丢弃草稿
  const handleDiscardDraft = () => {
    localStorage.removeItem(LOCALSTORAGE_KEY);
    setShowRecovery(false);
    setDraftToRecover(null);
  };

  // 保存到 localStorage
  useEffect(() => {
    if (!iceberg || !isDirty) return;

    const savedDraft = {
      ...iceberg,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(savedDraft));
  }, [iceberg, isDirty]);

  // 加载现有冰山图
  useEffect(() => {
    if (!icebergId || icebergId === 'new') return;
    if (iceberg && !iceberg.id.startsWith('temp_')) return;

    setLoading(true);
    setError(null);

    fetch(`/api/icebergs/${icebergId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setIceberg(data.data);
        } else {
          setError(data.error?.message || '加载失败');
        }
      })
      .catch((err) => {
        setError('加载失败');
        console.error('加载失败:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [icebergId, iceberg]);

  // 自动保存 (debounce 2秒)
  useEffect(() => {
    if (!isDirty || !iceberg) return;

    // 清除之前的定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // 设置新的定时器，2秒后自动保存
    autoSaveTimerRef.current = setTimeout(async () => {
      // 新建模式下 ID 未填写或不合法，不触发自动保存
      if (iceberg.id.startsWith('temp_') && validateSlug(customSlug)) return;

      setIsSaving(true);
      try {
        if (iceberg.id.startsWith('temp_')) {
          const res = await fetch('/api/icebergs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: iceberg.title, description: iceberg.description, slug: customSlug }),
          });
          const data = await res.json();
          if (data.success) {
            setIceberg(data.data);
            setDirty(false);
            setLastSaved(new Date());
            localStorage.removeItem(LOCALSTORAGE_KEY);
          }
        } else {
          await fetch(`/api/icebergs/${iceberg.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: iceberg.title, description: iceberg.description, status: iceberg.status }),
          });
          setDirty(false);
          setLastSaved(new Date());
          localStorage.removeItem(LOCALSTORAGE_KEY);
        }
      } catch (err) {
        console.error('自动保存失败:', err);
      } finally {
        setIsSaving(false);
      }
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [isDirty, iceberg]);

  // 获取真实的 iceberg id（如果是 temp_ 需要先创建）
  const getRealIcebergId = useCallback(async () => {
    if (!iceberg) return null;

    if (iceberg.id.startsWith('temp_')) {
      const slugErr = validateSlug(customSlug);
      if (slugErr) { toast(slugErr, 'error'); return null; }
      const res = await fetch('/api/icebergs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: iceberg.title, description: iceberg.description, slug: customSlug }),
      });
      const data = await res.json();
      if (data.success) {
        setIceberg(data.data);
        return data.data.id;
      }
      toast(data.error?.message || '创建失败', 'error');
      return null;
    }
    return iceberg.id;
  }, [iceberg, setIceberg, customSlug]);

  // 确保 tier 已经同步到服务器
  const ensureTierSynced = useCallback(async (tier: Tier) => {
    if (tier.id.startsWith('tier_')) {
      // 本地 tier，需要同步到服务器
      const icebergId = await getRealIcebergId();
      if (!icebergId) return null;

      const res = await fetch(`/api/icebergs/${icebergId}/tiers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tier.name, order: tier.order }),
      });
      const data = await res.json();
      if (data.success) {
        return data.data; // 返回服务器的 tier
      }
      return null;
    }
    return tier; // 已经是服务器的数据
  }, [getRealIcebergId]);

  // 添加层级
  const handleAddTier = async () => {
    if (!iceberg) return;

    const newTier: Tier = {
      id: `tier_${Date.now()}`,
      name: `Tier ${iceberg.tiers.length + 1}`,
      order: iceberg.tiers.length,
      icebergId: iceberg.id,
      items: [],
    };

    // 本地添加
    addTier(newTier);
    setDirty(true);

    // 如果已经有真实的 iceberg id，同步到服务器
    if (!iceberg.id.startsWith('temp_')) {
      try {
        const res = await fetch(`/api/icebergs/${iceberg.id}/tiers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newTier.name, order: newTier.order }),
        });
        const data = await res.json();
        if (data.success) {
          // 更新本地 id 为服务器返回的 id
          const currentIceberg = useIcebergStore.getState().iceberg;
          if (currentIceberg) {
            const updatedTiers = currentIceberg.tiers.map((t) =>
              t.id === newTier.id ? { ...t, id: data.data.id } : t
            );
            setIceberg({ ...currentIceberg, tiers: updatedTiers });
          }
        }
      } catch (err) {
        console.error('创建层级失败:', err);
      }
    }
  };

  // 更新层级名称
  const handleUpdateTier = async (tierId: string, updates: Partial<Tier>) => {
    updateTier(tierId, updates);
    setDirty(true);

    // 如果是服务器数据，同步更新
    if (!tierId.startsWith('tier_') && (updates.name !== undefined || updates.desc !== undefined)) {
      try {
        await fetch(`/api/tiers/${tierId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: updates.name, desc: updates.desc }),
        });
      } catch (err) {
        console.error('更新层级失败:', err);
      }
    }
  };

  // 删除层级
  const handleDeleteTier = async (tierId: string) => {
    removeTier(tierId);
    setDirty(true);

    if (!tierId.startsWith('tier_')) {
      try {
        await fetch(`/api/tiers/${tierId}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.error('删除层级失败:', err);
      }
    }
  };

  // 添加条目
  const handleAddItem = async (tierId: string, item: Item) => {
    addItem(tierId, item);
    setDirty(true);

    // 找到对应的 tier
    const tier = iceberg?.tiers.find((t) => t.id === tierId);
    if (!tier) return;

    // 如果 tier 是本地数据，先同步
    let realTierId = tierId;
    if (tierId.startsWith('tier_')) {
      const syncedTier = await ensureTierSynced(tier);
      if (syncedTier) {
        realTierId = syncedTier.id;
      } else {
        return;
      }
    }

    try {
      const res = await fetch(`/api/tiers/${realTierId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.title, desc: item.desc, order: item.order, labels: item.labels ?? [] }),
      });
      const data = await res.json();
      if (data.success) {
        // 更新本地 id
        const currentIceberg = useIcebergStore.getState().iceberg;
        if (currentIceberg) {
          const updatedTiers = currentIceberg.tiers.map((t) =>
            t.id === tierId
              ? {
                  ...t,
                  items: t.items.map((i) =>
                    i.id === item.id ? { ...i, id: data.data.id } : i
                  ),
                }
              : t
          );
          setIceberg({ ...currentIceberg, tiers: updatedTiers });
        }
      }
    } catch (err) {
      console.error('创建条目失败:', err);
    }
  };

  // 更新条目
  const handleUpdateItem = async (itemId: string, updates: Partial<Item>) => {
    updateItem(itemId, updates);
    setDirty(true);

    if (!itemId.startsWith('item_') && (updates.title !== undefined || updates.desc !== undefined || updates.labels !== undefined)) {
      try {
        await fetch(`/api/items/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: updates.title,
            desc: updates.desc,
            labels: updates.labels,
          }),
        });
      } catch (err) {
        console.error('更新条目失败:', err);
      }
    }
  };

  // 删除条目
  const handleDeleteItem = async (itemId: string) => {
    removeItem(itemId);
    setDirty(true);

    if (!itemId.startsWith('item_')) {
      try {
        await fetch(`/api/items/${itemId}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.error('删除条目失败:', err);
      }
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    let fromTierId: string | null = null;
    let toTierId: string | null = null;

    iceberg?.tiers.forEach((tier) => {
      if (tier.items.some((item) => item.id === activeId)) fromTierId = tier.id;
      if (tier.items.some((item) => item.id === overId)) toTierId = tier.id;
    });

    if (fromTierId && toTierId && fromTierId === toTierId) {
      const tier = iceberg?.tiers.find((t) => t.id === fromTierId);
      if (!tier) return;
      const oldIndex = tier.items.findIndex((i) => i.id === activeId);
      const newIndex = tier.items.findIndex((i) => i.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newItems = [...tier.items];
        const [removed] = newItems.splice(oldIndex, 1);
        newItems.splice(newIndex, 0, removed);
        // 更新 order 字段
        const orderedItems = newItems.map((item, idx) => ({ ...item, order: idx }));
        updateTier(fromTierId, { items: orderedItems });
        setDirty(true);
        // 同步到服务器
        syncItemOrders(fromTierId, orderedItems);
      }
    } else if (fromTierId && toTierId) {
      const fromTier = iceberg?.tiers.find((t) => t.id === fromTierId);
      const toTier = iceberg?.tiers.find((t) => t.id === toTierId);
      const newIndex = toTier?.items.findIndex((i) => i.id === overId) ?? 0;
      moveItem(activeId, fromTierId, toTierId, newIndex);
      setDirty(true);
      // 同步移动的 item
      const movedItem = fromTier?.items.find((i) => i.id === activeId);
      if (movedItem && !movedItem.id.startsWith('item_')) {
        syncItemOrder(activeId, toTierId, newIndex);
      }
      // 重新排序目标 tier
      if (toTier) {
        const updatedToTier = { ...toTier, items: [...toTier.items] };
        const movedItemInTarget = updatedToTier.items.find((i) => i.id === activeId);
        if (movedItemInTarget) {
          updatedToTier.items = updatedToTier.items.filter((i) => i.id !== activeId);
          updatedToTier.items.splice(newIndex, 0, movedItemInTarget);
          updatedToTier.items = updatedToTier.items.map((item, idx) => ({ ...item, order: idx }));
          syncItemOrders(toTierId, updatedToTier.items);
        }
      }
    }
  };

  // 同步单个 item 的 order 到服务器
  const syncItemOrder = async (itemId: string, tierId: string, order: number) => {
    if (itemId.startsWith('item_')) return;
    try {
      await fetch(`/api/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
    } catch (err) {
      console.error('同步 item order 失败:', err);
    }
  };

  // 同步 tier 内所有 items 的 order 到服务器
  const syncItemOrders = async (tierId: string, items: Item[]) => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.id.startsWith('item_')) {
        await syncItemOrder(item.id, tierId, i);
      }
    }
  };

  const handleSave = async () => {
    if (!iceberg) return;
    try {
      if (iceberg.id.startsWith('temp_')) {
        const slugErr = validateSlug(customSlug);
        if (slugErr) { setSlugError(slugErr); toast(slugErr, 'error'); return; }
        const res = await fetch('/api/icebergs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: iceberg.title, description: iceberg.description, slug: customSlug }),
        });
        const data = await res.json();
        if (data.success) {
          setIceberg(data.data);
          localStorage.removeItem(LOCALSTORAGE_KEY);
        } else {
          toast(data.error?.message || '保存失败', 'error');
        }
      } else {
        const res = await fetch(`/api/icebergs/${iceberg.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: iceberg.title, description: iceberg.description, status: iceberg.status }),
        });
        const data = await res.json();
        localStorage.removeItem(LOCALSTORAGE_KEY);
        if (data.success) {
          toast('草稿已保存');
        } else {
          toast(data.error?.message || '保存失败', 'error');
        }
      }
    } catch (err) {
      console.error('保存失败:', err);
      toast('保存失败，请重试', 'error');
    }
  };

  /**
   * "提交审核"按钮处理逻辑。
   *
   * 1. 若 iceberg 还是 temp_（从未保存），先创建草稿。
   * 2. 调用 POST /api/icebergs/[id]/submit，传入 nsfwConfirmed。
   * 3. 若后端返回 422（自查清单未通过），弹出清单模态框。
   * 4. 若成功，toast 提示并跳转到详情页。
   */
  const handleSubmit = async (confirmedNsfw = nsfwConfirmed) => {
    if (!iceberg) return;
    setIsSubmitting(true);
    try {
      // 确保 iceberg 已持久化
      let icebergId = iceberg.id;
      if (icebergId.startsWith('temp_')) {
        const slugErr = validateSlug(customSlug);
        if (slugErr) { setSlugError(slugErr); toast(slugErr, 'error'); return; }
        const res = await fetch('/api/icebergs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: iceberg.title, description: iceberg.description, slug: customSlug }),
        });
        const data = await res.json();
        if (!data.success) {
          toast(data.error?.message || '创建草稿失败', 'error');
          return;
        }
        setIceberg(data.data);
        localStorage.removeItem(LOCALSTORAGE_KEY);
        icebergId = data.data.id;
      }

      const res = await fetch(`/api/icebergs/${icebergId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nsfwConfirmed: confirmedNsfw }),
      });
      const data = await res.json();

      if (res.status === 422) {
        // 自查清单有未通过项，展示模态框
        setChecklistItems(data.error?.details ?? []);
        setShowChecklist(true);
        return;
      }

      if (data.success) {
        setShowChecklist(false);
        toast(data.data.message || '已提交，等待编辑审核');
        window.location.href = `/iceberg/${iceberg.slug || icebergId}`;
      } else {
        toast(data.error?.message || '提交失败', 'error');
      }
    } catch {
      toast('提交失败，请重试', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!iceberg || iceberg.id.startsWith('temp_')) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/icebergs/${iceberg.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        localStorage.removeItem(LOCALSTORAGE_KEY);
        window.location.href = '/iceberg/list';
      } else {
        toast(data.error?.message || '删除失败', 'error');
        setShowDeleteConfirm(false);
      }
    } catch {
      toast('删除失败，请重试', 'error');
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 font-mono">
        <span className="text-[#00FF41] animate-pulse">// 加载中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 font-mono">
        <span className="text-[#ef4444]">! 错误：{error}</span>
      </div>
    );
  }

  if (!iceberg) {
    return (
      <div className="flex items-center justify-center h-64 font-mono">
        <span className="text-[#3d444d] animate-pulse">// 初始化中...</span>
      </div>
    );
  }

  // 草稿恢复提示
  if (showRecovery && draftToRecover) {
    return (
      <div className="max-w-5xl mx-auto px-2 font-mono">
        <div className="border border-[#f59e0b40] bg-[#0d1117]">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#f59e0b30] bg-[#f59e0b08]">
            <span className="text-[#f59e0b] text-xs">!</span>
            <span className="text-xs text-[#f59e0b]">草稿::恢复</span>
          </div>
          <div className="p-6">
            <p className="text-xs text-[#6e7681] mb-1">// 标题</p>
            <p className="text-sm text-[#cdd9e5] mb-4 px-3 py-2 bg-[#161b22] border border-[#21262d]">{draftToRecover.title}</p>
            <p className="text-xs text-[#3d444d] mb-6">
              // 上次保存：{draftToRecover.savedAt ? new Date(draftToRecover.savedAt).toLocaleString() : '未知'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleRecoverDraft}
                className="px-5 py-2 bg-[#00FF41] text-[#0A0A0A] text-xs font-bold hover:bg-[#00CC33] transition-colors"
              >
                [ 恢复草稿 ]
              </button>
              <button
                onClick={handleDiscardDraft}
                className="px-5 py-2 border border-[#30363d] text-xs text-[#6e7681] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors"
              >
                [ 丢弃草稿 ]
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-2">
      {/* ── 编辑器头部 ── */}
      <header className="mb-6 border border-[#21262d] bg-[#0d1117]">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#21262d] bg-[#161b22]">
          <div className="flex items-center gap-2">
            <span className="text-[#00FF41] font-mono text-xs">▶</span>
            <span className="font-mono text-xs text-[#cdd9e5] tracking-widest">冰山图::编辑器</span>
          </div>
          <div className="font-mono text-[11px]">
            {isSaving ? (
              <span className="text-[#3b82f6]">[ ● 保存中... ]</span>
            ) : isDirty ? (
              <span className="text-[#f59e0b]">[ ● 未保存 ]</span>
            ) : (
              <span className="text-[#22c55e]">
                [ ● 已保存{lastSaved ? ` ${lastSaved.toLocaleTimeString()}` : ''} ]
              </span>
            )}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* METADATA 区 */}
          <div>
            <p className="text-[10px] font-mono text-[#3d444d] mb-1.5">// 元数据</p>
            <div className="flex items-center border border-[#21262d] bg-[#0A0A0A] focus-within:border-[#00FF41] transition-colors">
              <span className="px-3 text-[#00FF41] font-mono text-sm select-none flex-shrink-0">›</span>
              <input
                type="text"
                value={iceberg.title}
                onChange={(e) => {
                  updateTitle(e.target.value);
                  if (!slugTouched.current) {
                    const suggested = e.target.value
                      .toLowerCase()
                      .replace(/\s+/g, '-')
                      .replace(/[^a-z0-9_-]/g, '')
                      .replace(/-+/g, '-')
                      .replace(/^-|-$/g, '')
                      .substring(0, 60);
                    setCustomSlug(suggested);
                    setSlugError(suggested ? validateSlug(suggested) : null);
                  }
                }}
                className="flex-1 pr-4 py-3 bg-transparent font-mono text-lg focus:outline-none text-[#cdd9e5] placeholder:text-[#2d333b]"
                placeholder="冰山图标题"
              />
            </div>
          </div>

          {/* SLUG 区 */}
          <div>
            <p className="text-[10px] font-mono text-[#3d444d] mb-1.5">// 地址</p>
            <div className="flex items-center gap-0">
              <span className="px-2 py-2 text-[11px] font-mono text-[#3d444d] bg-[#161b22] border border-[#21262d] border-r-0 flex-shrink-0 select-none">
                /iceberg/
              </span>
              {iceberg.id.startsWith('temp_') ? (
                <input
                  type="text"
                  value={customSlug}
                  onChange={(e) => {
                    slugTouched.current = true;
                    handleSlugChange(e.target.value);
                  }}
                  className={`flex-1 px-3 py-2 bg-[#0A0A0A] border font-mono text-sm focus:outline-none transition-colors ${
                    slugError ? 'border-[#ef4444] focus:border-[#ef4444] text-[#ef4444]' : 'border-[#21262d] focus:border-[#00FF41] text-[#cdd9e5]'
                  }`}
                  placeholder="my-iceberg-id"
                  spellCheck={false}
                />
              ) : (
                <span className="flex-1 px-3 py-2 font-mono text-sm text-[#6e7681] bg-[#050608] border border-[#21262d]">
                  {iceberg.slug || iceberg.id}
                </span>
              )}
            </div>
            {iceberg.id.startsWith('temp_') && (
              <p className={`mt-1 text-[11px] font-mono ${slugError ? 'text-[#ef4444]' : 'text-[#3d444d]'}`}>
                // {slugError ?? '字母、数字、连字符(-)或下划线(_)，创建后不可修改'}
              </p>
            )}
          </div>

          {/* DESCRIPTION 区 */}
          <div>
            <p className="text-[10px] font-mono text-[#3d444d] mb-1.5">// 简介</p>
            <textarea
              value={iceberg.description || ''}
              onChange={(e) => updateDescription(e.target.value)}
              className="w-full px-4 py-3 bg-[#0A0A0A] border border-[#21262d] focus:border-[#00FF41] focus:outline-none resize-none font-mono text-sm text-[#cdd9e5] placeholder:text-[#2d333b] transition-colors"
              rows={3}
              placeholder="// 冰山图简介（可选，支持 Markdown）"
            />
          </div>
        </div>
      </header>

      {/* ── 层级列表 ── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={iceberg.tiers.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {iceberg.tiers.map((tier, index) => (
              <TierCard
                key={tier.id}
                tier={tier}
                tierIndex={index}
                onUpdateTier={handleUpdateTier}
                onDeleteTier={handleDeleteTier}
                onAddItem={handleAddItem}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* ── 添加层级 ── */}
      <button
        onClick={handleAddTier}
        className="mt-4 w-full py-3 border border-dashed border-[#21262d] font-mono text-xs text-[#3d444d] hover:border-[#00FF41] hover:text-[#00FF41] transition-colors"
      >
        [ ++ 添加层级 ]
      </button>

      {/* ── 底部操作栏 ── */}
      <div className="mt-6 flex items-center justify-between border border-[#21262d] bg-[#0d1117] px-4 py-3">
        <div>
          {!iceberg.id.startsWith('temp_') && (
            <button
              onClick={() => { setDeleteConfirmText(''); setShowDeleteConfirm(true); }}
              className="font-mono text-xs text-[#3d444d] border border-[#21262d] px-3 py-2 hover:border-[#ef444460] hover:text-[#ef4444] transition-colors"
            >
              [ 删除 ]
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            className="font-mono text-xs text-[#8b949e] border border-[#30363d] px-4 py-2 hover:border-[#00FF41] hover:text-[#00FF41] transition-colors"
          >
            [ 保存草稿 ]
          </button>
          <button
            onClick={() => handleSubmit()}
            disabled={isSubmitting}
            className="font-mono text-xs bg-[#00FF41] text-[#0A0A0A] font-bold px-4 py-2 hover:bg-[#00CC33] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '[ 提交中... ]' : '[ 提交审核 ]'}
          </button>
        </div>
      </div>

      {/* ── 删除确认弹窗 ── */}
      {deleteMounted && (
        <div className={`${deleteLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4`}>
          <div className={`${deleteLeaving ? 'modal-content-out' : 'modal-content'} bg-[#0d1117] border border-[#ef444440] w-full max-w-sm font-mono`}>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#ef444430] bg-[#ef444408]">
              <span className="text-[#ef4444] text-xs">!</span>
              <span className="text-xs text-[#ef4444]">删除::冰山图</span>
            </div>
            <div className="p-5">
              <p className="text-xs text-[#6e7681] mb-4 leading-relaxed">
                // 此操作不可撤销，所有层级和词条将被永久删除
              </p>
              <p className="text-[11px] text-[#3d444d] mb-2">// 输入冰山图标题以确认</p>
              <p className="text-xs text-[#cdd9e5] mb-3 px-3 py-2 bg-[#161b22] border border-[#21262d] truncate">
                {iceberg.title}
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="输入标题确认"
                className="w-full px-3 py-2 mb-4 bg-[#050608] border border-[#21262d] text-sm text-[#cdd9e5] focus:border-[#ef4444] focus:outline-none placeholder:text-[#2d333b]"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting || deleteConfirmText !== iceberg.title}
                  className="flex-1 py-2 border border-[#ef4444] text-[#ef4444] text-xs hover:bg-[#ef444420] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isDeleting ? '[ 删除中... ]' : '[ 确认删除 ]'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 border border-[#21262d] text-[#3d444d] text-xs hover:text-[#8b949e] transition-colors"
                >
                  [ 取消 ]
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 固定返回按钮 ── */}
      <div className="fixed bottom-8 left-6 z-40 flex flex-col items-start gap-2">
        {showBackConfirm && (
          <div className="bg-[#0d1117] border border-[#f59e0b40] font-mono text-xs p-3 shadow-xl w-44">
            <p className="text-[#f59e0b] mb-2 leading-snug">// 有未保存的内容</p>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => { setShowBackConfirm(false); window.history.length > 1 ? history.back() : (window.location.href = '/'); }}
                className="w-full py-1.5 border border-[#ef444460] text-[#ef4444] hover:bg-[#ef444415] transition-colors"
              >
                [ 确认离开 ]
              </button>
              <button
                onClick={() => setShowBackConfirm(false)}
                className="w-full py-1.5 border border-[#21262d] text-[#6e7681] hover:border-[#8b949e] hover:text-[#8b949e] transition-colors"
              >
                [ 继续编辑 ]
              </button>
            </div>
          </div>
        )}
        <button
          onClick={() => {
            if (isDirty) {
              setShowBackConfirm(v => !v);
            } else {
              window.history.length > 1 ? history.back() : (window.location.href = '/');
            }
          }}
          className={`font-mono text-sm px-5 py-3 border shadow-lg transition-colors ${
            showBackConfirm
              ? 'border-[#f59e0b] text-[#f59e0b] bg-[#0d1117]'
              : 'border-[#30363d] text-[#6e7681] bg-[#0d1117] hover:border-[#00FF41] hover:text-[#00FF41]'
          }`}
        >
          ‹ 返回
        </button>
      </div>

      {/* ── 自查清单模态框 ── */}
      {checklistMounted && (
        <div className={`${checklistLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${checklistLeaving ? 'modal-content-out' : 'modal-content'} bg-[#0d1117] border border-[#30363d] w-full max-w-md font-mono`}>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#21262d] bg-[#161b22]">
              <span className="text-[#00FF41] text-xs">▶</span>
              <span className="text-xs text-[#cdd9e5]">提交::自查清单</span>
            </div>
            <div className="p-5">
              <ul className="space-y-2 mb-6">
                {checklistItems.map(item => (
                  <li key={item.key} className="flex items-start gap-3 text-xs">
                    <span className={`flex-shrink-0 mt-0.5 ${item.pass ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                      {item.pass ? '✓' : '✗'}
                    </span>
                    <span className={item.pass ? 'text-[#6e7681]' : 'text-[#cdd9e5]'}>
                      {item.pass ? item.label : (item.hint ?? item.label)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* NSFW 确认复选框 */}
              {checklistItems.some(i => i.key === 'nsfw' && !i.pass) && (
                <label className="flex items-center gap-3 mb-6 cursor-pointer select-none">
                  <span
                    onClick={() => setNsfwConfirmed(v => !v)}
                    className={`w-4 h-4 border flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors ${
                      nsfwConfirmed ? 'bg-[#00FF41] border-[#00FF41]' : 'border-[#4b5563] hover:border-[#00FF41]'
                    }`}
                  >
                    {nsfwConfirmed && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="#0A0A0A" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    )}
                  </span>
                  <span className="text-xs text-[#8b949e]">
                    // 我确认此冰山图包含 NSFW 内容，将进入专项审核队列
                  </span>
                </label>
              )}

              {checklistItems.every(i => i.pass) || (
                checklistItems.every(i => i.pass || (i.key === 'nsfw' && nsfwConfirmed))
              ) ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowChecklist(false)}
                    className="flex-1 py-2 border border-[#21262d] text-xs text-[#6e7681] hover:border-[#8b949e] hover:text-[#8b949e] transition-colors"
                  >
                    [ 返回 ]
                  </button>
                  <button
                    onClick={() => handleSubmit(nsfwConfirmed)}
                    disabled={isSubmitting}
                    className="flex-1 py-2 bg-[#00FF41] text-[#0A0A0A] text-xs font-bold hover:bg-[#00CC33] transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? '[ 提交中... ]' : '[ 确认提交 ]'}
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowChecklist(false)}
                    className="flex-1 py-2 border border-[#21262d] text-xs text-[#6e7681] hover:border-[#8b949e] hover:text-[#8b949e] transition-colors"
                  >
                    [ 返回修改 ]
                  </button>
                  <div className="flex-1 py-2 border border-[#21262d] text-xs text-center text-[#3d444d] cursor-not-allowed">
                    [ 仍有未通过项 ]
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
