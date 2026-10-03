/**
 * [INPUT]: 依赖 Node test、临时目录、HTTP 客户端和真实 BatchStore/接收路由
 * [OUTPUT]: 对外提供上传完整性、隔离、互斥、断线恢复及鉴权的行为验证
 * [POS]: 服务回归边界；发布器注入可控结果，测试从不连接生产站点或读取本机密钥
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { BatchStore, ApiError, sha256 } = require('../server/store.cjs');
const { createReceiver } = require('../server/http.cjs');
const SUCCESS = { releaseId: 'test-release', contentVersion: sha256('test-content') };
const note = (title = '文章') => ({ type: 'article', path: '分类/文章.md', content: `---\nid: test-article\ntitle: ${title}\n---\n正文` });
const imageBytes = Buffer.from('test-image-bytes');
const image = { filename: '中文 图片.PNG', size: imageBytes.length, hash: sha256(imageBytes) };
async function fixture(t, publish = async () => SUCCESS) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-receiver-test-'));
  const store = new BatchStore(root, publish), key = crypto.randomBytes(32).toString('hex');
  const server = createReceiver(store, key);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (store.job) await store.job;
    await new Promise(resolve => server.close(resolve)); store.close(); fs.rmSync(root, { recursive: true, force: true });
  });
  const request = async (endpoint, method = 'GET', body, authenticated = true, binary = false) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/publish${endpoint}`, {
      method, headers: { ...(authenticated ? { Authorization: `Bearer ${key}` } : {}), ...(body !== undefined ? { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' } : {}) },
      ...(body !== undefined ? { body: binary ? body : JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  };
  return { root, store, request };
}

test('鉴权先于写入，健康响应不含连接凭据或服务端路径', async t => {
  const { root, request } = await fixture(t);
  assert.deepEqual(await request('/health', 'GET', undefined, false), { status: 401, body: { code: 'UNAUTHORIZED' } });
  assert.equal((await request('/batches', 'POST', { files: [note()], images: [] }, false)).status, 401);
  assert.deepEqual(fs.readdirSync(path.join(root, 'batches')), []);
  assert.deepEqual((await request('/health')).body, { status: 'ok', protocol: 1 });
});

test('嵌套路径保留，图片完整且哈希正确后才提交；重复提交幂等', async t => {
  let calls = 0;
  const { root, store, request } = await fixture(t, async () => { calls++; return SUCCESS; });
  const result = await request('/batches', 'POST', { files: [note()], images: [image] });
  assert.equal(result.status, 201);
  const id = result.body.batchId;
  assert.deepEqual(result.body.needUpload, [image.filename]);
  assert.equal(fs.readFileSync(path.join(root, 'batches', id, 'content/2.深度长文/分类/文章.md'), 'utf8'), note().content);
  assert.equal((await request(`/batches/${id}/commit`, 'POST', {})).body.code, 'INCOMPLETE');
  assert.equal((await request(`/batches/${id}/images/${encodeURIComponent(image.filename)}`, 'PUT', Buffer.from('wrong'), true, true)).body.code, 'INVALID_INPUT');
  assert.equal((await request(`/batches/${id}/images/${encodeURIComponent(image.filename)}`, 'PUT', imageBytes, true, true)).status, 200);
  await request(`/batches/${id}/commit`, 'POST', {}); await store.job;
  assert.equal(store.current(), id);
  assert.deepEqual(store.status(id).targets, { cn: 'published', com: 'published' });
  await request(`/batches/${id}/commit`, 'POST', {}); assert.equal(calls, 1);
  assert.equal((await request(`/batches/${id}/images/${encodeURIComponent(image.filename)}`, 'PUT', imageBytes, true, true)).status, 409);
});

test('图片独立修改走差量，删除仅在成功切换快照后生效', async t => {
  const { root, store } = await fixture(t);
  const first = store.create({ files: [note()], images: [image] });
  store.upload(first.batchId, image.filename, imageBytes); store.commit(first.batchId); await store.job;
  const same = store.create({ files: [note()], images: [image] });
  assert.deepEqual(same.needUpload, []);
  const changed = store.create({ files: [note()], images: [{ ...image, hash: sha256('changed'), size: 7 }] });
  assert.deepEqual(changed.needUpload, [image.filename]);
  const deleted = store.create({ files: [], images: [] });
  assert.equal(store.current(), first.batchId);
  store.commit(deleted.batchId); await store.job;
  assert.equal(store.current(), deleted.batchId);
  assert.deepEqual(fs.readdirSync(path.join(root, 'current/images')), []);
  assert.ok(fs.existsSync(path.join(root, 'batches', first.batchId, 'images', image.filename)));
});

test('构建失败保留上次成功内容；修复后同批次可重试', async t => {
  let fail = false;
  const { store } = await fixture(t, async () => { if (fail) throw new Error('private handshake path token'); return SUCCESS; });
  const first = store.create({ files: [note()], images: [] }); store.commit(first.batchId); await store.job;
  fail = true;
  const second = store.create({ files: [note('更新')], images: [] }); store.commit(second.batchId); await store.job;
  assert.equal(store.current(), first.batchId);
  assert.deepEqual(store.status(second.batchId), { batchId: second.batchId, state: 'failed', code: 'PUBLISH_FAILED' });
  fail = false; store.commit(second.batchId); await store.job; assert.equal(store.current(), second.batchId);
});

test('内容语义错误只返回业务错误，任务并发提交受限', async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { store } = await fixture(t, async () => { await pending; throw new ApiError('INVALID_CONTENT', 422); });
  const first = store.create({ files: [note()], images: [] }); store.commit(first.batchId);
  const second = store.create({ files: [], images: [] });
  assert.throws(() => store.commit(second.batchId), error => error.code === 'BUSY');
  release(); await store.job;
  assert.equal(store.status(first.batchId).code, 'INVALID_CONTENT'); assert.equal(store.current(), null);
});

test('路径逃逸、同名文件、伪类型与图片碰撞在暂存前拒绝', async t => {
  const { store } = await fixture(t);
  for (const relative of ['../outside.md', '/absolute.md', '分类/../outside.md', '分类\\escape.md', '.hidden/file.md', 'CLAUDE.md', 'a\u0000.md']) {
    assert.throws(() => store.create({ files: [{ ...note(), path: relative }], images: [] }), error => error.code === 'INVALID_INPUT');
  }
  assert.throws(() => store.create({ files: [{ ...note(), type: '__proto__' }], images: [] }));
  assert.throws(() => store.create({ files: [note(), note()], images: [] }));
  assert.throws(() => store.create({ files: [], images: [image, { ...image, filename: image.filename.toLowerCase() }] }));
  assert.equal(fs.readdirSync(path.join(store.root, 'batches')).length, 0);
});

test('服务重启保留成功状态，发布中断可重试且不改变 current', async t => {
  const { root, store } = await fixture(t);
  const first = store.create({ files: [note()], images: [] }); store.commit(first.batchId); await store.job;
  const interrupted = store.create({ files: [note('重启')], images: [] });
  const meta = store.load(interrupted.batchId); meta.state = 'publishing'; store.save(interrupted.batchId, meta);
  store.close();
  const restored = new BatchStore(root, async () => SUCCESS);
  assert.equal(restored.status(first.batchId).state, 'published');
  assert.equal(restored.status(interrupted.batchId).code, 'INTERRUPTED');
  assert.equal(restored.current(), first.batchId);
  restored.commit(interrupted.batchId); await restored.job; assert.equal(restored.current(), interrupted.batchId); restored.close();
});

test('第二服务不能同时操作同一数据目录', async t => {
  const { root } = await fixture(t);
  assert.throws(() => new BatchStore(root, async () => SUCCESS), /已有运行进程/);
});

test('栏目清单保留笔记库原始目录，拒绝伪身份、目录碰撞和漏传配置', async t => {
  const { root, store } = await fixture(t);
  const collections = [{ id: 'home', kind: 'config', folder: '1.开始' }, { id: 'books', kind: 'book', folder: '3.阅读思考' }, { id: 'about', kind: 'about', folder: '5.成长' }];
  const files = collections.map(item => ({ type: item.kind, collectionId: item.id, path: '_栏目.md', content: `---\nid: ${item.id}\nkind: ${item.kind}\n---\n` }));
  const created = store.create({ collections, files: [...files, { type: 'book', collectionId: 'books', path: '分类/笔记.md', content: '正文' }], images: [] });
  assert.ok(fs.existsSync(path.join(root, 'batches', created.batchId, 'content/3.阅读思考/分类/笔记.md')));
  assert.ok(!fs.existsSync(path.join(root, 'batches', created.batchId, 'content/3.行者百书')));
  assert.throws(() => store.create({ collections, files: files.slice(1), images: [] }));
  assert.throws(() => store.create({ collections, files: [...files, { ...files[0], collectionId: 'wrong' }], images: [] }));
  assert.throws(() => store.create({ collections: [...collections, { id: 'collision', kind: 'book', folder: '3.阅读思考' }], files, images: [] }));
  assert.throws(() => store.create({ collections: collections.map(item => ({ ...item, folder: '../escape' })), files, images: [] }));
});
