/**
 * [INPUT]: 依赖私有环境、共享真实路径隔离、BatchStore、Reader、本机/Cloudflare 发布器、公众号服务及自定义适配模块
 * [OUTPUT]: 对外提供完整系统服务启动入口；默认单站点，兼容既有发布命令
 * [POS]: 服务生命周期边界；源码不含实际站点连接参数，缺少配置时拒绝启动
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { BatchStore } = require('./store.cjs');
const { createReceiver } = require('./http.cjs');
const { createPublisher } = require('./publisher.cjs');
const { createReader } = require('./reader.cjs');
const path = require('node:path');
const { createLocalPublisher } = require('./local-publisher.cjs');
const { createCloudflarePublisher } = require('./cloudflare-publisher.cjs');
const { serveStatic, servePublishedStatic } = require('./static.cjs');
const { WechatService } = require('./wechat.cjs');
const { WechatApi } = require('./wechat-api.cjs');
const { externalPath, realPath, overlaps } = require('../scripts/local-runtime.cjs');
function start() {
  for (const key of ['BLOG_RECEIVER_KEY', 'BLOG_RECEIVER_DATA']) {
    if (!process.env[key]) throw new Error(`缺少私有配置项 ${key}。`);
  }
  const root = externalPath(process.env.BLOG_RECEIVER_DATA, '运行数据目录'), code = realPath(path.join(__dirname, '..')), template = realPath(process.env.BLOG_TEMPLATE_DIR || path.join(code, 'web'));
  if (overlaps(root, template)) throw new Error('运行数据必须与网站模板目录分开。');
  const origin = process.env.SITE_ORIGIN || `http://127.0.0.1:${process.env.BLOG_RECEIVER_PORT || 3002}`;
  const validOrigin = value => { const url = new URL(value); return url.origin === value && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))); };
  if (!validOrigin(origin)) throw new Error('公网网站需要 HTTPS，本机仅支持环回 HTTP。');
  const site = path.join(root, 'site');
  const mode = process.env.BLOG_PUBLISH_MODE || 'server';
  if (!['server', 'cloudflare'].includes(mode)) throw new Error('发布模式无效');
  if (mode === 'cloudflare' && (process.env.BLOG_PUBLISH_COMMAND || process.env.BLOG_RECEIVER_HOST && process.env.BLOG_RECEIVER_HOST !== '127.0.0.1')) throw new Error('Cloudflare 本机服务只监听环回地址，不使用历史发布命令');
  const publish = mode === 'cloudflare' ? createCloudflarePublisher(template, site, origin, process.env.BLOG_CLOUDFLARE_CONFIG) : process.env.BLOG_PUBLISH_COMMAND ? createPublisher(template, process.env.BLOG_PUBLISH_COMMAND) : createLocalPublisher(template, site, origin);
  const store = new BatchStore(root, publish);
  const { readContent } = require(path.join(template, 'scripts/content-contract.cjs'));
  const { publicSnapshot, localImageNames } = require(path.join(template, 'scripts/public-content.cjs'));
  const origins = (process.env.BLOG_READER_ORIGINS || origin).split(',').map(value => value.trim()).filter(Boolean);
  for (const value of origins) if (!validOrigin(value)) throw new Error('阅读站点地址无效。');
  const reader = createReader({ store, readContent, publicSnapshot, localImageNames, origins });
  const adapter = process.env.WECHAT_ADAPTER_MODULE ? require(path.resolve(process.env.WECHAT_ADAPTER_MODULE)).createAdapter(process.env) : new WechatApi({ appId: process.env.WECHAT_APP_ID, appSecret: process.env.WECHAT_APP_SECRET, baseUrl: process.env.WECHAT_API_BASE || 'https://api.weixin.qq.com' });
  for (const name of ['configured', 'upload', 'add', 'update', 'get']) if (typeof adapter[name] !== 'function') throw new Error('公众号适配器契约不完整。');
  const wechat = new WechatService(path.join(root, 'wechat'), adapter);
  const currentSite = serveStatic(path.join(site, 'current')), blankSite = serveStatic(path.join(template, 'dist'));
  const staticSite = process.env.BLOG_PUBLISH_COMMAND ? (req, res, pathname) => store.current() ? currentSite(req, res, pathname) : blankSite(req, res, pathname) : servePublishedStatic(site, store, blankSite);
  const server = createReceiver(store, process.env.BLOG_RECEIVER_KEY, reader, { wechat, staticSite });
  server.listen(Number(process.env.BLOG_RECEIVER_PORT || 3002), process.env.BLOG_RECEIVER_HOST || '127.0.0.1', () => process.stdout.write('博客接收服务已启动。\n'));
  const close = () => server.close(async () => { if (store.job) await store.job; store.close(); process.exit(0); });
  process.once('SIGTERM', close); process.once('SIGINT', close);
}
try { start(); }
catch { process.stderr.write('接收服务启动失败，请检查私有配置和数据目录。\n'); process.exitCode = 1; }
