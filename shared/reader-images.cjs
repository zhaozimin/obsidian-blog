/**
 * [INPUT]: 依赖正文、授权图片集合、访问令牌与 Markdown 代码隔离
 * [OUTPUT]: 对外提供 rewriteReaderImages，映射本地 Markdown/引用定义/HTML 图片，剥离无效查询参数并保留片段
 * [POS]: Node/Worker 共用阅读映射，保持代码中的图片路径原样
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { splitCode } = require('./markdown-parts.cjs');
function rewriteReaderImages(content, names, token) {
  return splitCode(content).map(part => part.code ? part.text : part.text.replace(/(\]\(\s*<?|^ {0,3}\[[^\]\n]+\]:\s*<?|\bsrc\s*=\s*["']?)(\/images\/[^\s)"'<>]+)/gim, (match, prefix, value) => {
    let url, name;
    try { url = new URL(value, 'https://local.invalid'); name = decodeURIComponent(url.pathname.slice('/images/'.length)); } catch { return match; }
    return names.has(name) ? `${prefix}/api/reader/media/${token}/${encodeURIComponent(name)}${url.hash}` : match;
  })).join('');
}
module.exports = { rewriteReaderImages };
