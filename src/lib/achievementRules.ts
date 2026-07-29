const FORBIDDEN_AUTHORIZATION_BLOCKS = new Set([
  'qualityLevel',
  'qualityScore',
  'collabEditCount',
  'role',
  'capability',
]);

export type AchievementLifecycle = 'ACTIVE' | 'LEGACY' | 'ARCHIVED';

export function validateAchievementConditions(raw: string): {
  valid: boolean;
  message?: string;
} {
  let conditions: unknown;
  try {
    conditions = JSON.parse(raw || '[]');
  } catch {
    return { valid: false, message: '成就条件必须是有效的 JSON' };
  }
  if (!Array.isArray(conditions)) {
    return { valid: false, message: '成就条件必须是数组' };
  }
  for (const condition of conditions) {
    if (!condition || typeof condition !== 'object') continue;
    const block = (condition as { block?: unknown }).block;
    if (typeof block === 'string' && FORBIDDEN_AUTHORIZATION_BLOCKS.has(block)) {
      return {
        valid: false,
        message: `条件 ${block} 已退役；成就不能依赖角色、能力或旧质量分`,
      };
    }
  }
  return { valid: true };
}

export function isAchievementLifecycle(value: unknown): value is AchievementLifecycle {
  return value === 'ACTIVE' || value === 'LEGACY' || value === 'ARCHIVED';
}
