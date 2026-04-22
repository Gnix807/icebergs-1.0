import { useEffect, useRef, useCallback } from 'react';
import { useIcebergStore } from '../stores/icebergStore';

const AUTOSAVE_DELAY = 5000; // 5 秒防抖
const LOCALSTORAGE_KEY = 'iceberg_draft';

interface DraftData {
  icebergId: string | null;
  content: string;
  savedAt: string;
}

export function useAutoSave(icebergId: string | null) {
  const { iceberg, isDirty, setLastSaved, setDirty } = useIcebergStore();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 保存到 localStorage 作为兜底
  const saveToLocalStorage = useCallback(() => {
    if (!iceberg) return;

    const draft: DraftData = {
      icebergId,
      content: JSON.stringify(iceberg),
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(draft));
  }, [iceberg, icebergId]);

  // 保存到后端
  const saveToServer = useCallback(async () => {
    if (!iceberg || !icebergId) return;

    try {
      const response = await fetch(`/api/icebergs/${icebergId}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(iceberg),
      });

      if (response.ok) {
        const { savedAt } = await response.json();
        setLastSaved(new Date(savedAt));
        setDirty(false);

        // 清除 localStorage 中的草稿
        localStorage.removeItem(LOCALSTORAGE_KEY);
      }
    } catch (error) {
      console.error('自动保存失败:', error);
    }
  }, [iceberg, icebergId, setLastSaved, setDirty]);

  // 从 localStorage 恢复草稿
  const loadFromLocalStorage = useCallback((): DraftData | null => {
    const saved = localStorage.getItem(LOCALSTORAGE_KEY);
    if (!saved) return null;

    try {
      return JSON.parse(saved) as DraftData;
    } catch {
      return null;
    }
  }, []);

  // 定时保存到 localStorage（兜底）
  useEffect(() => {
    const interval = setInterval(() => {
      if (isDirty) {
        saveToLocalStorage();
      }
    }, 30000); // 每 30 秒

    return () => clearInterval(interval);
  }, [isDirty, saveToLocalStorage]);

  // 防抖自动保存
  useEffect(() => {
    if (!isDirty) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      saveToServer();
    }, AUTOSAVE_DELAY);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isDirty, saveToServer]);

  return {
    saveToLocalStorage,
    loadFromLocalStorage,
    saveToServer: () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      saveToServer();
    },
  };
}
