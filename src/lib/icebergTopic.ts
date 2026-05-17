export const ICEBERG_TOPICS = [
  { value: 'general', label: '综合' },
  { value: 'game', label: '游戏' },
  { value: 'urban_legend', label: '都市传说' },
  { value: 'conspiracy', label: '阴谋论' },
  { value: 'history', label: '历史' },
  { value: 'science', label: '科学' },
  { value: 'technology', label: '科技' },
  { value: 'culture', label: '文化' },
  { value: 'horror', label: '恐怖' },
  { value: 'other', label: '其他' },
] as const;

export type PresetIcebergTopic = (typeof ICEBERG_TOPICS)[number]['value'];
export type IcebergTopic = string;

const TOPIC_SET = new Set<string>(ICEBERG_TOPICS.map((item) => item.value));

export function isPresetIcebergTopic(value: string): value is PresetIcebergTopic {
  return TOPIC_SET.has(value);
}

export function normalizeIcebergTopic(value: unknown, fallback = 'general'): IcebergTopic {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/\s+/g, ' ').trim().slice(0, 24);
  return normalized || fallback;
}

export function getIcebergTopicLabel(topic: string): string {
  const found = ICEBERG_TOPICS.find((item) => item.value === topic);
  return found?.label ?? (topic || '其他');
}
