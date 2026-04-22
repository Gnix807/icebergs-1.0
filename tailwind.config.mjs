/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        'bg-base': '#0A0A0A',
        'bg-elevated': '#121212',
        'bg-surface': '#1A1A1A',
        border: '#2A2A2A',
        'terminal-green': '#00FF41',
        'terminal-green-dim': '#00CC33',
      },
    },
  },
  plugins: [],
};
