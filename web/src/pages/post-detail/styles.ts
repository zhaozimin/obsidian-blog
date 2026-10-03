/**
 * [INPUT]: 依赖 纸·墨·朱 0.2.0 的字号与正文结构约定
 * [OUTPUT]: 对外提供 adjustments 标题字号与块结构参数
 * [POS]: Markdown 块渲染的标题字号与结构尺寸，正文字号、行高与块间距统一交给 styles/content.css
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const adjustments = {
  markdown: {
    h1: { fontSize: 28, paddingBottom: 12, borderBottomWidth: 1 },
    h2: { fontSize: 24 },
    h3: { fontSize: 20 },
    list: { marginLeft: 0 },
  },
};
