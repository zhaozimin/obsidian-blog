/**
 * [INPUT]: 依赖真实 Worker 与私有快照准备器、临时合成笔记和注入的 R2/Wrangler 边界
 * [OUTPUT]: 对外提供 Cloudflare 阅读、图片授权、发布顺序及失败保留的行为验证
 * [POS]: 无服务器方案回归边界，不连接真实 Cloudflare 账号或上传用户笔记
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { readConfig, preparePrivate, deployCloudflare, wranglerConfig, createCloudflarePublisher } = require('../server/cloudflare-publisher.cjs');
const TEMPLATE = path.resolve(__dirname, '../web');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-cloudflare-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = { name: 'test-blog', accountId: 'a'.repeat(32), origin: 'https://test.example', bucket: 'test-private-blog' };
  const file = path.join(root, 'cloudflare.json'); fs.writeFileSync(file, JSON.stringify(config));
  return { root, config, file };
}
function batch(t) {
  const data = fixture(t), directory = path.join(data.root, 'batch'), content = path.join(directory, 'content');
  fs.cpSync(path.resolve(__dirname, '../vault-template/blog-V3'), content, { recursive: true });
  const site = path.join(content, '1.首页/站点设置.md');
  fs.writeFileSync(site, fs.readFileSync(site, 'utf8').replace('name: ""', 'name: "Cloudflare测试"').replace('author: ""', 'author: "测试作者"'));
  const password = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(path.join(content, '2.深度长文/私有.md'), `---\nid: private-post\ntitle: 私有测试\ndate: 2026-10-03\npassword: ${password}\n---\nPRIVATE_TEST_BODY\n![](/images/%E7%A7%81%E5%AF%86.png)\n![](/images/shared.png)\n\`\`\`md\n![](/images/%E7%A7%81%E5%AF%86.png)\n\`\`\`\n`);
  fs.writeFileSync(path.join(content, '2.深度长文/公开.md'), '---\nid: public-post\ntitle: 公开测试\ndate: 2026-10-03\n---\n公开正文\n![](/images/shared.png)\n');
  fs.mkdirSync(path.join(directory, 'images'));
  fs.writeFileSync(path.join(directory, 'images/私密.png'), 'private-image-bytes');
  fs.writeFileSync(path.join(directory, 'images/shared.png'), 'public-image-bytes');
  fs.writeFileSync(path.join(directory, 'batch.json'), JSON.stringify({ files: [], images: [] }));
  return { ...data, directory, password };
}
async function workerFixture(t) {
  const source = batch(t), prepared = await preparePrivate(TEMPLATE, source.directory, 'release-one', path.join(source.root, 'private'));
  const objects = new Map(prepared.objects.map(object => [object.key, fs.readFileSync(object.file)]));
  const worker = (await import('../cloudflare/worker.mjs')).default;
  const env = {
    BLOG_RELEASE_ID: 'release-one', BLOG_SITE_ORIGIN: source.config.origin,
    ASSETS: { fetch: async () => new Response('public-assets') },
    PRIVATE_CONTENT: { get: async key => objects.has(key) ? { json: async () => JSON.parse(objects.get(key)), body: objects.get(key) } : null },
    READER_IP_LIMIT: { limit: async () => ({ success: true }) }, READER_POST_LIMIT: { limit: async () => ({ success: true }) }
  };
  const request = (url, options) => worker.fetch(new Request(source.config.origin + url, options), env);
  const unlock = password => request('/api/reader/posts/private-post/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: source.config.origin }, body: JSON.stringify({ password }) });
  return { ...source, prepared, worker, env, objects, request, unlock };
}
test('Cloudflare 私有快照只包含保护正文和专属图片，密码为随机盐派生值', async t => {
  const { prepared, password } = await workerFixture(t);
  assert.equal(prepared.posts.length, 1);
  assert.equal(prepared.objects.length, 2);
  assert.equal(prepared.posts[0].images.length, 1);
  const manifest = fs.readFileSync(prepared.objects.at(-1).file, 'utf8');
  assert.equal(manifest.includes(password), false); assert.match(manifest, /PRIVATE_TEST_BODY/);
  const { passwordRecord, verifyPassword } = await import('../shared/reader-crypto.mjs');
  const second = await passwordRecord(password);
  assert.notEqual(second.hash, prepared.posts[0].password.hash);
  assert.equal(await verifyPassword(password, second), true);
  assert.equal(await verifyPassword('wrong', second), false);
});
test('Worker 静态访问与密码阅读隔离，不公开上传和公众号入口', async t => {
  const { request, unlock, password } = await workerFixture(t);
  assert.equal(await (await request('/')).text(), 'public-assets');
  for (const value of [undefined, '', 'wrong']) assert.equal((await unlock(value)).status, 403);
  const response = await unlock(password); assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json(); assert.match(result.content, /PRIVATE_TEST_BODY/);
  assert.match(result.content, /\/api\/reader\/media\/[A-Za-z0-9_-]+\.[a-f0-9]{64}\//);
  assert.match(result.content, /\/images\/shared.png/);
  assert.ok(result.content.includes('```md\n![](/images/%E7%A7%81%E5%AF%86.png)\n```'));
  assert.equal(JSON.stringify(result).includes(password), false);
  for (const url of ['/api/publish/health', '/api/wechat/health', '/api/private/snapshot']) assert.equal((await request(url)).status, 404);
  assert.deepEqual(await (await request('/api/site/health')).json(), { releaseId: 'release-one', privateReader: true });
});
test('Worker 私有图片限于本篇，篡改、过期和版本变化使授权失效', async t => {
  const { request, unlock, password, objects, env } = await workerFixture(t);
  const body = await (await unlock(password)).json(), url = body.content.match(/\/api\/reader\/media\/[^)]+/)[0];
  assert.equal(await (await request(url)).text(), 'private-image-bytes');
  assert.equal((await request(url.slice(0, url.lastIndexOf('/') + 1) + 'shared.png')).status, 403);
  assert.equal((await request(url.replace(/media\/[A-Za-z0-9_-]+/, 'media/tampered'))).status, 403);
  const { signSession } = await import('../shared/reader-crypto.mjs');
  const snapshot = JSON.parse(objects.get('releases/release-one/snapshot.json'));
  const expired = await signSession({ id: 'private-post', releaseId: 'release-one', expires: Date.now() - 1 }, snapshot.signingKey);
  assert.equal((await request(`/api/reader/media/${expired}/${encodeURIComponent('私密.png')}`)).status, 403);
  const next = { ...snapshot, releaseId: 'release-two', signingKey: crypto.randomBytes(32).toString('hex') };
  env.BLOG_RELEASE_ID = 'release-two'; objects.set('releases/release-two/snapshot.json', Buffer.from(JSON.stringify(next)));
  assert.equal((await request(url)).status, 403);
});
test('Worker 在线限速、严格同源和小请求体先于密码读取', async t => {
  const { request, unlock, password, env } = await workerFixture(t);
  env.READER_POST_LIMIT.limit = async () => ({ success: false });
  assert.equal((await unlock(password)).status, 429);
  env.READER_POST_LIMIT.limit = async () => ({ success: true });
  assert.equal((await request('/api/reader/posts/private-post/unlock', { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('/api/reader/posts/private-post/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'x'.repeat(9000) }) })).status, 400);
  delete env.READER_IP_LIMIT; assert.equal((await unlock(password)).status, 503);
});
test('Cloudflare 上传先完成私有版本再部署静态资源，未配置 R2 不调用远程操作', async t => {
  const { file, root, config } = fixture(t), calls = [];
  const run = async args => { calls.push(args); return ''; };
  await deployCloudflare({ configFile: file, dist: path.join(root, 'dist'), releaseId: 'test-release', objects: [{ key: 'releases/test-release/snapshot.json', file: path.join(root, 'snapshot.json') }], run });
  assert.equal(calls.length, 2); assert.deepEqual(calls[0].slice(0, 3), ['r2', 'object', 'put']);
  assert.ok(calls[0].includes('--remote')); assert.equal(calls[1][0], 'deploy');
  const generated = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.generated.json')));
  assert.deepEqual(generated.assets.run_worker_first, ['/api/*']);
  assert.equal(generated.vars.BLOG_RELEASE_ID, 'test-release');
  config.bucket = ''; fs.writeFileSync(file, JSON.stringify(config)); calls.length = 0;
  await assert.rejects(deployCloudflare({ configFile: file, dist: root, releaseId: 'other', objects: [{ key: 'x', file: root }], run }), /R2/);
  assert.equal(calls.length, 0);
});
test('Cloudflare 配置阻止错误域名，空站无需 R2，未知网址要求人工核对', async t => {
  const { file, root, config } = fixture(t);
  config.bucket = ''; fs.writeFileSync(file, JSON.stringify(config)); assert.equal(readConfig(file).bucket, '');
  assert.equal(wranglerConfig(config, root, 'empty').r2_buckets, undefined);
  config.origin = ''; fs.writeFileSync(file, JSON.stringify(config));
  const result = await deployCloudflare({ configFile: file, dist: root, releaseId: 'empty', run: async () => 'https://test-blog.example.workers.dev' });
  assert.equal(result.url, 'https://test-blog.example.workers.dev');
  await assert.rejects(deployCloudflare({ configFile: file, dist: root, releaseId: 'unknown', run: async () => '' }), /网址/);
  config.origin = 'http://example.com'; fs.writeFileSync(file, JSON.stringify(config)); assert.throws(() => readConfig(file), /HTTPS/);
});
test('真实构建遇到云上传失败保留旧本机版本，重试成功才切换', async t => {
  const { file, root, directory, config } = batch(t), site = path.join(root, 'site');
  fs.mkdirSync(path.join(site, 'old'), { recursive: true }); fs.symlinkSync('old', path.join(site, 'current'));
  let fail = true, calls = 0;
  const publish = createCloudflarePublisher(TEMPLATE, site, config.origin, file, async () => { calls++; if (fail) throw new Error('模拟远程失败'); return ''; });
  await assert.rejects(publish(directory)); assert.equal(fs.readlinkSync(path.join(site, 'current')), 'old');
  fail = false; const result = await publish(directory);
  assert.notEqual(fs.readlinkSync(path.join(site, 'current')), 'old'); assert.equal(result.targets.site, 'published');
  assert.ok(calls >= 4);
  const publicData = fs.readFileSync(path.join(site, 'current/blog-data.json'), 'utf8');
  assert.equal(publicData.includes('PRIVATE_TEST_BODY'), false);
  assert.equal(fs.existsSync(path.join(site, 'current/images/私密.png')), false);
  assert.equal(fs.existsSync(path.join(site, 'current/images/shared.png')), true);
});
