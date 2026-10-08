/**
 * [INPUT]: 依赖 Node fs/path/crypto，解析现有目录及尚未创建的输出路径
 * [OUTPUT]: 对外提供真实路径隔离、公开资源符号链接检查与 writeAtomic 原子文件替换
 * [POS]: 内容原稿与可清理产物之间的真实路径边界，阻止符号链接别名绕过目录隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
function realPath(value) {
  let current = path.resolve(value), tail = [];
  while (!fs.existsSync(current)) {
    if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('输出路径包含失效符号链接');
    const parent = path.dirname(current);
    if (parent === current) throw new Error('无法解析输出目录');
    tail.unshift(path.basename(current)); current = parent;
  }
  return path.join(fs.realpathSync(current), ...tail);
}
function overlaps(first, second) {
  first = realPath(first); second = realPath(second);
  const within = (child, parent) => {
    const relative = path.relative(parent, child);
    return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  return within(first, second) || within(second, first);
}
function assertSeparate(first, second, message) {
  if (overlaps(first, second)) throw new Error(message);
}
function assertNoSymlinks(dir) {
  const info = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!info) return;
  if (info.isSymbolicLink()) throw new Error('公开资源目录不能包含符号链接');
  if (!info.isDirectory()) return;
  for (const entry of fs.readdirSync(dir)) assertNoSymlinks(path.join(dir, entry));
}
function writeAtomic(file, value) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}-${randomUUID()}.next`);
  try { fs.writeFileSync(temporary, value, { flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}
function validateBuildPaths({ projectDir, publicDir, buildDir, contentDir, imagesDir }) {
  assertNoSymlinks(publicDir);
  const output = realPath(buildDir), project = realPath(projectDir);
  if (overlaps(output, project) && output !== path.join(project, 'dist')) throw new Error('仓库内构建目录只能使用 dist，外部产物须与源码分开');
  for (const input of [publicDir, contentDir, imagesDir].filter(Boolean)) assertSeparate(output, input, '构建目录不能覆盖公开资源、内容或图片原稿');
  return { publicDir: realPath(publicDir), buildDir: output };
}
module.exports = { realPath, overlaps, assertSeparate, assertNoSymlinks, writeAtomic, validateBuildPaths };
