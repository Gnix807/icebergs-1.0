import { create } from 'zustand';
import type { IcebergTopic } from '../lib/icebergTopic';

export interface Item {
  id: string;
  title: string;
  desc: string;
  order: number;
  tierId: string;
  labels: string[];
  updatedAt?: string;
}

export interface Tier {
  id: string;
  name: string;
  desc: string;
  order: number;
  icebergId: string;
  items: Item[];
}

export interface Iceberg {
  id: string;
  slug: string;
  title: string;
  description?: string;
  topic: IcebergTopic;
  authorId: string;
  projectId?: string | null;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
  viewCount: number;
  tiers: Tier[];
  review?: {
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'OVERRIDDEN';
    note?: string | null;
    reviewedAt?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface UndoState {
  undoStack: string[];
  redoStack: string[];
}

const MAX_UNDO = 80;

interface IcebergStore {
  iceberg: Iceberg | null;
  isDirty: boolean;
  lastSaved: Date | null;
  canUndo: boolean;
  canRedo: boolean;

  setIceberg: (iceberg: Iceberg | null) => void;
  updateTitle: (title: string) => void;
  updateDescription: (description: string) => void;
  updateTopic: (topic: IcebergTopic) => void;
  addTier: (tier: Tier) => void;
  updateTier: (tierId: string, updates: Partial<Tier>) => void;
  removeTier: (tierId: string) => void;
  reorderTiers: (tierIds: string[]) => void;
  addItem: (tierId: string, item: Item) => void;
  updateItem: (itemId: string, updates: Partial<Item>) => void;
  removeItem: (itemId: string) => void;
  moveItem: (itemId: string, fromTierId: string, toTierId: string, newOrder: number) => void;
  setDirty: (dirty: boolean) => void;
  setLastSaved: (date: Date) => void;
  undo: () => void;
  redo: () => void;
  clearUndoHistory: () => void;
}

export const useIcebergStore = create<IcebergStore>((set, get) => {
  const undoState: UndoState = { undoStack: [], redoStack: [] };

  function snapshot(): string {
    const ice = get().iceberg;
    return ice ? JSON.stringify(ice) : '';
  }

  function restore(json: string): Iceberg | null {
    if (!json) return null;
    try { return JSON.parse(json); } catch { return null; }
  }

  function pushUndo() {
    const s = snapshot();
    if (!s) return;
    if (undoState.undoStack.length >= MAX_UNDO) undoState.undoStack.shift();
    undoState.undoStack.push(s);
    undoState.redoStack = [];
  }

  function undoImpl() {
    const prev = undoState.undoStack.pop();
    if (prev === undefined) return;
    const current = snapshot();
    if (current) { undoState.redoStack.push(current); }
    const restored = restore(prev);
    if (restored) {
      set({ iceberg: restored, isDirty: true, canUndo: undoState.undoStack.length > 0, canRedo: undoState.redoStack.length > 0 });
    }
  }

  function redoImpl() {
    const next = undoState.redoStack.pop();
    if (next === undefined) return;
    const current = snapshot();
    if (current) { undoState.undoStack.push(current); }
    const restored = restore(next);
    if (restored) {
      set({ iceberg: restored, isDirty: true, canUndo: undoState.undoStack.length > 0, canRedo: undoState.redoStack.length > 0 });
    }
  }

  function clearHistory() {
    undoState.undoStack = [];
    undoState.redoStack = [];
    set({ canUndo: false, canRedo: false });
  }

  return {
    iceberg: null,
    isDirty: false,
    lastSaved: null,
    canUndo: false,
    canRedo: false,

    setIceberg: (iceberg) => {
      undoState.undoStack = [];
      undoState.redoStack = [];
      set({ iceberg, isDirty: false, canUndo: false, canRedo: false });
    },

    updateTitle: (title) => {
      pushUndo();
      set((state) => ({
        iceberg: state.iceberg ? { ...state.iceberg, title } : null,
        isDirty: true,
        canUndo: undoState.undoStack.length > 0,
        canRedo: false,
      }));
    },

    updateDescription: (description) => {
      pushUndo();
      set((state) => ({
        iceberg: state.iceberg ? { ...state.iceberg, description } : null,
        isDirty: true,
        canUndo: undoState.undoStack.length > 0,
        canRedo: false,
      }));
    },

    updateTopic: (topic) => {
      pushUndo();
      set((state) => ({
        iceberg: state.iceberg ? { ...state.iceberg, topic } : null,
        isDirty: true,
        canUndo: undoState.undoStack.length > 0,
        canRedo: false,
      }));
    },

    addTier: (tier) => {
      pushUndo();
      set((state) => ({
        iceberg: state.iceberg ? { ...state.iceberg, tiers: [...state.iceberg.tiers, tier] } : null,
        isDirty: true,
        canUndo: undoState.undoStack.length > 0,
        canRedo: false,
      }));
    },

    updateTier: (tierId, updates) => {
      pushUndo();
      set((state) => ({
        iceberg: state.iceberg ? { ...state.iceberg, tiers: state.iceberg.tiers.map((t) => t.id === tierId ? { ...t, ...updates } : t) } : null,
        isDirty: true,
        canUndo: undoState.undoStack.length > 0,
        canRedo: false,
      }));
    },

    removeTier: (tierId) => {
      pushUndo();
      set((state) => ({
        iceberg: state.iceberg ? { ...state.iceberg, tiers: state.iceberg.tiers.filter((t) => t.id !== tierId) } : null,
        isDirty: true,
        canUndo: undoState.undoStack.length > 0,
        canRedo: false,
      }));
    },

    reorderTiers: (tierIds) => {
      pushUndo();
      set((state) => ({
        iceberg: state.iceberg ? { ...state.iceberg, tiers: tierIds.map((id, index) => { const tier = state.iceberg!.tiers.find((t) => t.id === id); return tier ? { ...tier, order: index } : null; }).filter(Boolean) as Tier[] } : null,
        isDirty: true,
        canUndo: undoState.undoStack.length > 0,
        canRedo: false,
      }));
    },

    addItem: (tierId, item) => {
      pushUndo();
      set((state) => ({
        iceberg: state.iceberg ? { ...state.iceberg, tiers: state.iceberg.tiers.map((t) => t.id === tierId ? { ...t, items: [...t.items, item] } : t) } : null,
        isDirty: true,
        canUndo: undoState.undoStack.length > 0,
        canRedo: false,
      }));
    },

    updateItem: (itemId, updates) => {
      pushUndo();
      set((state) => ({
        iceberg: state.iceberg ? { ...state.iceberg, tiers: state.iceberg.tiers.map((t) => ({ ...t, items: t.items.map((i) => i.id === itemId ? { ...i, ...updates } : i) })) } : null,
        isDirty: true,
        canUndo: undoState.undoStack.length > 0,
        canRedo: false,
      }));
    },

    removeItem: (itemId) => {
      pushUndo();
      set((state) => ({
        iceberg: state.iceberg ? { ...state.iceberg, tiers: state.iceberg.tiers.map((t) => ({ ...t, items: t.items.filter((i) => i.id !== itemId) })) } : null,
        isDirty: true,
        canUndo: undoState.undoStack.length > 0,
        canRedo: false,
      }));
    },

    moveItem: (itemId, fromTierId, toTierId, newOrder) => {
      pushUndo();
      set((state) => {
        if (!state.iceberg) return state;
        const fromTier = state.iceberg.tiers.find((t) => t.id === fromTierId);
        const item = fromTier?.items.find((i) => i.id === itemId);
        if (!item) return state;
        return {
          iceberg: { ...state.iceberg, tiers: state.iceberg.tiers.map((t) => {
            if (t.id === fromTierId) return { ...t, items: t.items.filter((i) => i.id !== itemId) };
            if (t.id === toTierId) { const newItems = [...t.items]; newItems.splice(newOrder, 0, { ...item, tierId: toTierId }); return { ...t, items: newItems }; }
            return t;
          }) },
          isDirty: true,
          canUndo: undoState.undoStack.length > 0,
          canRedo: false,
        };
      });
    },

    setDirty: (isDirty) => set({ isDirty }),
    setLastSaved: (lastSaved) => set({ lastSaved }),

    undo: undoImpl,
    redo: redoImpl,
    clearUndoHistory: clearHistory,
  };
});
