/**
 * [INPUT]: 依赖 vault-template、用户指定的新库路径与本机环境
 * [OUTPUT]: 对外提供幂等模板安装和私有本机服务配置
 * [POS]: 首次使用边界；已有笔记及 data.json 不覆盖，连接配置不进入发行模板
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2), index = args.indexOf('--vault');
if (index < 0 || !args[index + 1]) throw new Error('用法：npm run setup -- --vault /新笔记库绝对路径 [--local]');
const vault = path.resolve(args[index + 1]), template = path.join(root, 'vault-template');
if (vault === root || vault.startsWith(`${root}${path.sep}`)) throw new Error('用户笔记库必须放在源码之外。');
if (!fs.existsSync(path.join(template, '.obsidian/plugins/blog-publisher/main.js'))) throw new Error('请先运行 npm run build。');
function copy(dir, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const source = path.join(dir, entry.name), dest = path.join(target, entry.name);
    if (entry.name === 'CLAUDE.md' && fs.existsSync(dest)) continue;
    if (entry.isDirectory()) copy(source, dest);
    else if (!fs.existsSync(dest)) fs.copyFileSync(source, dest);
  }
}
copy(template, vault);
if (args.includes('--local')) {
  const local = path.join(root, '.local'), env = path.join(local, 'server.env'), data = path.join(vault, '.obsidian/plugins/blog-publisher/data.json');
  fs.mkdirSync(local, { recursive: true, mode: 0o700 });
  let key;
  if (fs.existsSync(env)) key = fs.readFileSync(env, 'utf8').match(/^BLOG_RECEIVER_KEY=(.+)$/m)?.[1];
  else {
    const existing = fs.existsSync(data) ? JSON.parse(fs.readFileSync(data, 'utf8')) : {};
    key = existing.serverUrl === 'http://127.0.0.1:3002' && String(existing.secretKey || '').length >= 32 ? existing.secretKey : crypto.randomBytes(32).toString('hex');
    const quote = value => JSON.stringify(value);
    fs.writeFileSync(env, `BLOG_RECEIVER_KEY=${key}\nBLOG_RECEIVER_DATA=${quote(path.join(local, 'data'))}\nBLOG_TEMPLATE_DIR=${quote(path.join(root, 'web'))}\nBLOG_RECEIVER_HOST=127.0.0.1\nBLOG_RECEIVER_PORT=3002\nSITE_ORIGIN=http://127.0.0.1:3002\nWECHAT_APP_ID=\nWECHAT_APP_SECRET=\nWECHAT_API_BASE=https://api.weixin.qq.com\nWECHAT_ADAPTER_MODULE=\n`, { mode: 0o600 });
  }
  if (!key) throw new Error('本机私有配置缺少发布密钥。');
  if (!fs.existsSync(data)) fs.writeFileSync(data, JSON.stringify({ blogFolderName: 'blog-V3', imagesFolderName: '6.附件', serverUrl: 'http://127.0.0.1:3002', secretKey: key, wechatStylePath: '发布配置/公众号排版.json' }, null, 2), { mode: 0o600 });
}
process.stdout.write('笔记库模板已安装，已有文件保持原样。用 Obsidian 打开此文件夹并启用 Blog Publisher。\n');
