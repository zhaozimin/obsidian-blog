/**
 * [INPUT]: 依赖 Node os/path/crypto/fs 与可选 BLOG_LOCAL_DIR
 * [OUTPUT]: 对外提供源码之外的本机运行目录、真实路径解析与安装路径隔离
 * [POS]: setup、Cloudflare 初始化和本机启动的共同路径边界；凭据与数据不写入公开源码
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
// ===== 未创建的目标也按最近现存父目录解析，符号链接不能绕过源码边界 =====
function realPath(value) {
  const absolute = path.resolve(value);
  try { return fs.realpathSync(absolute); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(realPath(parent), path.basename(absolute));
  }
}
function overlaps(a, b) {
  const contains = (parent, child) => {
    const relative = path.relative(parent, child);
    return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  return contains(a, b) || contains(b, a);
}
function statIfPresent(file) {
  try { return fs.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function externalPath(value, label) {
  const resolved = realPath(value);
  if (overlaps(resolved, realPath(root))) throw new Error(`${label}必须放在源码之外，不能与源码目录嵌套。`);
  return resolved;
}
const id = crypto.createHash('sha256').update(root).digest('hex').slice(0, 12);
const local = externalPath(process.env.BLOG_LOCAL_DIR || path.join(os.homedir(), '.local/share/obsidian-blog', id), '本机运行目录');
module.exports = { local, realPath, overlaps, externalPath, statIfPresent };
