import { renderMarkdownWithMath } from './markdown';

interface CacheEntry {
  html: string;
  timestamp: number;
}

const MAX_SIZE = 500;
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

let hits = 0;
let misses = 0;

export function getCachedMarkdown(itemId: string, desc: string, updatedAt: Date | string): string {
  const key = `${itemId}:${new Date(updatedAt).getTime()}`;
  const now = Date.now();

  const entry = cache.get(key);
  if (entry && now - entry.timestamp < TTL_MS) {
    hits++;
    return entry.html;
  }

  misses++;
  const html = renderMarkdownWithMath(desc);

  if (cache.size >= MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }

  cache.set(key, { html, timestamp: now });
  return html;
}

export function getCacheStats() {
  return { hits, misses, size: cache.size };
}

export function clearCache() {
  cache.clear();
  hits = 0;
  misses = 0;
}
