/**
 * [INPUT]: 依赖 Obsidian Modal/Setting/TFile、栏目声明、模板渲染与 Vault 新建/改名事件
 * [OUTPUT]: 对外提供 createArticle、createNote、categoriesOf、consoleButton（blog-button 代码块）、
 *           dashboardActions（blog-actions 代码块）与 registerAutoTemplate
 * [POS]: 本地写作入口，替代 Buttons + QuickAdd + Templater 三件套：中控台按钮按栏目稳定 id 定位，目录决定分类，
 *        模板决定字段；右键新建到栏目目录同样套模板，标题跟着文件名走，直到作者亲手改过。不覆盖已有文章
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { Modal, Setting, TFile, parseYaml } = require('obsidian');
const { discoverCollections, normalizeFolder } = require('./collector');
const { loadTemplate, renderTemplate, today, ensurePinnedProperty } = require('./templates');
const WRITABLE = new Set(['article', 'book', 'product', 'about']);
const SKIP = new Set(['CLAUDE.md', 'AGENTS.md', 'README.md', '_栏目.md']);
const INVALID = /[\\/:*?"<>|\x00-\x1f]/;
const NEW_CATEGORY = '\u0000new';
const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

// ============================================================
//  栏目与分类
// ============================================================

async function writableCollections(plugin) {
  const root = normalizeFolder(plugin.settings.blogFolderName);
  const collections = (await discoverCollections(plugin.app, root, parseYaml)).filter(item => WRITABLE.has(item.kind));
  return { root, collections };
}

/** 栏目下已有的分类文件夹，含多级（分类/子分类），隐藏目录不算 */
function categoriesOf(app, folderPath) {
  const found = [];
  const walk = (folder, prefix) => {
    for (const child of folder?.children || []) {
      if (!child.children || child.name.startsWith('.')) continue;
      const relative = prefix ? `${prefix}/${child.name}` : child.name;
      found.push(relative); walk(child, relative);
    }
  };
  walk(app.vault.getAbstractFileByPath(folderPath), '');
  return found.sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
}

function normalizeCategory(value) {
  const parts = String(value || '').trim().replace(/^\/+|\/+$/g, '').split('/').map(part => part.trim());
  if (parts.some(part => !part || part.startsWith('.') || INVALID.test(part))) throw new Error('分类名称不能为空，不能以点开头，也不能含 \\ : * ? " < > | 这些符号。');
  return parts.join('/');
}

// ============================================================
//  新建
// ============================================================

/** 新建一篇并打开；同名已存在就直接打开它，绝不覆盖原稿 */
async function createNote(plugin, collection, root, title, category = '') {
  const { app } = plugin;
  title = String(title || '').trim();
  if (!title || INVALID.test(title) || title === '.' || title === '..') throw new Error('请输入标题，不能含 \\ / : * ? " < > | 这些符号。');
  const folder = `${root}/${collection.folder}${category ? `/${normalizeCategory(category)}` : ''}`;
  const path = `${folder}/${title}.md`;
  let file = app.vault.getAbstractFileByPath(path);
  if (!file) {
    const parts = folder.split('/');
    for (let index = 1; index <= parts.length; index++) {
      const current = parts.slice(0, index).join('/');
      if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
    }
    const source = await loadTemplate(app, plugin.settings, collection.kind);
    file = await app.vault.create(path, renderTemplate(source, { id: crypto.randomUUID(), title, date: today() }));
  }
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file, { state: { mode: 'source' }, active: true });
  // 属性区与填写说明之后就是落笔的地方
  const editor = leaf.view?.editor;
  if (editor) {
    const last = editor.lastLine();
    editor.setCursor({ line: last, ch: editor.getLine(last).length });
    editor.focus();
  }
  return file;
}

class NewNoteModal extends Modal {
  constructor(plugin, root, collections, preset) {
    super(plugin.app);
    Object.assign(this, { plugin, root, collections, preset });
  }
  onOpen() {
    const { contentEl, collections, preset } = this;
    let collection = preset || collections[0], title = '', category = '', customName = '', busy = false;
    contentEl.createEl('h2', { text: preset ? `新建 · ${preset.folder}` : '新建笔记' });
    const submit = async () => {
      if (busy) return;
      busy = true;
      try {
        if (category === NEW_CATEGORY && !customName.trim()) throw new Error('请填写新分类的名称。');
        await createNote(this.plugin, collection, this.root, title, category === NEW_CATEGORY ? customName : category);
        this.close();
      } catch (error) { this.plugin.notice(error.message); busy = false; }
    };
    if (!preset) new Setting(contentEl).setName('栏目').addDropdown(input => {
      for (const item of collections) input.addOption(item.id, item.folder);
      input.setValue(collection.id).onChange(value => { collection = collections.find(item => item.id === value); renderCategory(); });
    });
    new Setting(contentEl).setName('标题').addText(input => {
      input.setPlaceholder('笔记标题').onChange(value => { title = value; });
      // 中文输入法回车是选字，不是提交
      input.inputEl.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); void submit(); } });
      window.setTimeout(() => input.inputEl.focus(), 0);
    });
    const categoryEl = contentEl.createDiv();
    const renderCategory = () => {
      categoryEl.empty(); category = ''; customName = '';
      if (collection.kind === 'about') return;
      let customEl;
      new Setting(categoryEl).setName('分类').setDesc('笔记所在的子文件夹就是分类。').addDropdown(input => {
        input.addOption('', '不分类');
        for (const name of categoriesOf(this.app, `${this.root}/${collection.folder}`)) input.addOption(name, name);
        input.addOption(NEW_CATEGORY, '新建分类…');
        input.onChange(value => { category = value; customEl.style.display = value === NEW_CATEGORY ? '' : 'none'; });
      });
      customEl = new Setting(categoryEl).setName('新分类名称').setDesc('可以写成 分类/子分类。').addText(input => input.onChange(value => { customName = value; })).settingEl;
      customEl.style.display = 'none';
    };
    renderCategory();
    new Setting(contentEl).addButton(button => button.setButtonText('创建').setCta().onClick(() => void submit()));
  }
  onClose() { this.contentEl.empty(); }
}

/** 新建入口：给了栏目 id 就直接进那个栏目，没给就先选栏目 */
async function createArticle(plugin, collectionId = '') {
  await ensurePinnedProperty(plugin.app);
  const { root, collections } = await writableCollections(plugin);
  if (!collections.length) throw new Error('没有可写作的栏目，请检查 _栏目.md。');
  const preset = collectionId ? collections.find(item => item.id === collectionId) : null;
  if (collectionId && !preset) throw new Error(`找不到栏目「${collectionId}」，请核对按钮里的栏目 id 与 _栏目.md。`);
  new NewNoteModal(plugin, root, collections, preset).open();
}

// ============================================================
//  中控台按钮
// ============================================================

const ACTIONS = {
  新建: (plugin, spec) => createArticle(plugin, spec.collection),
  上传博客: plugin => plugin.syncAllFiles(),
  公众号预览: plugin => plugin.previewWechat(),
  排版预览: plugin => plugin.typeset.activatePreview(),
  检查连接: plugin => plugin.checkConnection()
};

/**
 * ```blog-button``` 代码块：每行一项「键: 值」。
 * 文字 = 按钮上的字；栏目 = 稳定栏目 id（写了就默认「新建」）；动作 = 新建 / 上传博客 / 公众号预览 / 排版预览 / 检查连接。
 * 按 id 认栏目，文件夹改名后按钮照常工作。
 */
function consoleButton(plugin, source, el) {
  let spec;
  try { spec = parseYaml(source || '') || {}; } catch { spec = null; }
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return el.createEl('p', { text: '按钮写法：每行一项，例如「文字: 写长文」「栏目: long-reads」。', cls: 'blog-publisher-warning' });
  const collection = String(spec['栏目'] ?? '').trim();
  const action = String(spec['动作'] ?? (collection ? '新建' : '')).trim();
  const run = ACTIONS[action];
  if (!run) return el.createEl('p', { text: `不认识的动作「${action}」，可用：${Object.keys(ACTIONS).join('、')}。`, cls: 'blog-publisher-warning' });
  const label = String(spec['文字'] ?? '').trim() || (collection ? `新建 · ${collection}` : action);
  const button = el.createEl('button', { text: label, cls: 'mod-cta blog-publisher-button' });
  button.addEventListener('click', () => Promise.resolve(run(plugin, { collection })).catch(error => plugin.notice(error.message)));
  return button;
}

function dashboardActions(plugin, el) {
  const actions = [['新建文章', () => createArticle(plugin)], ['上传博客', () => plugin.syncAllFiles()], ['公众号预览', () => plugin.previewWechat()], ['检查连接', () => plugin.checkConnection()]];
  for (const [label, callback] of actions) { const button = el.createEl('button', { text: label }); button.addEventListener('click', () => Promise.resolve(callback()).catch(error => plugin.notice(error.message))); }
}

// ============================================================
//  右键新建也套模板（替代 Templater 的文件夹模板）
// ============================================================

/** 这篇属于哪个可写栏目；不在博客目录、说明文件与栏目声明本身返回 null */
async function collectionOf(plugin, file) {
  if (!(file instanceof TFile) || file.extension !== 'md' || SKIP.has(file.name)) return null;
  const root = normalizeFolder(plugin.settings.blogFolderName);
  if (!file.path.startsWith(`${root}/`)) return null;
  const collections = await discoverCollections(plugin.app, root, parseYaml);
  return collections.find(item => WRITABLE.has(item.kind) && file.path.startsWith(`${root}/${item.folder}/`)) || null;
}

/** 新建出来的空笔记套上模板；有内容的（插件自己建的、同步进来的）一律不碰 */
async function fillTemplate(plugin, file) {
  const collection = await collectionOf(plugin, file);
  if (!collection || (await plugin.app.vault.read(file)).trim()) return;
  const source = await loadTemplate(plugin.app, plugin.settings, collection.kind);
  const content = renderTemplate(source, { id: crypto.randomUUID(), title: file.basename, date: today() });
  await plugin.app.vault.process(file, current => current.trim() ? current : content);
}

/**
 * 右键新建先叫「未命名」再改名：标题还等于旧文件名，说明是模板代填的，就跟着新文件名走；
 * 作者亲手改过标题之后，两者不再相等，改名不再碰它。
 */
async function followTitle(plugin, file, oldPath) {
  const oldName = oldPath.split('/').pop().replace(/\.md$/, '');
  if (!(file instanceof TFile) || oldName === file.basename || !await collectionOf(plugin, file)) return;
  await plugin.app.vault.process(file, content => {
    const header = content.match(FRONTMATTER);
    if (!header) return content;
    let data;
    try { data = parseYaml(header[1]) || {}; } catch { return content; }
    if (data.title !== oldName) return content;
    return header[0].replace(/^title[ \t]*:.*$/m, `title: ${JSON.stringify(file.basename)}`) + content.slice(header[0].length);
  });
}

/** 监听放在 onLayoutReady 里：库加载时每个已有文件都会发一次 create，那些不是新建 */
function registerAutoTemplate(plugin) {
  plugin.app.workspace.onLayoutReady(() => {
    plugin.registerEvent(plugin.app.vault.on('create', file => { fillTemplate(plugin, file).catch(() => {}); }));
    plugin.registerEvent(plugin.app.vault.on('rename', (file, oldPath) => { followTitle(plugin, file, oldPath).catch(() => {}); }));
  });
}

module.exports = { createArticle, createNote, categoriesOf, consoleButton, dashboardActions, registerAutoTemplate, fillTemplate, followTitle };
