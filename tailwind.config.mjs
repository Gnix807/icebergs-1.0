/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      // ── 字体家族 ──────────────────────────────────────────
      fontFamily: {
        display: ['Space Grotesk', 'MiSans Normal', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        body:    ['MiSans Normal', 'PingFang SC', 'Microsoft YaHei', 'Space Grotesk', 'system-ui', 'sans-serif'],
        ui:      ['Space Grotesk', 'MiSans Normal', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        mono:    ['Space Mono', 'MiSans Normal', 'system-ui', 'PingFang SC', 'Microsoft YaHei', 'monospace'],
        sans:    ['Space Grotesk', 'MiSans Normal', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
      },

      // ── 颜色令牌（通过 CSS 变量实现暗/亮切换）────────────
      colors: {
        surface: {
          0: 'var(--color-surface-0)',
          1: 'var(--color-surface-1)',
          2: 'var(--color-surface-2)',
          3: 'var(--color-surface-3)',
          4: 'var(--color-surface-4)',
        },
        'text-hi':   'var(--color-text-hi)',
        'text-body': 'var(--color-text-body)',
        'text-mid':  'var(--color-text-mid)',
        'text-lo':   'var(--color-text-lo)',
        border:       'var(--color-border)',
        'border-subtle':  'var(--color-border-2)',
        'border-minimal': 'var(--color-border-3)',
        brand: {
          DEFAULT: 'var(--color-brand)',
          hover:   'var(--color-brand-2)',
        },
        danger:  { DEFAULT: 'var(--color-danger)' },
        warning: { DEFAULT: 'var(--color-warning)' },
        success: { DEFAULT: 'var(--color-success)' },
        info:    { DEFAULT: 'var(--color-info)' },
        purple:  { DEFAULT: 'var(--color-purple)' },
        gold:    { DEFAULT: 'var(--color-gold)' },
        silver:  { DEFAULT: 'var(--color-silver)' },
        bronze:  { DEFAULT: 'var(--color-bronze)' },
        'bg-base':      'var(--bg-base)',
        'bg-elevated':  'var(--bg-elevated)',
        'bg-surface':   'var(--bg-surface)',
        'terminal-green':     '#3ecf8e',
        'terminal-green-dim': '#24b47e',
      },

      borderRadius: {
        'token':      '0',
        'token-sm':   '4px',
        'token-md':   '6px',
        'token-lg':   '12px',
        'token-full': '9999px',
      },

      boxShadow: {
        'surface': '0 1px 3px rgba(0,0,0,0.06)',
        'overlay': '0 8px 24px rgba(0,0,0,0.08)',
        'modal':   '0 16px 48px rgba(0,0,0,0.12)',
      },

      zIndex: {
        'content':   '10',
        'sticky':    '30',
        'overlay':   '50',
        'modal':     '60',
        'toast':     '70',
        'decorator': '90',
      },

      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'card':     'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
    },
  },
  plugins: [],
};
