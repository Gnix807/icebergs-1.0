import { useEffect, useState, useCallback, useRef } from 'react';
import { loadDraft, saveDraft, clearDraft } from '../../lib/editorDraft';
import type { ChecklistItem } from '../../lib/types';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import * as dndCore from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { TierCard } from './TierCard';
import { useIcebergStore, type Tier, type Item, type Iceberg } from '../../stores/icebergStore';
import { toast } from '../ui/Toast';
import { ICEBERG_TOPICS, isPresetIcebergTopic, normalizeIcebergTopic } from '../../lib/icebergTopic';

const { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } = dndCore;
type DragEndEvent = dndCore.DragEndEvent;

const DRAFT_STORAGE_PREFIX = 'iceberg_draft_';
const LEGACY_DRAFT_KEY = 'iceberg_draft';
const VERSION_HISTORY_PREFIX = 'iceberg_draft_history_';
const VERSION_HISTORY_LIMIT = 12;

function buildSeedTiers(icebergId: string): Tier[] {
  const now = Date.now();
  return [
    { id: `tier_${now}_0`, name: 'Tier 1', desc: '', order: 0, icebergId, items: [] },
    { id: `tier_${now}_1`, name: 'Tier 2', desc: '', order: 1, icebergId, items: [] },
    { id: `tier_${now}_2`, name: 'Tier 3', desc: '', order: 2, icebergId, items: [] },
  ];
}

function buildEmptyIceberg(tempId: string): Iceberg {
  return {
    id: tempId,
    slug: '',
    title: '未命名冰山图',
    description: '',
    topic: 'general',
    authorId: '',
    status: 'DRAFT',
    viewCount: 0,
    tiers: buildSeedTiers(tempId),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    review: null,
  };
}

function buildFromImport(tempId: string): Iceberg | null {
  try {
    const raw = sessionStorage.getItem('imported_iceberg');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.tiers || !Array.isArray(data.tiers)) return null;
    sessionStorage.removeItem('imported_iceberg');

    const now = Date.now();
    return {
      id: tempId,
      slug: '',
      title: data.title || '导入的冰山图',
      description: data.description || '',
      topic: data.topic || 'general',
      authorId: '',
      status: 'DRAFT',
      viewCount: 0,
      tiers: data.tiers.map((t: any, ti: number) => ({
        id: `tier_${now}_${ti}`,
        name: t.name || `第 ${ti + 1} 层`,
        desc: t.desc || '',
        order: ti,
        icebergId: tempId,
        items: (t.items || []).map((it: any, ii: number) => ({
          id: `item_${now}_${ti}_${ii}`,
          title: it.title || `词条 ${ii + 1}`,
          desc: it.desc || '',
          order: ii,
          tierId: `tier_${now}_${ti}`,
          labels: JSON.stringify(it.labels || []),
        })),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      review: null,
    };
  } catch {
    return null;
  }
}

function buildCreatePayload(target: Iceberg, slug: string) {
  return {
    title: target.title,
    description: target.description,
    topic: target.topic,
    slug,
    tiers: target.tiers.map((tier, tierIndex) => ({
      name: tier.name,
      desc: tier.desc ?? '',
      order: typeof tier.order === 'number' ? tier.order : tierIndex,
      items: tier.items.map((item, itemIndex) => ({
        title: item.title,
        desc: item.desc ?? '',
        order: typeof item.order === 'number' ? item.order : itemIndex,
        labels: item.labels ?? [],
      })),
    })),
  };
}

interface IcebergEditorProps {
  icebergId?: string;
}

type IcebergDraft = Iceberg & { savedAt?: string };
type VersionSource = 'auto' | 'manual' | 'submit';
interface DraftVersion {
  id: string;
  savedAt: string;
  source: VersionSource;
  snapshot: Iceberg;
}

interface SyncFailure {
  key: string;
  message: string;
  method: 'POST' | 'PUT' | 'DELETE';
  url: string;
  body?: Record<string, unknown>;
  attempts: number;
  lastAt: string;
}

export function IcebergEditor({ icebergId }: IcebergEditorProps) {
  const {
    iceberg,
    isDirty,
    lastSaved,
    setIceberg,
    updateTitle,
    updateDescription,
    updateTopic,
    addTier,
    updateTier,
    removeTier,
    reorderTiers,
    addItem,
    updateItem,
    removeItem,
    setDirty,
    setLastSaved,
  } = useIcebergStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [draftToRecover, setDraftToRecover] = useState<IcebergDraft | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { mounted: deleteMounted, isLeaving: deleteLeaving } = useModalAnimation(showDeleteConfirm);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);
  const [useCustomTopic, setUseCustomTopic] = useState(false);
  const [customTopicInput, setCustomTopicInput] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versionHistory, setVersionHistory] = useState<DraftVersion[]>([]);
  const { mounted: historyMounted, isLeaving: historyLeaving } = useModalAnimation(showVersionHistory);
  const [syncFailures, setSyncFailures] = useState<SyncFailure[]>([]);
  const creatingIcebergRef = useRef<Promise<Iceberg | null> | null>(null);
  const tiersScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollTiersUp, setCanScrollTiersUp] = useState(false);
  const [canScrollTiersDown, setCanScrollTiersDown] = useState(false);

  const SLUG_RE = /^[a-zA-Z0-9_-]{2,60}$/;

  function validateSlug(val: string): string | null {
    if (!val) return 'ID 不能为空';
    if (!SLUG_RE.test(val)) return 'ID 只能含字母、数字、连字符(-)或下划线(_)，长度 2-60';
    return null;
  }

  function withTopic(target: Iceberg): Iceberg {
    return {
      ...target,
      topic: normalizeIcebergTopic(target.topic),
    };
  }

  function handleSlugChange(val: string) {
    setCustomSlug(val);
    setSlugError(validateSlug(val));
  }

  const getDraftStorageKey = useCallback((target: Iceberg | null = null) => {
    if (target && !target.id.startsWith('temp_')) return `${DRAFT_STORAGE_PREFIX}${target.id}`;
    if (icebergId && icebergId !== 'new' && icebergId !== 'imported') return `${DRAFT_STORAGE_PREFIX}${icebergId}`;
    return `${DRAFT_STORAGE_PREFIX}new`;
  }, [icebergId]);

  const getHistoryKey = useCallback((target: Iceberg | null = null) => {
    if (target && !target.id.startsWith('temp_')) {
      return `${VERSION_HISTORY_PREFIX}${target.id}`;
    }
    return `${VERSION_HISTORY_PREFIX}${icebergId ?? 'new'}`;
  }, [icebergId]);

  const loadVersionHistory = useCallback((target: Iceberg | null = null) => {
    try {
      const raw = localStorage.getItem(getHistoryKey(target));
      if (!raw) {
        setVersionHistory([]);
        return;
      }
      const parsed = JSON.parse(raw) as DraftVersion[];
      if (!Array.isArray(parsed)) {
        setVersionHistory([]);
        return;
      }
      const clean = parsed.filter((entry) =>
        entry &&
        typeof entry.id === 'string' &&
        typeof entry.savedAt === 'string' &&
        entry.snapshot &&
        typeof entry.snapshot.id === 'string',
      );
      setVersionHistory(clean.slice(0, VERSION_HISTORY_LIMIT));
    } catch {
      setVersionHistory([]);
    }
  }, [getHistoryKey]);

  const pushVersionSnapshot = useCallback((target: Iceberg, source: VersionSource) => {
    try {
      const key = getHistoryKey(target);
      const raw = localStorage.getItem(key);
      const prev = raw ? (JSON.parse(raw) as DraftVersion[]) : [];
      const now = new Date().toISOString();
      const nextEntry: DraftVersion = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        savedAt: now,
        source,
        snapshot: {
          ...target,
          tiers: target.tiers.map((tier) => ({
            ...tier,
            items: tier.items.map((item) => ({ ...item })),
          })),
        },
      };
      const merged = [nextEntry, ...prev].slice(0, VERSION_HISTORY_LIMIT);
      localStorage.setItem(key, JSON.stringify(merged));
      setVersionHistory(merged);
    } catch {
      // ignore localStorage failures
    }
  }, [getHistoryKey]);

  const queueSyncFailure = useCallback((failure: Omit<SyncFailure, 'attempts' | 'lastAt'>) => {
    const now = new Date().toISOString();
    setSyncFailures((prev) => {
      const hit = prev.find((item) => item.key === failure.key);
      if (hit) {
        return prev.map((item) =>
          item.key === failure.key
            ? { ...item, message: failure.message, method: failure.method, url: failure.url, body: failure.body, attempts: item.attempts + 1, lastAt: now }
            : item,
        );
      }
      return [{ ...failure, attempts: 1, lastAt: now }, ...prev].slice(0, 24);
    });
  }, []);

  const clearSyncFailure = useCallback((key: string) => {
    setSyncFailures((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const retrySyncFailure = useCallback(async (key: string) => {
    const target = syncFailures.find((item) => item.key === key);
    if (!target) return;
    try {
      const res = await fetch(target.url, {
        method: target.method,
        headers: target.body ? { 'Content-Type': 'application/json' } : undefined,
        body: target.body ? JSON.stringify(target.body) : undefined,
      });
      if (res.ok || res.status === 404) {
        clearSyncFailure(key);
        toast('已完成一次失败同步重试');
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch {
      setSyncFailures((prev) =>
        prev.map((item) => item.key === key ? { ...item, attempts: item.attempts + 1, lastAt: new Date().toISOString() } : item),
      );
      toast('重试失败，请稍后再试', 'error');
    }
  }, [syncFailures, clearSyncFailure]);

  const retryAllSyncFailures = useCallback(async () => {
    for (const failure of syncFailures) {
      // eslint-disable-next-line no-await-in-loop
      await retrySyncFailure(failure.key);
    }
  }, [syncFailures, retrySyncFailure]);
  const clearAllSyncFailures = useCallback(() => {
    setSyncFailures([]);
  }, []);

  const restoreVersion = (entry: DraftVersion) => {
    setIceberg(withTopic(entry.snapshot));
    setDirty(true);
    setLastSaved(new Date(entry.savedAt));
    setShowVersionHistory(false);
    toast(`已恢复到 ${new Date(entry.savedAt).toLocaleString()} 的版本`);
  };

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
    if (icebergId === 'imported') {
      const tempId = `temp_${Date.now()}`;
      const imported = buildFromImport(tempId);
      setIceberg(imported || buildEmptyIceberg(tempId));
    } else if (!icebergId) {
      const tempId = `temp_${Date.now()}`;
      setIceberg(buildEmptyIceberg(tempId));
    } else if (!iceberg) {
      const tempId = `temp_${Date.now()}`;
      setIceberg(buildEmptyIceberg(tempId));
    }
    setSyncFailures([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!iceberg) return;
    if (isPresetIcebergTopic(iceberg.topic)) {
      setUseCustomTopic(false);
      setCustomTopicInput('');
      return;
    }
    setUseCustomTopic(true);
    setCustomTopicInput(iceberg.topic);
  }, [iceberg?.topic, iceberg?.id]);

  // 检查服务端草稿（fallback localStorage）
  useEffect(() => {
    if (!icebergId || icebergId !== 'new') return;
    loadDraft(null).then((draft) => {
      if (draft?.title && draft.title !== '未命名冰山图') {
        setDraftToRecover({ ...draft, topic: normalizeIcebergTopic(draft.topic) });
        setShowRecovery(true);
      }
    });
  }, [icebergId]);

  // 恢复草稿
  const handleRecoverDraft = () => {
    if (draftToRecover) {
      setIceberg(withTopic(draftToRecover));
      setDirty(true);
      setShowRecovery(false);
    }
  };

  // 丢弃草稿
  const handleDiscardDraft = () => {
    clearDraft(iceberg && !iceberg.id.startsWith('temp_') ? iceberg.id : null);
    setShowRecovery(false);
    setDraftToRecover(null);
  };

  // 保存到服务端草稿 + localStorage 备份（1.5s 防抖）
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!iceberg || !isDirty) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      const dk = iceberg.id.startsWith('temp_') ? null : iceberg.id;
      saveDraft(dk, iceberg);
    }, 1500);
  }, [iceberg, isDirty]);

  // 切换编辑目标时读取版本历史
  useEffect(() => {
    loadVersionHistory(iceberg ?? null);
  }, [loadVersionHistory, iceberg?.id, icebergId]);

  // 加载现有冰山图
  useEffect(() => {
    if (!icebergId || icebergId === 'new' || icebergId === 'imported') return;
    if (iceberg && !iceberg.id.startsWith('temp_')) return;

    setLoading(true);
    setError(null);

    fetch(`/api/icebergs/${icebergId}?context=editor`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setIceberg(withTopic(data.data));
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
          const created = await createTempIcebergOnServer('auto');
          if (created) {
            setDirty(false);
            setLastSaved(new Date());
            pushVersionSnapshot(created, 'auto');
            clearDraft(iceberg.id);
          }
        } else {
          const payload = {
            title: iceberg.title,
            description: iceberg.description,
            topic: iceberg.topic,
            status: iceberg.status,
          };
          const res = await fetch(`/api/icebergs/${iceberg.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => null);
          if (res.ok && data?.success) {
            setDirty(false);
            setLastSaved(new Date());
            pushVersionSnapshot(iceberg, 'auto');
            clearDraft(iceberg.id);
            clearSyncFailure(`iceberg:update:${iceberg.id}`);
          } else {
            queueSyncFailure({
              key: `iceberg:update:${iceberg.id}`,
              message: data?.error?.message || '草稿自动保存失败，等待重试',
              method: 'PUT',
              url: `/api/icebergs/${iceberg.id}`,
              body: payload,
            });
          }
        }
      } catch (err) {
        console.error('自动保存失败:', err);
        if (!iceberg.id.startsWith('temp_')) {
          queueSyncFailure({
            key: `iceberg:update:${iceberg.id}`,
            message: '草稿自动保存失败，等待重试',
            method: 'PUT',
            url: `/api/icebergs/${iceberg.id}`,
            body: {
              title: iceberg.title,
              description: iceberg.description,
              topic: iceberg.topic,
              status: iceberg.status,
            },
          });
        }
      } finally {
        setIsSaving(false);
      }
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [isDirty, iceberg, customSlug, pushVersionSnapshot, getDraftStorageKey, clearSyncFailure, queueSyncFailure]);

  const createTempIcebergOnServer = useCallback(async (
    source: 'auto' | 'manual' | 'sync',
  ): Promise<Iceberg | null> => {
    const current = useIcebergStore.getState().iceberg ?? iceberg;
    if (!current || !current.id.startsWith('temp_')) return current ?? null;
    if (creatingIcebergRef.current) {
      return await creatingIcebergRef.current;
    }

    const slugErr = validateSlug(customSlug);
    if (slugErr) {
      if (source !== 'sync') toast(slugErr, 'error');
      return null;
    }

    const payload = buildCreatePayload(current, customSlug);
    const creatingTask = (async (): Promise<Iceberg | null> => {
      try {
        const res = await fetch('/api/icebergs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          const created = withTopic(data.data);
          setIceberg(created);
          clearSyncFailure('iceberg:create:temp');
          return created;
        }
        queueSyncFailure({
          key: 'iceberg:create:temp',
          message: data?.error?.message || '草稿创建失败，等待重试',
          method: 'POST',
          url: '/api/icebergs',
          body: payload,
        });
        if (source !== 'sync') toast(data?.error?.message || '创建失败', 'error');
      } catch (err) {
        console.error('创建冰山图失败:', err);
        queueSyncFailure({
          key: 'iceberg:create:temp',
          message: '草稿创建失败，等待重试',
          method: 'POST',
          url: '/api/icebergs',
          body: payload,
        });
        if (source !== 'sync') toast('创建失败，请稍后重试', 'error');
      }
      return null;
    })();

    creatingIcebergRef.current = creatingTask;
    try {
      return await creatingTask;
    } finally {
      creatingIcebergRef.current = null;
    }
  }, [iceberg, customSlug, setIceberg, clearSyncFailure, queueSyncFailure]);

  const getRealIcebergId = useCallback(async (source: 'auto' | 'manual' | 'sync' = 'sync') => {
    const current = useIcebergStore.getState().iceberg ?? iceberg;
    if (!current) return null;
    if (!current.id.startsWith('temp_')) return current.id;
    const created = await createTempIcebergOnServer(source);
    return created?.id ?? null;
  }, [iceberg, createTempIcebergOnServer]);

  // 确保 tier 已经同步到服务器
  const ensureTierSynced = useCallback(async (tier: Tier) => {
    if (tier.id.startsWith('tier_')) {
      // 本地 tier，需要同步到服务器
      const icebergId = await getRealIcebergId('sync');
      if (!icebergId) return null;

      const res = await fetch(`/api/icebergs/${icebergId}/tiers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tier.name, desc: tier.desc ?? '', order: tier.order }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        clearSyncFailure(`tier:create:${tier.id}`);
        return data.data; // 返回服务器的 tier
      }
      queueSyncFailure({
        key: `tier:create:${tier.id}`,
        message: data?.error?.message || '层级创建未同步',
        method: 'POST',
        url: `/api/icebergs/${icebergId}/tiers`,
        body: { name: tier.name, desc: tier.desc ?? '', order: tier.order },
      });
      return null;
    }
    return tier; // 已经是服务器的数据
  }, [getRealIcebergId, clearSyncFailure, queueSyncFailure]);

  // 添加层级
  const handleAddTier = async () => {
    if (!iceberg) return;
    const wasTempIceberg = iceberg.id.startsWith('temp_');

    const newTier: Tier = {
      id: `tier_${Date.now()}`,
      name: `Tier ${iceberg.tiers.length + 1}`,
      desc: '',
      order: iceberg.tiers.length,
      icebergId: iceberg.id,
      items: [],
    };

    // 本地添加
    addTier(newTier);
    setDirty(true);

    // 临时冰山图先确保创建成功，避免后续词条同步出现孤儿 tier
    if (wasTempIceberg) {
      await getRealIcebergId('sync');
      return;
    }

    try {
      const res = await fetch(`/api/icebergs/${iceberg.id}/tiers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTier.name, desc: newTier.desc ?? '', order: newTier.order }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        // 更新本地 id 为服务器返回的 id
        const currentIceberg = useIcebergStore.getState().iceberg;
        if (currentIceberg) {
          const updatedTiers = currentIceberg.tiers.map((t) =>
            t.id === newTier.id ? { ...t, id: data.data.id } : t
          );
          setIceberg({ ...currentIceberg, tiers: updatedTiers });
        }
        clearSyncFailure(`tier:create:${newTier.id}`);
      } else {
        queueSyncFailure({
          key: `tier:create:${newTier.id}`,
          message: data?.error?.message || '层级创建未同步',
          method: 'POST',
          url: `/api/icebergs/${iceberg.id}/tiers`,
          body: { name: newTier.name, desc: newTier.desc ?? '', order: newTier.order },
        });
      }
    } catch (err) {
      console.error('创建层级失败:', err);
      queueSyncFailure({
        key: `tier:create:${newTier.id}`,
        message: '层级创建未同步',
        method: 'POST',
        url: `/api/icebergs/${iceberg.id}/tiers`,
        body: { name: newTier.name, desc: newTier.desc ?? '', order: newTier.order },
      });
    }
  };

  // 更新层级名称
  const handleUpdateTier = async (tierId: string, updates: Partial<Tier>) => {
    updateTier(tierId, updates);
    setDirty(true);

    // 如果是服务器数据，同步更新
    if (!tierId.startsWith('tier_') && (updates.name !== undefined || updates.desc !== undefined || updates.order !== undefined)) {
      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.desc !== undefined) payload.desc = updates.desc;
      if (updates.order !== undefined) payload.order = updates.order;
      try {
        const res = await fetch(`/api/tiers/${tierId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!(res.ok && data?.success)) {
          queueSyncFailure({
            key: `tier:update:${tierId}`,
            message: data?.error?.message || '层级更新未同步',
            method: 'PUT',
            url: `/api/tiers/${tierId}`,
            body: payload,
          });
        } else {
          clearSyncFailure(`tier:update:${tierId}`);
        }
      } catch (err) {
        console.error('更新层级失败:', err);
        queueSyncFailure({
          key: `tier:update:${tierId}`,
          message: '层级更新未同步',
          method: 'PUT',
          url: `/api/tiers/${tierId}`,
          body: payload,
        });
      }
    }
  };

  // 删除层级
  const handleDeleteTier = async (tierId: string) => {
    removeTier(tierId);
    setDirty(true);

    if (!tierId.startsWith('tier_')) {
      try {
        const res = await fetch(`/api/tiers/${tierId}`, {
          method: 'DELETE',
        });
        if (!res.ok && res.status !== 404) {
          queueSyncFailure({
            key: `tier:delete:${tierId}`,
            message: '层级删除未同步',
            method: 'DELETE',
            url: `/api/tiers/${tierId}`,
          });
        } else {
          clearSyncFailure(`tier:delete:${tierId}`);
        }
      } catch (err) {
        console.error('删除层级失败:', err);
        queueSyncFailure({
          key: `tier:delete:${tierId}`,
          message: '层级删除未同步',
          method: 'DELETE',
          url: `/api/tiers/${tierId}`,
        });
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
        toast('层级尚未同步，词条将保留在本地草稿中', 'error');
        return;
      }
    }

    const payload = { title: item.title, desc: item.desc, order: item.order, labels: item.labels ?? [] };
    try {
      const res = await fetch(`/api/tiers/${realTierId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
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
        clearSyncFailure(`item:create:${item.id}`);
      } else {
        queueSyncFailure({
          key: `item:create:${item.id}`,
          message: data?.error?.message || '词条创建未同步',
          method: 'POST',
          url: `/api/tiers/${realTierId}/items`,
          body: payload,
        });
      }
    } catch (err) {
      console.error('创建条目失败:', err);
      queueSyncFailure({
        key: `item:create:${item.id}`,
        message: '词条创建未同步',
        method: 'POST',
        url: `/api/tiers/${realTierId}/items`,
        body: payload,
      });
    }
  };

  // 更新条目
  const handleUpdateItem = async (itemId: string, updates: Partial<Item>) => {
    updateItem(itemId, updates);
    setDirty(true);

    if (!itemId.startsWith('item_') && (updates.title !== undefined || updates.desc !== undefined || updates.labels !== undefined)) {
      const payload = {
        title: updates.title,
        desc: updates.desc,
        labels: updates.labels,
      };
      try {
        const res = await fetch(`/api/items/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!(res.ok && data?.success)) {
          queueSyncFailure({
            key: `item:update:${itemId}`,
            message: data?.error?.message || '词条更新未同步',
            method: 'PUT',
            url: `/api/items/${itemId}`,
            body: payload,
          });
        } else {
          clearSyncFailure(`item:update:${itemId}`);
        }
      } catch (err) {
        console.error('更新条目失败:', err);
        queueSyncFailure({
          key: `item:update:${itemId}`,
          message: '词条更新未同步',
          method: 'PUT',
          url: `/api/items/${itemId}`,
          body: payload,
        });
      }
    }
  };

  // 删除条目
  const handleDeleteItem = async (itemId: string) => {
    removeItem(itemId);
    setDirty(true);

    if (!itemId.startsWith('item_')) {
      try {
        const res = await fetch(`/api/items/${itemId}`, {
          method: 'DELETE',
        });
        if (!res.ok && res.status !== 404) {
          queueSyncFailure({
            key: `item:delete:${itemId}`,
            message: '词条删除未同步',
            method: 'DELETE',
            url: `/api/items/${itemId}`,
          });
        } else {
          clearSyncFailure(`item:delete:${itemId}`);
        }
      } catch (err) {
        console.error('删除条目失败:', err);
        queueSyncFailure({
          key: `item:delete:${itemId}`,
          message: '词条删除未同步',
          method: 'DELETE',
          url: `/api/items/${itemId}`,
        });
      }
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const updateTierScrollState = useCallback(() => {
    const el = tiersScrollRef.current;
    if (!el) {
      setCanScrollTiersUp(false);
      setCanScrollTiersDown(false);
      return;
    }
    const maxTop = el.scrollHeight - el.clientHeight;
    const nextCanUp = maxTop > 4 && el.scrollTop > 8;
    const nextCanDown = maxTop > 4 && el.scrollTop < maxTop - 8;
    setCanScrollTiersUp((prev) => (prev === nextCanUp ? prev : nextCanUp));
    setCanScrollTiersDown((prev) => (prev === nextCanDown ? prev : nextCanDown));
  }, []);

  const scrollTiersToBottom = useCallback(() => {
    const el = tiersScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  const scrollTiersToTop = useCallback(() => {
    const el = tiersScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const el = tiersScrollRef.current;
    if (!el) return;
    const onScroll = () => updateTierScrollState();
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScroll) : null;
    resizeObserver?.observe(el);
    const mutationObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(onScroll) : null;
    mutationObserver?.observe(el, { childList: true, subtree: true, attributes: true });
    const timer = window.setTimeout(onScroll, 80);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [updateTierScrollState, iceberg?.tiers.length]);

  // 同步 tier 排序到服务器
  const syncTierOrders = async (tiers: Tier[]) => {
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      if (tier.id.startsWith('tier_')) continue;
      const payload = { order: i };
      try {
        const res = await fetch(`/api/tiers/${tier.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          clearSyncFailure(`tier:order:${tier.id}`);
        } else {
          queueSyncFailure({
            key: `tier:order:${tier.id}`,
            message: data?.error?.message || '层级排序未同步',
            method: 'PUT',
            url: `/api/tiers/${tier.id}`,
            body: payload,
          });
        }
      } catch (err) {
        console.error('同步 tier order 失败:', err);
        queueSyncFailure({
          key: `tier:order:${tier.id}`,
          message: '层级排序未同步',
          method: 'PUT',
          url: `/api/tiers/${tier.id}`,
          body: payload,
        });
      }
    }
  };

  // 同步单个 item 的 tier/order 到服务器
  const syncItemOrder = async (itemId: string, tierId: string, order: number) => {
    if (itemId.startsWith('item_')) return;
    const payload = { order, tierId };
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        clearSyncFailure(`item:order:${itemId}`);
      } else {
        queueSyncFailure({
          key: `item:order:${itemId}`,
          message: data?.error?.message || '词条位置未同步',
          method: 'PUT',
          url: `/api/items/${itemId}`,
          body: payload,
        });
      }
    } catch (err) {
      console.error('同步 item order 失败:', err);
      queueSyncFailure({
        key: `item:order:${itemId}`,
        message: '词条位置未同步',
        method: 'PUT',
        url: `/api/items/${itemId}`,
        body: payload,
      });
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

  const handleDragEnd = (event: DragEndEvent) => {
    if (!iceberg) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeType = active.data.current?.type as string | undefined;

    // Tier 排序
    if (activeType === 'tier') {
      const oldIndex = iceberg.tiers.findIndex((t) => t.id === activeId);
      const newIndex = iceberg.tiers.findIndex((t) => t.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const orderedTierIds = arrayMove(iceberg.tiers.map((t) => t.id), oldIndex, newIndex);
      reorderTiers(orderedTierIds);
      setDirty(true);
      const orderedTiers = orderedTierIds
        .map((id, idx) => {
          const tier = iceberg.tiers.find((t) => t.id === id);
          return tier ? { ...tier, order: idx } : null;
        })
        .filter((t): t is Tier => !!t);
      void syncTierOrders(orderedTiers);
      return;
    }

    // Item 排序 / 跨层移动
    if (activeType !== 'item') return;

    let fromTierId: string | null = null;
    let toTierId: string | null = null;
    let overItemIndex = -1;

    for (const tier of iceberg.tiers) {
      if (tier.items.some((item) => item.id === activeId)) fromTierId = tier.id;
      const hitIndex = tier.items.findIndex((item) => item.id === overId);
      if (hitIndex !== -1) {
        toTierId = tier.id;
        overItemIndex = hitIndex;
      }
      if (tier.id === overId) {
        toTierId = tier.id;
        overItemIndex = tier.items.length;
      }
    }

    if (!fromTierId || !toTierId) return;

    const fromTier = iceberg.tiers.find((t) => t.id === fromTierId);
    const toTier = iceberg.tiers.find((t) => t.id === toTierId);
    if (!fromTier || !toTier) return;

    const movingItem = fromTier.items.find((item) => item.id === activeId);
    if (!movingItem) return;

    if (fromTierId === toTierId) {
      const oldIndex = fromTier.items.findIndex((i) => i.id === activeId);
      const newIndex = overItemIndex;
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const reordered = arrayMove(fromTier.items, oldIndex, newIndex).map((item, idx) => ({ ...item, order: idx }));
      updateTier(fromTierId, { items: reordered });
      setDirty(true);
      void syncItemOrders(fromTierId, reordered);
      return;
    }

    const fromItems = fromTier.items
      .filter((item) => item.id !== activeId)
      .map((item, idx) => ({ ...item, order: idx }));
    const targetItems = toTier.items.filter((item) => item.id !== activeId);
    const insertIndex = Math.max(0, Math.min(overItemIndex, targetItems.length));
    targetItems.splice(insertIndex, 0, { ...movingItem, tierId: toTierId });
    const toItems = targetItems.map((item, idx) => ({ ...item, tierId: toTierId, order: idx }));

    updateTier(fromTierId, { items: fromItems });
    updateTier(toTierId, { items: toItems });
    setDirty(true);

    void syncItemOrders(fromTierId, fromItems);
    void syncItemOrder(activeId, toTierId, insertIndex);
    void syncItemOrders(toTierId, toItems);
  };

  const handleSave = async () => {
    if (!iceberg) return;
    try {
      if (iceberg.id.startsWith('temp_')) {
        const slugErr = validateSlug(customSlug);
        if (slugErr) { setSlugError(slugErr); toast(slugErr, 'error'); return; }
        const created = await createTempIcebergOnServer('manual');
        if (created) {
          setDirty(false);
          setLastSaved(new Date());
          pushVersionSnapshot(created, 'manual');
          clearDraft(iceberg.id);
          toast('草稿已保存');
        }
      } else {
        const payload = {
          title: iceberg.title,
          description: iceberg.description,
          topic: iceberg.topic,
          status: iceberg.status,
          updatedAt: iceberg.updatedAt,
        };
        const res = await fetch(`/api/icebergs/${iceberg.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          clearDraft(iceberg.id);
          setDirty(false);
          setLastSaved(new Date());
          pushVersionSnapshot(iceberg, 'manual');
          clearSyncFailure(`iceberg:update:${iceberg.id}`);
          toast('草稿已保存');
        } else {
          queueSyncFailure({
            key: `iceberg:update:${iceberg.id}`,
            message: data?.error?.message || '保存失败，等待重试',
            method: 'PUT',
            url: `/api/icebergs/${iceberg.id}`,
            body: payload,
          });
          toast(data.error?.message || '保存失败', 'error');
        }
      }
    } catch (err) {
      console.error('保存失败:', err);
      if (!iceberg.id.startsWith('temp_')) {
        queueSyncFailure({
          key: `iceberg:update:${iceberg.id}`,
          message: '保存失败，等待重试',
          method: 'PUT',
          url: `/api/icebergs/${iceberg.id}`,
          body: {
            title: iceberg.title,
            description: iceberg.description,
            topic: iceberg.topic,
            status: iceberg.status,
            updatedAt: iceberg.updatedAt,
          },
        });
      }
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
      let redirectKey = iceberg.slug || iceberg.id;
      let submitSnapshot: Iceberg = iceberg;
      if (icebergId.startsWith('temp_')) {
        const slugErr = validateSlug(customSlug);
        if (slugErr) { setSlugError(slugErr); toast(slugErr, 'error'); return; }
        const res = await fetch('/api/icebergs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildCreatePayload(iceberg, customSlug)),
        });
        const data = await res.json();
        if (!data.success) {
          toast(data.error?.message || '创建草稿失败', 'error');
          return;
        }
        const persisted = withTopic(data.data);
        setIceberg(persisted);
        clearDraft(iceberg.id);
        icebergId = data.data.id;
        redirectKey = data.data.slug || data.data.id;
        submitSnapshot = persisted;
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
        pushVersionSnapshot({ ...submitSnapshot }, 'submit');
        toast(data.data.message || '已提交，等待编辑审核');
        window.location.href = `/iceberg/${redirectKey || icebergId}`;
      } else {
        toast(data.error?.message || '提交失败', 'error');
      }
    } catch {
      toast('提交失败，请重试', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 键盘快捷键 Ctrl+S 保存 / Ctrl+Enter 提交
  const saveRef = useRef(handleSave);
  const submitRef = useRef(handleSubmit);
  saveRef.current = handleSave;
  submitRef.current = handleSubmit;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveRef.current(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submitRef.current(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleDelete = async () => {
    if (!iceberg || iceberg.id.startsWith('temp_')) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/icebergs/${iceberg.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        clearDraft(iceberg.id);
        localStorage.removeItem(getHistoryKey(iceberg));
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
        <span className="text-brand animate-pulse">// 加载中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 font-mono">
        <span className="text-danger">! 错误：{error}</span>
      </div>
    );
  }

  if (!iceberg) {
    return (
      <div className="flex items-center justify-center h-64 font-mono">
        <span className="text-text-lo animate-pulse">// 初始化中...</span>
      </div>
    );
  }

  // 草稿恢复提示
  if (showRecovery && draftToRecover) {
    return (
      <div className="max-w-5xl mx-auto px-2 font-mono">
        <div className="border border-warning/25 bg-surface-1">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-warning/20 bg-warning/5">
            <span className="text-warning text-xs">!</span>
            <span className="text-xs text-warning">草稿::恢复</span>
          </div>
          <div className="p-6">
            <p className="text-xs text-text-mid mb-1">// 标题</p>
            <p className="text-sm text-text-hi mb-4 px-3 py-2 bg-surface-2 border border-border-subtle">{draftToRecover.title}</p>
            <p className="text-xs text-text-lo mb-6">
              // 上次保存：{draftToRecover.savedAt ? new Date(draftToRecover.savedAt).toLocaleString() : '未知'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleRecoverDraft}
                className="px-5 py-2 bg-brand text-[#0A0A0A] text-xs font-bold hover:bg-brand-hover transition-colors"
              >
                [ 恢复草稿 ]
              </button>
              <button
                onClick={handleDiscardDraft}
                className="px-5 py-2 border border-border text-xs text-text-mid hover:border-danger hover:text-danger transition-colors"
              >
                [ 丢弃草稿 ]
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const canSubmit = iceberg.status === 'DRAFT' || iceberg.status === 'REJECTED';
  const submitButtonText = isSubmitting
    ? '[ 提交中... ]'
    : iceberg.status === 'REJECTED'
      ? '[ 重新提交审核 ]'
      : iceberg.status === 'PENDING_REVIEW'
        ? '[ 审核中 ]'
        : iceberg.status === 'PUBLISHED'
          ? '[ 已发布 ]'
          : iceberg.status === 'ARCHIVED'
            ? '[ 已归档 ]'
            : '[ 提交审核 ]';

  return (
    <div className="max-w-5xl mx-auto px-2">
      {/* ── 编辑器头部 ── */}
      <header className="mb-6 border border-border-subtle bg-surface-1">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface-2">
          <div className="flex items-center gap-2">
            <span className="text-brand font-mono text-xs">▶</span>
            <span className="font-mono text-xs text-text-hi tracking-widest">冰山图::编辑器</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const prev = versionHistory[Math.min(1, versionHistory.length - 1)] ?? versionHistory[0];
                if (prev) restoreVersion(prev);
              }}
              disabled={versionHistory.length === 0}
              className="font-mono text-[10px] border border-border px-2 py-1 text-text-body hover:border-brand hover:text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="恢复到上一保存版本"
            >
              恢复上一版
            </button>
            <button
              onClick={() => setShowVersionHistory(true)}
              className="font-mono text-[10px] border border-border px-2 py-1 text-text-body hover:border-brand hover:text-brand transition-colors"
              title="查看历史版本"
            >
              版本历史 ({versionHistory.length})
            </button>
            <div className="font-mono text-[11px]">
              {isSaving ? (
                <span className="text-info">[ ● 保存中... ]</span>
              ) : isDirty ? (
                <span className="text-warning">[ ● 未保存 ]</span>
              ) : lastSaved ? (
                <span className="text-success">
                  [ ● 已保存 {(() => { const s = Math.round((Date.now() - lastSaved.getTime()) / 1000); return s < 60 ? `${s}秒前` : s < 3600 ? `${Math.round(s/60)}分钟前` : lastSaved.toLocaleTimeString(); })()} ]
                </span>
              ) : (
                <span className="text-success">[ ● 已保存 ]</span>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 border border-border-subtle bg-surface-0 px-3 py-2">
            <span className="font-mono text-[11px] text-text-mid">// 审核状态</span>
            <span
              className={`font-mono text-[11px] px-2 py-0.5 border ${
                iceberg.status === 'PUBLISHED'
                  ? 'text-success border-success/40 bg-[#22c55e]/10'
                  : iceberg.status === 'PENDING_REVIEW'
                    ? 'text-warning border-warning/40 bg-[#f59e0b]/10'
                    : iceberg.status === 'REJECTED'
                      ? 'text-danger border-danger/40 bg-[#ef4444]/10'
                      : 'text-text-body border-border bg-surface-2'
              }`}
            >
              {iceberg.status === 'PUBLISHED'
                ? '已发布'
                : iceberg.status === 'PENDING_REVIEW'
                  ? '待审核'
                  : iceberg.status === 'REJECTED'
                    ? '已驳回'
                    : iceberg.status === 'ARCHIVED'
                      ? '已归档'
                      : '草稿'}
            </span>
            {iceberg.status === 'PENDING_REVIEW' && (
              <span className="font-mono text-[11px] text-warning">已提交，等待编辑审核</span>
            )}
          </div>

          {iceberg.status === 'REJECTED' && (
            <div className="border border-danger/25 bg-danger/5 px-3 py-2">
              <p className="font-mono text-[11px] text-danger mb-1">// 审核反馈</p>
              <p className="font-mono text-xs text-text-hi leading-relaxed whitespace-pre-wrap">
                {iceberg.review?.note?.trim() || '本次驳回未附加文字说明，请根据规范调整后重新提交。'}
              </p>
            </div>
          )}

          {/* METADATA 区 */}
          <div>
            <p className="text-[10px] font-mono text-text-lo mb-1.5">// 元数据</p>
            <div className="flex items-center border border-border-subtle bg-surface-0 focus-within:border-brand transition-colors">
              <span className="px-3 text-brand font-mono text-sm select-none flex-shrink-0">›</span>
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
                className="flex-1 pr-4 py-3 bg-transparent font-mono text-lg focus:outline-none text-text-hi placeholder:text-text-mid"
                placeholder="冰山图标题"
                aria-label="冰山图标题"
              />
            </div>
          </div>

          {/* SLUG 区 */}
          <div>
            <p className="text-[10px] font-mono text-text-lo mb-1.5">// 地址</p>
            <div className="flex items-center gap-0">
              <span className="px-2 py-2 text-[11px] font-mono text-text-lo bg-surface-2 border border-border-subtle border-r-0 flex-shrink-0 select-none">
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
                  className={`flex-1 px-3 py-2 bg-surface-0 border font-mono text-sm focus:outline-none transition-colors ${
                    slugError ? 'border-danger focus:border-danger text-danger' : 'border-border-subtle focus:border-brand text-text-hi'
                  }`}
                  placeholder="my-iceberg-id"
                  spellCheck={false}
                  aria-label="自定义地址"
                />
              ) : (
                <span className="flex-1 px-3 py-2 font-mono text-sm text-text-mid bg-surface-0 border border-border-subtle">
                  {iceberg.slug || iceberg.id}
                </span>
              )}
            </div>
            {iceberg.id.startsWith('temp_') && (
              <p className={`mt-1 text-[11px] font-mono ${slugError ? 'text-danger' : 'text-text-lo'}`}>
                // {slugError ?? '字母、数字、连字符(-)或下划线(_)，创建后不可修改'}
              </p>
            )}
          </div>

          {/* DESCRIPTION 区 */}
          <div>
            <p className="text-[10px] font-mono text-text-lo mb-1.5">// 主题分类</p>
            <select
              value={useCustomTopic ? '__custom__' : normalizeIcebergTopic(iceberg.topic)}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__custom__') {
                  setUseCustomTopic(true);
                  const seed = isPresetIcebergTopic(iceberg.topic) ? '' : iceberg.topic;
                  setCustomTopicInput(seed);
                  return;
                }
                setUseCustomTopic(false);
                setCustomTopicInput('');
                updateTopic(normalizeIcebergTopic(val));
              }}
              className="w-full px-3 py-2 bg-surface-0 border border-border-subtle focus:border-brand focus:outline-none font-mono text-sm text-text-hi transition-colors"
              aria-label="主题分类"
            >
              {ICEBERG_TOPICS.map((topic) => (
                <option key={topic.value} value={topic.value}>
                  {topic.label}
                </option>
              ))}
              <option value="__custom__">自定义分类...</option>
            </select>
            {useCustomTopic && (
              <div className="mt-2">
                <input
                  type="text"
                  value={customTopicInput}
                  onChange={(e) => {
                    const next = e.target.value.slice(0, 24);
                    setCustomTopicInput(next);
                    updateTopic(next.trim() || 'other');
                  }}
                  placeholder="例如：动漫、冷知识、互联网谜团"
                  className="w-full px-3 py-2 bg-surface-0 border border-border-subtle focus:border-brand focus:outline-none font-mono text-sm text-text-hi placeholder:text-text-lo transition-colors"
                  aria-label="自定义主题"
                />
                <p className="mt-1 text-[11px] font-mono text-text-lo">最多 24 字，保存后会作为该冰山图的主题分类</p>
              </div>
            )}
          </div>

          {/* DESCRIPTION 区 */}
          <div>
            <p className="text-[10px] font-mono text-text-lo mb-1.5">// 简介</p>
            <textarea
              value={iceberg.description || ''}
              onChange={(e) => updateDescription(e.target.value)}
              className="w-full px-4 py-3 bg-surface-0 border border-border-subtle focus:border-brand focus:outline-none resize-none font-mono text-sm text-text-hi placeholder:text-text-mid transition-colors"
              rows={3}
              placeholder="// 冰山图简介（可选，支持 Markdown）"
              aria-label="冰山图简介"
            />
          </div>
        </div>
      </header>

      {/* ── 层级列表 ── */}
      <div className="relative">
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
            <div
              ref={tiersScrollRef}
              className="editor-scroll-shell max-h-[72vh] overflow-y-auto overscroll-contain pr-1"
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
            </div>
          </SortableContext>
        </DndContext>

        {(canScrollTiersDown || canScrollTiersUp) && (
          <div className="absolute right-3 bottom-3 z-20 flex flex-col gap-2 pointer-events-none">
            <button
              type="button"
              onClick={scrollTiersToTop}
              className={`editor-scroll-quick editor-scroll-quick-top ${
                canScrollTiersUp ? 'is-active' : 'is-disabled'
              }`}
              disabled={!canScrollTiersUp}
              title="回到顶部"
              aria-label="回到顶部"
            >
              顶部
            </button>
            <button
              type="button"
              onClick={scrollTiersToBottom}
              className={`editor-scroll-quick editor-scroll-quick-bottom ${
                canScrollTiersDown ? 'is-active' : 'is-disabled'
              }`}
              disabled={!canScrollTiersDown}
              title="一键滚动到底部"
              aria-label="滚动到底部"
            >
              到底
            </button>
          </div>
        )}
      </div>

      {/* ── 添加层级 ── */}
      <button
        onClick={handleAddTier}
        className="mt-4 w-full py-3 border border-dashed border-border-subtle font-mono text-xs text-text-lo hover:border-brand hover:text-brand transition-colors"
      >
        [ ++ 添加层级 ]
      </button>

      {/* ── 底部操作栏 ── */}
      <div className="mt-6 flex items-center justify-between border border-border-subtle bg-surface-1 px-4 py-3">
        <div>
          {!iceberg.id.startsWith('temp_') && (
            <button
              onClick={() => { setDeleteConfirmText(''); setShowDeleteConfirm(true); }}
              className="font-mono text-xs text-text-lo border border-border-subtle px-3 py-2 hover:border-[#ef444460] hover:text-danger transition-colors"
            >
              [ 删除 ]
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            className="font-mono text-xs text-text-body border border-border px-4 py-2 hover:border-brand hover:text-brand transition-colors"
          >
            [ 保存草稿 ]
          </button>
          <button
            onClick={() => handleSubmit()}
            disabled={isSubmitting || !canSubmit}
            className="font-mono text-xs bg-brand text-[#0A0A0A] font-bold px-4 py-2 hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand"
          >
            {submitButtonText}
          </button>
        </div>
      </div>

      {syncFailures.length > 0 && (
        <section className="mt-4 border border-danger/25 bg-surface-1">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#ef444430] bg-danger/5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-danger">!</span>
              <span className="font-mono text-xs text-danger">
                同步异常::{syncFailures.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void retryAllSyncFailures()}
                className="font-mono text-[11px] px-2 py-1 border border-border text-text-body hover:border-brand hover:text-brand transition-colors"
              >
                全部重试
              </button>
              <button
                type="button"
                onClick={clearAllSyncFailures}
                className="font-mono text-[11px] px-2 py-1 border border-border text-text-body hover:border-danger hover:text-danger transition-colors"
              >
                清空记录
              </button>
            </div>
          </div>
          <div className="p-3 space-y-2">
            {syncFailures.map((failure) => (
              <div
                key={failure.key}
                className="border border-border-subtle bg-surface-2 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-text-hi break-all">{failure.message}</p>
                    <p className="font-mono text-[10px] text-text-mid mt-1 break-all">
                      {failure.method} {failure.url}
                    </p>
                    <p className="font-mono text-[10px] text-text-lo mt-1">
                      重试次数 {failure.attempts} · 最近 {new Date(failure.lastAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void retrySyncFailure(failure.key)}
                    className="shrink-0 font-mono text-[11px] px-2 py-1 border border-border text-text-body hover:border-brand hover:text-brand transition-colors"
                  >
                    重试
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 版本历史 ── */}
      {historyMounted && (
        <div className={`${historyLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4`}>
          <div className={`${historyLeaving ? 'modal-content-out' : 'modal-content'} bg-surface-1 border border-border w-full max-w-xl font-mono`}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface-2">
              <div className="flex items-center gap-2">
                <span className="text-brand text-xs">⧗</span>
                <span className="text-xs text-text-hi">编辑器::版本历史</span>
              </div>
              <button
                onClick={() => setShowVersionHistory(false)}
                className="text-xs text-text-mid hover:text-text-body transition-colors"
              >
                [ 关闭 ]
              </button>
            </div>
            <div className="p-4">
              {versionHistory.length === 0 ? (
                <div className="py-10 text-center border border-border-subtle text-xs text-text-mid">
                  // 还没有历史版本，保存后会自动记录
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {versionHistory.map((entry, index) => {
                    const sourceText = entry.source === 'manual'
                      ? '手动保存'
                      : entry.source === 'submit'
                        ? '提交前快照'
                        : '自动保存';
                    return (
                      <div key={entry.id} className="border border-border-subtle bg-surface-2 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-text-hi truncate">
                              {entry.snapshot.title || '未命名冰山图'}
                            </div>
                            <div className="text-[10px] text-text-mid mt-1">
                              {new Date(entry.savedAt).toLocaleString()} · {sourceText}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {index === 0 && (
                              <span className="text-[10px] px-2 py-0.5 border border-brand/25 text-brand bg-brand/10">
                                最新
                              </span>
                            )}
                            <button
                              onClick={() => restoreVersion(entry)}
                              className="text-[10px] px-2.5 py-1 border border-border text-text-body hover:border-brand hover:text-brand transition-colors"
                            >
                              恢复
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 删除确认弹窗 ── */}
      {deleteMounted && (
        <div className={`${deleteLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4`}>
          <div className={`${deleteLeaving ? 'modal-content-out' : 'modal-content'} bg-surface-1 border border-danger/25 w-full max-w-sm font-mono`}>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#ef444430] bg-danger/5">
              <span className="text-danger text-xs">!</span>
              <span className="text-xs text-danger">删除::冰山图</span>
            </div>
            <div className="p-5">
              <p className="text-xs text-text-mid mb-4 leading-relaxed">
                // 此操作不可撤销，所有层级和词条将被永久删除
              </p>
              <p className="text-[11px] text-text-lo mb-2">// 输入冰山图标题以确认</p>
              <p className="text-xs text-text-hi mb-3 px-3 py-2 bg-surface-2 border border-border-subtle truncate">
                {iceberg.title}
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="输入标题确认"
                className="w-full px-3 py-2 mb-4 bg-surface-0 border border-border-subtle text-sm text-text-hi focus:border-danger focus:outline-none placeholder:text-text-mid"
                autoFocus
                aria-label="输入标题确认删除"
              />
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting || deleteConfirmText !== iceberg.title}
                  className="flex-1 py-2 border border-danger text-danger text-xs hover:bg-danger/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isDeleting ? '[ 删除中... ]' : '[ 确认删除 ]'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 border border-border-subtle text-text-lo text-xs hover:text-text-body transition-colors"
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
          <div className="bg-surface-1 border border-warning/25 font-mono text-xs p-3 shadow-xl w-44">
            <p className="text-warning mb-2 leading-snug">// 有未保存的内容</p>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => { setShowBackConfirm(false); window.history.length > 1 ? history.back() : (window.location.href = '/'); }}
                className="w-full py-1.5 border border-[#ef444460] text-danger hover:bg-danger/10 transition-colors"
              >
                [ 确认离开 ]
              </button>
              <button
                onClick={() => setShowBackConfirm(false)}
                className="w-full py-1.5 border border-border-subtle text-text-mid hover:border-[#8b949e] hover:text-text-body transition-colors"
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
              ? 'border-warning text-warning bg-surface-1'
              : 'border-border text-text-mid bg-surface-1 hover:border-brand hover:text-brand'
          }`}
        >
          ‹ 返回
        </button>
      </div>

      {/* ── 自查清单模态框 ── */}
      {checklistMounted && (
        <div className={`${checklistLeaving ? 'modal-overlay-out' : 'modal-overlay'} fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${checklistLeaving ? 'modal-content-out' : 'modal-content'} bg-surface-1 border border-border w-full max-w-md font-mono`}>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle bg-surface-2">
              <span className="text-brand text-xs">▶</span>
              <span className="text-xs text-text-hi">提交::自查清单</span>
            </div>
            <div className="p-5">
              <ul className="space-y-2 mb-6">
                {checklistItems.map(item => (
                  <li key={item.key} className="flex items-start gap-3 text-xs">
                    <span className={`flex-shrink-0 mt-0.5 ${item.pass ? 'text-success' : 'text-danger'}`}>
                      {item.pass ? '✓' : '✗'}
                    </span>
                    <span className={item.pass ? 'text-text-mid' : 'text-text-hi'}>
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
                      nsfwConfirmed ? 'bg-brand border-brand' : 'border-[#4b5563] hover:border-brand'
                    }`}
                  >
                    {nsfwConfirmed && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="#0A0A0A" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    )}
                  </span>
                  <span className="text-xs text-text-body">
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
                    className="flex-1 py-2 border border-border-subtle text-xs text-text-mid hover:border-[#8b949e] hover:text-text-body transition-colors"
                  >
                    [ 返回 ]
                  </button>
                  <button
                    onClick={() => handleSubmit(nsfwConfirmed)}
                    disabled={isSubmitting}
                    className="flex-1 py-2 bg-brand text-[#0A0A0A] text-xs font-bold hover:bg-brand-hover transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? '[ 提交中... ]' : '[ 确认提交 ]'}
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowChecklist(false)}
                    className="flex-1 py-2 border border-border-subtle text-xs text-text-mid hover:border-[#8b949e] hover:text-text-body transition-colors"
                  >
                    [ 返回修改 ]
                  </button>
                  <div className="flex-1 py-2 border border-border-subtle text-xs text-center text-text-lo cursor-not-allowed">
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
