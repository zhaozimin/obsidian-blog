/**
 * [INPUT]: 依赖 tailwindcss 与 autoprefixer
 * [OUTPUT]: 对外提供 PostCSS 样式构建管线
 * [POS]: 将站点样式随 Vite 一同构建，替代运行时 CDN
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
