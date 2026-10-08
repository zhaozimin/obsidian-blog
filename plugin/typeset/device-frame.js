/**
 * [INPUT]: 依赖 ./devices 的 shellCss；依赖浏览器 DOM（不依赖 Obsidian，可在普通网页里独立测试）
 * [OUTPUT]: 对外提供 DeviceFrame 类：render / fail / fit / scrollToLine / flashLine / measure / mark / destroy，以及 pending 标记
 * [POS]: plugin/typeset 的设备外壳；一台设备 = 一个同源 iframe（样式与公众号深色算法都关在里面，不污染 Obsidian）
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 *
 * 浅色：iframe 常驻，只替换正文 innerHTML，滚动位置不丢。
 * 公众号深色：mp-darkmode 是单例且配置只能设一次，每次渲染新建 iframe（新的 window），保证转换结果与线上一致。
 * 真机教训：外壳只有写好文档才算建成，半成品 iframe 绝不留下——留下它，之后每次刷新都以为「已建好」而跳过重建，预览永远空白。
 * 视图还没挂到页面上时 iframe 没有文档，先记下 pending，等视图挂上（尺寸变化）再画；画不出来就把原因显示在设备里，不留白屏。
 */
'use strict';
const { shellCss } = require('./devices');

const LONG_PARA_LINES = 7;     // 一段在该设备上超过这么多行，读者开始找不到落脚点
const SECTION_SCREENS = 4;     // 连续这么多屏没有小标题，读者失去方位

const escHtml = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

class DeviceFrame {
  /**
   * @param {HTMLElement} host 容器
   * @param {object} device DEVICES 里的一项
   * @param {{onLineClick?: (line:number)=>void, darkmodeSrc?: string}} opts
   */
  constructor(host, device, opts) {
    this.host = host;
    this.device = device;
    this.opts = opts || {};
    this.box = host.ownerDocument.createElement('div');
    this.box.className = 'pb-device';
    host.appendChild(this.box);
    this.iframe = null;
    this.key = '';
    this.scale = 1;
    this.height = 600;
    this.issues = [];
    this.pending = false;
    this.errorEl = null;
  }

  get doc() { return this.iframe && this.iframe.contentDocument; }
  get win() { return this.iframe && this.iframe.contentWindow; }

  // ---------- 外壳 ----------
  build(dark) {
    const keepLine = this.topLine();
    if (this.iframe) this.iframe.remove();
    this.iframe = null;
    this.key = '';
    const f = this.host.ownerDocument.createElement('iframe');
    f.className = 'pb-iframe';
    f.setAttribute('title', this.device.name);
    this.box.appendChild(f);
    try {
      const doc = f.contentDocument;
      if (!doc) throw new Error('设备外壳没有拿到文档');
      doc.open();
      doc.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
        shellCss(this.device, dark) + '</style></head><body><div class="area"><h1 class="title"></h1><div class="meta"></div><div id="js_content"></div></div></body></html>');
      doc.close();
      if (!doc.getElementById('js_content')) throw new Error('设备外壳没有写进去');
      doc.addEventListener('click', e => {
        const el = e.target.closest && e.target.closest('[data-line]');
        if (el && this.opts.onLineClick) this.opts.onLineClick(+el.getAttribute('data-line'));
      });
    } catch (error) {
      f.remove();
      throw error;
    }
    this.iframe = f;
    this.applySize();
    return keepLine;
  }

  /**
   * 画一次。返回 false 表示视图还没挂到页面上，已记下 pending，挂上后由视图补画。
   * @param {{html:string, title:string, meta?:string, dark?:boolean}} c
   */
  render(c) {
    if (!this.box.isConnected) { this.pending = true; return false; }
    const dark = !!c.dark;
    const key = this.device.id + (dark ? ':dark' : ':light');
    const rebuild = !this.iframe || key !== this.key || (dark && this.device.platform === 'wechat');
    const keepLine = rebuild ? this.build(dark) : null;
    this.key = key;
    const doc = this.doc;
    doc.querySelector('.title').textContent = c.title || '';
    doc.querySelector('.meta').innerHTML = c.meta || '';
    doc.getElementById('js_content').innerHTML = c.html;
    if (dark && this.device.platform === 'wechat') this.darken();
    this.mark(this.issues);
    if (keepLine != null) this.scrollToLine(keepLine, false);
    this.pending = false;
    if (this.errorEl) { this.errorEl.remove(); this.errorEl = null; }
    return true;
  }

  /** 画不出来时把原因写在设备里：白屏让人以为没打开，一句话能让人知道发生了什么 */
  fail(error) {
    if (this.iframe) { this.iframe.remove(); this.iframe = null; }
    this.key = '';
    if (!this.errorEl) {
      this.errorEl = this.host.ownerDocument.createElement('div');
      this.errorEl.className = 'pb-error';
      this.box.appendChild(this.errorEl);
    }
    this.errorEl.textContent = '这台设备没能画出来：' + (error && error.message || error);
  }

  /** 公众号深色模式：在 iframe 自己的 window 里跑 mp-darkmode，强制 dark。 */
  darken() {
    const win = this.win, src = this.opts.darkmodeSrc;
    if (!src) return;
    try {
      if (!win.Darkmode) win.eval(src);
      win.Darkmode.run(this.doc.querySelectorAll('#js_content *'), { mode: 'dark', needJudgeFirstPage: false, delayBgJudge: false });
    } catch (e) {
      console.error('[排版预览] 深色转换失败', e);
    }
  }

  // ---------- 尺寸 ----------
  /** 按可用宽高缩放设备：宽度放不下就等比缩小，iframe 内部仍是真实设备宽度。 */
  fit(width, height) {
    this.scale = Math.min(1, Math.max(0.2, width / this.device.width));
    this.height = Math.max(200, height);
    this.applySize();
  }

  applySize() {
    const k = this.scale, d = this.device;
    this.box.style.width = Math.round(d.width * k) + 'px';
    this.box.style.height = this.height + 'px';
    if (!this.iframe) return;
    this.iframe.style.width = d.width + 'px';
    this.iframe.style.height = Math.round(this.height / k) + 'px';
    this.iframe.style.transform = 'scale(' + k + ')';
  }

  // ---------- 定位 ----------
  /** 找到"起始行 ≤ line"中最靠后的块（嵌套块更精确，同行取文档顺序最后者）。 */
  elementForLine(line) {
    if (!this.doc) return null;
    let best = null, bestLine = -1;
    for (const el of this.doc.querySelectorAll('#js_content [data-line]')) {
      const l = +el.getAttribute('data-line');
      if (l <= line && l >= bestLine) { best = el; bestLine = l; }
    }
    return best;
  }

  topLine() {
    if (!this.doc) return null;
    const y = this.win.scrollY + 24;
    let line = null;
    for (const el of this.doc.querySelectorAll('#js_content [data-line]')) {
      if (el.getBoundingClientRect().top + this.win.scrollY <= y) line = +el.getAttribute('data-line');
      else break;
    }
    return line;
  }

  scrollToLine(line, smooth) {
    const el = this.elementForLine(line);
    if (!el) { if (this.win) this.win.scrollTo(0, 0); return; }
    const top = el.getBoundingClientRect().top + this.win.scrollY - 28;
    this.win.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  }

  flashLine(line) {
    const el = this.elementForLine(line);
    if (!el) return;
    el.classList.remove('pb-flash');
    void el.offsetWidth;
    el.classList.add('pb-flash');
  }

  // ---------- 实测体检 ----------
  /** 在这台设备的真实排版里量：长段（行数）与无小标题区（屏数）。 */
  measure() {
    const doc = this.doc, out = [];
    if (!doc) return out;
    const content = doc.getElementById('js_content');
    for (const p of content.querySelectorAll('p[data-line]')) {
      const lh = parseFloat(this.win.getComputedStyle(p).lineHeight);
      if (!lh) continue;
      const lines = Math.round(p.getBoundingClientRect().height / lh);
      if (lines > LONG_PARA_LINES) out.push({ line: +p.getAttribute('data-line'), kind: 'long', message: '这一段在' + this.device.short + '上 ' + lines + ' 行' });
    }
    const y = el => el.getBoundingClientRect().top + this.win.scrollY;
    const heads = [...content.querySelectorAll('h1[data-line],h2[data-line],h3[data-line]')];
    const first = content.querySelector('[data-line]');
    const marks = (first ? [first] : []).concat(heads.filter(h => h !== first));
    const end = content.getBoundingClientRect().bottom + this.win.scrollY;
    marks.forEach((m, i) => {
      const gap = (i + 1 < marks.length ? y(marks[i + 1]) : end) - y(m);
      const screens = gap / this.device.screen;
      if (screens > SECTION_SCREENS) out.push({ line: +m.getAttribute('data-line'), kind: 'nohead', message: '往下连续 ' + screens.toFixed(1) + ' 屏没有小标题' });
    });
    if (this.key.endsWith(':dark') && this.device.platform === 'wechat') out.push(...this.glare(content));
    return out;
  }

  /** 公众号深色模式下仍然发亮的底色块：读者在黑底上会看到一块刺眼的亮斑。 */
  glare(content) {
    const out = [], seen = new Set();
    for (const el of content.querySelectorAll('[style*="background"]')) {
      const m = (this.win.getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || []).map(Number);
      if (m.length < 3 || (m.length > 3 && m[3] < 0.3)) continue;
      const lum = 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];
      const host = el.closest('[data-line]');
      if (lum > 150 && host && !seen.has(host)) {
        seen.add(host);
        out.push({ line: +host.getAttribute('data-line'), kind: 'glare', message: '深色模式下这里是一块亮色底' });
      }
    }
    return out;
  }

  /** 把问题挂到对应块上（只在预览 iframe 里，复制件不受影响）。 */
  mark(issues) {
    this.issues = issues || [];
    const doc = this.doc;
    if (!doc) return;
    for (const el of doc.querySelectorAll('[data-pb-issue]')) el.removeAttribute('data-pb-issue');
    const byEl = new Map();
    for (const it of this.issues) {
      const el = doc.querySelector('#js_content [data-line="' + it.line + '"]') || this.elementForLine(it.line);
      if (!el) continue;
      byEl.set(el, (byEl.has(el) ? byEl.get(el) + ' · ' : '') + it.message);
    }
    for (const [el, msg] of byEl) el.setAttribute('data-pb-issue', msg);
  }

  destroy() { this.box.remove(); this.iframe = null; }
}

module.exports = { DeviceFrame, escHtml };
