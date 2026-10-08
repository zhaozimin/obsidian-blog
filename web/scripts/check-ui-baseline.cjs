/**
 * [INPUT]: 依赖 ui-baseline.json 的正式 UI 哈希与本仓库前端文件
 * [OUTPUT]: 对外提供 check:ui 验收结果，漏列、重复列及未声明的基准改动会阻止通过
 * [POS]: 已定稿界面的保护边界；视觉调整须用户授权，审计行为修复只更新对应文件并记录原因
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'ui-baseline.json'), 'utf8'));
const files = baseline.files, extensions = baseline.extensions || {};
if (!files || typeof files !== 'object' || Array.isArray(files) || typeof extensions !== 'object' || Array.isArray(extensions)) throw new Error('UI 基准格式无效');
const duplicates = Object.keys(files).filter(relative => Object.hasOwn(extensions, relative));
const groups = { ...files, ...extensions };
const changed = Object.entries(groups).filter(([relative, expected]) => {
  const file = path.resolve(root, relative);
  return !/^[a-f0-9]{64}$/.test(expected) || !file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile() || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected;
}).map(([relative]) => relative);
// ---------- 防止新组件绕过冻结边界 ----------
function unlisted(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return unlisted(relative);
    return /\.(?:tsx?|css)$/.test(entry.name) && !Object.hasOwn(groups, relative) ? [relative] : [];
  });
}
const missing = unlisted('src');
if (changed.length || duplicates.length || missing.length) {
  process.stderr.write(`正式 UI 基准发生变化或登记不完整：\n${[...changed, ...duplicates.map(file => `${file}（重复登记）`), ...missing.map(file => `${file}（未登记）`)].join('\n')}\n请核对用户授权及具体修复，不要自动重写全部基准。\n`); process.exitCode = 1;
} else process.stdout.write(`正式 UI 基准检查通过：${Object.keys(groups).length} 个文件。\n`);
