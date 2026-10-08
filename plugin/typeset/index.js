/**
 * [INPUT]: 依赖 obsidian 的 MarkdownView/Notice/debounce，@codemirror/view 的 EditorView（运行时由 Obsidian 提供）；
 *          依赖 ./preview-view、./normalize-modal、./compose 与 shared/typeset 的 normalize/parse
 * [OUTPUT]: 对外提供 registerTypeset（注册排版预览的视图、命令与监听，返回控制器）与 TYPESET_DEFAULTS
 * [POS]: plugin/typeset 的控制器，即原排版预览插件的编排中心：追踪「当前在写的那篇」，把编辑事件变成预览刷新、
 *        编辑器滚动变成预览跟随、预览点击变成编辑器跳转；渲染与体检委托 shared/typeset，界面委托视图。
 *        设置住在 Blog Publisher 的 settings.typeset 里，和发布设置同一份 data.json
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
'use strict';
const { MarkdownView, Notice, debounce } = require('obsidian');
const { EditorView } = require('@codemirror/view');
const { PreviewView, CompareView, VIEW_PREVIEW, VIEW_COMPARE } = require('./preview-view');
const { NormalizeModal } = require('./normalize-modal');
const { composeCopy, toPlain } = require('./compose');
const { normalize } = require('../../shared/typeset/normalize.cjs');
const { titleFromPath, splitFrontmatter } = require('../../shared/typeset/parse.cjs');

const TYPESET_DEFAULTS = Object.freeze({ theme: 'su', device: 'wx-phone', dark: false, showIssues: true, author: '', account: '', xHandle: '' });

class Typeset {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.lastView = null;
    this.pending = null;
  }

  get settings() { return this.plugin.settings.typeset; }

  // ============================================================
  //  当前文章
  // ============================================================
  cmOf(view) { return view && view.editor && view.editor.cm; }

  source() {
    const view = this.lastView;
    if (!view || !view.file || !view.editor || !view.leaf || !view.leaf.parent) return null;
    const text = view.editor.getValue();
    return { text, path: view.file.path, title: titleFromPath(view.file.name, splitFrontmatter(text).frontmatter) };
  }

  /** 预览里显示本地图片：wikilink / 相对路径 → Obsidian 资源 URL；复制件仍按本地图片处理 */
  resolveImage(src, _embed, sourcePath) {
    if (/^https?:\/\//.test(src)) return { remote: src, preview: src };
    let link = src.split('|')[0].split('#')[0];
    try { link = decodeURIComponent(link); } catch { /* 保持原样 */ }
    const file = this.app.metadataCache.getFirstLinkpathDest(link, sourcePath);
    return { remote: null, preview: file ? this.app.vault.getResourcePath(file) : null };
  }

  // ============================================================
  //  视图
  // ============================================================
  views() {
    return [VIEW_PREVIEW, VIEW_COMPARE].flatMap(type => this.app.workspace.getLeavesOfType(type)).map(leaf => leaf.view)
      .filter(view => view instanceof PreviewView || view instanceof CompareView);
  }

  refreshViews() { for (const view of this.views()) view.refresh(); }

  async activatePreview() {
    const workspace = this.app.workspace;
    let leaf = workspace.getLeavesOfType(VIEW_PREVIEW)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_PREVIEW, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async activateCompare() {
    const workspace = this.app.workspace;
    let leaf = workspace.getLeavesOfType(VIEW_COMPARE)[0];
    if (!leaf) {
      // 紧贴正在写的那篇右侧分屏：左边写、右边四台设备
      leaf = this.lastView && this.lastView.leaf ? workspace.createLeafBySplit(this.lastView.leaf, 'vertical') : workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_COMPARE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async updateSettings(patch, refresh) {
    Object.assign(this.settings, patch);
    await this.plugin.saveSettings();
    if (refresh !== false) this.refreshViews();
  }

  // ============================================================
  //  滚动同步与回跳
  // ============================================================
  onEditorMoved(cm, bySelection) {
    if (this.cmOf(this.lastView) !== cm || this.pending) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = null;
      let line;
      if (bySelection) line = cm.state.doc.lineAt(cm.state.selection.main.head).number - 1;
      else {
        const rect = cm.scrollDOM.getBoundingClientRect();
        const pos = cm.posAtCoords({ x: rect.left + 60, y: rect.top + 12 }, false);
        if (pos == null) return;
        line = cm.state.doc.lineAt(pos).number - 1;
      }
      for (const view of this.views()) view.followLine(line);
    });
  }

  jumpToLine(line) {
    const view = this.lastView;
    if (!view || !view.editor) return;
    this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
    const pos = { line, ch: 0 };
    view.editor.setCursor(pos);
    view.editor.scrollIntoView({ from: pos, to: pos }, true);
  }

  // ============================================================
  //  复制与标点规范化
  // ============================================================
  async copy(platform, button) {
    const source = this.source();
    if (!source) { new Notice('先打开一篇笔记'); return; }
    const result = composeCopy(source, platform, this.settings, (src, embed) => this.resolveImage(src, embed, source.path));
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([result.html], { type: 'text/html' }),
        'text/plain': new Blob([toPlain(result.html)], { type: 'text/plain' })
      })]);
    } catch (error) {
      new Notice('复制失败：' + error.message);
      return;
    }
    const where = platform === 'wechat' ? '公众号后台正文' : 'X Articles 编辑器';
    new Notice('已复制，去' + where + '粘贴' + (result.todos.length ? '\n待办 ' + result.todos.length + ' 项见预览面板' : ''), 4000);
    if (button) {
      const old = button.getText();
      button.setText('✓ 已复制');
      window.setTimeout(() => button.setText(old), 1800);
    }
  }

  /** 标点只改有唯一正确答案的地方，先给清单再改；一个事务，一步撤销 */
  normalizeEditor(editor) {
    const result = normalize(editor.getValue());
    if (!result.lines.length) {
      new Notice(result.notes.length ? '标点已规范；有 ' + result.notes.length + ' 条提醒' : '标点已经规范');
      if (!result.notes.length) return;
    }
    new NormalizeModal(this.app, result, () => {
      // 从后往前排，行号互不干扰
      const changes = result.lines.slice().sort((a, b) => b.line - a.line)
        .map(patch => ({ from: { line: patch.line, ch: 0 }, to: { line: patch.line, ch: patch.before.length }, text: patch.after }));
      editor.transaction({ changes });
      new Notice('已规范 ' + result.lines.length + ' 行');
    }).open();
  }
}

/** 注册排版预览：两个视图、一个侧栏图标、五条命令，以及把编辑与滚动接到预览上的监听 */
function registerTypeset(plugin) {
  const typeset = new Typeset(plugin);
  plugin.registerView(VIEW_PREVIEW, leaf => new PreviewView(leaf, typeset));
  plugin.registerView(VIEW_COMPARE, leaf => new CompareView(leaf, typeset));
  plugin.addRibbonIcon('smartphone', '排版预览', () => typeset.activatePreview());
  plugin.addCommand({ id: 'typeset-preview', name: '打开排版预览（侧栏）', callback: () => typeset.activatePreview() });
  plugin.addCommand({ id: 'typeset-compare', name: '打开四设备并排预览', callback: () => typeset.activateCompare() });
  plugin.addCommand({ id: 'copy-wechat', name: '复制到公众号', callback: () => typeset.copy('wechat') });
  plugin.addCommand({ id: 'copy-x', name: '复制到 X Articles', callback: () => typeset.copy('x') });
  plugin.addCommand({ id: 'normalize-punctuation', name: '规范化当前笔记的标点', editorCallback: editor => typeset.normalizeEditor(editor) });

  // ---------- 编辑 → 预览刷新 ----------
  const scheduleRefresh = debounce(() => typeset.refreshViews(), 150, true);
  plugin.registerEvent(plugin.app.workspace.on('editor-change', (_editor, info) => {
    if (info instanceof MarkdownView) typeset.lastView = info;
    scheduleRefresh();
  }));
  plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', leaf => {
    if (leaf && leaf.view instanceof MarkdownView && leaf.view !== typeset.lastView) {
      typeset.lastView = leaf.view;
      typeset.refreshViews();
    }
  }));
  // 同一个标签页里换一篇笔记不会触发 active-leaf-change：真机自检发现预览会停在上一篇，直到打下一个字
  plugin.registerEvent(plugin.app.workspace.on('file-open', () => {
    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) typeset.lastView = view;
    typeset.refreshViews();
  }));
  plugin.registerEvent(plugin.app.vault.on('rename', () => typeset.refreshViews()));

  // ---------- 编辑器滚动 / 光标 → 预览跟随 ----------
  plugin.registerEditorExtension(EditorView.updateListener.of(update => {
    if (update.viewportChanged || update.selectionSet) typeset.onEditorMoved(update.view, update.selectionSet && !update.viewportChanged);
  }));
  plugin.registerDomEvent(document, 'scroll', event => {
    const cm = typeset.cmOf(typeset.lastView);
    if (cm && event.target === cm.scrollDOM) typeset.onEditorMoved(cm, false);
  }, { capture: true, passive: true });

  plugin.app.workspace.onLayoutReady(() => {
    typeset.lastView = plugin.app.workspace.getActiveViewOfType(MarkdownView) || (plugin.app.workspace.getLeavesOfType('markdown')[0] || {}).view || null;
    typeset.refreshViews();
  });
  return typeset;
}

module.exports = { registerTypeset, TYPESET_DEFAULTS };
