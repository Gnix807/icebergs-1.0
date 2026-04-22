import type { ChecklistResult, ChecklistItem } from './types';

interface IcebergForChecklist {
  title: string;
  description: string | null;
  tiers: Array<{
    name: string;
    order: number;
    items: Array<{ title: string; desc: string; labels: string | string[] }>;
  }>;
}

/**
 * Validate an iceberg against the 6-point pre-submission checklist.
 * Returns a ChecklistResult with individual item pass/fail and an overall passed flag.
 */
export function runChecklist(
  iceberg: IcebergForChecklist,
  nsfwConfirmed = false,
): ChecklistResult {
  const items: ChecklistItem[] = [];

  // 1. Title length >= 5
  const titleOk = iceberg.title.trim().length >= 5;
  items.push({
    key: 'title',
    label: `标题已填写（${iceberg.title.trim().length} 字）`,
    pass: titleOk,
    hint: titleOk ? undefined : '标题过短，请补充至少 5 个字',
  });

  // 2. Description length >= 20
  const desc = (iceberg.description ?? '').trim();
  const descOk = desc.length >= 20;
  items.push({
    key: 'description',
    label: `摘要已填写（${desc.length} 字）`,
    pass: descOk,
    hint: descOk ? undefined : '摘要太短，至少 20 字',
  });

  // 3. Tier count >= 3
  const tierCount = iceberg.tiers.length;
  const tiersOk = tierCount >= 3;
  items.push({
    key: 'tiers',
    label: `层数：${tierCount} 层`,
    pass: tiersOk,
    hint: tiersOk ? undefined : '至少需要 3 个层级',
  });

  // 4. Each tier must have >= 2 items
  const thinTiers = iceberg.tiers.filter(t => t.items.length < 2);
  const tierItemsOk = thinTiers.length === 0;
  const thinLabels = thinTiers.map(t => `第 ${t.order + 1} 层`).join('、');
  items.push({
    key: 'tier_items',
    label: tierItemsOk
      ? '每层词条数 ≥ 2'
      : `${thinLabels} 词条不足 2 条`,
    pass: tierItemsOk,
    hint: tierItemsOk ? undefined : `${thinLabels} 词条不足 2 条，请补充`,
  });

  // 5. >= 50% of items have non-empty desc
  const allItems = iceberg.tiers.flatMap(t => t.items);
  const totalItems = allItems.length;
  const withDesc = allItems.filter(i => i.desc && i.desc.trim().length > 0).length;
  const coverageOk = totalItems === 0 || withDesc / totalItems >= 0.5;
  const coveragePct = totalItems === 0 ? 100 : Math.round((withDesc / totalItems) * 100);
  items.push({
    key: 'coverage',
    label: `词条描述覆盖率：${coveragePct}%`,
    pass: coverageOk,
    hint: coverageOk ? undefined : '超过一半词条缺少描述，请补充',
  });

  // 6. NSFW check — does NOT block submission, routes to NSFW queue
  const hasNsfw = allItems.some(i => {
    // labels may be a parsed string[] (from store) or a JSON string (from DB)
    let labels: string[];
    if (Array.isArray(i.labels)) {
      labels = i.labels as unknown as string[];
    } else {
      try { labels = JSON.parse(i.labels); } catch { labels = []; }
    }
    return labels.some((l: string) => l.toLowerCase() === 'nsfw');
  });
  items.push({
    key: 'nsfw',
    label: hasNsfw
      ? nsfwConfirmed
        ? '已确认含 NSFW 内容，将进入专项审核队列'
        : '检测到 NSFW 标签，请勾选确认'
      : '无 NSFW 内容',
    pass: !hasNsfw || nsfwConfirmed,
    hint: hasNsfw && !nsfwConfirmed
      ? '含 NSFW 标签的内容需要勾选确认后才能提交'
      : undefined,
  });

  const passed = items.every(i => i.pass);
  return { passed, items };
}
