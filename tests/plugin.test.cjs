/**
 * [INPUT]: 依赖 Node test、插件扫描器/网络边界与内存笔记库替身
 * [OUTPUT]: 递归扫描、引用图片、复选框初始化/模板与置顶同步、错误隐藏测试
 * [POS]: 插件回归边界；使用虚构笔记和凭据，不读取用户笔记库
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { collect, diff, sha256, normalizeFolder } = require('../plugin/collector');
const { PublisherClient, normalizeEndpoint } = require('../plugin/client');
const { templates } = require('../plugin/templates');
const Module = require('node:module');
let transport;
const messages = [];
const element = () => ({ empty() {}, createDiv: element, createEl: element, addEventListener() {} });
const obsidian = {
  Plugin: class {
    async loadData() { return this.initialSettings; }
    async saveData(data) { this.saved = structuredClone(data); }
    addStatusBarItem() { return { text: '', setText(value) { this.text = value; }, addClass() {}, setAttribute() {} }; }
    addRibbonIcon() {} addCommand() {} addSettingTab() {} registerEvent() {} register() {}
    registerView() {} registerEditorExtension() {} registerDomEvent() {}
  },
  MarkdownView: class {}, TFile: class {}, ItemView: class {}, setIcon() {}, debounce: fn => fn,
  Notice: class { constructor(message) { messages.push(message); } },
  Modal: class {
    constructor(app) { this.app = app; this.contentEl = element(); }
    open() { this.onOpen(); this.accepted = true; this.close(); }
    close() { this.onClose(); }
  },
  PluginSettingTab: class {}, Setting: class {},
  requestUrl: args => transport(args),
  parseYaml: yaml => parse(yaml)
};
// 排版预览由宿主提供 CodeMirror，构建时内联深色算法；测试里各给一个最小替身
const hosted = { obsidian, '@codemirror/view': { EditorView: { updateListener: { of: listener => listener } } }, 'darkmode-src': '' };
globalThis.document ??= {};
const originalLoad = Module._load;
Module._load = function(name, ...args) { return Object.hasOwn(hosted, name) ? hosted[name] : originalLoad.call(this, name, ...args); };
const BlogPublisherPlugin = require('../plugin/main');
Module._load = originalLoad;
const file = (path, bytes) => ({ path, name: path.split('/').pop(), basename: path.split('/').pop().replace(/\.md$/, ''), bytes });
function appFixture(imageContent = 'pixels') {
  const properties = new Map();
  const files = [
    ...templates().filter(entry => entry.path.endsWith('_栏目.md')).map(entry => file(`Blog/${entry.path}`, entry.content)),
    file('Blog/2.深度长文/分类/文章.md', '---\nid: article\nimage: "[[封面.PNG]]"\n---\n![[图.webp|300]]\n![示意](./图.webp)'),
    file('Blog/6.附件/子目录/封面.PNG', imageContent), file('Blog/6.附件/图.webp', 'diagram'),
    file('Blog/6.附件/无引用.png', 'private'), file('Private/secret.md', 'secret'), file('Blog/2.深度长文/CLAUDE.md', 'map')
  ];
  return {
    files,
    vault: {
      adapter: { exists: async name => properties.has(name), read: async name => properties.get(name), write: async (name, value) => properties.set(name, value) },
      getAbstractFileByPath: name => name === 'Blog' ? {} : files.find(item => item.path === name),
      getFiles: () => files, getMarkdownFiles: () => files.filter(item => item.path.endsWith('.md')),
      read: async item => item.bytes,
      readBinary: async item => new TextEncoder().encode(item.bytes).buffer,
      on() { return {}; }
    },
    metadataCache: { getFirstLinkpathDest: ref => files.find(item => item.name === ref.replace(/^\.\//, '')) },
    workspace: { onLayoutReady() {}, on() { return {}; }, getActiveFile() { return null; }, iterateAllLeaves() {} }
  };
}
const settings = { blogFolderName: 'Blog', imagesFolderName: '6.附件' };
const parse = yaml => Object.fromEntries([...yaml.matchAll(/^(\w+):\s*["']?(.*?)["']?$/gm)].map(match => [match[1], match[2]]));

test('嵌套笔记保留分类路径，仅上传被引用图片，标准本地图片可用', async () => {
  const result = await collect(appFixture(), settings, parse);
  assert.equal(result.files.length, 6); assert.equal(result.files.find(item => item.path.endsWith('分类/文章.md')).path, '分类/文章.md');
  assert.match(result.files.find(item => item.path.endsWith('分类/文章.md')).content, /!\[示意\]\(\/images\//);
  assert.deepEqual(result.images.map(item => item.filename).sort(), ['图.webp', '封面.PNG']);
  assert.equal(Object.keys(result.snapshot).length, 9);
  assert.ok(!JSON.stringify(result.files).includes('secret'));
});

test('置顶模板是布尔复选框，重复初始化保留其他属性类型且不改文章', async () => {
  const { articleTemplate, ensurePinnedProperty } = require('../plugin/templates');
  const matter = require('gray-matter');
  for (const kind of ['article', 'book', 'product']) assert.equal(matter(articleTemplate(kind, '测试')).data.pinned, false);
  assert.equal(matter(articleTemplate('about', '经历')).data.pinned, undefined);
  const app = appFixture();
  await app.vault.adapter.write('.obsidian/types.json', JSON.stringify({ types: { price: 'text' }, retained: true }));
  const original = JSON.stringify(app.files);
  await ensurePinnedProperty(app); await ensurePinnedProperty(app);
  assert.deepEqual(JSON.parse(await app.vault.adapter.read('.obsidian/types.json')), { types: { price: 'text', pinned: 'checkbox' }, retained: true });
  assert.equal(JSON.stringify(app.files), original);
});

test('置顶勾选进入完整笔记快照，字符串和数值不能冒充复选框', async () => {
  const matter = require('gray-matter'), yaml = source => matter(`---\n${source}\n---`).data;
  const app = appFixture(), note = app.files.find(item => item.path.endsWith('分类/文章.md'));
  const before = await collect(app, settings, yaml);
  note.bytes = note.bytes.replace('id: article', 'id: article\npinned: true');
  const after = await collect(app, settings, yaml);
  assert.deepEqual(diff(after.snapshot, before.snapshot).modified, ['article/分类/文章.md']);
  assert.equal(matter(after.files.find(item => item.path.endsWith('分类/文章.md')).content).data.pinned, true);
  for (const value of ['"true"', '"false"', '1', '[]']) {
    note.bytes = note.bytes.replace(/pinned: .*/, `pinned: ${value}`);
    await assert.rejects(collect(app, settings, yaml), /pinned.*复选框/);
  }
});

test('只改图片也能检测变更，删除图片纳入确认清单', async () => {
  const before = await collect(appFixture('old'), settings, parse);
  const after = await collect(appFixture('new'), settings, parse);
  assert.deepEqual(diff(after.snapshot, before.snapshot).modified, ['image/封面.PNG']);
  const removed = { ...after.snapshot }; delete removed['image/图.webp'];
  assert.deepEqual(diff(removed, after.snapshot).deleted, ['image/图.webp']);
  assert.equal(await sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('缺失图片、重复稳定 id 与同名引用拒绝发布', async () => {
  const missing = appFixture(); missing.files.find(item => item.path.endsWith('分类/文章.md')).bytes += '\n![[丢失.png]]';
  await assert.rejects(collect(missing, settings, parse), /不存在/);
  const duplicate = appFixture(); duplicate.files.push(file('Blog/3.阅读思考/另一本.md', '---\nid: article\n---\n正文'));
  await assert.rejects(collect(duplicate, settings, parse), /重复 id/);
  const collision = appFixture(); collision.files.push(file('Other/封面.PNG', 'other'));
  collision.metadataCache.getFirstLinkpathDest = ref => collision.files.find(item => item.path === ref || item.name === ref);
  collision.files.find(item => item.path.endsWith('分类/文章.md')).bytes += '\n![[Other/封面.PNG]]';
  await assert.rejects(collect(collision, settings, parse), /文件名重复/);
});

test('初始化模板具有独立稳定 id，不含个人社交账号或失效图片', () => {
  const entries = templates(); assert.equal(entries.length, 7);
  const ids = entries.map(entry => parse(entry.content.match(/^---\n([\s\S]*?)\n---/)[1]).id);
  assert.equal(new Set(ids).size, 6);
  assert.equal(ids[0], 'home'); assert.ok(entries.every(entry => !/封面\.png|contact@|cklaozhao\.me/.test(entry.content)));
});

test('旧接口地址可迁移，外网明文 HTTP 与 URL 内凭据被拒绝', () => {
  assert.equal(normalizeEndpoint('https://blog.example.com/api/upload/markdown/'), 'https://blog.example.com');
  assert.equal(normalizeEndpoint('https://blog.example.com/'), 'https://blog.example.com');
  assert.equal(normalizeEndpoint('http://127.0.0.1:3002'), 'http://127.0.0.1:3002');
  for (const value of ['http://blog.example.com', 'https://user:pass@blog.example.com', 'https://blog.example.com?key=secret', 'file:///secret']) assert.throws(() => normalizeEndpoint(value));
  for (const folder of ['', '../', 'Blog/../Secrets', '/Blog', '.obsidian']) assert.throws(() => normalizeFolder(folder));
});

test('服务错误和握手内容不泄漏到用户提示，上传凭据只进入请求头', async () => {
  let request;
  const client = new PublisherClient(async args => { request = args; return { status: 500, json: { code: 'PUBLISH_FAILED', details: 'server private handshake' } }; }, { serverUrl: 'https://blog.example.com', secretKey: 'test' });
  await assert.rejects(client.create({ files: [], images: [] }), error => error.code === 'PUBLISH_FAILED' && !error.message.includes('handshake'));
  assert.equal(request.headers.Authorization, 'Bearer test'); assert.ok(!request.body.includes('test'));
  const broken = new PublisherClient(async () => { throw new Error('handshake token'); }, { serverUrl: 'https://blog.example.com', secretKey: 'test' });
  await assert.rejects(broken.health(), error => error.code === 'NETWORK' && !error.message.includes('token'));
});

async function pluginFixture(t) {
  const plugin = new BlogPublisherPlugin(); plugin.app = appFixture();
  plugin.initialSettings = { ...settings, serverUrl: 'https://blog.example.com', secretKey: 'test', syncSnapshotV2: { 'article/旧文章.md': 'old' }, syncTarget: await sha256('https://blog.example.com\ntest') };
  await plugin.onload(); t.after(() => plugin.onunload()); return plugin;
}
function response(status, json) { return { status, json }; }

test('完整同步在双站 published 之前保留原快照，成功后才保存新记录', async t => {
  const plugin = await pluginFixture(t);
  transport = async request => {
    const route = new URL(request.url).pathname;
    if (route.endsWith('/batches')) return response(201, { batchId: 'test-batch', needUpload: ['图.webp', '封面.PNG'] });
    if (request.method === 'PUT') { assert.deepEqual(plugin.settings.syncSnapshotV2, { 'article/旧文章.md': 'old' }); return response(200, { success: true }); }
    if (route.endsWith('/commit')) {
      assert.deepEqual(plugin.settings.syncSnapshotV2, { 'article/旧文章.md': 'old' });
      assert.equal(plugin.saved.pendingPublish.batchId, 'test-batch');
      return response(202, { state: 'publishing' });
    }
    return response(200, { state: 'published', releaseId: 'release-test' });
  };
  await plugin.syncAllFiles();
  assert.equal(plugin.settings.pendingPublish, null);
  assert.equal(plugin.settings.lastReleaseId, 'release-test');
  assert.ok(plugin.settings.syncSnapshotV2['image/封面.PNG']);
  assert.equal(plugin.busy, false);
});

test('图片上传失败停止构建，不写入成功快照', async t => {
  const plugin = await pluginFixture(t); let commits = 0;
  transport = async request => {
    if (request.url.endsWith('/batches')) return response(201, { batchId: 'test-batch', needUpload: ['图.webp', '封面.PNG'] });
    if (request.url.endsWith('/commit')) commits++;
    return response(500, { code: 'INTERNAL', details: 'private-handshake' });
  };
  await plugin.syncAllFiles();
  assert.equal(commits, 0);
  assert.deepEqual(plugin.settings.syncSnapshotV2, { 'article/旧文章.md': 'old' });
  assert.equal(plugin.settings.pendingPublish, null);
  assert.ok(!messages.at(-1).includes('handshake'));
});

test('提交响应断线保留任务；再次同步恢复服务端成功结果', async t => {
  const plugin = await pluginFixture(t); let disconnected = true;
  transport = async request => {
    if (request.url.endsWith('/batches')) return response(201, { batchId: 'test-batch', needUpload: [] });
    if (request.url.endsWith('/commit') && disconnected) throw new Error('private connection handshake');
    return response(200, { state: 'published', releaseId: 'release-restored' });
  };
  await plugin.syncAllFiles();
  assert.equal(plugin.saved.pendingPublish.batchId, 'test-batch');
  assert.deepEqual(plugin.settings.syncSnapshotV2, { 'article/旧文章.md': 'old' });
  disconnected = false; await plugin.syncAllFiles();
  assert.equal(plugin.settings.pendingPublish, null);
  assert.equal(plugin.settings.lastReleaseId, 'release-restored');
  assert.ok(plugin.settings.syncSnapshotV2['image/封面.PNG']);
});

test('状态栏启动即常驻，上传结果不自动清空，重载恢复成功记录', async t => {
  const plugin = await pluginFixture(t);
  assert.equal(plugin.statusBarItem.text, '博客 · 就绪');
  plugin.status('正在上传图片 1/2…');
  assert.match(plugin.statusBarItem.text, /正在上传图片/);
  plugin.finish('博客已发布');
  assert.equal(plugin.statusTimer, undefined);
  assert.equal(plugin.statusBarItem.text, '博客 · 博客已发布');
  plugin.settings.lastReleaseId = 'test-release'; plugin.status('');
  assert.equal(plugin.statusBarItem.text, '博客 · 博客已发布');
});

test('仅改栏目文件夹也触发发布，稳定身份与文章快照不变', async () => {
  const app = appFixture();
  app.files.push(file('Blog/3.阅读思考/书.md', '---\nid: book-stable\n---\n正文'));
  const before = await collect(app, settings, parse);
  for (const item of app.files) item.path = item.path.replace('3.阅读思考/', '8.读书与生活/');
  const after = await collect(app, settings, parse);
  assert.deepEqual(diff(after.snapshot, before.snapshot), { added: [], modified: ['catalog'], deleted: [] });
  assert.equal(after.collections.find(item => item.kind === 'book').id, 'books');
  assert.equal(after.collections.find(item => item.kind === 'book').folder, '8.读书与生活');
  assert.equal(after.files.find(item => item.path === '书.md').collectionId, 'books');
});

test('已有内容的栏目重复初始化不增加文件，改名后不重建旧目录', async t => {
  const plugin = await pluginFixture(t), created = [];
  for (const item of plugin.app.files) item.path = item.path.replace('3.阅读思考/', '3.阅读生活/');
  plugin.app.vault.getAbstractFileByPath = folder => ({ path: folder });
  plugin.app.vault.create = async (name, bytes) => { created.push(name); plugin.app.files.push(file(name, bytes)); };
  plugin.app.vault.createFolder = async name => created.push(name);
  await plugin.initBlogStructure(); await plugin.initBlogStructure();
  assert.deepEqual(created, []);
});

test('模板说明与作者注释不上传，注释里引用的图片也不采集', async () => {
  const app = appFixture();
  app.files.push(file('Blog/2.深度长文/有说明.md', '---\nid: guided\n---\n\n%%\n填写说明：image 写成 "[[无引用.png]]"\n![[无引用.png]]\n%%\n\n正文 %%私语%% 结束'));
  const result = await collect(app, settings, parse);
  const guided = result.files.find(item => item.path === '有说明.md');
  assert.equal(guided.content, '---\nid: guided\n---\n\n\n\n正文  结束');
  assert.ok(!result.images.some(item => item.filename === '无引用.png'));
});

test('未声明的笔记目录拒绝上传，不能悄悄把原栏目当成删除', async () => {
  const app = appFixture(); app.files.push(file('Blog/意外改名/内容.md', '---\nid: unexpected\n---\n正文'));
  await assert.rejects(collect(app, settings, parse), /未声明/);
});
