/**
 * [INPUT]: 依赖正文、授权图片集合、访问令牌与 Markdown 代码隔离
 * [OUTPUT]: 对外提供 rewriteReaderImages，只改写正文图片授权地址
 * [POS]: Node/Worker 共用阅读映射，保持代码中的图片路径原样
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { splitCode } = require('./markdown-parts.cjs');
function rewriteReaderImages(content, names, token) {
  return splitCode(content).map(part => part.code ? part.text : part.text.replace(/\/images\/[^\s)"'<>]+/g, value => {
    let name; try { name = decodeURIComponent(value.slice('/images/'.length)); } catch { return value; }
    return names.has(name) ? `/api/reader/media/${token}/${encodeURIComponent(name)}` : value;
  })).join('');
}
module.exports = { rewriteReaderImages };
