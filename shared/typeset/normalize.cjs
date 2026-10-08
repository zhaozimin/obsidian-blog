/**
 * [INPUT]: 依赖 ./parse.cjs 的 CJK 字符类与 splitFrontmatter
 * [OUTPUT]: 对外提供 normalize(text) → { lines: 逐行改动[], notes: 只提醒不改[] }、applyPatch
 * [POS]: shared/typeset 的标点规范化（手动、先确认再改）；只做有唯一正确答案的标点修正，返回逐行补丁供编辑器一次性应用（一步撤销）。
 *        中英文空格、连续空格、空行与行尾空白归 format.cjs（离开即整理）——一条规则只住一个地方
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 *
 * 边界：
 * - 只改"非受保护片段"：行内代码、链接目标、URL、wikilink、HTML 标签、数学式不碰；frontmatter、代码块、表格不碰。
 * - 尊重作者的双引号体系：“”给引语、「」给名词与界面文字，互不转换；只把成对的半角 " 转成 “”。
 * - 全角空格 U+3000 是作者故意的留白，不动。重复标点属于语气，只提醒。
 * - 一行里出现 3 处以上"全角标点+空格"，多半是被压平的多行原文（空格是原换行的痕迹）——只提醒，不合并。
 */
'use strict';
const { CJK, splitFrontmatter } = require('./parse.cjs');

const C = '[' + CJK + ']';
const FULL_PUNCT = '，。！？；：、）」』”》〉】';
const OPEN_PUNCT = '（「『“《〈【';

const PROTECT = new RegExp(
  '`+[^`]*`+' +
  '|\\]\\([^)]*\\)' +
  '|<https?://[^>]+>' +
  '|https?://[^\\s<>()（）\\[\\]' + CJK + '，。、；：！？“”「」]+' +
  '|!?\\[\\[[^\\]]*\\]\\]' +
  '|</?[A-Za-z][^>]*>' +
  '|\\$[^$\\n]+\\$', 'g');

const SPACE_AROUND = '全角标点两侧不留空格';
// [规则名, 正则, 替换]——顺序有意义：先全角转半角，再转标点，最后收标点两侧的空格
const RULES = [
  ['全角字母数字转半角', /[０-９Ａ-Ｚａ-ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)],
  ['中文语境用全角逗号', new RegExp('(' + C + '),', 'g'), '$1，'],
  ['中文语境用全角分号', new RegExp('(' + C + ');', 'g'), '$1；'],
  ['中文语境用全角冒号', new RegExp('(' + C + '):', 'g'), '$1：'],
  ['中文语境用全角叹号', new RegExp('(' + C + ')!', 'g'), '$1！'],
  ['中文语境用全角问号', new RegExp('(' + C + ')\\?', 'g'), '$1？'],
  ['中文语境用全角句号', new RegExp('(' + C + ')\\.(?=$|\\s|' + C + ')', 'g'), '$1。'],
  ['中文括号用全角', new RegExp('\\(([^()]*' + C + '[^()]*)\\)|(?<=' + C + ')\\(([^()]*)\\)', 'g'), (m, a, b) => '（' + (a !== undefined ? a : b) + '）'],
  ['省略号统一为……', new RegExp('。{3,}|(?<=' + C + '|[“”」，])(?:\\.{3,}|(?<!…)…(?!…))|(?:\\.{3,}|(?<!…)…(?!…))(?=' + C + '|[“”「])', 'g'), '……'],
  ['中文破折号统一为——', new RegExp('(' + C + ')\\s*(?:--|—|－－)\\s*(' + C + ')', 'g'), '$1——$2'],
  [SPACE_AROUND, new RegExp('[ \\t]+([' + FULL_PUNCT + '])', 'g'), '$1'],
  [SPACE_AROUND, new RegExp('([' + FULL_PUNCT + '])[ \\t]+(?=\\S)', 'g'), '$1'],
  [SPACE_AROUND, new RegExp('([' + OPEN_PUNCT + '])[ \\t]+', 'g'), '$1'],
  [SPACE_AROUND, new RegExp('(?<=\\S)[ \\t]+([' + OPEN_PUNCT + '])', 'g'), '$1'],
];

// 加粗以中文标点收尾、后面紧跟汉字：CommonMark 判定不成闭合定界符，博客（marked）会露出星号。
// 把标点移到 ** 外面，文字与观感都不变。
const BOLD_PUNCT = new RegExp('\\*\\*([^*\\n]+?)([。！？，；：、])\\*\\*(?=' + C + '|[“「（])', 'g');
const FLATTENED = new RegExp('[' + FULL_PUNCT + '][ \\t]+(?=' + C + ')', 'g');
const REPEAT_PUNCT = /([！？。，])\1+/;

function fixQuotes(seg) {
  if (!seg.includes('"') || !new RegExp(C).test(seg)) return seg;
  const parts = seg.split('"');
  if (parts.length % 2 === 0) return seg;
  return parts.reduce((acc, p, k) => k === 0 ? p : acc + (k % 2 ? '“' : '”') + p, '');
}

function applyRules(seg, rules, used) {
  for (const [name, re, rep] of rules) {
    const next = seg.replace(re, rep);
    if (next !== seg) { used.add(name); seg = next; }
  }
  const q = fixQuotes(seg);
  if (q !== seg) { used.add('半角引号转中文引号'); seg = q; }
  return seg;
}

function normalizeLine(line, notes, lineNo) {
  const m = /^(\s*(?:>\s?)*(?:#{1,6}\s+|[-*+]\s+|\d{1,9}[.)]\s+)?)([\s\S]*)$/.exec(line);
  const prefix = m[1];
  let rest = m[2];
  const used = new Set();
  let rules = RULES;
  if ((rest.match(FLATTENED) || []).length >= 3) {
    rules = RULES.filter(r => r[0] !== SPACE_AROUND);
    notes.push({ line: lineNo, rule: '疑似被压平的多行原文（标点后的空格可能是原换行），未合并空格', text: rest.slice(0, 40) });
  }
  const bold = rest.replace(BOLD_PUNCT, '**$1**$2');
  if (bold !== rest) { used.add('加粗末尾标点移到星号外（博客兼容）'); rest = bold; }
  let out = '';
  let pos = 0;
  PROTECT.lastIndex = 0;
  let pm;
  while ((pm = PROTECT.exec(rest))) {
    out += applyRules(rest.slice(pos, pm.index), rules, used) + pm[0];
    pos = pm.index + pm[0].length;
  }
  out += applyRules(rest.slice(pos), rules, used);
  // 行尾空白不在这里收：行尾两个空格可能是作者的硬换行，留给 format.cjs 判断
  return { text: prefix + out, rules: [...used] };
}

/**
 * 返回 { lines: [{line, before, after, rules}], notes: [{line, rule, text}] }。
 * line 为全文 0 起行号；只替换行内文字，不增删行（空行归 format.cjs）。
 */
function normalize(text) {
  const { body, offset } = splitFrontmatter(text);
  const src = body.split('\n');
  const lines = [], notes = [];
  let inFence = false, fence = '', inComment = false;
  src.forEach((line, idx) => {
    const lineNo = idx + offset;
    const stripped = line.trim();
    const fm = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (inFence) { if (stripped.startsWith(fence)) inFence = false; return; }
    if (fm) { inFence = true; fence = fm[1]; return; }
    if ((stripped.match(/%%/g) || []).length % 2 === 1) { inComment = !inComment; return; }
    if (inComment || stripped.startsWith('|') || !stripped) return;
    const r = normalizeLine(line, notes, lineNo);
    if (REPEAT_PUNCT.test(r.text)) notes.push({ line: lineNo, rule: '重复标点（语气，未改）', text: r.text.trim().slice(0, 40) });
    if (r.text.includes('"') && new RegExp(C).test(r.text) && (r.text.match(/"/g) || []).length % 2 === 1) {
      notes.push({ line: lineNo, rule: '半角引号落单（未改）', text: r.text.trim().slice(0, 40) });
    }
    if (r.text !== line) lines.push({ line: lineNo, before: line, after: r.text, rules: r.rules });
  });
  return { lines, notes };
}

/** 把补丁应用到全文（测试与非编辑器场景用；编辑器里走 transaction）。 */
function applyPatch(text, lines) {
  const all = text.split('\n');
  const drop = new Set();
  for (const p of lines) {
    if (p.after === null) drop.add(p.line);
    else all[p.line] = p.after;
  }
  return all.filter((_, k) => !drop.has(k)).join('\n');
}

module.exports = { normalize, applyPatch };
