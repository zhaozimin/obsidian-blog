/**
 * [INPUT]: 依赖真实静态文件入口、HTTP 接收器、临时目录与 Node 流
 * [OUTPUT]: 对外提供路径/符号链接隔离、HEAD 和异步读取失败的回归验证
 * [POS]: 静态服务公开边界；构建目录之外的文件与读盘异常不能泄露或终止接收进程
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { once } = require('node:events');
const { serveStatic, servePublishedStatic } = require('../server/static.cjs');
const { createReceiver } = require('../server/http.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-static-')), dist = path.join(root, 'dist');
  fs.mkdirSync(dist); fs.writeFileSync(path.join(dist, 'index.html'), 'public-index');
  fs.writeFileSync(path.join(root, 'private.txt'), 'private-secret');
  fs.symlinkSync('../private.txt', path.join(dist, 'escape.txt'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return { root, dist };
}
test('静态入口只返回产物，拒绝隐藏路径和外部符号链接；HEAD 不返回正文', async t => {
  const { dist } = fixture(t), server = createReceiver({}, 'test-key-for-static-boundary-only-32', null, { staticSite: serveStatic(dist) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (url, method = 'GET') => fetch(`http://127.0.0.1:${server.address().port}${url}`, { method });
  assert.equal(await (await request('/')).text(), 'public-index');
  const head = await request('/', 'HEAD'); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  for (const route of ['/escape.txt', '/.secret', '/%2eprivate.txt', '/%2e%2e%2fprivate.txt', '/%5cprivate.txt']) assert.equal((await request(route)).status, 404);
});
test('已校验文件在异步打开前消失时关闭响应，不能产生未处理流异常', { timeout: 2000 }, async t => {
  const { dist } = fixture(t), response = new PassThrough(); response.writeHead = () => {};
  const closed = once(response, 'close');
  assert.equal(serveStatic(dist)({ method: 'GET' }, response, '/index.html'), true);
  fs.unlinkSync(path.join(dist, 'index.html'));
  await closed; assert.equal(response.destroyed, true);
});

test('静态资源选择跟随已提交批次，构建器提前切换 site/current 不影响公开版本', async t => {
  const { root } = fixture(t), site = path.join(root, 'site');
  for (const release of ['old', 'new']) {
    fs.mkdirSync(path.join(site, 'releases', release, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(site, 'releases', release, 'dist/index.html'), release);
  }
  fs.symlinkSync('releases/new/dist', path.join(site, 'current'));
  let releaseId = 'old';
  const store = { current: () => 'batch', load: () => ({ state: 'published', result: { releaseId } }) };
  const server = createReceiver({}, 'test-key-for-static-boundary-only-32', null, { staticSite: servePublishedStatic(site, store) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/`;
  assert.equal(await (await fetch(url)).text(), 'old');
  releaseId = 'new'; assert.equal(await (await fetch(url)).text(), 'new');
});
