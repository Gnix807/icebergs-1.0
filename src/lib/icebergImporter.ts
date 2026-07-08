/**
 * icebergImporter.ts — 从 IcebergThreads Firestore API 导入冰山图
 *
 * Firestore REST API 返回格式:
 *   { fields: { title: {stringValue}, layers: {arrayValue: {values: [...]}}, ... } }
 *
 * 每个 layer:
 *   { mapValue: { fields: { title: {stringValue}, items: {arrayValue: {values: [...]}} } } }
 *
 * 每个 item:
 *   { mapValue: { fields: { title: {stringValue}, description: {stringValue?}, ... } } }
 */

export interface ImportedItem {
  title: string;
  desc: string;
  labels: string[];
}

export interface ImportedTier {
  name: string;
  desc: string;
  items: ImportedItem[];
}

export interface ImportedIceberg {
  title: string;
  description: string;
  topic: string;
  tiers: ImportedTier[];
  isNsfw: boolean;
  stats: {
    layerCount: number;
    itemCount: number;
    originalLayerCount: number;
  };
}

interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
}

function sv(v: FirestoreValue | undefined): string {
  return v?.stringValue ?? '';
}

function iv(v: FirestoreValue | undefined): number {
  return v?.integerValue ? Number(v.integerValue) : 0;
}

function bv(v: FirestoreValue | undefined): boolean {
  return v?.booleanValue ?? false;
}

/**
 * 从 Firestore REST API 响应的 fields 中提取冰山图数据
 */
export function parseIcebergThreads(
  fields: Record<string, FirestoreValue>,
  options: { maxItemsPerLayer?: number } = {},
): ImportedIceberg {
  const maxItems = options.maxItemsPerLayer ?? 500;

  const title = sv(fields.title) || '导入的冰山图';
  const description = sv(fields.description) || '';
  const isNsfw = bv(fields.isNSFW);
  const tags: string[] = (fields.tags?.arrayValue?.values ?? [])
    .map(v => sv(v))
    .filter(Boolean);

  // 解析层级
  const rawLayers: FirestoreValue[] = fields.layers?.arrayValue?.values ?? [];
  const tiers: ImportedTier[] = [];

  for (const layerVal of rawLayers) {
    const lf = layerVal.mapValue?.fields ?? {};
    const name = sv(lf.title);
    const rawItems: FirestoreValue[] = lf.items?.arrayValue?.values ?? [];

    // 跳过空层或说明层
    if (rawItems.length === 0) continue;
    if (/^(说明|Notes|说明文档|编辑说明)/i.test(name) && tiers.length === 0) continue;

    const items: ImportedItem[] = [];
    const limit = Math.min(rawItems.length, maxItems);

    for (let i = 0; i < limit; i++) {
      const itemVal = rawItems[i];
      const if_ = itemVal.mapValue?.fields ?? {};
      const itemTitle = sv(if_.text) || sv(if_.title) || `词条 ${i + 1}`;
      const itemDesc = sv(if_.description) || sv(if_.desc) || '';
      const itemUrl = sv(if_.url) || '';
      const fullDesc = itemUrl && itemUrl.startsWith('http')
        ? (itemDesc ? `${itemDesc}\n\n来源: ${itemUrl}` : `来源: ${itemUrl}`)
        : itemDesc;
      const itemLabels: string[] = [];

      // 词条自身的 NSFW 标记
      if (bv(if_.isNSFW) || bv(if_.nsfw)) {
        itemLabels.push('NSFW');
      }

      // 顶层：如果原图是 NSFW，给前几条打标签
      if (isNsfw && i < 3 && tiers.length === 0) {
        itemLabels.push('NSFW');
      }

      // 从原始 tags 映射到标签
      if (tags.length > 0 && i === 0) {
        for (const tag of tags.slice(0, 3)) {
          if (tag && !itemLabels.includes(tag)) {
            itemLabels.push(tag);
          }
        }
      }

      items.push({ title: itemTitle, desc: fullDesc, labels: itemLabels });
    }

    // 如果因为限制截断了，添加提示词条
    if (rawItems.length > maxItems) {
      items.push({
        title: `（本层共 ${rawItems.length} 条，已截取前 ${maxItems} 条）`,
        desc: `原始冰山图本层包含 ${rawItems.length} 个词条，导入时截取了前 ${maxItems} 条以保持编辑器流畅。可手动补充剩余内容。`,
        labels: ['待完善'],
      });
    }

    tiers.push({ name, desc: '', items });
  }

  return {
    title,
    description,
    topic: 'general',
    tiers,
    isNsfw,
    stats: {
      layerCount: tiers.length,
      itemCount: tiers.reduce((s, t) => s + t.items.length, 0),
      originalLayerCount: rawLayers.length,
    },
  };
}

/**
 * 从 URL 提取 IcebergThreads 的文档 ID
 * 支持格式: icebergthreads.com/zh/iceberg/{docId}
 */
export function extractIcebergThreadsId(url: string): string | null {
  const m = url.match(/icebergthreads\.com\/\w+\/iceberg\/([a-zA-Z0-9_-]+)/);
  return m?.[1] ?? null;
}

/**
 * Firestore REST API 的基础 URL
 */
const FIRESTORE_BASE =
  'https://firestore.googleapis.com/v1/projects/iceberg-charts/databases/(default)/documents';

/**
 * 通过 Firestore REST API 获取 icebergthreads 冰山图原始数据
 */
export async function fetchIcebergThreads(
  docId: string,
): Promise<{ title: string; itemCount: number } & Record<string, FirestoreValue>> {
  const url = `${FIRESTORE_BASE}/icebergs/${encodeURIComponent(docId)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });

  if (!res.ok) {
    throw new Error(`Firestore 请求失败: HTTP ${res.status}`);
  }

  const doc = await res.json() as { fields?: Record<string, FirestoreValue> };
  if (!doc.fields) {
    throw new Error('无法解析冰山图数据');
  }

  return { title: sv(doc.fields.title), itemCount: 0, ...doc.fields };
}
