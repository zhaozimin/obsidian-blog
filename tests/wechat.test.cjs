/**
 * [INPUT]: 依赖 Node test、临时私有目录、真实渲染器和本机模拟公众号接口
 * [OUTPUT]: 对外提供图文排版、权限边界、草稿幂等与网络结果不明的行为验证
 * [POS]: 公众号回归边界；使用合成文章及虚构账号，不连接真实公众号，不读取个人凭据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const sharp = require('sharp');
const { prepareArticle, previewHtml } = require('../server/wechat-render.cjs');
const { WechatService } = require('../server/wechat.cjs');
const { WechatApi } = require('../server/wechat-api.cjs');
const { createReceiver } = require('../server/http.cjs');
const { ApiError } = require('../server/store.cjs');
const { collectWechatArticle } = require('../plugin/wechat.js');
const matter = require('gray-matter');
const id = 'a'.repeat(64);
async function article(markdown = '## 标题\n\n正文 $E=mc^2$。\n\n$$\n\\frac{a}{b}=2\n$$\n\n| 字段 | 值 |\n| --- | --- |\n| A | **B** |\n\n```js\nconst title = "文字";\n```\n\n![图](bp-asset:' + id + ')') {
  const bytes = await sharp({ create: { width: 100, height: 60, channels: 3, background: '#ddeeff' } }).png().toBuffer();
  return { articleId: 'stable-article', title: '公众号测试', markdown, cover: id, images: [{ id, base64: bytes.toString('base64') }], style: {} };
}
function directory(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
async function mock(t) {
  const calls = [], drafts = new Map();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'); const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks), input = String(req.headers['content-type']).startsWith('application/json') ? JSON.parse(bytes) : null;
    calls.push({ path: url.pathname, input });
    let result;
    if (url.pathname === '/cgi-bin/token') result = { access_token: 'test-token', expires_in: 7200 };
    else {
      assert.equal(url.searchParams.get('access_token'), 'test-token');
      if (url.pathname.includes('uploadimg')) { assert.ok(bytes.includes(Buffer.from('image/png'))); result = { url: 'https://example.invalid/image.png' }; }
      else if (url.pathname.includes('add_material')) result = { media_id: 'cover-id' };
      else if (url.pathname === '/cgi-bin/draft/add') { const media_id = `draft-${drafts.size + 1}`; drafts.set(media_id, input.articles[0]); result = { media_id }; }
      else if (url.pathname === '/cgi-bin/draft/update') { assert.ok(drafts.has(input.media_id)); drafts.set(input.media_id, input.articles); result = { errcode: 0 }; }
      else if (url.pathname === '/cgi-bin/draft/get') result = { news_item: [drafts.get(input.media_id)] };
      else result = { errcode: 48001 };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  return { calls, drafts, adapter: new WechatApi({ appId: 'test-account', appSecret: 'test-only', baseUrl: `http://127.0.0.1:${server.address().port}` }) };
}
test('代码/表格/两类公式保留，HTML 不执行，预览使用本地公式 PNG', async () => {
  const plan = await prepareArticle(await article());
  assert.equal(plan.formulas, 2); assert.equal(plan.assets.length, 3);
  assert.match(plan.html, /<table/); assert.match(plan.html, /<pre/); assert.match(plan.html, /const/);
  assert.ok(!plan.html.includes('class="hljs')); assert.match(previewHtml(plan), /data:image\/png;base64/);
  for (const asset of plan.assets) assert.equal((await sharp(Buffer.from(asset.base64, 'base64')).metadata()).format, 'png');
  const unsafe = await prepareArticle(await article('<script>alert(1)</script>\n\n[点击](javascript:alert)'));
  assert.ok(!unsafe.html.includes('<script')); assert.ok(!unsafe.html.includes('href="javascript:'));
});
test('缺封面、远程图片、错误公式和注入样式在上传前拒绝', async () => {
  await assert.rejects(prepareArticle({ ...await article(), cover: 'missing' }), { code: 'WECHAT_COVER' });
  await assert.rejects(prepareArticle(await article('![远程](http://localhost/private)')), { code: 'WECHAT_IMAGE' });
  await assert.rejects(prepareArticle(await article('$\\notARealCommand{x}$')), { code: 'WECHAT_MATH' });
  await assert.rejects(prepareArticle({ ...await article(), style: { fontFamily: 'system-ui; background:url(x)' } }), { code: 'WECHAT_STYLE' });
});
test('账号留空仍可预览，保存草稿明确报告未配置且不调用公众号', async t => {
  const service = new WechatService(directory(t), new WechatApi());
  const preview = await service.preview(await article()); assert.ok(preview.html); assert.equal(service.health().configured, false);
  await assert.rejects(service.draft(preview.previewId), { code: 'WECHAT_CONFIG' });
});
test('真实 HTTP 适配流程上传封面与公式，只建草稿；重复保存复用，修改更新原草稿', async t => {
  const { adapter, calls, drafts } = await mock(t), root = directory(t);
  let service = new WechatService(root, adapter);
  const preview = await service.preview(await article());
  assert.equal(calls.length, 0);
  const first = await service.draft(preview.previewId); assert.equal(first.mediaId, 'draft-1');
  assert.ok(!drafts.get(first.mediaId).content.includes('bp-asset:')); assert.equal(drafts.get(first.mediaId).thumb_media_id, 'cover-id');
  assert.equal((await service.draft(preview.previewId)).reused, true);
  service = new WechatService(root, adapter);
  const changed = await service.preview(await article('更新正文 $x=2$'));
  assert.equal((await service.draft(changed.previewId)).updated, true); assert.equal(drafts.size, 1);
  assert.equal(calls.filter(call => call.path === '/cgi-bin/draft/add').length, 1);
  assert.equal(calls.filter(call => call.path === '/cgi-bin/draft/update').length, 1);
  assert.ok(!calls.some(call => /freepublish|mass\//.test(call.path)));
});
test('新增草稿响应断线时保留不确定记录，重启后拒绝重复新增', async t => {
  let adds = 0;
  const adapter = { accountId: 'account', configured: () => true, upload: async (_, cover) => cover ? 'cover' : 'https://example.invalid/a.png', add: async () => { adds++; throw new ApiError('WECHAT_NETWORK', 502); }, get: async () => ({ news_item: [{}] }), update: async id => id };
  const root = directory(t); let service = new WechatService(root, adapter);
  const preview = await service.preview(await article('正文'));
  await assert.rejects(service.draft(preview.previewId), { code: 'WECHAT_NETWORK' });
  service = new WechatService(root, adapter);
  await assert.rejects(service.draft(preview.previewId), { code: 'WECHAT_UNCERTAIN' }); assert.equal(adds, 1);
  const reconciled = await service.preview({ ...await article('正文'), draftId: 'confirmed-draft' });
  assert.equal((await service.draft(reconciled.previewId)).mediaId, 'confirmed-draft'); assert.equal(adds, 1);
});
test('公众号 HTTP 预览及草稿路由要求鉴权，错误不暴露账号配置', async t => {
  const service = new WechatService(directory(t), new WechatApi());
  const server = createReceiver({}, 'test-key-for-local-only-not-a-real-key', null, { wechat: service });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/wechat`;
  const forbidden = await fetch(`${url}/health`); assert.equal(forbidden.status, 401);
  const headers = { Authorization: 'Bearer test-key-for-local-only-not-a-real-key', 'Content-Type': 'application/json' };
  const response = await fetch(`${url}/preview`, { method: 'POST', headers, body: JSON.stringify(await article()) });
  const preview = await response.json(); assert.equal(response.status, 200);
  const draft = await fetch(`${url}/drafts`, { method: 'POST', headers, body: JSON.stringify({ previewId: preview.previewId }) });
  assert.equal(draft.status, 409); assert.deepEqual(await draft.json(), { code: 'WECHAT_CONFIG' });
});
test('公众号仅收集选中文章，双链封面可用，代码中的图片语法不读取附件', async () => {
  const note = { path: 'blog-V3/2.深度长文/文章.md', basename: '文章', extension: 'md' };
  const image = { path: 'blog-V3/6.附件/封面.png', name: '封面.png' };
  const pixels = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ffffff' } }).png().toBuffer();
  let reads = 0;
  const source = '---\nid: stable-selected-note\ntitle: 测试\nimage: "[[封面.png]]"\n---\n正文\n\n```md\n![[不存在.png]]\n```\n\n`![[也不存在.png]]`\n\n![[封面.png]]';
  const app = { vault: { read: async () => source, readBinary: async () => { reads++; return pixels.buffer.slice(pixels.byteOffset, pixels.byteOffset + pixels.byteLength); }, getAbstractFileByPath: () => null }, metadataCache: { getFirstLinkpathDest: ref => ref === '封面.png' ? image : null } };
  const selected = await collectWechatArticle(app, {}, note, yaml => matter('---\n' + yaml + '\n---').data);
  assert.equal(selected.images.length, 1); assert.equal(reads, 1); assert.equal(selected.articleId, 'stable-selected-note');
  assert.match(selected.markdown, /```md\n!\[\[不存在.png\]\]\n```/);
  assert.match(selected.markdown, /`!\[\[也不存在.png\]\]`/);
  assert.match(selected.markdown, /!\[\]\(bp-asset:[a-f\d]{64}\)/);
});
