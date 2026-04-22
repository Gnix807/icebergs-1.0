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
      <div className="flex items-center justify-center h-64">
        <div className="text-[#6b7280]">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (!iceberg) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[#6b7280]">初始化中...</div>
      </div>
    );
  }

  // 草稿恢复提示
  if (showRecovery && draftToRecover) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="p-8 bg-[#121212] border border-[#f59e0b] rounded">
          <h2 className="text-xl font-mono mb-4">
            <span className="text-[#f59e0b]">!</span> 发现未保存的草稿
          </h2>
          <p className="text-[#9ca3af] mb-2">
            标题: <span className="text-[#e5e5e5]">{draftToRecover.title}</span>
          </p>
          <p className="text-[#6b7280] text-sm mb-6">
            上次保存: {draftToRecover.savedAt ? new Date(draftToRecover.savedAt).toLocaleString() : '未知'}
          </p>
          <div className="flex gap-4">
            <button
              onClick={handleRecoverDraft}
              className="px-6 py-3 bg-[#00FF41] text-[#0A0A0A] font-medium rounded hover:bg-[#00CC33] transition-colors"
            >
              恢复草稿
            </button>
            <button
              onClick={handleDiscardDraft}
              className="px-6 py-3 border border-[#2A2A2A] rounded hover:border-[#ef4444] hover:text-[#ef4444] transition-colors"
            >
              丢弃草稿
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-8 p-6 bg-[#121212] border border-[#2A2A2A] rounded">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-mono">
            <span className="text-[#00FF41]">#</span> 冰山图编辑器
          </h1>
          <div className="text-xs text-[#6b7280]">
            {isSaving ? (
              <span className="text-[#3b82f6]">● 保存中...</span>
            ) : isDirty ? (
              <span className="text-[#f59e0b]">● 未保存</span>
            ) : (
              <span className="text-[#22c55e]">● 已保存</span>
            )}
            {lastSaved && <span className="ml-2">{lastSaved.toLocaleTimeString()}</span>}
          </div>
        </div>
        <input
          type="text"
          value={iceberg.title}
          onChange={(e) => {
            updateTitle(e.target.value);
            // 标题变化时，若 ID 还未手动输入过，自动建议
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
          className="w-full px-4 py-3 bg-[#0A0A0A] border border-[#2A2A2A] rounded font-mono text-xl focus:border-[#00FF41] focus:outline-none"
          placeholder="冰山图标题"
        />

        {/* 冰山图 ID */}
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[#4b5563] flex-shrink-0">ID</span>
            <span className="text-xs font-mono text-[#2A2A2A] flex-shrink-0">/iceberg/</span>
            {iceberg.id.startsWith('temp_') ? (
              <input
                type="text"
                value={customSlug}
                onChange={(e) => {
                  slugTouched.current = true;
                  handleSlugChange(e.target.value);
                }}
                className={`flex-1 px-3 py-1.5 bg-[#0A0A0A] border font-mono text-sm focus:outline-none transition-colors ${
                  slugError ? 'border-[#ef4444] focus:border-[#ef4444]' : 'border-[#2A2A2A] focus:border-[#00FF41]'
                }`}
                placeholder="my-iceberg-id"
                spellCheck={false}
              />
            ) : (
              <span className="flex-1 px-3 py-1.5 font-mono text-sm text-[#6b7280] bg-[#050608] border border-[#1f2937]">
                {iceberg.slug || iceberg.id}
              </span>
            )}
          </div>
          {iceberg.id.startsWith('temp_') && (
            <p className={`mt-1 ml-[calc(1rem+4.5rem)] text-[11px] font-mono ${slugError ? 'text-[#ef4444]' : 'text-[#374151]'}`}>
              {slugError ?? '字母、数字、连字符(-)或下划线(_)，创建后不可修改'}
            </p>
          )}
        </div>

        <textarea
          value={iceberg.description || ''}
          onChange={(e) => updateDescription(e.target.value)}
          className="w-full mt-4 px-4 py-3 bg-[#0A0A0A] border border-[#2A2A2A] rounded focus:border-[#00FF41] focus:outline-none resize-none"
          rows={2}
          placeholder="简短描述 (可选)"
        />
      </header>

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
          <div className="space-y-6">
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

      <button
        onClick={handleAddTier}
        className="btn-primary mt-6 w-full py-4 border-2 border-dashed border-[#2A2A2A] rounded font-mono text-[#6b7280] hover:border-[#00FF41] hover:text-[#00FF41] transition-colors"
      >
        + 添加层级
      </button>

      <div className="mt-8 flex justify-between gap-4">
        {/* 左侧：危险操作 */}
        <div>
          {!iceberg.id.startsWith('temp_') && (
            <button
              onClick={() => { setDeleteConfirmText(''); setShowDeleteConfirm(true); }}
              className="btn-danger px-4 py-3 border border-[#2A2A2A] font-mono text-sm text-[#4b5563] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors"
            >
              删除冰山图
            </button>
          )}
        </div>
        {/* 右侧：保存 / 提交 */}
        <div className="flex gap-4">
          <button
            onClick={handleSave}
            className="btn-primary px-6 py-3 border border-[#2A2A2A] rounded hover:border-[#00FF41] hover:text-[#00FF41] transition-colors"
          >
            保存草稿
          </button>
          <button
            onClick={() => handleSubmit()}
            disabled={isSubmitting}
            className="btn-primary px-6 py-3 bg-[#00FF41] text-[#0A0A0A] font-medium rounded hover:bg-[#00CC33] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '提交中...' : '提交审核'}
          </button>
        </div>
      </div>

      {/* 删除确认弹窗 */}
      {deleteMounted && (
        <div className={`${deleteLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4`}>
          <div className={`${deleteLeaving ? 'modal-content-out' : 'modal-content'} bg-[#0d0f14] border border-[#ef444440] w-full max-w-sm p-6 font-mono`}>
            <h2 className="text-base mb-1">
              <span className="text-[#ef4444]">[ !</span> 删除冰山图 <span className="text-[#ef4444]">]</span>
            </h2>
            <p className="text-xs text-[#6b7280] mb-4 leading-relaxed">
              此操作不可撤销。所有层级和词条将被永久删除。
            </p>
            <p className="text-xs text-[#9ca3af] mb-2">
              请输入冰山图标题以确认：
            </p>
            <p className="text-xs text-[#e5e5e5] mb-3 px-2 py-1 bg-[#0a0c10] border border-[#2A2A2A] truncate">
              {iceberg.title}
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="输入标题确认"
              className="w-full px-3 py-2 mb-4 bg-[#050608] border border-[#2A2A2A] text-sm text-[#e5e5e5] focus:border-[#ef4444] focus:outline-none"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={isDeleting || deleteConfirmText !== iceberg.title}
                className="btn-danger flex-1 py-2 border border-[#ef4444] text-[#ef4444] text-sm hover:bg-[#ef444420] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isDeleting ? '删除中...' : '确认删除'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-ghost flex-1 py-2 border border-[#2A2A2A] text-[#4b5563] text-sm hover:text-[#9ca3af] transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 自查清单模态框 */}
      {checklistMounted && (
        <div className={`${checklistLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${checklistLeaving ? 'modal-content-out' : 'modal-content'} bg-[#0d0f14] border border-[#2A2A2A] rounded-lg w-full max-w-md p-6 font-mono`}>
            <h2 className="text-lg mb-4">
              <span className="text-[#00FF41]">[ </span>
              发布前自查
              <span className="text-[#00FF41]"> ]</span>
            </h2>

            <ul className="space-y-2 mb-6">
              {checklistItems.map(item => (
                <li key={item.key} className="flex items-start gap-3 text-sm">
                  <span className={item.pass ? 'text-[#22c55e] mt-0.5' : 'text-[#ef4444] mt-0.5'}>
                    {item.pass ? '✓' : '✗'}
                  </span>
                  <span className={item.pass ? 'text-[#9ca3af]' : 'text-[#e5e5e5]'}>
                    {item.pass ? item.label : (item.hint ?? item.label)}
                  </span>
                </li>
              ))}
            </ul>

            {/* NSFW 确认复选框（仅当有 NSFW 且未确认时显示） */}
            {checklistItems.some(i => i.key === 'nsfw' && !i.pass) && (
              <label className="flex items-center gap-3 mb-6 cursor-pointer select-none">
                <span
                  onClick={() => setNsfwConfirmed(v => !v)}
                  className={`w-4 h-4 border rounded flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors ${
                    nsfwConfirmed
                      ? 'bg-[#00FF41] border-[#00FF41]'
                      : 'border-[#4b5563] hover:border-[#00FF41]'
                  }`}
                >
                  {nsfwConfirmed && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="#0A0A0A" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  )}
                </span>
                <span className="text-sm text-[#9ca3af]">
                  我确认此冰山图包含 NSFW 内容，将进入专项审核队列
                </span>
              </label>
            )}

            {checklistItems.every(i => i.pass) || (
              checklistItems.every(i => i.pass || (i.key === 'nsfw' && nsfwConfirmed))
            ) ? (
              <div className="flex gap-3">
                <button
                  onClick={() => setShowChecklist(false)}
                  className="flex-1 py-2 border border-[#2A2A2A] rounded text-sm hover:border-[#6b7280] transition-colors"
                >
                  返回编辑
                </button>
                <button
                  onClick={() => handleSubmit(nsfwConfirmed)}
                  disabled={isSubmitting}
                  className="flex-1 py-2 bg-[#00FF41] text-[#0A0A0A] rounded text-sm font-medium hover:bg-[#00CC33] transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? '提交中...' : '确认提交'}
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => setShowChecklist(false)}
                  className="flex-1 py-2 border border-[#2A2A2A] rounded text-sm hover:border-[#6b7280] transition-colors"
                >
                  返回修改
                </button>
                <div className="flex-1 py-2 border border-[#374151] rounded text-sm text-center text-[#6b7280] cursor-not-allowed">
                  仍有未通过项
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
