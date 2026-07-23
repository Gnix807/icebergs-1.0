// src/lib/editorDraft.ts
// 编辑器草稿存储抽象 — 优先服务端 API，失败时 fallback 到 localStorage

const API_BASE = '/api/drafts';

function lsKey(icebergId: string | null): string {
  return icebergId ? `iceberg_draft_${icebergId}` : 'iceberg_draft_new';
}

export async function loadDraft(icebergId: string | null): Promise<any | null> {
  try {
    const params = icebergId ? `?icebergId=${encodeURIComponent(icebergId)}` : '?icebergId=null';
    const res = await fetch(`${API_BASE}${params}`);
    if (!res.ok) throw new Error('server unavailable');
    const json = await res.json();
    if (json.success && json.data?.draft?.data) {
      return typeof json.data.draft.data === 'string'
        ? JSON.parse(json.data.draft.data)
        : json.data.draft.data;
    }
    return null;
  } catch {
    // fallback to localStorage
    try {
      const raw = localStorage.getItem(lsKey(icebergId));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}

export async function saveDraft(icebergId: string | null, data: any): Promise<void> {
  // always mirror to localStorage as backup
  try {
    const payload = { ...data, _draftSavedAt: Date.now() };
    localStorage.setItem(lsKey(icebergId), JSON.stringify(payload));
  } catch {}

  // save to server (fire-and-forget)
  fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      icebergId: icebergId || null,
      data: JSON.stringify(data),
    }),
  }).catch(() => {});
}

export async function clearDraft(icebergId: string | null): Promise<void> {
  try { localStorage.removeItem(lsKey(icebergId)); } catch {}
  const params = icebergId ? `?icebergId=${encodeURIComponent(icebergId)}` : '?icebergId=null';
  fetch(`${API_BASE}${params}${params.includes('?') ? '&' : '?'}action=delete`, { headers: { 'Content-Type': 'application/json' } }).catch(() => {});
}
