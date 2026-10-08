/**
 * [INPUT]: 依赖 marked 的 Markdown token，识别真实图片和本地附件链接
 * [OUTPUT]: 对外提供 imageSources，支持行内图、引用式图与附件链接，跳过代码和网站作为纯文字展示的 HTML
 * [POS]: 公开图片集合与产物资源检查共用的语法边界，避免扫描规则分歧导致私图公开
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { lexer, walkTokens } = require('marked');
function imageSources(content) {
  const sources = new Set();
  walkTokens(lexer(content || ''), token => {
    if (token.type === 'image' || token.type === 'link' && token.href.startsWith('/images/')) sources.add(token.href);
  });
  return sources;
}
module.exports = { imageSources };
