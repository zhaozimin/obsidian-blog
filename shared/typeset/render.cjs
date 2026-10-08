/**
 * [INPUT]: 依赖 ./parse.cjs 的 load/parseInline/plainText
 * [OUTPUT]: 对外提供 renderWechat(md, theme, opts)、renderX(md, opts)、isCaption、captionLines
 * [POS]: shared/typeset 的出口层；同一棵语法树 → 公众号全内联样式 HTML / X 语义 HTML。
 *        mode:'preview' 给设备外壳看（本地图片显示真图、块带 data-line）；mode:'copy' 给剪贴板（干净、本地图片留占位）
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 *
 * 渲染器只做形式翻译，不增删作者的字。平台迫使的结构性文字（外链文末注、图片占位）一律进 todos。
 * 新增平台 = 继承 BaseRenderer 写子类，不改已有渲染器。
 */
'use strict';
const { load, parseInline, plainText } = require('./parse.cjs');

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const escAttr = s => esc(s).replace(/"/g, '&quot;');
const basename = s => String(s).split(/[\\/]/).pop();
const CAPTION_PARA = /^图\s*\d+/;
const SEPARATOR = /^[\s·•・*＊\-—_~～.。⁂]+$/;

const defaultResolve = src => /^https?:\/\//.test(src) ? { remote: src, preview: src } : { remote: null, preview: null };

/** 图片后紧跟的短引用 / 「图 N」开头的段落 → 图注。作者的习惯，渲染器顺着排。体检复用同一判断。 */
function isCaption(prev, block) {
  if (!prev || prev.type !== 'image') return false;
  if (block.type === 'quote' && block.children.length === 1 && block.children[0].type === 'paragraph') {
    return plainText(parseInline(block.children[0].lines.join('\n'))).length <= 80;
  }
  return block.type === 'paragraph' && CAPTION_PARA.test(block.lines[0]);
}
const captionLines = b => b.type === 'quote' ? b.children[0].lines : b.lines;

// ============================================================
//  基类：块与行内的分派骨架
// ============================================================
class BaseRenderer {
  constructor(opts) {
    opts = opts || {};
    this.annotate = !!opts.annotate;
    this.preview = opts.mode === 'preview';
    this.resolve = opts.resolveImage || defaultResolve;
    this.todos = [];
    this.images = [];
    this.listDepth = 0;
  }

  render(markdown) {
    const { blocks } = load(markdown);
    this.prepare(blocks);
    const body = this.blocks(this.dropTitle(blocks), 0, null);
    return this.wrap(body + this.footer());
  }

  /** 正文首块若是唯一的一级标题，它是文章标题——平台有独立标题栏，正文不再重复。 */
  dropTitle(blocks) {
    const h1 = blocks.filter(b => b.type === 'heading' && b.level === 1);
    if (blocks.length && blocks[0].type === 'heading' && blocks[0].level === 1 && h1.length === 1) {
      this.todo('正文开头的一级标题「' + plainText(parseInline(blocks[0].text)) + '」当作文章标题，不进正文');
      return blocks.slice(1);
    }
    return blocks;
  }

  prepare() {}
  wrap(html) { return html; }
  footer() { return ''; }
  todo(s) { if (!this.todos.includes(s)) this.todos.push(s); }
  at(b) { return this.annotate && b && b.line != null ? ' data-line="' + b.line + '"' : ''; }

  blocks(blocks, depth, ctx) {
    let out = '', prev = null;
    for (const b of blocks) {
      if (isCaption(prev, b)) out += this.caption(parseInline(captionLines(b).join('\n')), ctx, b);
      else out += this['block_' + b.type](b, depth, ctx);
      prev = b;
    }
    return out;
  }

  registerImage(b) {
    const r = this.resolve(b.src, !!b.embed) || {};
    const item = { n: this.images.length + 1, alt: b.alt || basename(b.src), src: b.src, file: basename(b.src),
      remote: r.remote || null, preview: r.preview || null };
    this.images.push(item);
    return item;
  }

  inline(nodes, ctx) { return nodes.map(nd => this['in_' + nd[0]](nd, ctx)).join(''); }
  in_text(nd) { return esc(nd[1]); }
  in_br() { return '<br>'; }
  in_wikilink(nd) { return esc(nd[2]); }
  in_fnref(nd) { return '<sup>[' + esc(nd[1]) + ']</sup>'; }
}

// ============================================================
//  公众号：每个可见元素写满内联样式，复制后不依赖任何容器继承
// ============================================================
class WeChatRenderer extends BaseRenderer {
  constructor(theme, opts) {
    super(opts);
    this.t = theme;
    this.v = theme.variants;
    this.links = [];
  }

  font(size, color, weight, lh) {
    const t = this.t;
    return 'font-family:' + t.fontFamily + ';font-size:' + (size || t.fontSize) + 'px;line-height:' + (lh || t.lineHeight) +
      ';letter-spacing:' + t.letterSpacing + 'px;color:' + (color || t.color) + ';' + (weight ? 'font-weight:' + weight + ';' : '');
  }

  pStyle(ctx) {
    const t = this.t, align = 'text-align:' + t.textAlign + ';';
    if (ctx === 'quote' || ctx === 'qlist') return (ctx === 'quote' ? 'margin:0 0 8px;' : 'margin:0 0 4px;') + this.font(t.fontSize - 1, t.quoteText) + align;
    if (ctx === 'list') return 'margin:0 0 4px;' + this.font() + align;
    return 'margin:0 0 ' + t.paragraphGap + 'px;' + this.font() + align;
  }

  wrap(html) {
    return '<section style="' + this.font() + 'word-break:break-word;overflow-wrap:break-word;text-align:' + this.t.textAlign + ';">' + html + '</section>';
  }

  // ---------- 块 ----------
  block_paragraph(b, depth, ctx) {
    const text = plainText(parseInline(b.lines.join('\n')));
    if (SEPARATOR.test(text) && text.trim().length <= 12) {
      return '<p' + this.at(b) + ' style="margin:32px 0;text-align:center;' + this.font(this.t.fontSize, this.t.muted) + 'letter-spacing:4px;">' + esc(text.trim()) + '</p>';
    }
    return '<p' + this.at(b) + ' style="' + this.pStyle(ctx) + '">' + this.inline(parseInline(b.lines.join('\n')), ctx) + '</p>';
  }

  block_heading(b) {
    const text = this.inline(parseInline(b.text), 'heading');
    if (b.level === 1) return this.h1(text, b);
    if (b.level === 2) return this.h2(text, b);
    if (b.level === 3) return this.h3(text, b);
    return '<p' + this.at(b) + ' style="margin:24px 0 10px;' + this.font(null, this.t.strongColor, 700) + '">' + text + '</p>';
  }

  h1(text, b) {
    const t = this.t, size = t.headingSize + 2, v = this.v.h1, a = this.at(b);
    if (v === 'band') return '<h1' + a + ' style="margin:56px 0 32px;padding:12px 16px;background-color:' + t.h1Bg + ';text-align:center;' + this.font(size - 1, '#ffffff', 700, 1.5) + 'letter-spacing:1px;text-wrap:balance;">' + text + '</h1>';
    if (v === 'accent') return '<h1' + a + ' style="margin:56px 0 32px;padding-bottom:10px;border-bottom:2px solid ' + t.accent + ';text-align:center;' + this.font(size, t.accent, 700, 1.5) + 'letter-spacing:1px;text-wrap:balance;">' + text + '</h1>';
    return '<h1' + a + ' style="margin:56px 0 32px;padding:14px 0;border-top:1px solid ' + t.accent + ';border-bottom:1px solid ' + t.accent + ';text-align:center;' + this.font(size, t.accent, 700, 1.5) + 'letter-spacing:1px;text-wrap:balance;">' + text + '</h1>';
  }

  h2(text, b) {
    const t = this.t, v = this.v.h2, a = this.at(b);
    if (v === 'bar') return '<h2' + a + ' style="margin:44px 0 20px;text-wrap:balance;padding-left:12px;border-left:4px solid ' + t.accent + ';' + this.font(t.headingSize, t.strongColor, 700, 1.5) + '">' + text + '</h2>';
    if (v === 'underline') return '<h2' + a + ' style="margin:44px 0 20px;' + this.font(t.headingSize, t.strongColor, 700, 1.6) + '"><span style="padding-bottom:3px;border-bottom:3px solid ' + t.accent + ';">' + text + '</span></h2>';
    return '<h2' + a + ' style="margin:44px 0 18px;text-wrap:balance;' + this.font(t.headingSize, t.strongColor, 700, 1.5) + '">' + text + '</h2>';
  }

  h3(text, b) {
    const t = this.t, v = this.v.h3, size = t.fontSize + 1, a = this.at(b);
    if (v === 'accent') return '<h3' + a + ' style="margin:32px 0 12px;' + this.font(size, t.accent, 700, 1.6) + '">' + text + '</h3>';
    if (v === 'leftline') return '<h3' + a + ' style="margin:32px 0 12px;padding-left:9px;border-left:3px solid ' + t.accent + ';' + this.font(size, t.strongColor, 700, 1.5) + '">' + text + '</h3>';
    return '<h3' + a + ' style="margin:32px 0 12px;' + this.font(size, t.strongColor, 700, 1.6) + '">' + text + '</h3>';
  }

  block_quote(b, depth) {
    const t = this.t;
    let inner = '';
    if (b.callout) inner += '<p style="margin:0 0 6px;' + this.font(t.fontSize - 1, t.strongColor, 700) + '">' + this.inline(parseInline(b.title || b.callout.toUpperCase()), 'quote') + '</p>';
    inner += this.blocks(b.children, depth + 1, 'quote');
    const k = inner.lastIndexOf('margin:0 0 8px;');   // 卡片里最后一段不留底边距，上下内边距才对称
    if (k >= 0) inner = inner.slice(0, k) + 'margin:0;' + inner.slice(k + 'margin:0 0 8px;'.length);
    const box = this.v.quote === 'line'
      ? 'margin:20px 0;padding:2px 0 2px 14px;border-left:3px solid ' + t.quoteBorder + ';'
      : 'margin:20px 0;padding:14px 16px;background-color:' + t.quoteBg + ';border-radius:6px;';
    return '<section' + this.at(b) + ' style="' + box + '">' + inner + '</section>';
  }

  caption(nodes, ctx, b) {
    const t = this.t;
    return '<p' + this.at(b) + ' style="margin:-8px 0 ' + (t.paragraphGap + 8) + 'px;text-align:center;' + this.font(13, t.muted, null, 1.6) + '">' + this.inline(nodes, 'caption') + '</p>';
  }

  block_list(b, depth, ctx) {
    const t = this.t;
    this.listDepth++;
    const nested = this.listDepth > 1;
    const last = b.start + b.items.length - 1;
    const width = b.ordered ? 1.0 + 0.55 * String(last).length : 1.2;
    const innerCtx = (ctx === 'quote' || ctx === 'qlist') ? 'qlist' : 'list';
    const markColor = nested ? t.muted : t.listMarker;
    const items = b.items.map((item, k) => {
      const marker = b.ordered ? (b.start + k) + '.' : (nested ? '◦' : '•');
      let body = this.blocks(item, depth + 1, innerCtx);
      // 标记放进第一段开头；后续块整体缩进，与首段文字对齐
      const mk = '<span style="display:inline-block;width:' + width + 'em;margin-left:-' + width + 'em;color:' + markColor +
        ';font-weight:' + (b.ordered && !nested ? 700 : 400) + ';">' + marker + '</span>';
      body = body.replace(/^(<p[^>]*>)/, '$1' + mk);
      return '<section' + this.at(item[0]) + ' style="margin:0 0 ' + (b.loose ? 14 : nested ? 4 : 10) + 'px;padding-left:' + width + 'em;">' + body + '</section>';
    }).join('');
    this.listDepth--;
    return '<section' + this.at(b) + ' style="margin:' + (nested ? '4px 0 6px' : '0 0 ' + t.paragraphGap + 'px') + ';">' + items + '</section>';
  }

  block_code(b) {
    const t = this.t;
    return '<pre' + this.at(b) + ' style="margin:0 0 ' + t.paragraphGap + 'px;padding:14px 16px;background-color:' + t.codeBg +
      ';border-radius:6px;white-space:pre-wrap;word-break:break-all;overflow-x:auto;font-family:Menlo,Consolas,monospace;font-size:13px;line-height:1.65;color:' +
      t.color + ';"><code style="font-family:Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap;">' + esc(b.text) + '</code></pre>';
  }

  block_hr(b) { return '<hr' + this.at(b) + ' style="margin:40px auto;width:48px;border:0;border-top:1px solid ' + this.t.quoteBorder + ';">'; }

  block_image(b) {
    const item = this.registerImage(b), t = this.t, gap = t.paragraphGap + 4;
    const src = item.remote || (this.preview ? item.preview : null);
    if (src) {
      const local = !item.remote ? ' data-pb-local="1"' : '';
      if (!item.remote) this.todo('本地图片 ' + item.file + '：粘贴后在占位框处手动上传');
      return '<p' + this.at(b) + local + ' style="margin:' + gap + 'px 0 ' + gap + 'px;text-align:center;"><img src="' + escAttr(src) +
        '" alt="' + escAttr(item.alt.slice(0, 60)) + '" style="max-width:100%;height:auto;display:block;margin:0 auto;border-radius:4px;"></p>';
    }
    this.todo('本地图片 ' + item.file + '：粘贴后在占位框处手动上传');
    return '<p' + this.at(b) + ' style="margin:' + t.paragraphGap + 'px 0;padding:24px 12px;border:1px dashed ' + t.muted + ';text-align:center;' +
      this.font(13, t.muted, null, 1.6) + '">〔图片：' + esc(item.file) + '——本地图片，请在此处上传〕</p>';
  }

  block_table(b) {
    const t = this.t;
    const row = (cells, head) => '<tr>' + cells.map((c, i) => {
      const tag = head ? 'th' : 'td';
      return '<' + tag + ' style="border:1px solid ' + t.quoteBorder + ';padding:8px 10px;text-align:' + (b.aligns[i] || 'left') + ';' +
        this.font(14, null, null, 1.6) + (head ? 'background-color:' + t.quoteBg + ';font-weight:700;' : '') + '">' + this.inline(parseInline(c)) + '</' + tag + '>';
    }).join('') + '</tr>';
    return '<section' + this.at(b) + ' style="margin:0 0 ' + t.paragraphGap + 'px;overflow-x:auto;"><table style="border-collapse:collapse;width:100%;">' +
      row(b.header, true) + b.rows.map(r => row(r, false)).join('') + '</table></section>';
  }

  // ---------- 行内 ----------
  in_strong(nd, ctx) {
    const t = this.t, v = this.v.strong, kids = this.inline(nd[1], ctx);
    if (ctx === 'heading') return kids;
    if (v === 'accent') return '<strong style="font-weight:700;color:' + t.accent + ';">' + kids + '</strong>';
    if (v === 'marker') return '<strong style="font-weight:700;color:' + t.strongColor + ';background-color:' + t.markBg + ';padding:0 2px;">' + kids + '</strong>';
    return '<strong style="font-weight:700;color:' + t.strongColor + ';">' + kids + '</strong>';
  }
  in_em(nd, ctx) { return '<em style="font-style:italic;">' + this.inline(nd[1], ctx) + '</em>'; }
  in_del(nd, ctx) { return '<span style="text-decoration:line-through;">' + this.inline(nd[1], ctx) + '</span>'; }
  in_mark(nd, ctx) { return '<span style="background-color:' + this.t.markBg + ';padding:0 2px;">' + this.inline(nd[1], ctx) + '</span>'; }
  in_code(nd) { return '<code style="font-family:Menlo,Consolas,monospace;font-size:0.9em;background-color:' + this.t.codeBg + ';padding:1px 4px;border-radius:3px;">' + esc(nd[1]) + '</code>'; }
  in_autolink(nd) { return '<span style="color:' + this.t.muted + ';word-break:break-all;">' + esc(nd[1]) + '</span>'; }

  in_link(nd, ctx) {
    const t = this.t, url = nd[2], text = plainText(nd[1]).trim(), kids = this.inline(nd[1], ctx);
    if (url.startsWith('#')) return /^\d+$/.test(text) ? '<sup style="font-size:11px;line-height:0;color:' + t.muted + ';">[' + esc(text) + ']</sup>' : kids;
    if (!/^(https?:|mailto:)/.test(url)) return kids;
    if (text === url || text === url.replace(/^https?:\/\//, '') || /^[\w.-]+\.[a-z]{2,}(\/\S*)?$/.test(text)) {
      return '<span style="color:' + t.muted + ';word-break:break-all;">' + kids + '</span>';
    }
    this.links.push([text, url]);
    return '<span style="color:' + t.linkColor + ';">' + kids + '</span><sup style="font-size:11px;line-height:0;color:' + t.accent + ';">↗' + this.links.length + '</sup>';
  }

  in_image(nd) {
    const item = this.registerImage({ alt: nd[1], src: nd[2] });
    const src = item.remote || (this.preview ? item.preview : null);
    return src ? '<img src="' + escAttr(src) + '" alt="" style="max-width:100%;height:auto;vertical-align:middle;">' : '〔图片：' + esc(item.file) + '〕';
  }

  in_embed(nd) { return this.in_image(['image', nd[1], nd[1]]); }

  footer() {
    if (!this.links.length) return '';
    const t = this.t;
    this.todo('公众号正文外链不可点击：' + this.links.length + ' 个链接改成「文字↗n」，网址集中在文末「文中链接」');
    const rows = this.links.map(([text, url], i) => '<p style="margin:0 0 6px;word-break:break-all;' + this.font(12, t.muted, null, 1.6) + '">↗' + (i + 1) + ' ' + esc(text) + '：' + esc(url) + '</p>').join('');
    return '<section style="margin:40px 0 0;padding-top:14px;border-top:1px solid ' + t.quoteBorder + ';"><p style="margin:0 0 8px;' + this.font(13, t.muted, 700) + '">文中链接</p>' + rows + '</section>';
  }
}

// ============================================================
//  X Articles：只用官方支持的格式，样式交给 X 编辑器
//  最高一级标题→Heading(h1)，次一级→Subheading(h2)；图片粘贴带不过去，复制件留〔插图 N〕占位
// ============================================================
class XRenderer extends BaseRenderer {
  prepare(blocks) {
    const levels = [...new Set(blocks.filter(b => b.type === 'heading').map(b => b.level))].sort();
    this.hmap = {};
    levels.forEach((lvl, i) => { this.hmap[lvl] = i === 0 ? 'h1' : i === 1 ? 'h2' : 'p'; });
  }

  block_paragraph(b, depth, ctx) { return '<p' + this.at(b) + '>' + this.inline(parseInline(b.lines.join('\n')), ctx) + '</p>'; }

  block_heading(b) {
    const tag = this.hmap[b.level] || 'p', text = this.inline(parseInline(b.text), 'heading');
    return tag === 'p' ? '<p' + this.at(b) + '><strong>' + text + '</strong></p>' : '<' + tag + this.at(b) + '>' + text + '</' + tag + '>';
  }

  block_quote(b, depth) {
    this.todo('X 官方格式没有引用块：粘贴后检查是否保留，没保留就改缩进或截图');
    const title = b.callout && b.title ? '<p><strong>' + this.inline(parseInline(b.title)) + '</strong></p>' : '';
    return '<blockquote' + this.at(b) + '>' + title + this.blocks(b.children, depth + 1, 'quote') + '</blockquote>';
  }

  caption(nodes, ctx, b) { return '<p' + this.at(b) + '>' + this.inline(nodes, ctx) + '</p>'; }

  block_list(b, depth) {
    this.listDepth++;
    if (this.listDepth > 1) this.todo('X 嵌套列表待实测：粘贴后检查二级列表是否保留缩进');
    const tag = b.ordered ? 'ol' : 'ul';
    const start = b.ordered && b.start !== 1 ? ' start="' + b.start + '"' : '';
    const items = b.items.map(it => '<li' + this.at(it[0]) + '>' + this.blocks(it, depth + 1, 'list').replace(/^<p[^>]*>([\s\S]*?)<\/p>/, '$1') + '</li>').join('');
    this.listDepth--;
    return '<' + tag + this.at(b) + start + '>' + items + '</' + tag + '>';
  }

  block_code(b) {
    this.todo('X 不支持代码块：已按原样换行放入，建议截图');
    return '<p' + this.at(b) + '>' + esc(b.text).replace(/\n/g, '<br>') + '</p>';
  }

  block_hr(b) { return '<p' + this.at(b) + '><br></p>'; }

  block_image(b) {
    const item = this.registerImage(b);
    const src = this.preview ? (item.remote || item.preview) : null;
    if (src) return '<p' + this.at(b) + ' data-pb-img="' + item.n + '"><img src="' + escAttr(src) + '" alt=""></p>';
    return '<p' + this.at(b) + ' data-pb-img="' + item.n + '">〔插图 ' + item.n + ' · ' + esc(item.file) + '〕</p>';
  }

  block_table(b) {
    this.todo('X 不支持表格：已改成逐行列表，信息密的表建议截图');
    const rows = b.rows.map(r => '<li>' + b.header.map((h, i) => '<strong>' + this.inline(parseInline(h)) + '</strong>：' + this.inline(parseInline(r[i] || ''))).join('；') + '</li>').join('');
    return '<ul' + this.at(b) + '>' + rows + '</ul>';
  }

  in_strong(nd, ctx) { const k = this.inline(nd[1], ctx); return ctx === 'heading' ? k : '<strong>' + k + '</strong>'; }
  in_em(nd, ctx) { return '<em>' + this.inline(nd[1], ctx) + '</em>'; }
  in_del(nd, ctx) { return '<s>' + this.inline(nd[1], ctx) + '</s>'; }
  in_mark(nd, ctx) { return '<strong>' + this.inline(nd[1], ctx) + '</strong>'; }
  in_code(nd) { return esc(nd[1]); }
  in_autolink(nd) { return '<a href="' + escAttr(nd[1]) + '">' + esc(nd[1]) + '</a>'; }

  in_link(nd, ctx) {
    const url = nd[2], kids = this.inline(nd[1], ctx), text = plainText(nd[1]).trim();
    if (url.startsWith('#')) return /^\d+$/.test(text) ? '[' + esc(text) + ']' : kids;
    if (!/^(https?:|mailto:)/.test(url)) return kids;
    return '<a href="' + escAttr(url) + '">' + kids + '</a>';
  }

  in_image(nd) {
    const item = this.registerImage({ alt: nd[1], src: nd[2] });
    return '〔插图 ' + item.n + '〕';
  }
  in_embed(nd) { return this.in_image(['image', nd[1], nd[1]]); }

  footer() {
    if (this.images.length) this.todo('X 粘贴带不走图片：' + this.images.length + ' 处〔插图 N〕占位，按图片清单逐张上传');
    return '';
  }
}

function renderWechat(markdown, theme, opts) {
  const r = new WeChatRenderer(theme, opts);
  const html = r.render(markdown);
  return { html, todos: r.todos, images: r.images, links: r.links };
}

function renderX(markdown, opts) {
  const r = new XRenderer(opts);
  const html = r.render(markdown);
  return { html, todos: r.todos, images: r.images };
}

module.exports = { renderWechat, renderX, isCaption, captionLines, SEPARATOR };
