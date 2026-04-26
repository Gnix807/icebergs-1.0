import { marked } from 'marked';
import katex from 'katex';

// 配置 marked
marked.setOptions({
  gfm: true,
  breaks: true,
});

// 轻量安全清洗：移除危险标签、事件属性、可执行协议
const DANGEROUS_TAGS_RE = /<(?:script|style|iframe|object|embed|form|input|button|meta|link|base)[\s\S]*?>[\s\S]*?<\/(?:script|style|iframe|object|embed|form|input|button|meta|link|base)>/gi;
const DANGEROUS_SELF_CLOSING_RE = /<(?:script|style|iframe|object|embed|form|input|button|meta|link|base)\b[^>]*\/?>/gi;
const EVENT_HANDLER_RE = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const SRC_DOC_RE = /\ssrcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_URL_RE = /\s(?:href|src|xlink:href)\s*=\s*(?:"\s*(?:javascript|vbscript|data:text\/html)[^"]*"|'\s*(?:javascript|vbscript|data:text\/html)[^']*'|\s*(?:javascript|vbscript|data:text\/html)[^\s>]+)/gi;

export function sanitizeHtml(html: string): string {
  return html
    .replace(DANGEROUS_TAGS_RE, '')
    .replace(DANGEROUS_SELF_CLOSING_RE, '')
    .replace(EVENT_HANDLER_RE, '')
    .replace(SRC_DOC_RE, '')
    .replace(DANGEROUS_URL_RE, '');
}

export function renderMarkdown(content: string): string {
  const html = marked.parse(content, { async: false }) as string;
  return sanitizeHtml(html);
}

/** 先提取数学公式占位，再进行 Markdown 渲染，最后还原为 KaTeX HTML */
export function renderMarkdownWithMath(raw: string): string {
  const store: { display: boolean; html: string }[] = [];

  const withPlaceholders = raw
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
      store.push({
        display: true,
        html: katex.renderToString(math.trim(), {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        }),
      });
      return `<!--KM${store.length - 1}-->`;
    })
    .replace(/\$([^\n$]+?)\$/g, (_, math) => {
      store.push({
        display: false,
        html: katex.renderToString(math.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        }),
      });
      return `<!--KM${store.length - 1}-->`;
    });

  if (store.length === 0) return renderMarkdown(raw);

  return renderMarkdown(withPlaceholders)
    .replace(/<p><!--KM(\d+)--><\/p>/g, (_, i) => {
      const m = store[+i];
      return m.display ? `<div class="katex-display-block">${m.html}</div>` : `<p>${m.html}</p>`;
    })
    .replace(/<!--KM(\d+)-->/g, (_, i) => store[+i].html);
}
