/**
 * [INPUT]: 依赖成功构建目录与 Node HTTP/fs
 * [OUTPUT]: 对外提供 serveStatic，仅提供构建后的公开文件
 * [POS]: 同源博客静态入口；不暴露原稿、草稿、密钥或源码，数据快照每次重新验证缓存
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.xml': 'application/xml' };
function serveStatic(root) {
  return (req, res, pathname) => {
    if (!['GET', 'HEAD'].includes(req.method)) return false;
    let decoded; try { decoded = decodeURIComponent(pathname); } catch { return false; }
    if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(part => part.startsWith('.'))) return false;
    const file = path.resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
    const realRoot = fs.realpathSync(root), realFile = fs.realpathSync(file);
    if (!realFile.startsWith(`${realRoot}${path.sep}`)) return false;
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': decoded.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res); return true;
  };
}
module.exports = { serveStatic };
