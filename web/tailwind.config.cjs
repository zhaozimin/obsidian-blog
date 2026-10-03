/**
 * [INPUT]: 依赖 index.html、src 的工具类与 zzm-v4 字体令牌
 * [OUTPUT]: 对外提供 本地样式扫描范围与工具类字体
 * [POS]: 正文工具类构建边界，视觉主题由冻结设计系统负责
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['var(--zzm-font)'], mono: ['var(--zzm-mono)'] },
    },
  },
  plugins: [],
};
