/**
 * [INPUT]: 依赖 vault-template、Node 环境解析与 local-runtime 的真实路径隔离
 * [OUTPUT]: 对外提供幂等模板安装、合并置顶复选框类型和私有本机服务配置
 * [POS]: 首次使用边界；已有栏目、笔记及 data.json 不覆盖，拒绝符号链接逃逸，连接配置不进入发行模板
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseEnv } = require('node:util');
const { local, realPath, overlaps, externalPath, statIfPresent } = require('./local-runtime.cjs');
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2), index = args.indexOf('--vault');
const { pinnedPropertyTypes } = require('../shared/property-types.cjs');
if (index < 0 || !args[index + 1]) throw new Error('用法：npm run setup -- --vault /新笔记库绝对路径 [--local]');
const vault = externalPath(args[index + 1], '用户笔记库'), template = path.join(root, 'vault-template');
if (overlaps(vault, local)) throw new Error('用户笔记库必须与私有服务运行目录分开。');
if (!fs.existsSync(path.join(template, '.obsidian/plugins/blog-publisher/main.js'))) throw new Error('请先运行 npm run build。');
function existingBlog(dir) {
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir, { withFileTypes: true }).some(entry => entry.isDirectory() ? existingBlog(path.join(dir, entry.name)) : entry.name.endsWith('.md') && entry.name !== 'CLAUDE.md');
}
if (statIfPresent(path.join(vault, 'blog-V3'))?.isSymbolicLink()) throw new Error('博客目录不能为符号链接。');
const preserveBlog = existingBlog(path.join(vault, 'blog-V3'));
function copy(dir, target) {
  if (!realPath(target).startsWith(`${vault}${path.sep}`) && realPath(target) !== vault) throw new Error('笔记库内符号链接不能指向库外。');
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const source = path.join(dir, entry.name), dest = path.join(target, entry.name);
    if (entry.isSymbolicLink() || statIfPresent(dest)?.isSymbolicLink()) throw new Error('模板安装不接受符号链接。');
    if (dir === template && entry.name === 'blog-V3' && preserveBlog) continue;
    if (entry.name === 'CLAUDE.md' && fs.existsSync(dest)) continue;
    if (entry.isDirectory()) copy(source, dest);
    else if (!fs.existsSync(dest)) fs.copyFileSync(source, dest, fs.constants.COPYFILE_EXCL);
  }
}
copy(template, vault);
// ---------- 保留已有属性类型，只注册置顶复选框 ----------
const typesFile = path.join(vault, '.obsidian/types.json');
if (statIfPresent(typesFile) && !statIfPresent(typesFile).isFile()) throw new Error('属性类型配置必须为普通文件。');
const currentTypes = fs.existsSync(typesFile) ? JSON.parse(fs.readFileSync(typesFile, 'utf8')) : {};
const updatedTypes = pinnedPropertyTypes(currentTypes);
if (JSON.stringify(currentTypes) !== JSON.stringify(updatedTypes)) fs.writeFileSync(typesFile, `${JSON.stringify(updatedTypes, null, 2)}\n`);
if (args.includes('--local')) {
  const env = path.join(local, 'server.env'), data = path.join(vault, '.obsidian/plugins/blog-publisher/data.json');
  fs.mkdirSync(local, { recursive: true, mode: 0o700 }); fs.chmodSync(local, 0o700);
  let key;
  if (statIfPresent(env) && !statIfPresent(env).isFile()) throw new Error('私有环境配置必须为普通文件。');
  if (fs.existsSync(env)) key = parseEnv(fs.readFileSync(env, 'utf8')).BLOG_RECEIVER_KEY;
  else {
    const existing = fs.existsSync(data) ? JSON.parse(fs.readFileSync(data, 'utf8')) : {};
    const existingKey = String(existing.secretKey || '').trim();
    key = existing.serverUrl === 'http://127.0.0.1:3002' && existingKey.length >= 32 ? existingKey : crypto.randomBytes(32).toString('hex');
    const quote = value => JSON.stringify(value);
    fs.writeFileSync(env, `BLOG_RECEIVER_KEY=${quote(key)}\nBLOG_RECEIVER_DATA=${quote(path.join(local, 'data'))}\nBLOG_TEMPLATE_DIR=${quote(path.join(root, 'web'))}\nBLOG_RECEIVER_HOST=127.0.0.1\nBLOG_RECEIVER_PORT=3002\nSITE_ORIGIN=http://127.0.0.1:3002\nWECHAT_APP_ID=\nWECHAT_APP_SECRET=\nWECHAT_API_BASE=https://api.weixin.qq.com\nWECHAT_ADAPTER_MODULE=\n`, { mode: 0o600 });
  }
  if (!key || key.trim() !== key || key.length < 32 || /[\r\n]/.test(key)) throw new Error('本机私有配置的发布密钥需至少 32 字符，且不能含首尾空格或换行。');
  fs.chmodSync(env, 0o600);
  if (statIfPresent(data)?.isSymbolicLink()) throw new Error('插件设置不能为符号链接。');
  if (!fs.existsSync(data)) fs.writeFileSync(data, JSON.stringify({ blogFolderName: 'blog-V3', imagesFolderName: '6.附件', serverUrl: 'http://127.0.0.1:3002', secretKey: key, wechatStylePath: '发布配置/公众号排版.json' }, null, 2), { mode: 0o600 });
}
process.stdout.write('笔记库模板已安装，已有文件保持原样。用 Obsidian 打开此文件夹并启用 Blog Publisher。\n');
