import { useCallback, useRef } from 'react';
import { useIcebergStore } from '../stores/icebergStore';
import * as api from '../lib/api-client';

const AUTOSAVE_DELAY = 3000; // 3 秒防抖

export function useApiSave(icebergId: string | null) {
  const { iceberg, setLastSaved, setDirty, setIceberg } = useIcebergStore();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createdRef = useRef(false); // 防止重复创建

  // 保存到后端
  const saveToServer = useCallback(async () => {
    if (!iceberg || !icebergId) return;

    try {
      // 如果是新建的冰山图（本地ID），先创建
      if (icebergId === 'new' && !createdRef.current) {
        const created = await api.createIceberg({
          title: iceberg.title || '未命名冰山图',
          description: iceberg.description || '',
          topic: iceberg.topic,
        });
        createdRef.current = true;

        // 用服务器返回的数据替换本地数据
        setIceberg({
          ...created,
          tiers: iceberg.tiers, // 保留本地的 tiers
        });

        setLastSaved(new Date());
        setDirty(false);
        return;
      }

      // 如果冰山图已创建，更新标题和描述
      if (createdRef.current || iceberg.id !== icebergId) {
        const realId = createdRef.current ? iceberg.id : icebergId;
        await api.updateIceberg(realId, {
          title: iceberg.title,
          description: iceberg.description,
          topic: iceberg.topic,
          status: iceberg.status,
        });

        setLastSaved(new Date());
        setDirty(false);
      }
    } catch (err) {
      console.error('保存失败:', err);
    }
  }, [iceberg, icebergId, setLastSaved, setDirty, setIceberg]);

  // 防抖保存
  const debouncedSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      saveToServer();
    }, AUTOSAVE_DELAY);
  }, [saveToServer]);

  // 加载冰山图数据
  const loadIceberg = useCallback(async (id: string) => {
    try {
      const data = await api.getIceberg(id);
      setIceberg(data);
      createdRef.current = true;
      return data;
    } catch (err) {
      console.error('加载失败:', err);
      throw err;
    }
  }, [setIceberg]);

  return {
    saveToServer,
    debouncedSave,
    loadIceberg,
  };
}
