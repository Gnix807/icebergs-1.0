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
 *
 * The checklist in the writing guide (/guide/writing) lists 11 items for user
 * self-review; the 6 here are the subset that can be automatically validated.
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
    hint: titleOk ? undefined : '标题至少需 5 个字，简洁说明主题即可',
  });

  // 2. Description length >= 20
  const desc = (iceberg.description ?? '').trim();
  const descOk = desc.length >= 20;
  items.push({
    key: 'description',
    label: `摘要已填写（${desc.length} 字）`,
    pass: descOk,
    hint: descOk ? undefined : '摘要至少20字，简要说明该冰山图的范围与视角',
  });

  // 3. Tier count >= 3
  const tierCount = iceberg.tiers.length;
  const tiersOk = tierCount >= 3;
  items.push({
    key: 'tiers',
    label: `层级数量：${tierCount} 层`,
    pass: tiersOk,
    hint: tiersOk ? undefined : '至少需要 3 个层级来体现知识深度梯度',
  });

  // 4. Each tier must have >= 2 items
  const thinTiers = iceberg.tiers.filter(t => t.items.length < 2);
  const tierItemsOk = thinTiers.length === 0;
  const thinLabels = thinTiers.map(t => `「${t.name}」`).join('、');
  items.push({
    key: 'tier_items',
    label: tierItemsOk
      ? '每层词条数 ≥ 2 条'
      : `${thinLabels} 不足 2 条`,
    pass: tierItemsOk,
    hint: tierItemsOk ? undefined : `${thinLabels} 请至少为每层添加 2 个词条`,
  });

  // 5. Item description coverage is recommended, but no longer blocks
  // submission. This keeps older/imported title-only icebergs portable while
  // still giving creators a visible target for later improvements.
  const allItems = iceberg.tiers.flatMap(t => t.items);
  const totalItems = allItems.length;
  const withDesc = allItems.filter(i => i.desc && i.desc.trim().length > 0).length;
  const coverageOk = totalItems === 0 || withDesc / totalItems >= 0.5;
  const coveragePct = totalItems === 0 ? 100 : Math.round((withDesc / totalItems) * 100);
  items.push({
    key: 'coverage',
    label: `词条描述覆盖率：${coveragePct}%（建议 ≥ 50%）`,
    pass: coverageOk,
    blocking: false,
    hint: coverageOk ? undefined : '不影响提交，可以先进入审核，发布后再逐步补充词条介绍',
  });

  // 6. NSFW check — does NOT block submission, routes to NSFW queue
  const hasNsfw = allItems.some(i => {
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
        ? '已确认含 NSFW 内容，提交后进入专项审核'
        : '检测到 NSFW 标签，提交前请勾选确认'
      : '无 NSFW 内容',
    pass: !hasNsfw || nsfwConfirmed,
    hint: hasNsfw && !nsfwConfirmed
      ? '含成人、血腥等内容的词条需标注 NSFW 并在此确认'
      : undefined,
  });

  const passed = items.every(i => i.pass || i.blocking === false);
  return { passed, items };
}
