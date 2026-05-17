/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      // ── 字体家族 ──────────────────────────────────────────
      fontFamily: {
        // 显示字：导航、标题、标签、代码
        display: ['IBM Plex Mono', 'JetBrains Mono', 'monospace'],
        // 正文字：冰山图正文、Markdown、段落
        body: ['Noto Serif SC', 'Noto Serif', 'serif'],
        // UI 字：表单、提示、辅助文本
        ui: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        // 向后兼容别名（逐步迁移期间保持可用）
        mono: ['IBM Plex Mono', 'JetBrains Mono', 'monospace'],
        sans: ['IBM Plex Sans', 'Noto Serif SC', 'system-ui', 'sans-serif'],
      },

      // ── 颜色令牌（通过 CSS 变量实现暗/亮切换）────────────
      colors: {
        // 表面层级
        surface: {
          0: 'var(--color-surface-0)',
          1: 'var(--color-surface-1)',
          2: 'var(--color-surface-2)',
          3: 'var(--color-surface-3)',
          4: 'var(--color-surface-4)',
        },
        // 文字层级
        'text-hi':   'var(--color-text-hi)',
        'text-body': 'var(--color-text-body)',
        'text-mid':  'var(--color-text-mid)',
        'text-lo':   'var(--color-text-lo)',
        // 边框层级
        border:       'var(--color-border)',
        'border-subtle':  'var(--color-border-2)',
        'border-minimal': 'var(--color-border-3)',
        // 品牌色
        brand: {
          DEFAULT: 'var(--color-brand)',
          hover:   'var(--color-brand-2)',
        },
        // 语义色
        danger:  { DEFAULT: 'var(--color-danger)' },
        warning: { DEFAULT: 'var(--color-warning)' },
        success: { DEFAULT: 'var(--color-success)' },
        info:    { DEFAULT: 'var(--color-info)' },
        purple:  { DEFAULT: 'var(--color-purple)' },
        gold:    { DEFAULT: 'var(--color-gold)' },
        silver:  { DEFAULT: 'var(--color-silver)' },
        bronze:  { DEFAULT: 'var(--color-bronze)' },
        // 向后兼容（逐步迁移）
        'bg-base':      '#0A0A0A',
        'bg-elevated':  '#121212',
        'bg-surface':   '#1A1A1A',
        'terminal-green':     '#00FF41',
        'terminal-green-dim': '#00CC33',
      },

      // ── 圆角层级 ──────────────────────────────────────────
      borderRadius: {
        'token':      '0',
        'token-sm':   '4px',
        'token-md':   '8px',
        'token-full': '9999px',
      },

      // ── 阴影层级 ──────────────────────────────────────────
      boxShadow: {
        'surface': '0 1px 3px rgba(0,0,0,0.4)',
        'overlay': '0 8px 24px rgba(0,0,0,0.6)',
        'modal':   '0 20px 60px rgba(0,0,0,0.7)',
      },

      // ── Z-Index 尺度 ──────────────────────────────────────
      zIndex: {
        'content':   '10',
        'sticky':    '30',
        'overlay':   '50',
        'modal':     '60',
        'toast':     '70',
        'decorator': '90',
      },

      // ── 缓动函数 ──────────────────────────────────────────
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'card':     'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
    },
  },
  plugins: [],
};
