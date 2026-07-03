import { prisma } from './prisma';

let cache: Record<string, boolean> | null = null;
let cacheTime = 0;
const TTL = 30_000; // 30 seconds

export function clearFeatureCache() {
  cache = null;
  cacheTime = 0;
}

export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  const now = Date.now();
  if (cache && now - cacheTime < TTL) return cache;

  const rows = await prisma.systemSettings.findMany({
    where: { key: { startsWith: 'feature_' } },
    select: { key: true, value: true },
  });

  cache = Object.fromEntries(rows.map(r => [r.key, r.value === 'true']));
  cacheTime = now;
  return cache;
}

export function isEnabled(flags: Record<string, boolean>, key: string): boolean {
  return flags[key] ?? false;
}
