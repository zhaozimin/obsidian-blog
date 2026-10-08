/**
 * [INPUT]: 依赖 ./parse.cjs 的 load/parseInline/plainText/walk，依赖 ./render.cjs 的 isCaption
 * [OUTPUT]: 对外提供 diagnose(text) → issues[{line, kind, message}]、stats(text)
 * [POS]: shared/typeset 的结构体检；只看"结构"能判断的问题（加粗密度、多卡引用块、无图图注、悬空引用、平台备注、残留按钮字）。
 *        "长段落""几屏没有小标题"依赖真实排版高度，由视图层在设备里实测，不在这里估算
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
'use strict';
const { load, parseInline, plainText, walk } = require('./parse.cjs');
const { isCaption } = require('./render.cjs');

// 平台备注：作者写给自己的提醒，不是正文。只认明确的动作句，避免"在 X 上刷到"这种正文误报
const NOTE = /(X|公众号|博客|小红书)\s*(里|上|版)?\s*(在这里|这里)?\s*(嵌入|插入|放|贴|换成)|在这里(嵌入|插入|放)|待补|TODO|【(截图|配图|图|插图|视频)[^】]*】/;
const UI_DEBRIS = /^(复制|Copy|copy|已复制|点击复制)$/;
const IMG_FILE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
const PER_SECTION_BOLD = 3;

function nodesOf(b) { return parseInline(b.lines.join('\n')); }

/** 结构性加粗：段首加粗标签（**原理**：）或整段只有一个加粗——它们在做表格的工作，不算强调。 */
function emphasisCount(b) {
  const nodes = nodesOf(b);
  const strong = nodes.filter(n => n[0] === 'strong').length;
  if (!strong) return 0;
  const lead = nodes[0] && nodes[0][0] === 'strong' && nodes[1] && nodes[1][0] === 'text' && /^\s*[：:　]/.test(nodes[1][1]);
  const whole = nodes.length === 1 && nodes[0][0] === 'strong' && plainText(nodes).length <= 24;
  return Math.max(0, strong - (lead || whole ? 1 : 0));
}

function diagnose(text) {
  const { blocks } = load(text);
  const issues = [];
  const add = (line, kind, message) => issues.push({ line, kind, message });

  // ---------- 分节加粗密度 ----------
  let section = { line: null, title: '开头', bold: 0, chars: 0 };
  const closeSection = () => {
    if (section.bold > PER_SECTION_BOLD && section.bold * 150 > section.chars) {
      add(section.line != null ? section.line : 0, 'bold', '「' + section.title + '」一节有 ' + section.bold + ' 处强调加粗，读者分不清主次（建议 ≤3）');
    }
  };
  for (const b of blocks) {
    if (b.type === 'heading') {
      closeSection();
      section = { line: b.line, title: plainText(parseInline(b.text)).slice(0, 16), bold: 0, chars: 0 };
      continue;
    }
    for (const x of walk([b])) {
      if (x.type !== 'paragraph') continue;
      section.bold += emphasisCount(x);
      section.chars += plainText(nodesOf(x)).replace(/\s/g, '').length;
    }
  }
  closeSection();

  // ---------- 引用块：多张卡片挤在一块 ----------
  for (const b of walk(blocks)) {
    if (b.type !== 'quote') continue;
    // 卡片标签：段首一个短加粗（≤20 字），后面不是冒号——"**01　权威原理**　_Authority_" 是，"**原理**：…" 不是
    const labels = b.children.filter(c => {
      const m = c.type === 'paragraph' && /^\*\*([^*]+)\*\*\s*(.?)/.exec(c.lines[0]);
      return m && m[1].trim().length <= 20 && !/[：:]/.test(m[2]);
    }).length;
    if (labels >= 2) add(b.line, 'cards', '一个引用块里有 ' + labels + ' 张卡片：建议一卡一块（卡片之间空一行，去掉中间的 >）');
  }

  // ---------- 图注、图片、引用、残留 ----------
  let prev = null;
  for (const b of blocks) {
    const first = b.type === 'paragraph' ? b.lines[0] : b.type === 'quote' && b.children[0] && b.children[0].type === 'paragraph' ? b.children[0].lines[0] : '';
    if (/^图\s*\d+\s*[·・:：]/.test(first) && !(prev && prev.type === 'image')) add(b.line, 'caption', '图注前面没有图片：「' + first.slice(0, 14) + '…」');
    if (isCaption(prev, b) || (b.type === 'paragraph' && /^图\s*\d+/.test(first))) {
      const nodes = parseInline((b.type === 'quote' ? b.children[0].lines : b.lines).join('\n'));
      if (nodes.some(n => n[0] === 'link' && IMG_FILE.test(n[2]))) add(b.line, 'debris', '图注末尾黏着图片文件链接，会和图注连成一行');
    }
    prev = b;
  }
  for (const b of walk(blocks)) {
    if (b.type !== 'paragraph') continue;
    b.lines.forEach((ln, k) => {
      if (UI_DEBRIS.test(ln.trim())) add(b.line + k, 'debris', '疑似网页按钮文字残留：「' + ln.trim() + '」');
      if (NOTE.test(ln)) add(b.line + k, 'note', '平台备注 / 待办：「' + ln.trim().slice(0, 24) + '」');
    });
  }

  // ---------- 悬空的 [n](#rN) 锚点 ----------
  const anchors = new Set();
  text.replace(/id="([^"]+)"|\^([\w-]+)\s*$/gm, (m, a, b) => { anchors.add(a || b); return m; });
  const dangling = new Map();   // 引用文字 → 首次出现的行
  for (const b of walk(blocks)) {
    if (b.type !== 'paragraph') continue;
    for (const nd of nodesOf(b)) {
      const label = plainText(nd[1] || []).trim();
      if (nd[0] === 'link' && /^#/.test(nd[2]) && !anchors.has(nd[2].slice(1)) && !dangling.has(label)) dangling.set(label, b.line);
    }
  }
  if (dangling.size) {
    add(Math.min(...dangling.values()), 'anchor', '文内引用 ' + [...dangling.keys()].map(s => '[' + s + ']').join('') + ' 找不到对应的参考文献条目');
  }

  return issues.sort((a, b) => a.line - b.line);
}

/** 字数统一口径：只数读者看得见的正文字（汉字、字母、数字），不含 frontmatter、网址、图片说明。 */
function stats(text) {
  const { blocks } = load(text);
  let chars = 0;
  for (const b of walk(blocks)) {
    if (b.type === 'paragraph') chars += plainText(nodesOf(b)).replace(/https?:\/\/\S+/g, '').replace(/[^\p{L}\p{N}]/gu, '').length;
    if (b.type === 'heading') chars += plainText(parseInline(b.text)).replace(/[^\p{L}\p{N}]/gu, '').length;
  }
  return { chars, minutes: Math.max(1, Math.round(chars / 400)) };
}

module.exports = { diagnose, stats };
