/**
 * [INPUT]: 依赖真实 HTTP 边界、Reader、Node test 与临时私有图片，注入内容契约和时钟
 * [OUTPUT]: 对外提供未授权读取、限速、跨站授权、限时图片与批次切换的行为验证
 * [POS]: 阅读隐私回归边界；使用合成文章，既不读取私有密码也不向生产站发布
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReader } = require('../server/reader.cjs');
const { createReceiver } = require('../server/http.cjs');
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-reader-'));
  let batch = 'first', time = 0;
  for (const id of ['first', 'second']) {
    fs.mkdirSync(path.join(root, id, 'images'), { recursive: true });
    fs.writeFileSync(path.join(root, id, 'images/私密.webp'), 'private-image');
    fs.writeFileSync(path.join(root, id, 'images/另一篇.webp'), 'other-image');
  }
  const password = crypto.randomBytes(32).toString('hex');
  const body = 'PRIVATE_BODY_SENTINEL\n![](/images/%E7%A7%81%E5%AF%86.webp)\n![](/images/shared.webp)\n```md\n![](/images/%E7%A7%81%E5%AF%86.webp)\n```';
  const store = { current: () => batch, dir: id => path.join(root, id) };
  const reader = createReader({ store, origins: ['https://example.com'], now: () => time,
    readContent: () => ({ allPosts: [{ id: 'private', password, content: body }] }),
    publicSnapshot: () => ({ privateImages: new Set(['私密.webp', '另一篇.webp']) }),
    localImageNames: () => new Set(['私密.webp', 'shared.webp']),
  });
  const server = createReceiver(store, crypto.randomBytes(32).toString('hex'), reader);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); });
  const request = (url, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${url}`, options);
  const unlock = (value, ip = 'test-client') => request('/api/reader/posts/private/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip, Origin: 'https://example.com' }, body: JSON.stringify({ password: value }) });
  return { reader, request, unlock, password, change: () => { batch = 'second'; }, expire: () => { time += 1800001; } };
}
test('阅读接口不需要上传密钥，但缺失或错误阅读密码永不返回正文', async t => {
  const { request, unlock, password } = await fixture(t);
  for (const value of [undefined, '', 'wrong']) {
    const response = await unlock(value); assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { code: 'READ_DENIED' });
  }
  const guessed = await request('/api/reader/posts/private/unlock'); assert.equal(guessed.status, 404);
  const response = await unlock(password); assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://example.com');
  const data = await response.json(); assert.match(data.content, /PRIVATE_BODY_SENTINEL/);
  assert.equal(JSON.stringify(data).includes(password), false);
  assert.match(data.content, /\/api\/reader\/media\/[a-f0-9]{64}\//);
  assert.match(data.content, /\/images\/shared.webp/);
  assert.ok(data.content.includes('```md\n![](/images/%E7%A7%81%E5%AF%86.webp)\n```'));
});
test('图片能力只能读取本篇专属图片，过期或成功批次变化立即失效', async t => {
  const { request, unlock, password, expire, change } = await fixture(t);
  const first = await (await unlock(password)).json();
  const url = first.content.match(/\/api\/reader\/media\/[^)]+/)[0];
  const response = await request(url); assert.equal(response.status, 200); assert.equal(await response.text(), 'private-image');
  const prefix = url.slice(0, url.lastIndexOf('/') + 1);
  for (const name of ['另一篇.webp', '../私密.webp', 'shared.webp']) assert.equal((await request(prefix + encodeURIComponent(name))).status, 403);
  assert.equal((await request(url.replace(/media\/[a-f0-9]+/, `media/${'0'.repeat(64)}`))).status, 403);
  expire(); assert.equal((await request(url)).status, 403);
  const next = await (await unlock(password)).json(); const nextUrl = next.content.match(/\/api\/reader\/media\/[^)]+/)[0];
  change(); assert.equal((await request(nextUrl)).status, 403);
});
test('在线猜测限速、严格 CORS 与小请求体限制', async t => {
  const { request, unlock, password } = await fixture(t);
  for (let i = 0; i < 6; i++) assert.equal((await unlock('wrong')).status, 403);
  assert.equal((await unlock(password)).status, 429);
  const denied = await request('/api/reader/posts/private/unlock', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null);
  assert.equal((await request('/api/reader/posts/private/unlock', { method: 'OPTIONS', headers: { Origin: 'https://example.com' } })).status, 204);
  const big = await request('/api/reader/posts/private/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'x'.repeat(9000) }) });
  assert.equal(big.status, 413);
  assert.equal((await request('/api/publish/health')).status, 401);
});
