import DOMPurify from 'dompurify';
import { marked } from 'marked';

// 配置 marked
marked.setOptions({
  gfm: true,
  breaks: true,
});

// DOMPurify 配置
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'blockquote',
    'pre', 'code',
    'a', 'strong', 'em', 'del', 's',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img', 'figure', 'figcaption',
    'details', 'summary',
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'target', 'rel',
    'src', 'alt', 'width', 'height',
    'class', 'id',
  ],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target'],
};

export function renderMarkdown(content: string): string {
  const html = marked.parse(content) as string;
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}
