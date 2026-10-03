/**
 * [INPUT]: 依赖构建后的 dist、用户指定的插件目录与项目外备份目录
 * [OUTPUT]: 备份并更新 main.js、manifest.json、styles.css，保留本机 data.json
 * [POS]: 本地安装边界；安装不包含启用、发布文章或复制连接凭据到源码
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const [destination, backup] = process.argv.slice(2);
if (!destination || !backup) throw new Error('用法：npm run install:plugin -- /插件绝对路径 /项目外备份绝对路径');
const target = path.resolve(destination), archive = path.resolve(backup);
if ([target, archive].some(dir => dir === root || dir.startsWith(`${root}${path.sep}`))) throw new Error('插件和备份必须存放在源码目录之外。');
fs.mkdirSync(archive, { recursive: true, mode: 0o700 });
const files = ['main.js', 'manifest.json', 'styles.css'];
for (const file of files) {
  if (!fs.existsSync(path.join(root, 'dist', file))) throw new Error('请先运行 npm run build。');
  if (fs.existsSync(path.join(target, file))) {
    const copy = path.join(archive, file);
    fs.copyFileSync(path.join(target, file), copy, fs.constants.COPYFILE_EXCL); fs.chmodSync(copy, 0o600);
  }
}
fs.mkdirSync(target, { recursive: true });
for (const file of files) fs.copyFileSync(path.join(root, 'dist', file), path.join(target, file));
process.stdout.write('插件已安装，原设置和笔记已保留。请重新加载插件。\n');
