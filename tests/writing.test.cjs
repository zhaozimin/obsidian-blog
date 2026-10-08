/**
 * [INPUT]: 依赖 Node test、gray-matter 解析 YAML、插件写作模块（templates/authoring/images/format）与内存笔记库替身
 * [OUTPUT]: 模板渲染、新建与分类、中控台按钮、右键新建套模板、标题跟随文件名、图片命名与离开即整理时机的回归验证
 * [POS]: 写作入口的回归边界；替身只模拟用到的 Obsidian 接口，使用虚构笔记，不读取用户笔记库
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const matter = require('gray-matter');

// ============================================================
//  Obsidian 替身
// ============================================================
const notices = [], modals = [];
class TFile { constructor(path, content) { Object.assign(this, { path, content, name: path.split('/').pop(), basename: path.split('/').pop().replace(/\.md$/, ''), extension: path.split('.').pop(), stat: { mtime: 0 } }); } }
class TFolder { constructor(path) { Object.assign(this, { path, name: path.split('/').pop(), children: [] }); } }
class MarkdownView { constructor(file) { this.file = file; this.saved = 0; } save() { this.saved++; return Promise.resolve(); } getMode() { return 'source'; } }
const element = () => {
  const el = { children: [], listeners: {}, style: {}, text: '', cls: '' };
  el.createEl = (tag, options = {}) => { const child = element(); Object.assign(child, { tag, text: options.text || '', cls: options.cls || '' }); el.children.push(child); return child; };
  el.createDiv = () => el.createEl('div');
  el.addEventListener = (name, handler) => { el.listeners[name] = handler; };
  el.empty = () => { el.children = []; };
  return el;
};
const obsidian = {
  TFile, MarkdownView,
  Modal: class { constructor(app) { this.app = app; this.contentEl = element(); } open() { modals.push(this); } close() {} },
  Setting: class {
    constructor() { this.settingEl = element(); }
    setName() { return this; } setDesc() { return this; }
    addDropdown() { return this; } addText() { return this; } addButton() { return this; }
  },
  parseYaml: yaml => matter(`---\n${yaml}\n---\n`).data
};
const originalLoad = Module._load;
Module._load = function(name, ...args) { return name === 'obsidian' ? obsidian : originalLoad.call(this, name, ...args); };
const templates = require('../plugin/templates');
const authoring = require('../plugin/authoring');
const { cleanImageName, suggestImageName, IMAGE_EXTENSION } = require('../plugin/images');
const { registerFormatter } = require('../plugin/format');
Module._load = originalLoad;

/** 内存笔记库：文件、文件夹、事件与工作区，都只实现写作模块真正调用的那几个接口 */
function vaultFixture(entries = {}) {
  const items = new Map(), handlers = {}, opened = [];
  const add = item => {
    items.set(item.path, item);
    const parent = item.path.split('/').slice(0, -1).join('/');
    if (parent) { if (!items.has(parent)) add(new TFolder(parent)); items.get(parent).children.push(item); }
    return item;
  };
  for (const [path, content] of Object.entries(entries)) add(new TFile(path, content));
  const app = {
    handlers, opened,
    vault: {
      getAbstractFileByPath: path => items.get(path) || null,
      getMarkdownFiles: () => [...items.values()].filter(item => item instanceof TFile && item.extension === 'md'),
      getFiles: () => [...items.values()].filter(item => item instanceof TFile),
      read: async file => file.content, cachedRead: async file => file.content,
      create: async (path, content) => add(new TFile(path, content)),
      createFolder: async path => add(new TFolder(path)),
      process: async (file, fn) => { file.content = fn(file.content); app.trigger('modify', file); return file.content; },
      on: (name, handler) => { (handlers[name] ||= []).push(handler); return {}; },
      adapter: { exists: async () => false, read: async () => '{}', write: async () => {} }
    },
    workspace: {
      active: null, leaves: [],
      onLayoutReady: callback => callback(),
      on: (name, handler) => { (handlers[name] ||= []).push(handler); return {}; },
      getActiveFile: () => app.workspace.active,
      iterateAllLeaves: callback => app.workspace.leaves.forEach(callback),
      getLeaf: () => ({ openFile: async (file, options) => opened.push({ file, options }), view: null })
    },
    trigger: (name, ...args) => { for (const handler of handlers[name] || []) handler(...args); }
  };
  return app;
}
const SECTIONS = {
  'Blog/2.深度长文/_栏目.md': '---\nid: long-reads\nkind: article\n---\n',
  'Blog/3.阅读思考/_栏目.md': '---\nid: books\nkind: book\n---\n',
  'Blog/5.关于/_栏目.md': '---\nid: about\nkind: about\n---\n',
  'Blog/1.首页/_栏目.md': '---\nid: home\nkind: config\n---\n'
};
const pluginFixture = (entries = {}, settings = {}) => {
  const app = vaultFixture({ ...SECTIONS, ...entries });
  const commands = {};
  const plugin = {
    app, settings: { blogFolderName: 'Blog', templateFolder: '模板', autoFormat: true, ...settings },
    notice: message => notices.push(message), registerEvent() {}, register() {}, addCommand: command => { commands[command.id] = command; },
    syncAllFiles: async () => 'synced', previewWechat: async () => 'previewed', checkConnection: async () => 'checked'
  };
  return { app, plugin, commands };
};
const flush = () => new Promise(resolve => setImmediate(resolve));

// ============================================================
//  模板
// ============================================================

test('四类内置模板带字段说明，说明住在注释里，属性区是合法 YAML', () => {
  for (const kind of ['article', 'book', 'product', 'about']) {
    const source = templates.builtinTemplate(kind);
    const parsed = matter(source);
    assert.ok(source.includes('%%\n填写说明'));
    assert.equal(parsed.data.id, '');
    assert.equal(parsed.data.pinned, kind === 'about' ? undefined : false);
  }
  assert.ok(templates.builtinTemplate('book').includes('rating 评分'));
  assert.ok(templates.builtinTemplate('product').includes('link 链接'));
  assert.ok(!/^link:/m.test(templates.builtinTemplate('article')), '长文页不显示 link，模板不放这个字段');
  assert.deepEqual(templates.templateFiles().map(entry => entry.path), ['模板/长文模板.md', '模板/书籍模板.md', '模板/产品模板.md', '模板/故事模板.md']);
});

test('渲染只填 id、title、date，标题里的引号不弄坏 YAML，缺的键补在最前', () => {
  const rendered = templates.renderTemplate('---\ntitle: ""\nsubtitle: "{{title}}"\n---\n# {{title}}\n', { id: 'x1', title: '被"选中"的 16 天', date: '2026-10-04' });
  const parsed = matter(rendered);
  assert.equal(parsed.data.title, '被"选中"的 16 天');
  assert.equal(parsed.data.id, 'x1');
  assert.equal(parsed.data.date, '2026-10-04');
  assert.equal(parsed.content.trim(), '# 被"选中"的 16 天');
  assert.equal(matter(templates.renderTemplate('正文', { id: 'a', title: 'b', date: 'c' })).content.trim(), '正文');
  assert.equal(templates.today(new Date(2026, 9, 4, 1, 30)), '2026-10-04');
});

test('笔记库里的模板优先，缺失时退回内置模板', async () => {
  const { app } = pluginFixture({ '模板/长文模板.md': '---\nid: ""\ntitle: ""\nmine: true\n---\n' });
  assert.match(await templates.loadTemplate(app, { templateFolder: '模板' }, 'article'), /mine: true/);
  assert.match(await templates.loadTemplate(app, { templateFolder: '模板' }, 'book'), /填写说明/);
});

// ============================================================
//  新建
// ============================================================

test('新建按栏目与分类落盘、套库内模板并打开；同名直接打开，不覆盖', async () => {
  const { app, plugin } = pluginFixture({ 'Blog/2.深度长文/AI/旧文.md': '旧内容', '模板/长文模板.md': '---\nid: ""\ntitle: ""\ndate: ""\n---\n\n%%说明%%\n' });
  const collection = { id: 'long-reads', kind: 'article', folder: '2.深度长文' };
  const created = await authoring.createNote(plugin, collection, 'Blog', '新文章', 'AI/工具');
  assert.equal(created.path, 'Blog/2.深度长文/AI/工具/新文章.md');
  assert.equal(matter(created.content).data.title, '新文章');
  assert.equal(app.opened.at(-1).options.state.mode, 'source');
  const again = await authoring.createNote(plugin, collection, 'Blog', '旧文', 'AI');
  assert.equal(again.content, '旧内容');
  await assert.rejects(authoring.createNote(plugin, collection, 'Blog', 'a/b'), /标题/);
  await assert.rejects(authoring.createNote(plugin, collection, 'Blog', '好标题', '.隐藏'), /分类/);
  assert.deepEqual(authoring.categoriesOf(app, 'Blog/2.深度长文'), ['AI', 'AI/工具']);
});

test('中控台按钮按栏目 id 进入新建，未知动作与坏写法给出提示', async () => {
  const { plugin } = pluginFixture();
  const el = element();
  const button = authoring.consoleButton(plugin, '文字: 笔下生花 · 万文集\n栏目: books', el);
  assert.equal(button.text, '笔下生花 · 万文集');
  button.listeners.click(); await flush(); await flush();
  assert.equal(modals.at(-1).preset.id, 'books');
  const upload = authoring.consoleButton(plugin, '动作: 上传博客', element());
  assert.equal(upload.text, '上传博客');
  assert.equal(authoring.consoleButton(plugin, '动作: 群发', el).cls, 'blog-publisher-warning');
  authoring.consoleButton(plugin, '文字: 错栏目\n栏目: nope', el).listeners.click(); await flush(); await flush();
  assert.match(notices.at(-1), /找不到栏目「nope」/);
});

test('右键新建到栏目目录的空笔记套模板；改名时代填的标题跟着走，亲手改过的不动', async () => {
  const { app, plugin } = pluginFixture();
  authoring.registerAutoTemplate(plugin);
  const blank = await app.vault.create('Blog/3.阅读思考/未命名.md', '');
  app.trigger('create', blank); await flush(); await flush();
  assert.equal(matter(blank.content).data.title, '未命名');
  assert.ok(blank.content.includes('doubanUrl'));
  const oldPath = blank.path;
  Object.assign(blank, { path: 'Blog/3.阅读思考/穷查理宝典.md', name: '穷查理宝典.md', basename: '穷查理宝典' });
  app.trigger('rename', blank, oldPath); await flush(); await flush();
  assert.equal(matter(blank.content).data.title, '穷查理宝典');
  blank.content = blank.content.replace('title: "穷查理宝典"', 'title: "我起的标题"');
  Object.assign(blank, { path: 'Blog/3.阅读思考/改名.md', name: '改名.md', basename: '改名' });
  app.trigger('rename', blank, 'Blog/3.阅读思考/穷查理宝典.md'); await flush(); await flush();
  assert.equal(matter(blank.content).data.title, '我起的标题');
  for (const [path, content] of [['Blog/3.阅读思考/有内容.md', '原文'], ['别处/空.md', ''], ['Blog/3.阅读思考/CLAUDE.md', '']]) {
    const file = await app.vault.create(path, content);
    app.trigger('create', file); await flush(); await flush();
    assert.equal(file.content, content);
  }
});

test('图片名由作者起：只去掉弄坏路径与双链的符号，建议名优先用有意义的原名', () => {
  assert.equal(cleanImageName('  朋友圈   封面  '), '朋友圈 封面');
  assert.equal(cleanImageName('a/b#c|d[1]^x'), 'abcd1x');
  assert.equal(cleanImageName('..隐藏'), '隐藏');
  assert.equal(suggestImageName('04-system-overview.png', '朋友圈'), '04-system-overview');
  assert.equal(suggestImageName('image.png', '朋友圈'), '朋友圈');
  assert.equal(suggestImageName('Pasted image 20261004213000.png', '朋友圈'), '朋友圈');
  assert.equal(suggestImageName('截屏2026-10-04 21.30.00.png', '朋友圈'), '朋友圈');
  assert.equal(suggestImageName('IMG_1234.HEIC', ''), '');
  assert.ok(IMAGE_EXTENSION.test('封面.WEBP') && IMAGE_EXTENSION.test('照片.heic') && !IMAGE_EXTENSION.test('文档.pdf'));
});

// ============================================================
//  离开即整理
// ============================================================

test('正开着的那一篇不动，离开时才整理；没开着的防抖整理；手动命令立即整理', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.window = { setTimeout: (...args) => setTimeout(...args), clearTimeout: id => clearTimeout(id), requestAnimationFrame: callback => callback() };
  t.after(() => { delete globalThis.window; });
  const { app, plugin, commands } = pluginFixture({ 'Blog/2.深度长文/写作中.md': '中文English\n下一行', 'Blog/2.深度长文/后台.md': '后台English', 'CLAUDE.md': '地图English\n紧凑' });
  registerFormatter(plugin);
  const writing = app.vault.getAbstractFileByPath('Blog/2.深度长文/写作中.md');
  const view = Object.assign(new MarkdownView(writing), { currentMode: { getScroll: () => 120, applyScroll: value => { view.scrolled = value; } } });
  app.workspace.leaves = [{ view }]; app.workspace.active = writing;

  app.trigger('modify', writing);
  t.mock.timers.tick(5000); await flush();
  assert.equal(writing.content, '中文English\n下一行', '正在写的那篇不动');

  app.workspace.active = null; app.trigger('file-open', null); await flush(); await flush();
  assert.equal(writing.content, '中文 English\n\n下一行\n');
  assert.equal(view.saved, 1, '整理前先让分栏存盘');
  assert.equal(view.scrolled, 120, '滚动位置放回原处');

  const background = app.vault.getAbstractFileByPath('Blog/2.深度长文/后台.md');
  app.trigger('modify', background); await flush();
  assert.equal(background.content, '后台English');
  t.mock.timers.tick(2000); await flush(); await flush();
  assert.equal(background.content, '后台 English\n');

  const map = app.vault.getAbstractFileByPath('CLAUDE.md');
  app.trigger('modify', map); t.mock.timers.tick(2000); await flush(); await flush();
  assert.equal(map.content, '地图English\n紧凑', 'Agent 地图文件不排版');

  plugin.settings.autoFormat = false;
  writing.content = '关掉English'; app.trigger('modify', writing); t.mock.timers.tick(2000); await flush();
  assert.equal(writing.content, '关掉English');

  app.workspace.active = writing;
  await commands['format-note'].callback();
  assert.equal(writing.content, '关掉 English\n');
  assert.match(notices.at(-1), /已整理/);
});
