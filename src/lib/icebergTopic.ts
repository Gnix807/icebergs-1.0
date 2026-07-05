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
  { value: 'anime', label: '动漫' },
  { value: 'internet', label: '网络文化' },
  { value: 'military', label: '军事' },
  { value: 'religion', label: '宗教哲学' },
  { value: 'nature', label: '自然生态' },
  { value: 'medicine', label: '医学心理' },
  { value: 'sports', label: '体育' },
  { value: 'food', label: '美食' },
  { value: 'music', label: '音乐' },
  { value: 'art', label: '建筑艺术' },
  { value: 'space', label: '天文太空' },
  { value: 'crime', label: '犯罪悬疑' },
  { value: 'politics', label: '政治社会' },
  { value: 'education', label: '教育学术' },
  { value: 'finance', label: '经济金融' },
  { value: 'folklore', label: '民俗神话' },
  { value: 'travel', label: '交通旅行' },
  { value: 'literature', label: '文学影视' },
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
