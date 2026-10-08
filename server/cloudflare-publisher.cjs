/**
 * [INPUT]: 依赖本机静态发布器、web 私有内容契约、阅读加密协议与用户 Wrangler 授权
 * [OUTPUT]: 对外提供 Cloudflare 配置验证、私有快照准备、静态部署与发布适配器
 * [POS]: 发布渠道适配边界；先上传版本隔离私有对象，再部署同版本 Worker/资源，日志保存在用户私有配置旁
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { ApiError } = require('./store.cjs');
const { createLocalPublisher } = require('./local-publisher.cjs');
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', apng: 'image/apng' };
const CODE = path.resolve(__dirname, '..');
function readConfig(file, requireOrigin = true) {
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(config.name) || !/^[a-f0-9]{32}$/.test(config.accountId)) throw new Error('Cloudflare 名称或账号 ID 无效');
  if (config.bucket && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket)) throw new Error('R2 桶名称无效');
  if (config.origin || requireOrigin) {
    const origin = new URL(config.origin);
    if (origin.protocol !== 'https:' || origin.origin !== config.origin) throw new Error('Cloudflare 网站必须使用 HTTPS 根地址');
  }
  if (config.domain && config.origin !== `https://${config.domain}`) throw new Error('自定义域名与站点地址不一致');
  return config;
}
function wranglerConfig(config, dist, releaseId) {
  const result = {
    name: config.name, account_id: config.accountId, main: path.join(CODE, 'cloudflare/worker.mjs'), compatibility_date: '2026-10-01', workers_dev: true,
    assets: { directory: path.resolve(dist), binding: 'ASSETS', not_found_handling: 'single-page-application', run_worker_first: ['/api/*'] },
    vars: { BLOG_RELEASE_ID: releaseId, BLOG_SITE_ORIGIN: config.origin || '' },
    ratelimits: [
      { name: 'READER_IP_LIMIT', namespace_id: config.ipNamespace || '1001', simple: { limit: 30, period: 60 } },
      { name: 'READER_POST_LIMIT', namespace_id: config.postNamespace || '1002', simple: { limit: 6, period: 60 } }
    ]
  };
  if (config.bucket) result.r2_buckets = [{ binding: 'PRIVATE_CONTENT', bucket_name: config.bucket }];
  if (config.domain) result.routes = [{ pattern: config.domain, custom_domain: true }];
  return result;
}
async function preparePrivate(template, batch, releaseId, directory) {
  const { readContent } = require(path.join(template, 'scripts/content-contract.cjs'));
  const { publicSnapshot, localImageNames } = require(path.join(template, 'scripts/public-content.cjs'));
  const { passwordRecord } = await import('../shared/reader-crypto.mjs');
  const source = readContent(path.join(batch, 'content')), { privateImages } = publicSnapshot(source);
  const objects = [], posts = [], written = new Set();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const post of source.allPosts.filter(item => item.password)) {
    const images = [];
    for (const name of localImageNames(post.content)) {
      if (!privateImages.has(name)) continue;
      const digest = crypto.createHash('sha256').update(name).digest('hex'), key = `releases/${releaseId}/images/${digest}`;
      const file = path.join(batch, 'images', name);
      if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) throw new Error('私有图片缺失');
      images.push({ name, key, type: TYPES[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream' });
      if (!written.has(key)) { objects.push({ key, file }); written.add(key); }
    }
    posts.push({ id: post.id, content: post.content, password: await passwordRecord(post.password), images });
  }
  const data = { version: 1, releaseId, signingKey: crypto.randomBytes(32).toString('hex'), posts };
  const file = path.join(directory, 'snapshot.json'); fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
  if (posts.length) objects.push({ key: `releases/${releaseId}/snapshot.json`, file });
  return { posts, objects };
}
function runWrangler(args) {
  return new Promise((resolve, reject) => {
    const executable = path.join(path.dirname(require.resolve('wrangler/package.json', { paths: [CODE] })), 'bin/wrangler.js');
    const child = spawn(process.execPath, [executable, ...args], { cwd: CODE, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; const collect = chunk => { output = (output + chunk.toString()).slice(-256000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new ApiError('PUBLISH_FAILED', 500)); }, 600000);
    child.on('error', () => { clearTimeout(timer); reject(new ApiError('PUBLISH_FAILED', 500)); });
    child.on('close', code => {
      clearTimeout(timer);
      const configIndex = args.indexOf('--config'), configFile = configIndex >= 0 && args[configIndex + 1];
      if (configFile) {
        try { fs.writeFileSync(path.join(path.dirname(configFile), 'cloudflare-deploy.log'), output, { mode: 0o600 }); }
        catch { /* 日志写入失败不能改变远程发布结果或终止接收服务。 */ }
      }
      code === 0 ? resolve(output) : reject(new ApiError('PUBLISH_FAILED', 500));
    });
  });
}
async function deployCloudflare({ configFile, dist, releaseId, objects = [], run = runWrangler }) {
  const config = readConfig(configFile, false);
  if (objects.length && !config.bucket) throw new Error('密码文章需要私有 R2 桶；请配置后重新上传');
  const directory = path.dirname(configFile), generated = path.join(directory, 'wrangler.generated.json');
  fs.writeFileSync(generated, JSON.stringify(wranglerConfig(config, dist, releaseId), null, 2), { mode: 0o600 });
  for (const object of objects) await run(['r2', 'object', 'put', `${config.bucket}/${object.key}`, '--file', object.file, '--remote', '--config', generated]);
  const output = await run(['deploy', '--config', generated]);
  const url = config.origin || output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/i)?.[0];
  if (!url) throw new Error('部署已提交，请在 Cloudflare 后台确认实际网址并设置 origin');
  fs.writeFileSync(configFile, JSON.stringify({ ...config, initialized: true }, null, 2), { mode: 0o600 });
  return { url, releaseId };
}
function createCloudflarePublisher(template, siteRoot, origin, configFile, run) {
  const config = readConfig(configFile);
  if (config.origin !== origin) throw new Error('SITE_ORIGIN 与 Cloudflare 配置不一致');
  return createLocalPublisher(template, siteRoot, origin, { deploy: async ({ batch, dist, releaseId, release }) => {
    const { objects } = await preparePrivate(template, batch, releaseId, path.join(release, 'private'));
    await deployCloudflare({ configFile, dist, releaseId, objects, run });
  } });
}
module.exports = { readConfig, wranglerConfig, preparePrivate, deployCloudflare, createCloudflarePublisher };
