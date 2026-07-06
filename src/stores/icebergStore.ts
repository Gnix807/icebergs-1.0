import { create } from 'zustand';
import type { IcebergTopic } from '../lib/icebergTopic';

export interface Item {
  id: string;
  title: string;
  desc: string;
  order: number;
  tierId: string;
  labels: string[];
}

export interface Tier {
  id: string;
  name: string;
  desc: string;
  order: number;
  bgImage?: string;
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
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
  viewCount: number;
  coverImage?: string;
  tiers: Tier[];
  review?: {
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'OVERRIDDEN';
    note?: string | null;
    reviewedAt?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface IcebergStore {
  iceberg: Iceberg | null;
  isDirty: boolean;
  lastSaved: Date | null;

  // Actions
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
}

export const useIcebergStore = create<IcebergStore>((set) => ({
  iceberg: null,
  isDirty: false,
  lastSaved: null,

  setIceberg: (iceberg) => set({ iceberg, isDirty: false }),

  updateTitle: (title) =>
    set((state) => ({
      iceberg: state.iceberg ? { ...state.iceberg, title } : null,
      isDirty: true,
    })),

  updateDescription: (description) =>
    set((state) => ({
      iceberg: state.iceberg ? { ...state.iceberg, description } : null,
      isDirty: true,
    })),

  updateTopic: (topic) =>
    set((state) => ({
      iceberg: state.iceberg ? { ...state.iceberg, topic } : null,
      isDirty: true,
    })),

  addTier: (tier) =>
    set((state) => ({
      iceberg: state.iceberg
        ? { ...state.iceberg, tiers: [...state.iceberg.tiers, tier] }
        : null,
      isDirty: true,
    })),

  updateTier: (tierId, updates) =>
    set((state) => ({
      iceberg: state.iceberg
        ? {
            ...state.iceberg,
            tiers: state.iceberg.tiers.map((t) =>
              t.id === tierId ? { ...t, ...updates } : t
            ),
          }
        : null,
      isDirty: true,
    })),

  removeTier: (tierId) =>
    set((state) => ({
      iceberg: state.iceberg
        ? {
            ...state.iceberg,
            tiers: state.iceberg.tiers.filter((t) => t.id !== tierId),
          }
        : null,
      isDirty: true,
    })),

  reorderTiers: (tierIds) =>
    set((state) => ({
      iceberg: state.iceberg
        ? {
            ...state.iceberg,
            tiers: tierIds
              .map((id, index) => {
                const tier = state.iceberg!.tiers.find((t) => t.id === id);
                return tier ? { ...tier, order: index } : null;
              })
              .filter(Boolean) as Tier[],
          }
        : null,
      isDirty: true,
    })),

  addItem: (tierId, item) =>
    set((state) => ({
      iceberg: state.iceberg
        ? {
            ...state.iceberg,
            tiers: state.iceberg.tiers.map((t) =>
              t.id === tierId ? { ...t, items: [...t.items, item] } : t
            ),
          }
        : null,
      isDirty: true,
    })),

  updateItem: (itemId, updates) =>
    set((state) => ({
      iceberg: state.iceberg
        ? {
            ...state.iceberg,
            tiers: state.iceberg.tiers.map((t) => ({
              ...t,
              items: t.items.map((i) =>
                i.id === itemId ? { ...i, ...updates } : i
              ),
            })),
          }
        : null,
      isDirty: true,
    })),

  removeItem: (itemId) =>
    set((state) => ({
      iceberg: state.iceberg
        ? {
            ...state.iceberg,
            tiers: state.iceberg.tiers.map((t) => ({
              ...t,
              items: t.items.filter((i) => i.id !== itemId),
            })),
          }
        : null,
      isDirty: true,
    })),

  moveItem: (itemId, fromTierId, toTierId, newOrder) =>
    set((state) => {
      if (!state.iceberg) return state;

      const fromTier = state.iceberg.tiers.find((t) => t.id === fromTierId);
      const item = fromTier?.items.find((i) => i.id === itemId);
      if (!item) return state;

      return {
        iceberg: {
          ...state.iceberg,
          tiers: state.iceberg.tiers.map((t) => {
            if (t.id === fromTierId) {
              return { ...t, items: t.items.filter((i) => i.id !== itemId) };
            }
            if (t.id === toTierId) {
              const newItems = [...t.items];
              newItems.splice(newOrder, 0, { ...item, tierId: toTierId });
              return { ...t, items: newItems };
            }
            return t;
          }),
        },
        isDirty: true,
      };
    }),

  setDirty: (isDirty) => set({ isDirty }),
  setLastSaved: (lastSaved) => set({ lastSaved }),
}));
