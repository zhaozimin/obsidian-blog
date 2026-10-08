/**
 * [INPUT]: 依赖 shared/typeset/format 的 formatMarkdown/spaceLine 与 Node test
 * [OUTPUT]: 空白排版规则、保护名单、块级空行与幂等性的回归验证
 * [POS]: 自动排版的规则边界；样例均为虚构文字，不读取用户笔记库
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatMarkdown, spaceLine } = require('../shared/typeset/format.cjs');

const once = text => {
  const result = formatMarkdown(text);
  assert.equal(formatMarkdown(result), result, '整理必须幂等');
  return result;
};

test('中英文、数字之间恰好一个空格，连续空格只留一个', () => {
  assert.equal(spaceLine('中文English  数字123和  空格'), '中文 English 数字 123 和 空格');
  assert.equal(spaceLine('增长100%以上'), '增长 100% 以上');
  assert.equal(spaceLine('中文   English'), '中文 English');
  assert.equal(spaceLine('  缩进不动  但中间收'), '  缩进不动 但中间收');
});

test('段与段之间恰好一个空行，相邻两行文字各自成段', () => {
  assert.equal(once('第一行\n第二行\n\n\n\n第三段'), '第一行\n\n第二行\n\n第三段\n');
  assert.equal(once('\n\n开头空行\n\n\n'), '开头空行\n');
});

test('读者看见的字决定补不补空格，链接、代码与网址内部一字不动', () => {
  assert.equal(spaceLine('打开[[MOC-人脉]]看看'), '打开 [[MOC-人脉]]看看');
  assert.equal(spaceLine('运行`npm install`命令'), '运行 `npm install` 命令');
  assert.equal(spaceLine('点[这里](https://a.com/x)看'), '点[这里](https://a.com/x)看');
  assert.equal(spaceLine('见[Obsidian](https://obsidian.md)官网'), '见 [Obsidian](https://obsidian.md) 官网');
  assert.equal(spaceLine('访问https://example.com/路径?q=中文'), '访问 https://example.com/路径?q=中文');
  assert.equal(spaceLine('设$x$为'), '设 $x$ 为');
  assert.equal(spaceLine('这是#标签'), '这是 #标签');
  assert.equal(spaceLine('看图![[图.webp]]Next'), '看图![[图.webp]]Next');
  assert.equal(spaceLine('正文%%私语%%English'), '正文%%私语%% English');
  assert.equal(spaceLine('`a  b`与  [[x  y]]'), '`a  b` 与 [[x  y]]');
});

test('全角空格、属性区与代码块不动', () => {
  assert.equal(once('　　首行缩进。\n文字　English'), '　　首行缩进。\n\n文字　English\n');
  assert.equal(once('---\ntitle: "中文English"\ntags: []\n---\n正文English'), '---\ntitle: "中文English"\ntags: []\n---\n\n正文 English\n');
  const code = '```js\n中文English  \n\n\nconst a  = 1;\n```';
  assert.equal(once(`说明\n${code}\n后文`), `说明\n\n${code}\n\n后文\n`);
  assert.equal(once('正文\n    缩进续行'), '正文\n    缩进续行\n');
  assert.equal(once('前文\n\n    缩进代码  English中文\n\n后文'), '前文\n\n    缩进代码  English中文\n\n后文\n');
});

test('标题、列表、引用、表格、分隔线与注释块的空行', () => {
  assert.equal(once('# 标题\n正文\n## 小标题\n### 更小'), '# 标题\n\n正文\n\n## 小标题\n\n### 更小\n');
  assert.equal(once('前文\n- 一\n- 二\n  续行\n文字'), '前文\n\n- 一\n- 二\n  续行\n\n文字\n');
  assert.equal(once('> 引用一\n> 引用二\n正文'), '> 引用一\n> 引用二\n\n正文\n');
  assert.equal(once('说明\n| 列A  | 列B |\n| --- | --- |\n| 中文English | 1 |\n后文'), '说明\n\n| 列 A  | 列 B |\n| --- | --- |\n| 中文 English | 1 |\n\n后文\n');
  assert.equal(once('正文\n---\n后文'), '正文\n\n---\n\n后文\n');
  assert.equal(once('%%\n填写说明English中文\n\n- 例子\n%%\n正文'), '%%\n填写说明English中文\n\n- 例子\n%%\n\n正文\n');
  assert.equal(once('$$\na  +  b\n$$\n正文'), '$$\na  +  b\n$$\n\n正文\n');
});

test('硬换行保留同段，HTML 块原样', () => {
  assert.equal(once('第一行<br>\n第二行\n第三行\\\n第四行'), '第一行<br>\n第二行\n\n第三行\\\n第四行\n');
  assert.equal(once('对过去，   \n数出了38个，  \n都在铺垫。  \n## 标题'), '对过去，  \n数出了 38 个，  \n都在铺垫。\n\n## 标题\n');
  assert.equal(once('> 引用  \n> 续行'), '> 引用  \n> 续行\n');
  assert.equal(once('<details>\n<summary>标题English</summary>\n内容\n</details>\n\n正文'), '<details>\n<summary>标题English</summary>\n内容\n</details>\n\n正文\n');
});

test('callout 里的代码按钮整段冻结，不在 callout 中间插空行', () => {
  const console = '> [!multi-column]\n>\n> > [!note] 深度长文\n> >\n> > ```blog-button\n> > 文字: 笔下生花 · 万文集\n> > 栏目: long-reads\n> > ```\n>\n> > [!success] 阅读思考\n';
  assert.equal(once(console), console);
});

test('保留 CRLF 与 BOM，空笔记原样返回', () => {
  assert.equal(once('a中\r\nb'), 'a 中\r\n\r\nb\r\n');
  assert.equal(once('﻿---\nid: x\n---\n正文'), '﻿---\nid: x\n---\n\n正文\n');
  assert.equal(formatMarkdown(''), '');
  assert.equal(formatMarkdown('\n\n'), '\n\n');
});
