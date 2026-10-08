/**
 * [INPUT]: 只接收 Markdown 字符串，零 Obsidian / DOM / Node 依赖
 * [OUTPUT]: 对外提供 formatMarkdown（整篇空白排版，幂等）、spaceLine（单行中英文空格与连续空格）与 CJK 字符类
 * [POS]: shared/typeset 的空白规则层，插件「离开即整理」与「整理当前笔记」共用这一趟纯函数。
 *        照 ziminOS Pro 的 core/markdownStyle 写成，并按博客作者的两条要求加了两件事：
 *        连续空格只留一个；相邻两行文字拆成两段（与作者原先 Linter 的段落空行同一判据）
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
'use strict';

// ============================================================
//  字符类
// ============================================================

/** 汉字、假名、注音与兼容表意文字。刻意不含全角标点：「，Dataview」不该变成「， Dataview」 */
const CJK = '⺀-⻿⼀-⿟぀-ゟ゠-ヿ㄀-ㄯ㈀-㋿㐀-䶿一-鿿豈-﫿';
const IS_CJK = new RegExp(`[${CJK}]`);
/** 受保护片段的边界只问「是不是可见的半角字符」：`.obsidian`、#标签、网址都算西文 */
const IS_ASCII_GRAPH = /[!-~]/;
/** 正文里加空格只发生在汉字与字母、数字之间；百分号跟着数字走 */
const CJK_THEN_LATIN = new RegExp(`([${CJK}])([A-Za-z0-9])`, 'g');
const LATIN_THEN_CJK = new RegExp(`([A-Za-z0-9%])([${CJK}])`, 'g');

// ============================================================
//  行内保护：里面一个字都不动
// ============================================================

/**
 * 加空格谁都会写，难的是知道哪里不能加：`[[文件名]]` 里插一个空格，链接当场断掉，而且不报错。
 * 顺序有意义：同一位置先认尖括号网址，再认 HTML 标签，否则网址会被当成看不见的标签。
 */
const PROTECTED = new RegExp([
  '%%[^\\n]*?%%',              // 行内注释：读者看不见
  '(`+)[^\\n]*?\\1',           // 行内代码：同样长度的反引号闭合
  '!?\\[\\[[^\\]\\n]*\\]\\]',   // 双链与嵌入，连别名一起
  '!?\\[[^\\]\\n]*\\]\\([^)\\n]*\\)', // Markdown 链接与图片，连显示文字一起
  '<https?://[^>\\s]+>',       // 尖括号网址
  'https?://\\S+',             // 裸网址：吃到空白为止，宁可不补空格也不能把网址拆开
  '</?[A-Za-z][^>\\n]*>',      // HTML 标签
  '\\$[^$\\n]+\\$',            // 行内公式
  '#[^\\s#]+',                 // 标签。`## ` 不会命中：# 后面必须紧跟非空白非 #
].join('|'), 'g');

/**
 * 受保护片段在读者眼里的首尾字符。补不补空格看的是读者看见的字，不是语法符号：
 * 「点[这里](url)看」显示为「点这里看」，汉字挨着汉字，不该补；「运行`npm`」显示为「运行npm」，该补。
 * 图片与嵌入是一块画面，两侧不补（返回空边界）；注释与 HTML 标签读者看不见，
 * 返回 null 表示「透明」——判断空格时跳过它，看它两边真正挨着的字。
 */
function edges(segment) {
  const pair = text => [text.charAt(0), text.charAt(text.length - 1)];
  if (segment.startsWith('%%')) return null;
  if (segment.startsWith('!')) return ['', ''];
  if (segment.startsWith('`')) return pair(segment.replace(/^`+|`+$/g, '').trim());
  if (segment.startsWith('[[')) {
    const [target, alias] = segment.slice(2, -2).split('|');
    return pair((alias ?? target.split('/').pop().split('#')[0]).trim());
  }
  if (segment.startsWith('[')) return pair(segment.slice(1, segment.indexOf('](')).trim());
  if (segment.startsWith('<http')) return pair(segment.slice(1, -1));
  if (segment.startsWith('<')) return null;
  if (segment.startsWith('$')) return ['x', 'x'];
  return pair(segment);
}

/** 一边是汉字、另一边是可见半角字符，才补一个空格；已有空白或全角标点都不补，这也保证了幂等 */
function needsGap(tail, head) {
  if (!tail || !head) return false;
  return (IS_CJK.test(tail) && IS_ASCII_GRAPH.test(head)) || (IS_ASCII_GRAPH.test(tail) && IS_CJK.test(head));
}

/**
 * 一行的空白整理：汉字与字母、数字之间恰好一个空格，连续半角空格收成一个。
 * 行首缩进不动（列表层级靠它），全角空格 U+3000 不动（作者有意留白），受保护片段内部不动。
 * collapse 为 false 时只补空格不收空格：表格里的对齐空格是作者排的版。
 */
function spaceLine(line, { collapse = true } = {}) {
  const segments = [];
  let cursor = 0, match;
  PROTECTED.lastIndex = 0;
  while ((match = PROTECTED.exec(line)) !== null) {
    if (match.index > cursor) segments.push({ text: line.slice(cursor, match.index) });
    segments.push({ text: match[0], frozen: true, edges: edges(match[0]) });
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) segments.push({ text: line.slice(cursor) });

  let out = '', tail = '';
  segments.forEach((segment, index) => {
    let { text } = segment;
    if (segment.frozen && segment.edges === null) { out += text; return; }
    if (!segment.frozen) {
      text = text.replace(CJK_THEN_LATIN, '$1 $2').replace(LATIN_THEN_CJK, '$1 $2');
      if (collapse) {
        text = text.replace(/(?<=\S) {2,}(?=\S)/g, ' ');
        if (index > 0) text = text.replace(/^ {2,}/, ' ');
        if (index < segments.length - 1 && /\S/.test(out + text)) text = text.replace(/ {2,}$/, ' ');
      }
    }
    const [head, last] = segment.frozen ? segment.edges : [text.charAt(0), text.charAt(text.length - 1)];
    out += needsGap(tail, head) ? ` ${text}` : text;
    if (text) tail = last;
  });
  return out;
}

// ============================================================
//  行的身份：空行规则全部建立在它之上
// ============================================================

const HEADING = /^ {0,3}#{1,6}(?:\s|$)/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const LIST = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const LIST_CONTINUATION = /^(?: {2,}|\t)\S/;
const QUOTE = /^ {0,3}>/;
const TABLE_ROW = /^\s*\|/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;
const HTML_BLOCK = /^ {0,3}(?:<!--|<\/?[A-Za-z][\w-]*(?:[\s/][^>]*)?>)/;
const INDENTED = /^(?: {4}|\t)/;
const QUOTE_PREFIX = /^(?:[ \t]{0,3}>[ \t]?)+/;
/** 行尾两个空格、<br> 或反斜杠是作者要的硬换行：下一行与它同段，不拆 */
const HARD_BREAK = /(?:<br\s*\/?>| {2}|(?<!\\)\\)$/i;
/** 能用行尾两个空格接续下一行的身份；接续的前提是下一行与它同身份，否则中间本来就要空一行 */
const CONTINUABLE = new Set(['text', 'quote', 'list']);

/** 一行里注释符号是否落单（行内代码里的 %% 不算）：落单就是多行注释的开头或收尾 */
const opensOrClosesComment = line => (line.replace(/(`+)[^\n]*?\1/g, '').match(/%%/g) || []).length % 2 === 1;

/**
 * 逐行判定身份，带着上下文走：围栏代码、公式、多行注释、HTML 块里的每一行都冻结（frozen），
 * 内容一个字节不动；引用里的代码围栏同样冻结，但身份仍是引用，免得在 callout 中间插空行把它截断。
 */
function classify(lines) {
  const marks = [];
  let fence = null, math = 0, comment = 0, html = false, table = false, inList = false, block = 0;
  lines.forEach((line, index) => {
    const unquoted = line.replace(QUOTE_PREFIX, '');
    const quoted = unquoted.length !== line.length;
    const push = mark => marks.push(mark);

    if (fence) {
      push({ kind: fence.kind, frozen: true, block: fence.block });
      const close = unquoted.trim();
      if (close.length >= fence.size && [...close].every(char => char === fence.char)) fence = null;
      return;
    }
    if (math) { push({ kind: 'math', frozen: true, block: math }); if (/\$\$\s*$/.test(line.trim())) math = 0; return; }
    if (comment) { push({ kind: 'comment', frozen: true, block: comment }); if (opensOrClosesComment(line)) comment = 0; return; }

    const opening = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(unquoted);
    if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
      const kind = quoted ? 'quote' : inList && LIST_CONTINUATION.test(line) ? 'list' : 'code';
      fence = { char: opening[1][0], size: opening[1].length, kind, block: ++block };
      push({ kind, frozen: true, block });
      html = false; table = false;
      if (kind === 'code') inList = false;
      return;
    }
    if (line.trim().startsWith('$$')) {
      const single = line.trim().length > 2 && /\$\$\s*$/.test(line.trim().slice(2));
      push({ kind: 'math', frozen: true, block: ++block });
      if (!single) math = block;
      return;
    }
    if (opensOrClosesComment(line)) { push({ kind: 'comment', frozen: true, block: ++block }); comment = block; return; }

    if (!line.trim()) { push({ kind: 'blank' }); html = false; table = false; return; }
    if (html) { push({ kind: 'html', frozen: true }); return; }
    if (table && line.includes('|')) { push({ kind: 'table' }); return; }
    table = false;

    if (HEADING.test(line)) { push({ kind: 'heading' }); inList = false; return; }
    if (HR.test(line)) { push({ kind: 'hr' }); inList = false; return; }
    if (LIST.test(line)) { push({ kind: 'list' }); inList = true; return; }
    if (inList && LIST_CONTINUATION.test(line)) { push({ kind: 'list' }); return; }
    if (QUOTE.test(line)) { push({ kind: 'quote' }); inList = false; return; }
    if (TABLE_ROW.test(line) || (line.includes('|') && TABLE_SEPARATOR.test(lines[index + 1] || ''))) {
      push({ kind: 'table' }); table = true; inList = false; return;
    }
    if (HTML_BLOCK.test(line)) { push({ kind: 'html', frozen: true }); html = true; inList = false; return; }
    if (INDENTED.test(line)) {
      const previous = marks[marks.length - 1];
      // 空行之后的缩进是代码块；紧跟正文的缩进是作者的续行，拆开它会凭空变出一个代码块
      if (!previous || previous.kind === 'blank' || previous.indentedCode) push({ kind: 'code', frozen: true, indentedCode: true, block: previous?.indentedCode ? previous.block : ++block });
      else push({ kind: 'text', indented: true });
      return;
    }
    push({ kind: 'text' }); inList = false;
  });
  return marks;
}

// ============================================================
//  空行：哪两行之间必须隔一行
// ============================================================

/** 这些块与邻居之间各留一个空行；正文与正文之间也留——每一行文字自成一段 */
const ISOLATED = new Set(['heading', 'list', 'table', 'code', 'quote', 'hr', 'math', 'comment']);

function needsBlankBetween(before, after) {
  // HTML 块不能被空行打断语义，缩进续行拆开会变成代码块：两种都保持原样
  if (before.kind === 'html' || after.kind === 'html' || after.indented) return false;
  if (before.kind === after.kind) {
    if (before.kind === 'text') return !HARD_BREAK.test(before.line);
    if (before.kind === 'heading' || before.kind === 'hr') return true;
    // 两段代码、公式或注释首尾相接：各自成块。引用与列表里的代码不算——在 callout 中间插空行会把它截成两半
    return ['code', 'math', 'comment'].includes(before.kind) && before.block !== after.block;
  }
  return ISOLATED.has(before.kind) || ISOLATED.has(after.kind);
}

// ============================================================
//  整篇
// ============================================================

/**
 * 切出文件顶部的属性区。判据收得很紧：必须从第一个字符起就是 `---`，且后面有一行单独的 `---`。
 * 松一点就会把正文里的分隔线当成属性区开头，把作者的一段正文当 YAML 保护起来。
 */
function splitFrontmatter(content) {
  if (!content.startsWith('---\n')) return { frontmatter: '', body: content };
  const lines = content.split('\n');
  for (let index = 1; index < lines.length; index++) {
    if (lines[index].trim() === '---') return { frontmatter: lines.slice(0, index + 1).join('\n'), body: lines.slice(index + 1).join('\n') };
  }
  return { frontmatter: '', body: content };
}

/**
 * 整理一篇 Markdown，同输入同输出且幂等：formatMarkdown(formatMarkdown(x)) === formatMarkdown(x)。
 * 幂等是设计前提，不是碰巧的性质——整理会写盘，写盘再触发监听，断开这个环靠的正是第二趟没有任何改动。
 * 属性区一个字都不动；空笔记原样返回（新建的空笔记不该因为整理多出一次写入）。
 */
function formatMarkdown(content) {
  if (!content.trim()) return content;
  const ending = (content.match(/\r\n|\n|\r/) || ['\n'])[0];
  const bom = content.startsWith('﻿') ? '﻿' : '';
  const { frontmatter, body } = splitFrontmatter(content.slice(bom.length).replace(/\r\n|\r/g, '\n'));
  const lines = body.split('\n'), marks = classify(lines), out = [];
  let previous = null;

  lines.forEach((raw, index) => {
    const mark = marks[index];
    if (mark.kind === 'blank') {
      // 开头的空行与连续空行只留一个
      if (out.length && out[out.length - 1] !== '') out.push('');
      return;
    }
    let line = raw;
    if (!mark.frozen) {
      // 行尾空格去掉；唯独作者用两个空格接续下一行时收成恰好两个——那是排版，不是多余的空白
      const next = marks[index + 1];
      const keepBreak = / {2,}$/.test(raw) && CONTINUABLE.has(mark.kind) && next?.kind === mark.kind;
      line = spaceLine(line.replace(/[ \t]+$/, ''), { collapse: mark.kind !== 'table' }) + (keepBreak ? '  ' : '');
    }
    if (previous && needsBlankBetween(previous, { ...mark, line }) && out.length && out[out.length - 1] !== '') out.push('');
    out.push(line);
    previous = { ...mark, line };
  });

  let text = out.join('\n').replace(/\n+$/, '');
  if (frontmatter) text = text ? `${frontmatter}\n\n${text}` : frontmatter;
  text = `${bom}${text}\n`;
  return ending === '\n' ? text : text.replace(/\n/g, ending);
}

module.exports = { CJK, formatMarkdown, spaceLine, splitFrontmatter };
