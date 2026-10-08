/**
 * [INPUT]: 依赖构建后的 dist 与 local-runtime 真实路径隔离，接收插件和外部备份目录
 * [OUTPUT]: 校验真实路径、备份并更新三文件，写入失败回滚，保留本机 data.json
 * [POS]: 本地安装边界；安装不包含启用、发布文章或复制连接凭据到源码
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const { externalPath, overlaps, statIfPresent } = require('./local-runtime.cjs');
const root = path.resolve(__dirname, '..');
const [destination, backup] = process.argv.slice(2);
if (!destination || !backup) throw new Error('用法：npm run install:plugin -- /插件绝对路径 /项目外备份绝对路径');
const target = externalPath(destination, '插件目录'), archive = externalPath(backup, '备份目录');
if (overlaps(target, archive)) throw new Error('插件目录和备份目录必须分开。');
const files = ['main.js', 'manifest.json', 'styles.css'];
// ===== 先验证全部输入，避免后续文件缺失时留下半套插件 =====
for (const file of files) {
  const source = path.join(root, 'dist', file), existing = path.join(target, file);
  if (!fs.existsSync(source) || !fs.lstatSync(source).isFile()) throw new Error('请先运行 npm run build。');
  const stat = statIfPresent(existing);
  if (stat && !stat.isFile()) throw new Error('插件文件必须为普通文件。');
  if (statIfPresent(path.join(archive, file))) throw new Error('备份目录已有同名文件，请使用新的备份目录。');
}
fs.mkdirSync(archive, { recursive: true, mode: 0o700 }); fs.chmodSync(archive, 0o700);
for (const file of files) {
  if (fs.existsSync(path.join(target, file))) {
    const copy = path.join(archive, file);
    fs.copyFileSync(path.join(target, file), copy, fs.constants.COPYFILE_EXCL); fs.chmodSync(copy, 0o600);
  }
}
fs.mkdirSync(target, { recursive: true });
const written = [];
try {
  for (const file of files) {
    written.push(file); fs.copyFileSync(path.join(root, 'dist', file), path.join(target, file));
  }
} catch (error) {
  for (const file of written) {
    const original = path.join(archive, file), output = path.join(target, file);
    if (fs.existsSync(original)) fs.copyFileSync(original, output);
    else fs.rmSync(output, { force: true });
  }
  throw error;
}
process.stdout.write('插件已安装，原设置和笔记已保留。请重新加载插件。\n');
