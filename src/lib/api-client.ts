import type { Iceberg, Tier, Item } from '../stores/icebergStore';

const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || '请求失败');
  }

  return data.data;
}

// ==================== Iceberg ====================

export interface IcebergListResponse {
  items: Iceberg[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getIcebergList(params?: {
  page?: number;
  limit?: number;
  status?: string;
  q?: string;
  sort?: 'newest' | 'oldest' | 'popular';
  nsfw?: 'show' | 'hide';
  topic?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.page)   searchParams.set('page',   String(params.page));
  if (params?.limit)  searchParams.set('limit',  String(params.limit));
  if (params?.status) searchParams.set('status', params.status);
  if (params?.q)      searchParams.set('q',      params.q);
  if (params?.sort)   searchParams.set('sort',   params.sort);
  if (params?.nsfw)   searchParams.set('nsfw',   params.nsfw);
  if (params?.topic)  searchParams.set('topic',  params.topic);

  const query = searchParams.toString();
  return request<IcebergListResponse>(`/icebergs${query ? `?${query}` : ''}`);
}

export async function getIceberg(id: string) {
  return request<Iceberg>(`/icebergs/${id}`);
}

export async function createIceberg(data: { title: string; description?: string; topic?: string }) {
  return request<Iceberg>(`/icebergs?data=${encodeURIComponent(JSON.stringify(data))}`);
}

export async function updateIceberg(id: string, data: { title?: string; description?: string; topic?: string; status?: string }) {
  return request<Iceberg>(`/icebergs/${id}?data=${encodeURIComponent(JSON.stringify(data))}`);
}

export async function deleteIceberg(id: string) {
  return request<{ deleted: boolean }>(`/icebergs/${id}?action=delete`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
}

// ==================== Tier ====================

export async function getTiers(icebergId: string) {
  return request<Tier[]>(`/icebergs/${icebergId}/tiers`);
}

export async function createTier(icebergId: string, data: { name: string; order?: number }) {
  return request<Tier>(`/icebergs/${icebergId}/tiers`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTier(id: string, data: { name?: string; order?: number }) {
  return request<Tier>(`/tiers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteTier(id: string) {
  return request<{ deleted: boolean }>(`/tiers/${id}?action=delete`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
}

// ==================== Item ====================

export async function createItem(tierId: string, data: { title: string; desc?: string }) {
  return request<Item>(`/tiers/${tierId}/items`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateItem(id: string, data: { title?: string; desc?: string }) {
  return request<Item>(`/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteItem(id: string) {
  return request<{ deleted: boolean }>(`/items/${id}?action=delete`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
}
