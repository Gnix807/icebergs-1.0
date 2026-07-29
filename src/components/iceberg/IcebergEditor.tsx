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
import { ItemEditorForm } from './ItemEditorForm';
import { EditorToolbar } from './EditorToolbar';
import { EditorActionBar } from './EditorActionBar';
import { EditorDocumentPanel } from './EditorDocumentPanel';
import {
  RepositoryControls,
  type RepositoryConflictState,
  type RepositoryUiState,
} from './RepositoryControls';
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
          labels: it.labels || [],
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

function normLabels(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
  return [];
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
        labels: normLabels(item.labels),
      })),
    })),
  };
}

function mergeImportedWorkingCopy(current: Iceberg, raw: Record<string, any>) {
  const remoteTiers = Array.isArray(raw.tiers) ? raw.tiers : [];
  const unmatchedTiers = [...current.tiers];
  const summary: ImportSyncSummary = {
    addedTiers: 0,
    updatedTiers: 0,
    preservedTiers: 0,
    addedItems: 0,
    updatedItems: 0,
    preservedItems: 0,
  };
  const key = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase();
  const now = Date.now();
  const tiers: Tier[] = remoteTiers.map((remoteTier: any, tierIndex: number) => {
    const matchIndex = unmatchedTiers.findIndex((tier) => key(tier.name) === key(remoteTier.name));
    const matched = matchIndex >= 0 ? unmatchedTiers.splice(matchIndex, 1)[0] : null;
    const tierId = matched?.id ?? `tier_import_${now}_${tierIndex}`;
    if (matched) summary.updatedTiers += 1;
    else summary.addedTiers += 1;
    const unmatchedItems = [...(matched?.items ?? [])];
    const remoteItems = Array.isArray(remoteTier.items) ? remoteTier.items : [];
    const items: Item[] = remoteItems.map((remoteItem: any, itemIndex: number) => {
      const itemMatchIndex = unmatchedItems.findIndex((item) => key(item.title) === key(remoteItem.title));
      const itemMatch = itemMatchIndex >= 0 ? unmatchedItems.splice(itemMatchIndex, 1)[0] : null;
      if (itemMatch) summary.updatedItems += 1;
      else summary.addedItems += 1;
      return {
        id: itemMatch?.id ?? `item_import_${now}_${tierIndex}_${itemIndex}`,
        title: String(remoteItem.title || `词条 ${itemIndex + 1}`).slice(0, 240),
        desc: String(remoteItem.desc || itemMatch?.desc || ''),
        labels: [...new Set([
          ...(itemMatch?.labels ?? []),
          ...(Array.isArray(remoteItem.labels)
            ? remoteItem.labels.filter((label: unknown): label is string => typeof label === 'string')
            : []),
        ])],
        order: itemIndex,
        tierId,
      };
    });
    for (const localItem of unmatchedItems) {
      items.push({ ...localItem, tierId, order: items.length });
      summary.preservedItems += 1;
    }
    return {
      id: tierId,
      icebergId: current.id,
      name: String(remoteTier.name || matched?.name || `层级 ${tierIndex + 1}`),
      desc: String(remoteTier.desc || matched?.desc || ''),
      order: tierIndex,
      items,
    };
  });
  for (const localTier of unmatchedTiers) {
    tiers.push({
      ...localTier,
      order: tiers.length,
      items: localTier.items.map((item, index) => ({ ...item, order: index })),
    });
    summary.preservedTiers += 1;
    summary.preservedItems += localTier.items.length;
  }
  return {
    iceberg: {
      ...current,
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.slice(0, 120) : current.title,
      description: typeof raw.description === 'string' && raw.description.trim()
        ? raw.description
        : current.description,
      tiers,
    },
    summary,
  };
}

interface IcebergEditorProps {
  icebergId?: string;
}

type IcebergDraft = Iceberg & { savedAt?: string };
type VersionSource = 'auto' | 'manual' | 'submit' | 'restore' | 'collaboration' | 'import';
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

interface PendingImportSync {
  targetId: string;
  sourceUrl: string;
  imported: Record<string, unknown>;
}

interface ImportSyncSummary {
  addedTiers: number;
  updatedTiers: number;
  preservedTiers: number;
  addedItems: number;
  updatedItems: number;
  preservedItems: number;
}

interface RepositorySessionState {
  role: RepositoryUiState['role'];
  repository: {
    defaultBranchId: string;
    branches: RepositoryUiState['branches'];
    currentBranch: RepositoryUiState['currentBranch'];
    headCommit: RepositoryUiState['headCommit'];
    mainHeadCommitId: string;
    openPull?: { number: number; title: string } | null;
  };
  workingCopy: {
    revision: number;
    baseCommitId: string;
    dirty: boolean;
  };
  iceberg: Iceberg;
}

interface MetadataBaseline {
  title: string;
  description: string;
  topic: string;
}

function captureMetadata(target: Iceberg): MetadataBaseline {
  return {
    title: target.title,
    description: target.description ?? '',
    topic: normalizeIcebergTopic(target.topic),
  };
}

function buildMetadataPayload(target: Iceberg, baseline: MetadataBaseline) {
  const payload: Record<string, unknown> = {
    updatedAt: target.updatedAt,
    baseMetadata: baseline,
  };
  if (target.title !== baseline.title) payload.title = target.title;
  if ((target.description ?? '') !== baseline.description) payload.description = target.description ?? '';
  if (normalizeIcebergTopic(target.topic) !== baseline.topic) payload.topic = target.topic;
  return payload;
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
    undo,
    redo,
    clearUndoHistory,
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
  const [isRestoringVersion, setIsRestoringVersion] = useState(false);
  const restoringVersionRef = useRef(false);
  const metadataBaselineRef = useRef<MetadataBaseline | null>(null);
  const metadataBaselineIcebergIdRef = useRef<string | null>(null);
  const collaborationChannelRef = useRef<BroadcastChannel | null>(null);
  const [remoteUpdateAt, setRemoteUpdateAt] = useState<string | null>(null);
  const [isLoadingRemoteUpdate, setIsLoadingRemoteUpdate] = useState(false);
  const [recentlyDeletedTier, setRecentlyDeletedTier] = useState<Tier | null>(null);
  const [isUndoingTierDelete, setIsUndoingTierDelete] = useState(false);
  const { mounted: historyMounted, isLeaving: historyLeaving } = useModalAnimation(showVersionHistory);
  const [syncFailures, setSyncFailures] = useState<SyncFailure[]>([]);
  const creatingIcebergRef = useRef<Promise<Iceberg | null> | null>(null);
  const tiersScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollTiersUp, setCanScrollTiersUp] = useState(false);
  const [canScrollTiersDown, setCanScrollTiersDown] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [mobileDocumentOpen, setMobileDocumentOpen] = useState(!icebergId);
  const [pendingImportSync, setPendingImportSync] = useState<PendingImportSync | null>(null);
  const [isApplyingImportSync, setIsApplyingImportSync] = useState(false);
  const [lastImportSyncSummary, setLastImportSyncSummary] = useState<ImportSyncSummary | null>(null);
  const [repositorySession, setRepositorySession] = useState<RepositorySessionState | null>(null);
  const [repositoryWorkspaceDirty, setRepositoryWorkspaceDirty] = useState(false);
  const [repositoryWorkspaceSaving, setRepositoryWorkspaceSaving] = useState(false);
  const [repositoryConflict, setRepositoryConflict] = useState<
    (RepositoryConflictState & { revision: number }) | null
  >(null);
  const repositorySaveTimerRef = useRef<number | null>(null);
  const repositoryLoadingRef = useRef(false);

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

  const rememberMetadataBaseline = useCallback((target: Iceberg) => {
    metadataBaselineRef.current = captureMetadata(target);
    metadataBaselineIcebergIdRef.current = target.id;
  }, []);

  const loadRepositoryState = useCallback(async (branchId?: string) => {
    const current = useIcebergStore.getState().iceberg;
    const targetId = current && !current.id.startsWith('temp_') ? current.id : icebergId;
    if (!targetId || targetId === 'new' || targetId === 'imported' || repositoryLoadingRef.current) return;
    repositoryLoadingRef.current = true;
    try {
      const query = branchId ? `?branch=${encodeURIComponent(branchId)}` : '';
      const res = await fetch(`/api/icebergs/${targetId}/repository${query}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data.data?.enabled || !data.data?.repository) {
        if (data?.data?.enabled === false) setRepositorySession(null);
        return;
      }
      const next = data.data as RepositorySessionState;
      setRepositorySession(next);
      setRepositoryWorkspaceDirty(next.workingCopy.dirty);
      const loaded = withTopic(next.iceberg);
      rememberMetadataBaseline(loaded);
      setIceberg(loaded);
      setLastSaved(new Date());
      setRemoteUpdateAt(null);
      setSyncFailures([]);
    } catch (err) {
      console.error('加载版本库工作副本失败:', err);
    } finally {
      repositoryLoadingRef.current = false;
    }
  }, [icebergId, rememberMetadataBaseline, setIceberg, setLastSaved]);

  const saveRepositoryWorkspace = useCallback(async (snapshot?: Iceberg) => {
    const current = snapshot ?? useIcebergStore.getState().iceberg;
    const repo = repositorySession;
    if (!current || !repo) return null;
    setRepositoryWorkspaceSaving(true);
    try {
      const res = await fetch(`/api/icebergs/${current.id}/repository`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-workspace',
          branchId: repo.repository.currentBranch.id,
          revision: repo.workingCopy.revision,
          baseCommitId: repo.workingCopy.baseCommitId,
          snapshot: current,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        if (res.status === 409 && data?.error?.code === 'WORKSPACE_CONFLICT') {
          toast('另一个标签页保存了更新的工作副本，请切换分支或重新载入', 'error');
        } else {
          toast(data?.error?.message || '工作副本保存失败', 'error');
        }
        return null;
      }
      const saved = data.data as { revision: number; baseCommitId: string };
      setRepositorySession((previous) => previous ? {
        ...previous,
        workingCopy: {
          ...previous.workingCopy,
          revision: saved.revision,
          baseCommitId: saved.baseCommitId,
          dirty: true,
        },
      } : previous);
      setRepositoryWorkspaceDirty(true);
      setDirty(false);
      setLastSaved(new Date());
      clearDraft(current.id);
      return saved;
    } catch {
      toast('工作副本保存失败，请检查网络', 'error');
      return null;
    } finally {
      setRepositoryWorkspaceSaving(false);
    }
  }, [repositorySession, setDirty, setLastSaved]);

  const selectRepositoryBranch = useCallback(async (branchId: string) => {
    if (isDirty && repositorySession) {
      const saved = await saveRepositoryWorkspace();
      if (!saved) return;
    }
    await loadRepositoryState(branchId);
  }, [isDirty, repositorySession, loadRepositoryState, saveRepositoryWorkspace]);

  const createRepositoryBranch = useCallback(async (title: string) => {
    const current = useIcebergStore.getState().iceberg;
    if (!current || !repositorySession) return false;
    const res = await fetch(`/api/icebergs/${current.id}/repository`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create-branch',
        title,
        baseBranchId: repositorySession.repository.currentBranch.id,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      toast(data?.error?.message || '创建分支失败', 'error');
      return false;
    }
    await loadRepositoryState(data.data.id);
    toast('改动分支已创建');
    return true;
  }, [repositorySession, loadRepositoryState]);

  const commitRepositoryVersion = useCallback(async (message: string) => {
    const current = useIcebergStore.getState().iceberg;
    const repo = repositorySession;
    if (!current || !repo) return false;
    const saved = await saveRepositoryWorkspace(current);
    if (!saved) return false;
    const res = await fetch(`/api/icebergs/${current.id}/repository`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'commit',
        branchId: repo.repository.currentBranch.id,
        revision: saved.revision,
        expectedHeadCommitId: repo.repository.currentBranch.headCommitId,
        message,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      toast(data?.error?.message || '提交版本失败', 'error');
      if (data?.error?.code === 'MERGE_CONFLICT' && Array.isArray(data.error.details?.conflicts)) {
        setRepositoryConflict({
          conflicts: data.error.details.conflicts,
          headCommitId: data.error.details.headCommitId,
          message,
          revision: saved.revision,
        });
      } else if (res.status === 409) {
        await loadRepositoryState(repo.repository.currentBranch.id);
      }
      return false;
    }
    setRepositoryConflict(null);
    setRepositoryWorkspaceDirty(false);
    await loadRepositoryState(repo.repository.currentBranch.id);
    toast(`版本 ${data.data.shortHash} 已提交`);
    return true;
  }, [repositorySession, saveRepositoryWorkspace, loadRepositoryState]);

  const resolveRepositoryConflicts = useCallback(async (resolutions: Array<{
    path: string;
    field: string;
    choice: 'ours' | 'theirs';
  }>) => {
    const current = useIcebergStore.getState().iceberg;
    const repo = repositorySession;
    const conflict = repositoryConflict;
    if (!current || !repo || !conflict) return false;
    const res = await fetch(`/api/icebergs/${current.id}/repository`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resolve-conflicts',
        branchId: repo.repository.currentBranch.id,
        revision: conflict.revision,
        expectedHeadCommitId: conflict.headCommitId,
        message: conflict.message,
        resolutions,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      toast(data?.error?.message || '冲突解决提交失败', 'error');
      if (res.status === 409) {
        setRepositoryConflict(null);
        await loadRepositoryState(repo.repository.currentBranch.id);
      }
      return false;
    }
    setRepositoryConflict(null);
    setRepositoryWorkspaceDirty(false);
    await loadRepositoryState(repo.repository.currentBranch.id);
    toast(`冲突已解决，版本 ${data.data.shortHash} 已提交`);
    return true;
  }, [repositoryConflict, repositorySession, loadRepositoryState]);

  const createRepositoryPull = useCallback(async (title: string, body: string) => {
    const current = useIcebergStore.getState().iceberg;
    const repo = repositorySession;
    if (!current || !repo || repositoryWorkspaceDirty) return false;
    const res = await fetch(`/api/icebergs/${current.id}/repository`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create-pull',
        title,
        body,
        headBranchId: repo.repository.currentBranch.id,
        baseBranchId: repo.repository.defaultBranchId,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      toast(data?.error?.message || '创建合并请求失败', 'error');
      return false;
    }
    await loadRepositoryState(repo.repository.currentBranch.id);
    toast(`合并请求 #${data.data.number} 已创建`);
    return true;
  }, [repositorySession, repositoryWorkspaceDirty, loadRepositoryState]);

  const acceptCollaborationRevision = useCallback((raw: unknown, broadcast = true) => {
    if (typeof raw !== 'string' || Number.isNaN(new Date(raw).getTime())) return;
    useIcebergStore.setState((state) => {
      if (!state.iceberg) return state;
      const currentTime = new Date(state.iceberg.updatedAt).getTime();
      const nextTime = new Date(raw).getTime();
      if (nextTime <= currentTime) return state;
      return { iceberg: { ...state.iceberg, updatedAt: raw } };
    });
    if (broadcast) {
      collaborationChannelRef.current?.postMessage({ updatedAt: raw });
    }
  }, []);

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

  // 元数据保存接口会返回完整冰山图，但层级/词条可能是请求开始时的旧快照。
  // 这里只接收服务端时间戳，始终保留编辑器中的最新层级和词条，避免异步响应覆盖本地新增内容。
  const reconcileMetadataSave = useCallback((savedSnapshot: Iceberg, serverData: any) => {
    let savedWithoutNewerChanges = false;

    useIcebergStore.setState((state) => {
      const current = state.iceberg;
      if (!current || current.id !== savedSnapshot.id) return state;

      savedWithoutNewerChanges = current === savedSnapshot;
      const titleChangedAfterRequest = current.title !== savedSnapshot.title;
      const descriptionChangedAfterRequest =
        (current.description ?? '') !== (savedSnapshot.description ?? '');
      const topicChangedAfterRequest =
        normalizeIcebergTopic(current.topic) !== normalizeIcebergTopic(savedSnapshot.topic);
      return {
        iceberg: {
          ...current,
          title: titleChangedAfterRequest || typeof serverData?.title !== 'string'
            ? current.title
            : serverData.title,
          description: descriptionChangedAfterRequest || typeof serverData?.description !== 'string'
            ? current.description
            : serverData.description,
          topic: topicChangedAfterRequest || serverData?.topic === undefined
            ? current.topic
            : normalizeIcebergTopic(serverData.topic),
          updatedAt: typeof serverData?.updatedAt === 'string'
            ? serverData.updatedAt
            : current.updatedAt,
        },
        // 请求发出后如果又有编辑，继续保持 dirty，让下一轮自动保存处理新内容。
        isDirty: savedWithoutNewerChanges ? false : state.isDirty,
      };
    });

    if (serverData && typeof serverData === 'object') {
      rememberMetadataBaseline({
        ...savedSnapshot,
        title: typeof serverData.title === 'string' ? serverData.title : savedSnapshot.title,
        description: typeof serverData.description === 'string'
          ? serverData.description
          : savedSnapshot.description,
        topic: serverData.topic ?? savedSnapshot.topic,
      });
      acceptCollaborationRevision(serverData.updatedAt);
      if (serverData.collaborationMerged && typeof serverData.updatedAt === 'string') {
        setRemoteUpdateAt(serverData.updatedAt);
      }
    }

    return savedWithoutNewerChanges;
  }, [acceptCollaborationRevision, rememberMetadataBaseline]);

  const retrySyncFailure = useCallback(async (key: string) => {
    const target = syncFailures.find((item) => item.key === key);
    if (!target) return;
    try {
      let res: Response;
      if (target.method === 'DELETE') {
        res = await fetch(`${target.url}${target.url.includes('?') ? '&' : '?'}action=delete`, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
      } else if (target.body) {
        res = await fetch(target.url, {
          method: target.method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(target.body),
        });
      } else {
        res = await fetch(target.url);
      }
      const data = await res.json().catch(() => null);
      if (res.ok || res.status === 404) {
        acceptCollaborationRevision(data?.data?.icebergUpdatedAt ?? data?.data?.updatedAt);
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
  }, [syncFailures, clearSyncFailure, acceptCollaborationRevision]);

  const retryAllSyncFailures = useCallback(async () => {
    for (const failure of syncFailures) {
      // eslint-disable-next-line no-await-in-loop
      await retrySyncFailure(failure.key);
    }
  }, [syncFailures, retrySyncFailure]);
  const clearAllSyncFailures = useCallback(() => {
    setSyncFailures([]);
  }, []);

  const restoreVersion = async (entry: DraftVersion) => {
    const current = useIcebergStore.getState().iceberg;
    if (!current || isRestoringVersion) return;
    if (isSaving) {
      toast('正在保存当前修改，请稍后再恢复版本');
      return;
    }

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    restoringVersionRef.current = true;
    setIsRestoringVersion(true);

    try {
      if (current.id.startsWith('temp_')) {
        pushVersionSnapshot(current, 'restore');
        setIceberg(withTopic({
          ...entry.snapshot,
          id: current.id,
          slug: current.slug,
          updatedAt: current.updatedAt,
        }));
        setDirty(true);
        setLastSaved(new Date(entry.savedAt));
        setShowVersionHistory(false);
        toast(`已恢复到 ${new Date(entry.savedAt).toLocaleString()} 的版本`);
        return;
      }

      const res = await fetch(`/api/icebergs/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'restore-version',
          baseUpdatedAt: current.updatedAt,
          snapshot: entry.snapshot,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        if (res.status === 409) setRemoteUpdateAt(current.updatedAt);
        toast(data?.error?.message || '恢复失败，当前内容未被修改', 'error');
        return;
      }

      pushVersionSnapshot(current, 'restore');
      const restored = withTopic(data.data);
      rememberMetadataBaseline(restored);
      setIceberg(restored);
      setLastSaved(new Date());
      clearDraft(current.id);
      clearSyncFailure(`iceberg:update:${current.id}`);
      setShowVersionHistory(false);
      toast(`已恢复到 ${new Date(entry.savedAt).toLocaleString()} 的版本`);
    } catch (err) {
      console.error('恢复历史版本失败:', err);
      toast('恢复失败，当前内容未被修改', 'error');
    } finally {
      restoringVersionRef.current = false;
      setIsRestoringVersion(false);
    }
  };

  const loadLatestCollaborationVersion = async () => {
    const current = useIcebergStore.getState().iceberg;
    if (!current || current.id.startsWith('temp_') || isLoadingRemoteUpdate) return;
    setIsLoadingRemoteUpdate(true);
    try {
      const res = await fetch(`/api/icebergs/${current.id}?context=editor`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast(data?.error?.message || '载入最新版本失败', 'error');
        return;
      }
      pushVersionSnapshot(current, 'collaboration');
      const latest = withTopic(data.data);
      rememberMetadataBaseline(latest);
      setIceberg(latest);
      setLastSaved(new Date());
      setRemoteUpdateAt(null);
      clearDraft(current.id);
      toast('已备份当前编辑并载入协作者的最新版本');
    } catch {
      toast('载入最新版本失败，请稍后重试', 'error');
    } finally {
      setIsLoadingRemoteUpdate(false);
    }
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

  useEffect(() => {
    if (iceberg && metadataBaselineIcebergIdRef.current !== iceberg.id) {
      rememberMetadataBaseline(iceberg);
    }
  }, [iceberg?.id, rememberMetadataBaseline]);

  // 同一浏览器的多个编辑标签页即时互相提醒；不同用户通过下方轻量轮询发现更新。
  useEffect(() => {
    collaborationChannelRef.current?.close();
    collaborationChannelRef.current = null;
    if (!iceberg || iceberg.id.startsWith('temp_') || typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(`iceberg-collaboration:${iceberg.id}`);
    collaborationChannelRef.current = channel;
    channel.onmessage = (event) => {
      const updatedAt = event.data?.updatedAt;
      const current = useIcebergStore.getState().iceberg;
      if (typeof updatedAt === 'string' && current
        && new Date(updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
        setRemoteUpdateAt(updatedAt);
      }
    };
    return () => {
      channel.close();
      if (collaborationChannelRef.current === channel) collaborationChannelRef.current = null;
    };
  }, [iceberg?.id]);

  useEffect(() => {
    if (!iceberg || iceberg.id.startsWith('temp_')) return;
    let disposed = false;
    const checkForRemoteUpdate = async () => {
      if (document.visibilityState === 'hidden' || restoringVersionRef.current) return;
      try {
        const res = await fetch(`/api/icebergs/${iceberg.id}?context=editor&fields=collaboration`, {
          cache: 'no-store',
        });
        const data = await res.json().catch(() => null);
        const updatedAt = data?.data?.updatedAt;
        const current = useIcebergStore.getState().iceberg;
        if (!disposed && res.ok && typeof updatedAt === 'string' && current
          && new Date(updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
          setRemoteUpdateAt(updatedAt);
        }
      } catch {
        // 网络抖动不影响编辑，已有同步失败队列负责写操作告警。
      }
    };
    const timer = window.setInterval(() => void checkForRemoteUpdate(), 12_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkForRemoteUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [iceberg?.id]);

  // 同步暂存独立于服务端加载读取。Astro 页面切换可能保留 Zustand，
  // 因此不能只在“首次 fetch 成功”时消费，否则第一次返回编辑器会漏掉提示。
  useEffect(() => {
    if (!iceberg || iceberg.id.startsWith('temp_')) return;
    try {
      const raw = sessionStorage.getItem('imported_iceberg_sync');
      if (!raw) return;
      const staged = JSON.parse(raw) as PendingImportSync;
      const matchesCurrent = staged?.targetId === iceberg.id
        || staged?.targetId === iceberg.slug
        || staged?.targetId === icebergId;
      if (matchesCurrent && staged.imported && typeof staged.imported === 'object') {
        setPendingImportSync(staged);
        sessionStorage.removeItem('imported_iceberg_sync');
      }
    } catch {
      sessionStorage.removeItem('imported_iceberg_sync');
    }
  }, [iceberg?.id, iceberg?.slug, icebergId]);

  // 加载现有冰山图
  useEffect(() => {
    if (!icebergId || icebergId === 'new' || icebergId === 'imported') return;

    const controller = new AbortController();
    let disposed = false;
    setLoading(true);
    setError(null);

    fetch(`/api/icebergs/${icebergId}?context=editor`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (disposed) return;
        if (data.success) {
          const loaded = withTopic(data.data);
          rememberMetadataBaseline(loaded);
          setIceberg(loaded);
        } else {
          setError(data.error?.message || '加载失败');
        }
      })
      .catch((err) => {
        if (disposed || err?.name === 'AbortError') return;
        setError('加载失败');
        console.error('加载失败:', err);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [icebergId, rememberMetadataBaseline]);

  // 功能开关开启时，在旧详情接口完成权限校验后切换到服务端版本库工作副本。
  useEffect(() => {
    if (!iceberg || iceberg.id.startsWith('temp_') || repositorySession) return;
    void loadRepositoryState();
  }, [iceberg?.id, repositorySession, loadRepositoryState]);

  // 自动保存 (debounce 2秒)
  useEffect(() => {
    if (!isDirty || !iceberg) return;
    if (repositorySession) return;

    // 清除之前的定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // 设置新的定时器，2秒后自动保存
    autoSaveTimerRef.current = setTimeout(async () => {
      if (restoringVersionRef.current) return;
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
          const baseline = metadataBaselineRef.current ?? captureMetadata(iceberg);
          const payload = buildMetadataPayload(iceberg, baseline);
          const res = await fetch(`/api/icebergs/${iceberg.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => null);
          if (res.ok && data?.success) {
            const savedWithoutNewerChanges = reconcileMetadataSave(iceberg, data.data);
            setLastSaved(new Date());
            pushVersionSnapshot(iceberg, 'auto');
            if (savedWithoutNewerChanges) clearDraft(iceberg.id);
            clearSyncFailure(`iceberg:update:${iceberg.id}`);
          } else {
            if (res.status === 409) setRemoteUpdateAt(iceberg.updatedAt);
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
              ...buildMetadataPayload(
                iceberg,
                metadataBaselineRef.current ?? captureMetadata(iceberg),
              ),
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
  }, [isDirty, iceberg, customSlug, pushVersionSnapshot, getDraftStorageKey, clearSyncFailure, queueSyncFailure, reconcileMetadataSave]);

  // GitHub 式协作开启后，自动保存只写当前用户的工作副本，不推进分支 head。
  useEffect(() => {
    if (!repositorySession || !iceberg || !isDirty) return;
    setRepositoryWorkspaceDirty(true);
    if (repositorySaveTimerRef.current) window.clearTimeout(repositorySaveTimerRef.current);
    repositorySaveTimerRef.current = window.setTimeout(() => {
      void saveRepositoryWorkspace(iceberg);
    }, 1500);
    return () => {
      if (repositorySaveTimerRef.current) window.clearTimeout(repositorySaveTimerRef.current);
    };
  }, [repositorySession, iceberg, isDirty, saveRepositoryWorkspace]);

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
          rememberMetadataBaseline(created);
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
  }, [iceberg, customSlug, setIceberg, clearSyncFailure, queueSyncFailure, rememberMetadataBaseline]);

  const getRealIcebergId = useCallback(async (source: 'auto' | 'manual' | 'sync' = 'sync') => {
    const current = useIcebergStore.getState().iceberg ?? iceberg;
    if (!current) return null;
    if (!current.id.startsWith('temp_')) return current.id;
    const created = await createTempIcebergOnServer(source);
    return created?.id ?? null;
  }, [iceberg, createTempIcebergOnServer]);

  // 确保 tier 已经同步到服务器
  const ensureTierSynced = useCallback(async (tier: Tier) => {
    if (repositorySession) return tier;
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
        acceptCollaborationRevision(data.data?.icebergUpdatedAt);
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
  }, [repositorySession, getRealIcebergId, clearSyncFailure, queueSyncFailure, acceptCollaborationRevision]);

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
    if (repositorySession) return;

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
        useIcebergStore.setState((state) => ({
          iceberg: state.iceberg
            ? {
                ...state.iceberg,
                tiers: state.iceberg.tiers.map((t) =>
                  t.id === newTier.id
                    ? {
                        ...t,
                        id: data.data.id,
                        order: data.data.order,
                        icebergId: state.iceberg!.id,
                        items: t.items.map((item) => ({ ...item, tierId: data.data.id })),
                      }
                    : t
                ),
              }
            : null,
        }));
        acceptCollaborationRevision(data.data?.icebergUpdatedAt);
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
    const baseTier = useIcebergStore.getState().iceberg?.tiers.find((tier) => tier.id === tierId);
    updateTier(tierId, updates);
    setDirty(true);
    if (repositorySession) return;

    // 如果是服务器数据，同步更新
    if (!tierId.startsWith('tier_') && (updates.name !== undefined || updates.desc !== undefined || updates.order !== undefined)) {
      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.desc !== undefined) payload.desc = updates.desc;
      if (updates.order !== undefined) payload.order = updates.order;
      if (baseTier) {
        payload.baseTier = {
          ...(updates.name !== undefined ? { name: baseTier.name } : {}),
          ...(updates.desc !== undefined ? { desc: baseTier.desc } : {}),
          ...(updates.order !== undefined ? { order: baseTier.order } : {}),
        };
      }
      try {
        const res = await fetch(`/api/tiers/${tierId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!(res.ok && data?.success)) {
          if (res.status === 409) setRemoteUpdateAt(iceberg?.updatedAt ?? new Date(0).toISOString());
          queueSyncFailure({
            key: `tier:update:${tierId}`,
            message: data?.error?.message || '层级更新未同步',
            method: 'PUT',
            url: `/api/tiers/${tierId}`,
            body: payload,
          });
        } else {
          acceptCollaborationRevision(data.data?.icebergUpdatedAt);
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
    const baseTier = useIcebergStore.getState().iceberg?.tiers.find((tier) => tier.id === tierId);
    const baseTierSnapshot = baseTier
      ? { ...baseTier, items: baseTier.items.map((item) => ({ ...item })) }
      : null;
    removeTier(tierId);
    setDirty(true);
    if (repositorySession) {
      if (baseTierSnapshot) setRecentlyDeletedTier(baseTierSnapshot);
      return;
    }

    if (!tierId.startsWith('tier_')) {
      const baseParam = baseTier
          ? encodeURIComponent(JSON.stringify({
              name: baseTier.name,
              desc: baseTier.desc,
              baseUpdatedAt: useIcebergStore.getState().iceberg?.updatedAt,
          }))
        : '';
      const deleteUrl = `/api/tiers/${tierId}${baseParam ? `?base=${baseParam}` : ''}`;
      try {
        const res = await fetch(`${deleteUrl}${baseParam ? '&' : '?'}action=delete`, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        const data = await res.json().catch(() => null);
        if (!res.ok && res.status !== 404) {
          if (res.status === 409) {
            setRemoteUpdateAt(iceberg?.updatedAt ?? new Date(0).toISOString());
            toast(data?.error?.message || '层级已被协作者修改，未执行删除', 'error');
          }
          queueSyncFailure({
            key: `tier:delete:${tierId}`,
            message: data?.error?.message || '层级删除未同步',
            method: 'DELETE',
            url: deleteUrl,
          });
        } else {
          acceptCollaborationRevision(data?.data?.icebergUpdatedAt);
          if (res.ok && data?.success && baseTierSnapshot) {
            setRecentlyDeletedTier(baseTierSnapshot);
          }
          clearSyncFailure(`tier:delete:${tierId}`);
        }
      } catch (err) {
        console.error('删除层级失败:', err);
        queueSyncFailure({
          key: `tier:delete:${tierId}`,
          message: '层级删除未同步',
          method: 'DELETE',
          url: deleteUrl,
        });
      }
    } else if (baseTierSnapshot) {
      setRecentlyDeletedTier(baseTierSnapshot);
    }
  };

  const undoDeletedTier = async () => {
    const deletedTier = recentlyDeletedTier;
    const current = useIcebergStore.getState().iceberg;
    if (!deletedTier || !current || isUndoingTierDelete) return;
    setIsUndoingTierDelete(true);
    try {
      if (repositorySession || current.id.startsWith('temp_') || deletedTier.id.startsWith('tier_')) {
        useIcebergStore.setState((state) => {
          if (!state.iceberg) return state;
          const tiers = [
            ...state.iceberg.tiers.map((tier) =>
              tier.order >= deletedTier.order ? { ...tier, order: tier.order + 1 } : tier
            ),
            deletedTier,
          ].sort((a, b) => a.order - b.order);
          return { iceberg: { ...state.iceberg, tiers }, isDirty: true };
        });
        setRecentlyDeletedTier(null);
        toast('已撤销层级删除');
        return;
      }

      const res = await fetch(`/api/icebergs/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore-tier', tier: deletedTier }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast(data?.error?.message || '撤销删除失败，请重试', 'error');
        return;
      }
      const restored = data.data as Tier & { icebergUpdatedAt?: string };
      useIcebergStore.setState((state) => {
        if (!state.iceberg) return state;
        const tiers = [
          ...state.iceberg.tiers.map((tier) =>
            tier.order >= restored.order ? { ...tier, order: tier.order + 1 } : tier
          ),
          restored,
        ].sort((a, b) => a.order - b.order);
        return { iceberg: { ...state.iceberg, tiers } };
      });
      acceptCollaborationRevision(restored.icebergUpdatedAt);
      setRecentlyDeletedTier(null);
      toast('已撤销层级删除，其他协作者的修改保持不变');
    } catch {
      toast('撤销删除失败，请稍后重试', 'error');
    } finally {
      setIsUndoingTierDelete(false);
    }
  };

  // 添加条目
  const handleAddItem = async (tierId: string, item: Item) => {
    addItem(tierId, item);
    setDirty(true);
    setSelectedItemId(item.id);
    if (repositorySession) return;

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
        // 只替换服务端生成的词条 id，不重置 dirty，也不覆盖请求期间发生的其他编辑。
        useIcebergStore.setState((state) => {
          if (!state.iceberg) return state;
          return {
            iceberg: {
              ...state.iceberg,
              tiers: state.iceberg.tiers.map((t) =>
                t.id === tierId
                  ? {
                      ...t,
                      items: t.items.map((i) =>
                        i.id === item.id
                          ? {
                              ...i,
                              id: data.data.id,
                              tierId: realTierId,
                              order: data.data.order,
                              updatedAt: data.data.updatedAt,
                            }
                          : i
                      ),
                    }
                  : t
              ),
            },
          };
        });
        acceptCollaborationRevision(data.data?.icebergUpdatedAt);
        setSelectedItemId((current) => current === item.id ? data.data.id : current);
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
  const handleUpdateItem = async (itemId: string, updates: Partial<Item>): Promise<boolean> => {
    const baseItem = useIcebergStore.getState().iceberg?.tiers
      .flatMap((tier) => tier.items)
      .find((item) => item.id === itemId);
    updateItem(itemId, updates);
    setDirty(true);
    if (repositorySession) return true;

    if (!itemId.startsWith('item_') && (updates.title !== undefined || updates.desc !== undefined || updates.labels !== undefined)) {
      const payload = {
        title: updates.title,
        desc: updates.desc,
        labels: updates.labels,
        baseUpdatedAt: baseItem?.updatedAt,
      };
      try {
        const res = await fetch(`/api/items/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!(res.ok && data?.success)) {
          if (res.status === 409) {
            setRemoteUpdateAt(iceberg?.updatedAt ?? new Date(0).toISOString());
            if (baseItem) {
              useIcebergStore.setState((state) => ({
                iceberg: state.iceberg
                  ? {
                      ...state.iceberg,
                      tiers: state.iceberg.tiers.map((tier) => ({
                        ...tier,
                        items: tier.items.map((item) => item.id === itemId ? baseItem : item),
                      })),
                    }
                  : null,
              }));
            }
            toast(data?.error?.message || '词条已被协作者修改，编辑内容仍保留在表单中', 'error');
            return false;
          }
          queueSyncFailure({
            key: `item:update:${itemId}`,
            message: data?.error?.message || '词条更新未同步',
            method: 'PUT',
            url: `/api/items/${itemId}`,
            body: payload,
          });
        } else {
          useIcebergStore.setState((state) => ({
            iceberg: state.iceberg
              ? {
                  ...state.iceberg,
                  tiers: state.iceberg.tiers.map((tier) => ({
                    ...tier,
                    items: tier.items.map((item) =>
                      item.id === itemId
                        ? { ...item, updatedAt: data.data.updatedAt }
                        : item
                    ),
                  })),
                }
              : null,
          }));
          acceptCollaborationRevision(data.data?.icebergUpdatedAt);
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
    return true;
  };

  // 删除条目
  const handleDeleteItem = async (itemId: string) => {
    const baseItem = useIcebergStore.getState().iceberg?.tiers
      .flatMap((tier) => tier.items)
      .find((item) => item.id === itemId);
    removeItem(itemId);
    setDirty(true);
    if (repositorySession) return;

    if (!itemId.startsWith('item_')) {
      const baseParam = baseItem?.updatedAt
        ? `?baseUpdatedAt=${encodeURIComponent(baseItem.updatedAt)}`
        : '';
      const deleteUrl = `/api/items/${itemId}${baseParam}`;
      try {
        const res = await fetch(`${deleteUrl}${baseParam ? '&' : '?'}action=delete`, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        const data = await res.json().catch(() => null);
        if (!res.ok && res.status !== 404) {
          if (res.status === 409) {
            setRemoteUpdateAt(iceberg?.updatedAt ?? new Date(0).toISOString());
            toast(data?.error?.message || '词条已被协作者修改，未执行删除', 'error');
          }
          queueSyncFailure({
            key: `item:delete:${itemId}`,
            message: data?.error?.message || '词条删除未同步',
            method: 'DELETE',
            url: deleteUrl,
          });
        } else {
          acceptCollaborationRevision(data?.data?.icebergUpdatedAt);
          clearSyncFailure(`item:delete:${itemId}`);
        }
      } catch (err) {
        console.error('删除条目失败:', err);
        queueSyncFailure({
          key: `item:delete:${itemId}`,
          message: '词条删除未同步',
          method: 'DELETE',
          url: deleteUrl,
        });
      }
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
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

  // 排序和跨层移动必须一次提交，避免协作者看到逐条请求产生的中间状态。
  const syncStructureOrder = async (
    payload: Record<string, unknown>,
    key: string,
    fallbackMessage: string,
  ) => {
    if (repositorySession) return;
    const current = useIcebergStore.getState().iceberg;
    if (!current || current.id.startsWith('temp_')) return;
    const body = {
      action: 'reorder-structure',
      baseUpdatedAt: current.updatedAt,
      ...payload,
    };
    try {
      const res = await fetch(`/api/icebergs/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        const itemVersions = data.data?.itemVersions;
        if (itemVersions && typeof itemVersions === 'object') {
          useIcebergStore.setState((state) => ({
            iceberg: state.iceberg
              ? {
                  ...state.iceberg,
                  tiers: state.iceberg.tiers.map((tier) => ({
                    ...tier,
                    items: tier.items.map((item) => (
                      typeof itemVersions[item.id] === 'string'
                        ? { ...item, updatedAt: itemVersions[item.id] }
                        : item
                    )),
                  })),
                }
              : null,
          }));
        }
        acceptCollaborationRevision(data.data?.updatedAt);
        clearSyncFailure(key);
      } else {
        if (res.status === 409) {
          setRemoteUpdateAt(current.updatedAt);
          toast(data?.error?.message || fallbackMessage, 'error');
        }
        queueSyncFailure({
          key,
          message: data?.error?.message || fallbackMessage,
          method: 'PUT',
          url: `/api/icebergs/${current.id}`,
          body,
        });
      }
    } catch (err) {
      console.error('同步结构排序失败:', err);
      queueSyncFailure({
        key,
        message: fallbackMessage,
        method: 'PUT',
        url: `/api/icebergs/${current.id}`,
        body,
      });
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
      void syncStructureOrder({
        kind: 'tiers',
        baseOrder: iceberg.tiers
          .map((tier) => tier.id)
          .filter((id) => !id.startsWith('tier_')),
        order: orderedTiers
          .map((tier) => tier.id)
          .filter((id) => !id.startsWith('tier_')),
      }, 'structure:tiers:order', '层级排序未同步');
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
      if (fromTierId.startsWith('tier_')) return;
      void syncStructureOrder({
        kind: 'items',
        baseLayout: {
          [fromTierId]: fromTier.items
            .map((item) => item.id)
            .filter((id) => !id.startsWith('item_')),
        },
        layout: {
          [fromTierId]: reordered
            .map((item) => item.id)
            .filter((id) => !id.startsWith('item_')),
        },
      }, `structure:items:${fromTierId}`, '词条排序未同步');
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

    if (fromTierId.startsWith('tier_') || toTierId.startsWith('tier_')) return;
    void syncStructureOrder({
      kind: 'items',
      baseLayout: {
        [fromTierId]: fromTier.items
          .map((item) => item.id)
          .filter((id) => !id.startsWith('item_')),
        [toTierId]: toTier.items
          .map((item) => item.id)
          .filter((id) => !id.startsWith('item_')),
      },
      layout: {
        [fromTierId]: fromItems
          .map((item) => item.id)
          .filter((id) => !id.startsWith('item_')),
        [toTierId]: toItems
          .map((item) => item.id)
          .filter((id) => !id.startsWith('item_')),
      },
    }, `structure:items:${fromTierId}:${toTierId}`, '词条移动未同步');
  };

  const handleSave = async () => {
    if (!iceberg) return;
    if (repositorySession) {
      const saved = await saveRepositoryWorkspace(iceberg);
      if (saved) toast('工作副本已保存；需要形成正式历史时请点击“提交版本”');
      return;
    }
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
        const baseline = metadataBaselineRef.current ?? captureMetadata(iceberg);
        const payload = buildMetadataPayload(iceberg, baseline);
        const res = await fetch(`/api/icebergs/${iceberg.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          const savedWithoutNewerChanges = reconcileMetadataSave(iceberg, data.data);
          if (savedWithoutNewerChanges) clearDraft(iceberg.id);
          setLastSaved(new Date());
          pushVersionSnapshot(iceberg, 'manual');
          clearSyncFailure(`iceberg:update:${iceberg.id}`);
          toast('草稿已保存');
        } else {
          if (res.status === 409) setRemoteUpdateAt(iceberg.updatedAt);
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
            ...buildMetadataPayload(
              iceberg,
              metadataBaselineRef.current ?? captureMetadata(iceberg),
            ),
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
    if (repositorySession) {
      if (repositorySession.repository.currentBranch.id !== repositorySession.repository.defaultBranchId) {
        toast('当前位于改动分支，请先发起并合并 Pull Request', 'error');
        return;
      }
      if (repositoryWorkspaceDirty || isDirty || repositoryWorkspaceSaving) {
        toast('请先提交当前版本，再提交审核', 'error');
        return;
      }
    }
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

      const res = await fetch(`/api/icebergs/${icebergId}/submit?data=${encodeURIComponent(JSON.stringify({ nsfwConfirmed: confirmedNsfw }))}`);
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
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  undoRef.current = undo;
  redoRef.current = redo;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveRef.current(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submitRef.current(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoRef.current(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redoRef.current(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const selectedItem = iceberg?.tiers
    .flatMap((tier) => tier.items)
    .find((item) => item.id === selectedItemId) ?? null;

  useEffect(() => {
    if (selectedItemId && iceberg && !selectedItem) {
      setSelectedItemId(null);
    }
  }, [iceberg, selectedItem, selectedItemId]);

  useEffect(() => {
    if (!selectedItemId || typeof window === 'undefined' || !window.matchMedia('(max-width: 1023px)').matches) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedItemId]);

  const handleDelete = async () => {
    if (!iceberg || iceberg.id.startsWith('temp_')) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/icebergs/${iceberg.id}?action=delete`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
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

  const handleDocumentTitleChange = (value: string) => {
    updateTitle(value);
    if (!slugTouched.current) {
      const suggested = value
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 60);
      setCustomSlug(suggested);
      setSlugError(suggested ? validateSlug(suggested) : null);
    }
  };

  const handleDocumentTopicSelect = (value: string) => {
    if (value === '__custom__') {
      setUseCustomTopic(true);
      setCustomTopicInput(isPresetIcebergTopic(iceberg.topic) ? '' : iceberg.topic);
      return;
    }
    setUseCustomTopic(false);
    setCustomTopicInput('');
    updateTopic(normalizeIcebergTopic(value));
  };

  const handleCustomTopicChange = (value: string) => {
    const next = value.slice(0, 24);
    setCustomTopicInput(next);
    updateTopic(next.trim() || 'other');
  };

  const applyImportSync = async () => {
    if (!iceberg || !pendingImportSync || iceberg.id.startsWith('temp_')) return;
    setIsApplyingImportSync(true);
    try {
      // 在任何远端写入前保留完整本地快照，作为编辑器内可恢复版本。
      pushVersionSnapshot(iceberg, 'import');
      if (repositorySession) {
        const merged = mergeImportedWorkingCopy(iceberg, pendingImportSync.imported);
        setIceberg(withTopic(merged.iceberg));
        setDirty(true);
        setRepositoryWorkspaceDirty(true);
        setLastImportSyncSummary(merged.summary);
        setPendingImportSync(null);
        setSelectedItemId((current) => current && merged.iceberg.tiers.some(
          (tier) => tier.items.some((item) => item.id === current),
        ) ? current : null);
        toast('源站更新已合并到工作副本，请检查后提交版本');
        return;
      }
      const res = await fetch(`/api/icebergs/${iceberg.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync-import',
          baseUpdatedAt: iceberg.updatedAt,
          imported: pendingImportSync.imported,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data.data?.iceberg) {
        const synced = withTopic(data.data.iceberg);
        rememberMetadataBaseline(synced);
        setIceberg(synced);
        setLastSaved(new Date());
        setLastImportSyncSummary(data.data.summary);
        setPendingImportSync(null);
        setRemoteUpdateAt(null);
        clearDraft(iceberg.id);
        collaborationChannelRef.current?.postMessage({ updatedAt: synced.updatedAt });
        setSelectedItemId((current) => current && synced.tiers.some(
          (tier) => tier.items.some((item) => item.id === current),
        ) ? current : null);
        toast('源站更新已安全同步');
      } else {
        if (res.status === 409) setRemoteUpdateAt(iceberg.updatedAt);
        toast(data?.error?.message || '同步失败，当前内容未改动', 'error');
      }
    } catch (err) {
      console.error('同步 Iceberg Threads 更新失败:', err);
      toast('同步失败，当前内容未改动，请稍后重试', 'error');
    } finally {
      setIsApplyingImportSync(false);
    }
  };

  const handleSelectedItemSave = async (itemId: string, updates: Partial<Item>) => {
    const success = await handleUpdateItem(itemId, updates);
    if (success) setSelectedItemId(null);
    return success;
  };

  const leaveEditor = () => {
    window.history.length > 1 ? history.back() : (window.location.href = '/');
  };

  return (
    <div className="editor-workspace mx-auto max-w-[1520px] px-0 lg:px-5">
      {/* ── 编辑器头部 ── */}
      <header className="contents">
        {/* 标题栏 */}
        <EditorToolbar
          title={iceberg.title}
          status={iceberg.status}
          icebergId={iceberg.id}
          isNew={iceberg.id.startsWith('temp_')}
          isSaving={isSaving || repositoryWorkspaceSaving}
          isDirty={isDirty}
          lastSaved={lastSaved}
          historyCount={versionHistory.length}
          canRestore={versionHistory.length > 0 && !isRestoringVersion && !isSaving}
          isRestoring={isRestoringVersion}
          showBackConfirm={showBackConfirm}
          onBack={() => isDirty ? setShowBackConfirm((current) => !current) : leaveEditor()}
          onConfirmLeave={leaveEditor}
          onContinueEditing={() => setShowBackConfirm(false)}
          onRestore={() => {
            const previous = versionHistory[Math.min(1, versionHistory.length - 1)] ?? versionHistory[0];
            if (previous) void restoreVersion(previous);
          }}
          onShowHistory={() => setShowVersionHistory(true)}
        />

        {repositorySession && (
          <RepositoryControls
            state={{
              role: repositorySession.role,
              defaultBranchId: repositorySession.repository.defaultBranchId,
              currentBranch: repositorySession.repository.currentBranch,
              branches: repositorySession.repository.branches,
              headCommit: repositorySession.repository.headCommit,
              openPull: repositorySession.repository.openPull,
              dirty: repositoryWorkspaceDirty,
              workspaceSaving: repositoryWorkspaceSaving,
            }}
            icebergSlug={iceberg.slug || iceberg.id}
            onSelectBranch={selectRepositoryBranch}
            onCreateBranch={createRepositoryBranch}
            onCommit={commitRepositoryVersion}
            onCreatePull={createRepositoryPull}
            conflict={repositoryConflict}
            onResolveConflicts={resolveRepositoryConflicts}
            onDismissConflict={() => setRepositoryConflict(null)}
          />
        )}

        {pendingImportSync && (
          <div className="mx-3 mt-3 flex flex-col gap-3 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between lg:mx-0">
            <div>
              <p className="font-mono text-xs text-brand">已准备好 Iceberg Threads 同步数据</p>
              <p className="mt-1 font-mono text-[10px] leading-relaxed text-text-mid">
                应用后会更新同名层级和词条并加入新内容；本地独有内容、标签和已有词条 ID 会保留，源站删除不会在本站执行。
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => void applyImportSync()}
                disabled={isApplyingImportSync || isSaving || isRestoringVersion}
                className="min-h-11 rounded-lg border border-brand/50 bg-brand/10 px-3 py-1.5 font-mono text-[10px] text-brand hover:bg-brand/15 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
              >
                {isApplyingImportSync ? '同步中…' : '备份并应用同步'}
              </button>
              <button
                type="button"
                onClick={() => setPendingImportSync(null)}
                disabled={isApplyingImportSync}
                className="min-h-11 rounded-lg border border-border px-3 py-1.5 font-mono text-[10px] text-text-mid hover:bg-surface-0/60 hover:text-text-body disabled:opacity-50 sm:min-h-9"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {lastImportSyncSummary && (
          <div className="mx-3 mt-3 flex flex-col gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between lg:mx-0">
            <div>
              <p className="font-mono text-xs text-success">源站内容已同步</p>
              <p className="mt-1 font-mono text-[10px] leading-relaxed text-text-mid">
                新增 {lastImportSyncSummary.addedTiers} 个层级、{lastImportSyncSummary.addedItems} 个词条；
                更新 {lastImportSyncSummary.updatedTiers} 个层级、{lastImportSyncSummary.updatedItems} 个词条；
                安全保留 {lastImportSyncSummary.preservedTiers} 个本地层级、{lastImportSyncSummary.preservedItems} 个本地词条。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLastImportSyncSummary(null)}
              className="min-h-11 shrink-0 rounded-lg border border-border px-3 py-1.5 font-mono text-[10px] text-text-mid hover:bg-surface-0/60 hover:text-text-body sm:min-h-9"
            >
              关闭
            </button>
          </div>
        )}

        {remoteUpdateAt && (
          <div className="mx-3 mt-3 flex flex-col gap-3 rounded-xl border border-info/30 bg-info/10 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between lg:mx-0">
            <div>
              <p className="font-mono text-xs text-info">检测到其他窗口或协作者的新修改</p>
              <p className="mt-1 font-mono text-[10px] text-text-mid">
                当前编辑不会被自动覆盖；载入前会先保存一份“协作同步前备份”。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadLatestCollaborationVersion()}
              disabled={isLoadingRemoteUpdate || isRestoringVersion || isSaving}
              className="min-h-11 shrink-0 rounded-lg border border-info/50 px-3 py-1.5 font-mono text-[10px] text-info hover:bg-info/10 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
            >
              {isLoadingRemoteUpdate ? '载入中…' : '备份并载入最新版本'}
            </button>
          </div>
        )}

        {recentlyDeletedTier && (
          <div className="mx-3 mt-3 flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between lg:mx-0">
            <div>
              <p className="font-mono text-xs text-warning">
                已删除层级“{recentlyDeletedTier.name}”
              </p>
              <p className="mt-1 font-mono text-[10px] text-text-mid">
                撤销只恢复这个层级，不会回滚或覆盖其他协作者的修改。
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => void undoDeletedTier()}
                disabled={isUndoingTierDelete}
                className="min-h-11 rounded-lg border border-warning/50 px-3 py-1.5 font-mono text-[10px] text-warning hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
              >
                {isUndoingTierDelete ? '恢复中…' : '撤销删除'}
              </button>
              <button
                type="button"
                onClick={() => setRecentlyDeletedTier(null)}
                disabled={isUndoingTierDelete}
                className="min-h-11 rounded-lg border border-border px-3 py-1.5 font-mono text-[10px] text-text-mid hover:bg-surface-0/60 hover:text-text-body disabled:opacity-50 sm:min-h-9"
              >
                关闭
              </button>
            </div>
          </div>
        )}

        <div className="hidden">
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

      <div className="min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-5 lg:py-5">
        <main className="min-w-0 pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
          <section className="border-x border-b border-border-subtle bg-surface-1/90 shadow-sm lg:hidden">
            <button
              type="button"
              onClick={() => setMobileDocumentOpen((current) => !current)}
              className="flex min-h-12 w-full items-center justify-between px-4 font-mono text-xs text-text-hi"
              aria-expanded={mobileDocumentOpen}
            >
              <span>文档设置</span>
              <span className="text-text-mid">{mobileDocumentOpen ? '收起 ▲' : '展开 ▼'}</span>
            </button>
            {mobileDocumentOpen && (
              <div className="border-t border-border-subtle">
                <EditorDocumentPanel
                  idPrefix="editor-mobile-document"
                  iceberg={iceberg}
                  customSlug={customSlug}
                  slugError={slugError}
                  useCustomTopic={useCustomTopic}
                  customTopicInput={customTopicInput}
                  onTitleChange={handleDocumentTitleChange}
                  onSlugChange={(value) => {
                    slugTouched.current = true;
                    handleSlugChange(value);
                  }}
                  onTopicSelect={handleDocumentTopicSelect}
                  onCustomTopicChange={handleCustomTopicChange}
                  onDescriptionChange={updateDescription}
                  onDelete={!iceberg.id.startsWith('temp_')
                    ? () => {
                        setDeleteConfirmText('');
                        setShowDeleteConfirm(true);
                      }
                    : undefined}
                />
              </div>
            )}
          </section>

          <section className="border-x border-b border-border-subtle bg-surface-0/80 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.06)] lg:rounded-xl lg:border lg:p-5">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-border-subtle pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand/20 bg-brand/10 text-brand sm:inline-flex" aria-hidden="true">
                  ≋
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-mono text-sm font-semibold text-text-hi">层级结构</h2>
                    <span className="rounded-full border border-border-subtle bg-surface-1 px-2 py-0.5 font-mono text-[9px] text-text-mid">
                      {iceberg.tiers.length} 层
                    </span>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-text-lo">
                    使用专用把手排序，也可跨层移动词条
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddTier}
                className="min-h-11 shrink-0 rounded-lg border border-brand/40 bg-brand/5 px-3 font-mono text-xs text-brand transition-[border-color,background-color,box-shadow] hover:border-brand/70 hover:bg-brand/10 hover:shadow-[0_8px_22px_rgba(0,255,65,0.10)] sm:min-h-9"
              >
                + 添加层级
              </button>
            </div>

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
              className="editor-scroll-shell lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1 lg:[max-height:calc(100dvh-15rem)]"
            >
              <div className="space-y-4 pb-1">
                {iceberg.tiers.map((tier, index) => (
                  <TierCard
                    key={tier.id}
                    tier={tier}
                    tierIndex={index}
                    onUpdateTier={handleUpdateTier}
                    onDeleteTier={handleDeleteTier}
                    onAddItem={handleAddItem}
                    onEditItem={setSelectedItemId}
                    onDeleteItem={(itemId) => {
                      if (selectedItemId === itemId) setSelectedItemId(null);
                      void handleDeleteItem(itemId);
                    }}
                    selectedItemId={selectedItemId}
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
        className="mt-4 min-h-11 w-full rounded-xl border border-dashed border-border-subtle bg-surface-1/45 py-3 font-mono text-xs text-text-lo transition-[border-color,color,background-color] hover:border-brand hover:bg-brand/5 hover:text-brand"
      >
        [ ++ 添加层级 ]
      </button>
          </section>
        </main>

        <aside className="hidden min-h-0 flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-1/90 shadow-[0_18px_48px_rgba(0,0,0,0.08)] lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-8rem)] lg:[max-height:calc(100dvh-8rem)]">
          <div className="flex min-h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-surface-2/75 px-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand/20 bg-brand/10 font-mono text-xs text-brand" aria-hidden="true">
                {selectedItem ? '✎' : '⌁'}
              </span>
              <div className="min-w-0">
              <p className="font-mono text-xs font-semibold text-text-hi">
                {selectedItem ? '词条编辑' : '文档设置'}
              </p>
              {selectedItem && (
                <p className="mt-0.5 max-w-[280px] truncate font-mono text-[10px] text-text-lo">
                  {selectedItem.title}
                </p>
              )}
              {!selectedItem && (
                <p className="mt-0.5 font-mono text-[10px] text-text-lo">基础信息与发布设置</p>
              )}
              </div>
            </div>
            {selectedItem && (
              <button
                type="button"
                onClick={() => setSelectedItemId(null)}
                className="inline-flex min-h-9 items-center rounded-lg border border-transparent px-2 font-mono text-[10px] text-text-mid transition-colors hover:border-border-subtle hover:bg-surface-0/60 hover:text-text-hi"
              >
                返回文档设置
              </button>
            )}
          </div>

          {selectedItem ? (
            <ItemEditorForm
              key={selectedItem.id}
              item={selectedItem}
              onSave={handleSelectedItemSave}
              onCancel={() => setSelectedItemId(null)}
              surface="inspector"
            />
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <EditorDocumentPanel
                  idPrefix="editor-desktop-document"
                  iceberg={iceberg}
                  customSlug={customSlug}
                  slugError={slugError}
                  useCustomTopic={useCustomTopic}
                  customTopicInput={customTopicInput}
                  onTitleChange={handleDocumentTitleChange}
                  onSlugChange={(value) => {
                    slugTouched.current = true;
                    handleSlugChange(value);
                  }}
                  onTopicSelect={handleDocumentTopicSelect}
                  onCustomTopicChange={handleCustomTopicChange}
                  onDescriptionChange={updateDescription}
                  onDelete={!iceberg.id.startsWith('temp_')
                    ? () => {
                        setDeleteConfirmText('');
                        setShowDeleteConfirm(true);
                      }
                    : undefined}
                />
              </div>
              <EditorActionBar
                variant="desktop"
                onSave={() => void handleSave()}
                onSubmit={() => void handleSubmit()}
                canSubmit={canSubmit}
                isSaving={isSaving}
                isSubmitting={isSubmitting}
                submitText={submitButtonText}
                saveText={repositorySession ? '[ 保存工作副本 ]' : '[ 保存草稿 ]'}
              />
            </>
          )}
        </aside>
      </div>

      {selectedItem && (
        <div className="editor-mobile-item-panel fixed inset-x-0 z-[60] flex min-h-0 flex-col overflow-hidden rounded-t-2xl border-t border-brand/40 bg-surface-1 shadow-2xl lg:hidden">
          <div className="flex min-h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-surface-2/80 px-4">
            <div className="min-w-0">
              <p className="font-mono text-xs text-text-hi">词条编辑</p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-text-lo">{selectedItem.title}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedItemId(null)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center font-mono text-sm text-text-mid"
              aria-label="关闭词条编辑"
            >
              ×
            </button>
          </div>
          <ItemEditorForm
            key={selectedItem.id}
            item={selectedItem}
            onSave={handleSelectedItemSave}
            onCancel={() => setSelectedItemId(null)}
            surface="mobile"
          />
        </div>
      )}

      {!selectedItem && (
        <EditorActionBar
          variant="mobile"
          onSave={() => void handleSave()}
          onSubmit={() => void handleSubmit()}
          canSubmit={canSubmit}
          isSaving={isSaving}
          isSubmitting={isSubmitting}
          submitText={submitButtonText}
          saveText={repositorySession ? '[ 保存工作副本 ]' : '[ 保存草稿 ]'}
        />
      )}

      {/* ── 底部操作栏 ── */}
      <div className="hidden">
        <div className="sm:flex-shrink-0">
          {!iceberg.id.startsWith('temp_') && (
            <button
              onClick={() => { setDeleteConfirmText(''); setShowDeleteConfirm(true); }}
              className="min-h-11 w-full px-3 py-2 font-mono text-xs text-text-lo border border-border-subtle hover:border-[#ef444460] hover:text-danger transition-colors sm:w-auto"
            >
              [ 删除 ]
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
          <button
            onClick={handleSave}
            className="min-h-11 px-3 py-2 font-mono text-xs text-text-body border border-border hover:border-brand hover:text-brand transition-colors sm:px-4"
          >
            [ 保存草稿 ]
          </button>
          <button
            onClick={() => handleSubmit()}
            disabled={isSubmitting || !canSubmit}
            className="min-h-11 px-3 py-2 font-mono text-xs bg-brand text-[#0A0A0A] font-bold hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand sm:px-4"
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
        <div className={`${historyLeaving ? 'modal-overlay-out' : 'modal-overlay'} app-modal-viewport modern-modal-viewport fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4`}>
          <div className={`${historyLeaving ? 'modal-content-out' : 'modal-content'} app-modal-panel modern-modal-panel bg-surface-1 border border-border w-full max-w-xl font-mono`} role="dialog" aria-modal="true" aria-label="版本历史">
            <div className="modern-modal-header flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface-2">
              <div className="flex items-center gap-2">
                <span className="text-brand text-xs">⧗</span>
                <span className="text-xs text-text-hi">编辑器::版本历史</span>
              </div>
              <button
                onClick={() => setShowVersionHistory(false)}
                className="modal-icon-button text-xs text-text-mid hover:text-text-body transition-colors"
              >
                [ 关闭 ]
              </button>
            </div>
            <div className="modern-modal-body p-4">
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
                      : entry.source === 'restore'
                          ? '恢复前备份'
                      : entry.source === 'collaboration'
                            ? '协作同步前备份'
                          : entry.source === 'import'
                            ? '源站同步前备份'
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
                              onClick={() => void restoreVersion(entry)}
                              disabled={isRestoringVersion || isSaving}
                              className="text-[10px] px-2.5 py-1 border border-border text-text-body hover:border-brand hover:text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isRestoringVersion ? '恢复中…' : '恢复'}
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
        <div className={`${deleteLeaving ? 'modal-overlay-out' : 'modal-overlay'} app-modal-viewport modern-modal-viewport fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4`}>
          <div className={`${deleteLeaving ? 'modal-content-out' : 'modal-content'} app-modal-panel modern-modal-panel modern-modal-danger bg-surface-1 border border-danger/25 w-full max-w-sm font-mono`} role="alertdialog" aria-modal="true" aria-label="删除冰山图">
            <div className="modern-modal-header flex items-center gap-2 px-4 py-2 border-b border-[#ef444430] bg-danger/5">
              <span className="text-danger text-xs">!</span>
              <span className="text-xs text-danger">删除::冰山图</span>
            </div>
            <div className="modern-modal-body p-5">
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
              <div className="modern-modal-actions flex gap-3">
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
      <div className="hidden">
        {showBackConfirm && (
          <div className="bg-surface-1 border border-warning/25 font-mono text-xs p-3 shadow-xl w-44">
            <p className="text-warning mb-2 leading-snug">// 有未保存的内容</p>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => { setShowBackConfirm(false); window.history.length > 1 ? history.back() : (window.location.href = '/'); }}
                className="min-h-11 w-full py-1.5 border border-[#ef444460] text-danger hover:bg-danger/10 transition-colors"
              >
                [ 确认离开 ]
              </button>
              <button
                onClick={() => setShowBackConfirm(false)}
                className="min-h-11 w-full py-1.5 border border-border-subtle text-text-mid hover:border-[#8b949e] hover:text-text-body transition-colors"
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
          className={`min-h-11 font-mono text-sm px-5 py-3 border shadow-lg transition-colors ${
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
        <div className={`${checklistLeaving ? 'modal-overlay-out' : 'modal-overlay'} app-modal-viewport modern-modal-viewport fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4`}>
          <div className={`${checklistLeaving ? 'modal-content-out' : 'modal-content'} app-modal-panel modern-modal-panel bg-surface-1 border border-border w-full max-w-md font-mono`} role="dialog" aria-modal="true" aria-label="提交自查清单">
            <div className="modern-modal-header flex items-center gap-2 px-4 py-2 border-b border-border-subtle bg-surface-2">
              <span className="text-brand text-xs">▶</span>
              <span className="text-xs text-text-hi">提交::自查清单</span>
            </div>
            <div className="modern-modal-body p-5">
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
                <label className="flex min-h-11 items-center gap-3 mb-6 cursor-pointer select-none">
                  <span
                    onClick={() => setNsfwConfirmed(v => !v)}
                    className={`w-6 h-6 border flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors ${
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
                <div className="modern-modal-actions flex gap-3">
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
                <div className="modern-modal-actions flex gap-3">
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
