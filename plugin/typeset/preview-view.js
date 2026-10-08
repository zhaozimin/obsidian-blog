/**
 * [INPUT]: 依赖 obsidian 的 ItemView/setIcon，依赖 ./device-frame、./devices、./compose、shared/typeset/themes、darkmode-src（构建时内联的公众号深色算法）
 * [OUTPUT]: 对外提供 PreviewView（侧栏单设备）、CompareView（主区四设备并排）、VIEW_PREVIEW、VIEW_COMPARE
 * [POS]: plugin/typeset 的 Obsidian 视图层；只负责布局与交互，渲染、体检、复制都委托给控制器（index.js）与 compose。
 *        视图类型 id 沿用原排版预览插件的 paiban-preview / paiban-compare，已保存的侧栏面板重启后原位接管。
 *        每台设备单独兜错：一台画不出来只在它身上写原因；视图挂上页面后补画先前没画成的设备
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
'use strict';
const { ItemView, setIcon } = require('obsidian');
const { DeviceFrame } = require('./device-frame');
const { DEVICES } = require('./devices');
const { composePreview } = require('./compose');
const { THEMES } = require('../../shared/typeset/themes.cjs');
const darkmodeSrc = require('darkmode-src');

const VIEW_PREVIEW = 'paiban-preview';
const VIEW_COMPARE = 'paiban-compare';

// ============================================================
//  共用：工具栏控件与问题面板
// ============================================================
class BaseView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.frames = [];
    this.lastIssues = [];
  }

  get settings() { return this.plugin.settings; }

  iconButton(parent, icon, label, onClick) {
    const b = parent.createEl('button', { cls: 'pb-icon-btn clickable-icon', attr: { 'aria-label': label } });
    setIcon(b, icon);
    b.addEventListener('click', onClick);
    return b;
  }

  themeSelect(parent) {
    const sel = parent.createEl('select', { cls: 'dropdown pb-theme' });
    for (const t of THEMES) sel.createEl('option', { value: t.id, text: '风格：' + t.name });
    sel.value = this.settings.theme;
    sel.addEventListener('change', () => this.plugin.updateSettings({ theme: sel.value }));
    return sel;
  }

  syncControls() {
    if (this.themeEl) this.themeEl.value = this.settings.theme;
    if (this.darkBtn) this.darkBtn.toggleClass('is-active', this.settings.dark);
    if (this.issueBtn) this.issueBtn.toggleClass('is-active', this.settings.showIssues);
  }

  /** 尺寸变化时重排；视图刚挂到页面上（从 0 变成有尺寸）时，把之前没画成的设备补画一次 */
  observe(el) {
    this.ro = new ResizeObserver(() => {
      this.layout();
      if (this.frames.some(f => f.pending)) this.refresh();
    });
    this.ro.observe(el);
    this.register(() => this.ro.disconnect());
  }

  /**
   * 把一台设备的渲染结果画上去，并返回结构 + 实测问题；画不出来返回 null。
   * 一台设备出错只在它自己身上显示原因，不拖垮其他设备与体检面板。
   */
  paint(frame, source) {
    try {
      const c = composePreview(source, frame.device, this.settings, (s, e) => this.plugin.resolveImage(s, e, source.path));
      if (!frame.render({ html: c.html, title: c.title, meta: c.meta, dark: this.settings.dark })) return { c, issues: c.issues };
      const issues = c.issues.concat(frame.measure()).sort((a, b) => a.line - b.line);
      frame.mark(this.settings.showIssues ? issues : []);
      return { c, issues };
    } catch (error) {
      console.error('[排版预览]', error);
      frame.fail(error);
      return null;
    }
  }

  followLine(line) { for (const f of this.frames) f.scrollToLine(line, false); }
  flashLine(line) { for (const f of this.frames) { f.scrollToLine(line, true); f.flashLine(line); } }

  emptyState(on) {
    this.emptyEl.toggleClass('is-hidden', !on);
    this.stageEl.toggleClass('is-hidden', on);
  }
}

// ============================================================
//  侧栏：单设备 + 设备切换 + 复制 + 体检面板
// ============================================================
class PreviewView extends BaseView {
  getViewType() { return VIEW_PREVIEW; }
  getDisplayText() { return '排版预览'; }
  getIcon() { return 'smartphone'; }

  async onOpen() {
    const el = this.contentEl;
    el.empty();
    el.addClass('pb-view');
    const bar = el.createDiv('pb-toolbar');
    const devRow = bar.createDiv('pb-devices');
    this.devBtns = DEVICES.map(d => {
      const b = devRow.createEl('button', { cls: 'pb-dev', text: d.short, attr: { 'aria-label': d.name + (d.approx ? '（近似，待校准）' : '') } });
      b.addEventListener('click', () => this.plugin.updateSettings({ device: d.id }));
      return b;
    });
    const row = bar.createDiv('pb-row');
    this.themeEl = this.themeSelect(row);
    this.darkBtn = this.iconButton(row, 'moon', '深色模式', () => this.plugin.updateSettings({ dark: !this.settings.dark }));
    this.issueBtn = this.iconButton(row, 'stethoscope', '体检标记', () => this.plugin.updateSettings({ showIssues: !this.settings.showIssues }));
    this.iconButton(row, 'columns', '四设备并排', () => this.plugin.activateCompare());
    this.copyBtn = row.createEl('button', { cls: 'mod-cta pb-copy' });
    this.copyBtn.addEventListener('click', () => this.plugin.copy(this.device().platform, this.copyBtn));

    this.emptyEl = el.createDiv({ cls: 'pb-empty is-hidden', text: '打开一篇笔记，这里会实时显示它在公众号和 X 上的样子。' });
    this.stageEl = el.createDiv('pb-stage');
    this.panelEl = el.createEl('details', { cls: 'pb-panel' });
    this.observe(this.stageEl);
    this.refresh();
  }

  device() { return DEVICES.find(d => d.id === this.settings.device) || DEVICES[0]; }

  layout() {
    const f = this.frames[0];
    if (f) f.fit(this.stageEl.clientWidth - 12, this.stageEl.clientHeight - 8);
  }

  refresh() {
    if (!this.stageEl) return;
    this.syncControls();
    const d = this.device();
    this.devBtns.forEach((b, i) => b.toggleClass('is-active', DEVICES[i].id === d.id));
    this.copyBtn.setText(d.platform === 'wechat' ? '复制到公众号' : '复制到 X');
    this.themeEl.toggleClass('is-hidden', d.platform !== 'wechat');
    const source = this.plugin.source();
    if (!source) { this.emptyState(true); return; }
    this.emptyState(false);
    if (!this.frames[0] || this.frames[0].device.id !== d.id) {
      for (const f of this.frames) f.destroy();
      this.frames = [new DeviceFrame(this.stageEl, d, { darkmodeSrc, onLineClick: l => this.plugin.jumpToLine(l) })];
      this.layout();
    }
    const painted = this.paint(this.frames[0], source);
    if (painted) this.renderPanel(painted.c, painted.issues, d);
  }

  renderPanel(c, issues, d) {
    const p = this.panelEl, open = p.open;
    p.empty();
    p.open = open;
    p.createEl('summary', { text: c.stats.chars + ' 字 · 约 ' + c.stats.minutes + ' 分钟　体检 ' + issues.length + ' · 待办 ' + c.todos.length });
    if (issues.length) {
      const ul = p.createEl('ul', { cls: 'pb-issues' });
      for (const it of issues) {
        const li = ul.createEl('li');
        li.createSpan({ cls: 'pb-line', text: 'L' + (it.line + 1) });
        li.createSpan({ text: it.message });
        li.addEventListener('click', () => { this.plugin.jumpToLine(it.line); this.flashLine(it.line); });
      }
    }
    if (c.todos.length) {
      p.createEl('div', { cls: 'pb-subhead', text: '发前待办（' + d.name + '）' });
      const ul = p.createEl('ul', { cls: 'pb-todos' });
      for (const t of c.todos) ul.createEl('li', { text: t });
    }
    if (d.approx) p.createEl('div', { cls: 'pb-note', text: 'X 外壳是近似样式，字体与间距待用真实文章校准。' });
  }

  async onClose() { for (const f of this.frames) f.destroy(); this.frames = []; }
}

// ============================================================
//  主区：四设备并排
// ============================================================
class CompareView extends BaseView {
  getViewType() { return VIEW_COMPARE; }
  getDisplayText() { return '排版预览 · 四设备并排'; }
  getIcon() { return 'columns'; }

  async onOpen() {
    const el = this.contentEl;
    el.empty();
    el.addClass('pb-view', 'pb-compare');
    const row = el.createDiv('pb-toolbar').createDiv('pb-row');
    this.themeEl = this.themeSelect(row);
    this.darkBtn = this.iconButton(row, 'moon', '深色模式', () => this.plugin.updateSettings({ dark: !this.settings.dark }));
    this.issueBtn = this.iconButton(row, 'stethoscope', '体检标记', () => this.plugin.updateSettings({ showIssues: !this.settings.showIssues }));
    this.emptyEl = el.createDiv({ cls: 'pb-empty is-hidden', text: '在主区打开一篇笔记，这里会并排显示四种设备。' });
    this.stageEl = el.createDiv('pb-stage pb-grid');
    this.cols = DEVICES.map(d => {
      const col = this.stageEl.createDiv('pb-col');
      col.createDiv({ cls: 'pb-col-head', text: d.name + (d.approx ? '（近似）' : '') });
      const frame = new DeviceFrame(col, d, { darkmodeSrc, onLineClick: l => this.plugin.jumpToLine(l) });
      this.frames.push(frame);
      return col;
    });
    this.observe(this.stageEl);
    this.refresh();
  }

  layout() {
    const w = Math.max(220, (this.stageEl.clientWidth - 24 - 16 * 3) / 4);   // 扣掉舞台左右内边距与三道间隔
    for (const f of this.frames) f.fit(w, this.stageEl.clientHeight - 30);
  }

  refresh() {
    if (!this.stageEl) return;
    this.syncControls();
    const source = this.plugin.source();
    if (!source) { this.emptyState(true); return; }
    this.emptyState(false);
    this.layout();
    for (const f of this.frames) this.paint(f, source);
  }

  async onClose() { for (const f of this.frames) f.destroy(); this.frames = []; }
}

module.exports = { PreviewView, CompareView, VIEW_PREVIEW, VIEW_COMPARE };
