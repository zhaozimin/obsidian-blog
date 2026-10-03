/**
 * [INPUT]: 依赖用户选择的 Cloudflare 账号、资源名称、已有本机配置和空白网站
 * [OUTPUT]: 对外提供 cloudflare:init 与 cloudflare:deploy，私有配置只写入 .local
 * [POS]: 无服务器首次安装边界；初始化空站后记录真实网址，日常发布由插件触发
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readConfig, deployCloudflare } = require('../server/cloudflare-publisher.cjs');
const root = path.resolve(__dirname, '..'), local = path.join(root, '.local');
const file = path.join(local, 'cloudflare.json'), env = path.join(local, 'server.env');
function updateEnvironment(config) {
  if (!fs.existsSync(env)) throw new Error('请先运行 npm run setup -- --vault /你的笔记库 --local');
  let text = fs.readFileSync(env, 'utf8');
  for (const [key, value] of Object.entries({ BLOG_PUBLISH_MODE: 'cloudflare', BLOG_CLOUDFLARE_CONFIG: file, SITE_ORIGIN: config.origin || 'http://127.0.0.1:3002', BLOG_RECEIVER_HOST: '127.0.0.1' })) {
    const line = `${key}=${JSON.stringify(value)}`;
    text = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), () => line) : `${text.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(env, text, { mode: 0o600 });
}
async function main() {
  const [mode, ...args] = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--name', '--account', '--origin', '--bucket', '--domain'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('配置参数无效');
    options[args[i].slice(2)] = args[i + 1];
  }
  fs.mkdirSync(local, { recursive: true, mode: 0o700 });
  if (mode === 'init') {
    if (!fs.existsSync(env)) throw new Error('请先安装空白笔记库并生成本机配置');
    const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const name = options.name || previous.name, accountId = options.account || previous.accountId;
    const changed = Boolean(previous.name && (name !== previous.name || accountId !== previous.accountId));
    const domain = options.domain || (changed ? '' : previous.domain) || '';
    const config = { ...previous, name, accountId, bucket: options.bucket || (accountId !== previous.accountId ? '' : previous.bucket) || '', domain, origin: options.origin || (domain ? `https://${domain}` : changed ? '' : previous.origin) || '', initialized: changed ? false : Boolean(previous.initialized) };
    const namespace = parseInt(crypto.createHash('sha256').update(config.name || '').digest('hex').slice(0, 7), 16) + 10000;
    config.ipNamespace = String(namespace); config.postNamespace = String(namespace + 1);
    const next = `${file}.next`; fs.writeFileSync(next, JSON.stringify(config, null, 2), { mode: 0o600 });
    try { readConfig(next, false); fs.renameSync(next, file); } finally { if (fs.existsSync(next)) fs.unlinkSync(next); }
    updateEnvironment(config);
    process.stdout.write('Cloudflare 私有配置已保存。未设置站点地址时，请先运行 npm run cloudflare:deploy 初始化空站。\n');
    return;
  }
  if (mode !== 'deploy' || args.length) throw new Error('用法：cloudflare.cjs init [参数] 或 deploy');
  const config = readConfig(file, false), dist = path.join(root, 'web/dist');
  if (config.initialized) throw new Error('此目标已部署。请从 Obsidian 重新发布当前内容，不用空站初始化覆盖现有网站');
  const data = JSON.parse(fs.readFileSync(path.join(dist, 'blog-data.json'), 'utf8'));
  if (data.allPosts?.length || data.aboutStories?.length) throw new Error('首次部署入口只能部署空站；文章请通过插件上传');
  const result = await deployCloudflare({ configFile: file, dist, releaseId: `bootstrap-${Date.now()}` });
  config.origin = result.url; config.initialized = true; fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 }); updateEnvironment(config);
  process.stdout.write(`Cloudflare 空站已部署：${result.url}\n现在运行 npm run dev:system，然后从 Obsidian 上传内容。\n`);
}
main().catch(error => { process.stderr.write(error?.message || 'Cloudflare 配置或部署失败'); process.stderr.write('\n'); process.exitCode = 1; });
