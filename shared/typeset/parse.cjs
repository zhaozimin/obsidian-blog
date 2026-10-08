/**
 * [INPUT]: 依赖 ./format.cjs 的 CJK 字符类（与自动排版同一份）；纯函数，不碰 Obsidian / DOM / Node API
 * [OUTPUT]: 对外提供 CJK、splitFrontmatter、stripComments、parseBlocks、parseInline、plainText、walk、load、titleFromPath
 * [POS]: shared/typeset 预览渲染的语法地基；所有块带源码行号（0 起，整篇文件坐标），滚动同步与体检标记都靠它定位
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 *
 * 只覆盖作者真实用到的 Obsidian Markdown 子集：标题、段落（单换行即换行）、引用与 callout、
 * 有序/无序列表（可嵌套）、代码块、表格、分割线、图片、链接、wikilink、%%注释%%。
 */
'use strict';
const { CJK } = require('./format.cjs');

// ============================================================
//  文档级预处理
// ============================================================
const FRONTMATTER = /^---[ \t]*\n([\s\S]*?\n)?---[ \t]*(\n|$)/;

/** 返回 { frontmatter 原文含分隔线, body, offset: 正文首行在全文中的行号 } */
function splitFrontmatter(text) {
  const m = FRONTMATTER.exec(text);
  if (!m) return { frontmatter: '', body: text, offset: 0 };
  return { frontmatter: m[0], body: text.slice(m[0].length), offset: m[0].split('\n').length - 1 };
}

/** %%注释%% 是作者私语，任何出口都不该出现。保留换行数，行号不漂移。 */
function stripComments(text) {
  return text.replace(/%%[\s\S]*?%%/g, s => s.replace(/[^\n]/g, ''));
}

/** 文件名即标题：去掉 ⏸️ ❌ 这类状态前缀与 MOC- 这类库命名前缀。 */
function titleFromPath(path, frontmatter) {
  const fm = /^title:\s*["']?(.+?)["']?\s*$/m.exec(frontmatter || '');
  if (fm) return fm[1];
  let name = path.replace(/\\/g, '/').split('/').pop().replace(/\.md$/, '');
  name = name.replace(/^[\p{So}\p{Sk}\p{Mn}\p{Cf}️\s]+/u, '');
  name = name.replace(/^(MOC|moc|Index|INDEX)[-_\s]+/, '');
  return name.trim();
}

// ============================================================
//  块级解析
// ============================================================
const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const IMG_ONLY = /^\s*!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)\s*$/;
const EMBED_ONLY = /^\s*!\[\[([^\]]+)\]\]\s*$/;
const CALLOUT = /^\[!(\w+)\][+-]?\s*(.*)$/;

const expand = s => s.replace(/\t/g, '    ');
const indentOf = s => { const e = expand(s); return e.length - e.replace(/^ +/, '').length; };
const blank = s => !s.trim();

function startsBlock(line) {
  return HEADING.test(line) || FENCE.test(line) || QUOTE.test(line) || HR.test(line) ||
    LIST_ITEM.test(line) || IMG_ONLY.test(line) || EMBED_ONLY.test(line);
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map(c => c.trim());
}

function parseList(lines, nos, i) {
  const n = lines.length;
  const first = LIST_ITEM.exec(lines[i]);
  const base = indentOf(lines[i]);
  const ordered = /\d/.test(first[2][0]);
  const start = ordered ? parseInt(first[2], 10) : 1;
  const items = [];
  const startLine = nos[i];
  let loose = false;
  while (i < n) {
    const m = LIST_ITEM.exec(lines[i]);
    if (!m || indentOf(lines[i]) !== base || /\d/.test(m[2][0]) !== ordered) break;
    const contentIndent = base + m[2].length + expand(m[3]).length;
    const itemLines = [m[4]];
    const itemNos = [nos[i]];
    i++;
    while (i < n) {
      const line = lines[i];
      if (blank(line)) {
        let j = i;
        while (j < n && blank(lines[j])) j++;
        if (j < n && indentOf(lines[j]) >= contentIndent) {
          for (let k = i; k < j; k++) { itemLines.push(''); itemNos.push(nos[k]); }
          i = j; loose = true; continue;
        }
        break;
      }
      const ind = indentOf(line);
      if (ind >= contentIndent || (ind > base && LIST_ITEM.test(line))) {
        itemLines.push(expand(line).slice(Math.min(ind, contentIndent)));
      } else if (LIST_ITEM.test(line) || startsBlock(line)) {
        break;
      } else {
        itemLines.push(line.trim()); // 懒续行
      }
      itemNos.push(nos[i]);
      i++;
    }
    items.push(parseBlocks(itemLines, itemNos));
    let j = i;
    while (j < n && blank(lines[j])) j++;
    if (j > i && j < n) {
      const m2 = LIST_ITEM.exec(lines[j]);
      if (m2 && indentOf(lines[j]) === base && /\d/.test(m2[2][0]) === ordered) { loose = true; i = j; continue; }
    }
    if (j > i) break;
  }
  return [{ type: 'list', ordered, start, items, loose, line: startLine, endLine: nos[i - 1] }, i];
}

/**
 * 行数组 → 块数组。nos 是每行在原文中的行号（嵌套解析时保持全文坐标）。
 * 块：{type, line, endLine, ...}，type ∈ heading/paragraph/quote/list/code/hr/image/table
 */
function parseBlocks(lines, nos) {
  nos = nos || lines.map((_, k) => k);
  const blocks = [];
  const n = lines.length;
  let i = 0;
  while (i < n) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }
    let m = FENCE.exec(line);
    if (m) {
      const fence = m[1];
      const buf = [];
      let j = i + 1;
      while (j < n && !lines[j].trim().startsWith(fence)) buf.push(lines[j++]);
      blocks.push({ type: 'code', lang: m[2], text: buf.join('\n'), line: nos[i], endLine: nos[Math.min(j, n - 1)] });
      i = j + 1; continue;
    }
    if ((m = HEADING.exec(line))) {
      blocks.push({ type: 'heading', level: m[1].length, text: m[2], line: nos[i], endLine: nos[i] });
      i++; continue;
    }
    if (HR.test(line)) { blocks.push({ type: 'hr', line: nos[i], endLine: nos[i] }); i++; continue; }
    if (QUOTE.test(line)) {
      let inner = [], innerNos = [];
      const s = i;
      while (i < n && QUOTE.test(lines[i])) { inner.push(QUOTE.exec(lines[i])[1]); innerNos.push(nos[i]); i++; }
      const block = { type: 'quote', callout: null, title: '', line: nos[s], endLine: nos[i - 1] };
      const cm = inner.length ? CALLOUT.exec(inner[0].trim()) : null;
      if (cm) {
        block.callout = cm[1].toLowerCase(); block.title = cm[2];
        inner = inner.slice(1); innerNos = innerNos.slice(1);
      }
      block.children = parseBlocks(inner, innerNos);
      blocks.push(block); continue;
    }
    if (LIST_ITEM.test(line)) {
      const [block, next] = parseList(lines, nos, i);
      blocks.push(block); i = next; continue;
    }
    if (line.includes('|') && i + 1 < n && TABLE_SEP.test(lines[i + 1])) {
      const header = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map(c => (c.startsWith(':') && c.endsWith(':')) ? 'center' : c.endsWith(':') ? 'right' : 'left');
      const rows = [];
      const s = i;
      i += 2;
      while (i < n && lines[i].trim() && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
      blocks.push({ type: 'table', header, aligns, rows, line: nos[s], endLine: nos[i - 1] });
      continue;
    }
    if ((m = IMG_ONLY.exec(line))) {
      blocks.push({ type: 'image', alt: m[1], src: m[2], embed: false, line: nos[i], endLine: nos[i] });
      i++; continue;
    }
    if ((m = EMBED_ONLY.exec(line))) {
      const target = m[1].split('|')[0];
      blocks.push({ type: 'image', alt: target, src: target, embed: true, line: nos[i], endLine: nos[i] });
      i++; continue;
    }
    const para = [line.trimEnd()];
    const s = i;
    i++;
    while (i < n && lines[i].trim() && !startsBlock(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < n && TABLE_SEP.test(lines[i + 1]))) {
      para.push(lines[i].trimEnd()); i++;
    }
    blocks.push({ type: 'paragraph', lines: para.map(p => p.trim()), line: nos[s], endLine: nos[i - 1] });
  }
  return blocks;
}

// ============================================================
//  行内解析
//  节点：['text', s] ['br'] ['strong', kids] ['em', kids] ['del', kids] ['mark', kids]
//        ['code', s] ['link', kids, url] ['image', alt, src] ['autolink', url]
//        ['wikilink', target, alias] ['embed', target] ['fnref', id]
// ============================================================
const INLINE = [
  ['code', /(`+)(.+?)\1/y],
  ['escape', /\\([\\`*_{}[\]()#+\-.!~=|<>])/y],
  ['autolink', /<(https?:\/\/[^>\s]+)>/y],
  ['br', /<br\s*\/?>|\n/y],
  ['image', /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/y],
  ['embed', /!\[\[([^\]]+)\]\]/y],
  ['wikilink', /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/y],
  ['fnref', /\[\^([^\]]+)\]/y],
  ['link', /\[((?:[^[\]]|\[[^[\]]*\])*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/y],
  ['strong', /\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*|__(?=\S)([\s\S]+?)(?<=\S)__/y],
  ['del', /~~(?=\S)([\s\S]+?)(?<=\S)~~/y],
  ['mark', /==(?=\S)([\s\S]+?)(?<=\S)==/y],
  ['em', /\*(?=[^\s*])([\s\S]+?)(?<=[^\s*])\*|(?<![A-Za-z0-9])_(?=\S)([\s\S]+?)(?<=\S)_(?![A-Za-z0-9])/y],
  ['url', new RegExp('https?://[^\\s<>()（）\\[\\]' + CJK + '，。、；：！？“”「」]+', 'y')],
  ['tag', /<\/?[A-Za-z][^>]*>/y],
];
// 每种语法可能出现的首字符：逐字扫描时先过滤，长文也只有线性开销
const TRIGGER = /[`\\<\n![*_~=h]/;

function parseInline(text) {
  const nodes = [];
  let buf = '';
  const flush = () => { if (buf) { nodes.push(['text', buf]); buf = ''; } };
  let pos = 0;
  while (pos < text.length) {
    const ch = text[pos];
    let hit = null;
    if (TRIGGER.test(ch)) {
      for (const [name, re] of INLINE) {
        re.lastIndex = pos;
        const m = re.exec(text);
        if (m) { hit = [name, m]; break; }
      }
    }
    if (!hit) { buf += ch; pos++; continue; }
    const [name, m] = hit;
    pos += m[0].length;
    if (name === 'escape') { buf += m[1]; continue; }
    if (name === 'tag') continue;
    flush();
    switch (name) {
      case 'code': nodes.push(['code', m[2]]); break;
      case 'br': nodes.push(['br']); break;
      case 'autolink': nodes.push(['autolink', m[1]]); break;
      case 'url': nodes.push(['autolink', m[0]]); break;
      case 'image': nodes.push(['image', m[1], m[2]]); break;
      case 'embed': nodes.push(['embed', m[1].split('|')[0]]); break;
      case 'wikilink': nodes.push(['wikilink', m[1], m[2] || m[1].split('/').pop().split('#')[0]]); break;
      case 'fnref': nodes.push(['fnref', m[1]]); break;
      case 'link': nodes.push(['link', parseInline(m[1]), m[2]]); break;
      default: nodes.push([name, parseInline(m[1] !== undefined ? m[1] : m[2])]);
    }
  }
  flush();
  return nodes;
}

function plainText(nodes) {
  let out = '';
  for (const nd of nodes) {
    switch (nd[0]) {
      case 'text': case 'code': case 'autolink': out += nd[1]; break;
      case 'br': out += '\n'; break;
      case 'strong': case 'em': case 'del': case 'mark': case 'link': out += plainText(nd[1]); break;
      case 'wikilink': out += nd[2]; break;
      case 'fnref': out += '[' + nd[1] + ']'; break;
      default: break;
    }
  }
  return out;
}

/** 深度优先遍历所有块（含引用、列表内部）。 */
function* walk(blocks) {
  for (const b of blocks) {
    yield b;
    if (b.type === 'quote') yield* walk(b.children);
    else if (b.type === 'list') for (const item of b.items) yield* walk(item);
  }
}

/** 全文 → { frontmatter, blocks }。块行号是全文坐标，直接对应编辑器行。 */
function load(text) {
  const { frontmatter, body, offset } = splitFrontmatter(text);
  const lines = stripComments(body).split('\n');
  return { frontmatter, blocks: parseBlocks(lines, lines.map((_, k) => k + offset)) };
}

module.exports = { CJK, splitFrontmatter, stripComments, titleFromPath, parseBlocks, parseInline, plainText, walk, load };
