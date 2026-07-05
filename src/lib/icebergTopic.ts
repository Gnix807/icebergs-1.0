export const ICEBERG_TOPICS = [
  { value: 'general', label: '综合' },
  { value: 'history', label: '历史' },
  { value: 'science', label: '科学' },
  { value: 'technology', label: '科技' },
  { value: 'philosophy', label: '哲学' },
  { value: 'culture', label: '文化' },
  { value: 'art', label: '建筑艺术' },
  { value: 'literature', label: '文学影视' },
  { value: 'music', label: '音乐' },
  { value: 'game', label: '游戏' },
  { value: 'anime', label: '动漫' },
  { value: 'internet', label: '网络文化' },
  { value: 'education', label: '教育学术' },
  { value: 'language', label: '语言' },
  { value: 'politics', label: '政治社会' },
  { value: 'finance', label: '经济金融' },
  { value: 'military', label: '军事' },
  { value: 'religion', label: '宗教哲学' },
  { value: 'folklore', label: '民俗神话' },
  { value: 'space', label: '天文太空' },
  { value: 'nature', label: '自然生态' },
  { value: 'biology', label: '生物' },
  { value: 'geography', label: '地理' },
  { value: 'medicine', label: '医学心理' },
  { value: 'math', label: '数学' },
  { value: 'physics', label: '物理' },
  { value: 'chemistry', label: '化学' },
  { value: 'sports', label: '体育' },
  { value: 'food', label: '美食' },
  { value: 'travel', label: '交通旅行' },
  { value: 'crime', label: '犯罪悬疑' },
  { value: 'horror', label: '恐怖' },
  { value: 'urban_legend', label: '都市传说' },
  { value: 'conspiracy', label: '阴谋论' },
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
