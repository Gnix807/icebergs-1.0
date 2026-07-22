import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://icebergs.gnix807.cn',
  integrations: [
    react(),
    tailwind(),
  ],
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  vite: {
    build: {
      // 兼顾旧国产 Chromium/WebView；IE/Trident 仅提供 SSR 可读降级。
      target: ['es2018', 'chrome69', 'edge79', 'firefox68', 'safari12.1'],
      cssTarget: ['chrome69', 'edge79', 'firefox68', 'safari12.1'],
    },
    ssr: {
      noExternal: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities', '@dnd-kit/modifiers'],
    },
    optimizeDeps: {
      include: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities', '@dnd-kit/modifiers'],
    },
  },
});
