/**
 * [INPUT]: 依赖 shared/typeset 全部内核（parse/normalize/render/diagnose/themes/format）、plugin/wechat 的风格换算与 Node test；
 *          设置 TYPESET_SAMPLES 为真实文章目录时额外跑真文回归（目录不入库）
 * [OUTPUT]: 解析行号、标点规范化边界、标点与空白两步串联、渲染契约（无 class/style、X 标签子集、data-line 只在预览）、体检、
 *           公众号草稿沿用预览风格的回归验证
 * [POS]: 排版预览内核的回归网，由原排版预览插件的 tests/core.test.js 移入；内核是纯函数，全部在 Node 里验证
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { load, walk, titleFromPath } = require('../shared/typeset/parse.cjs');
const { normalize, applyPatch } = require('../shared/typeset/normalize.cjs');
const { renderWechat, renderX } = require('../shared/typeset/render.cjs');
const { diagnose, stats } = require('../shared/typeset/diagnose.cjs');
const { THEMES, BLOG_KEYS } = require('../shared/typeset/themes.cjs');
const { formatMarkdown } = require('../shared/typeset/format.cjs');
const { themeStyle, styleLabel } = require('../plugin/wechat.js');

const SAMPLES = process.env.TYPESET_SAMPLES;
const real = SAMPLES && fs.existsSync(SAMPLES) ? fs.readdirSync(SAMPLES).filter(f => f.endsWith('.md')).map(f => ({ f, text: fs.readFileSync(path.join(SAMPLES, f), 'utf8') })) : [];

const fixed = s => applyPatch(s, normalize(s).lines);
/** 作者完整的一次整理：先手动规范标点，再由离开即整理收空白 */
const both = s => formatMarkdown(fixed(s)).replace(/\n$/, '');

// ============================================================
//  解析
// ============================================================
test('块行号是全文坐标（含 frontmatter 偏移）', () => {
  const md = '---\na: 1\n---\n第一段\n第二行\n\n## 标题\n\n> 引用一\n> 引用二\n\n- 列表\n  - 嵌套\n';
  const { blocks } = load(md);
  assert.deepStrictEqual(blocks.map(b => [b.type, b.line]), [['paragraph', 3], ['heading', 6], ['quote', 8], ['list', 11]]);
  assert.strictEqual(blocks[2].children[0].line, 8);
  const nested = [...walk(blocks)].filter(b => b.type === 'list');
  assert.strictEqual(nested[1].line, 12);
});

test('标题：去状态 emoji 与 MOC- 前缀，frontmatter title 优先', () => {
  assert.strictEqual(titleFromPath('a/⏸️ 朋友圈不是舞台.md'), '朋友圈不是舞台');
  assert.strictEqual(titleFromPath('MOC-Claude-稳定使用经验分享.md'), 'Claude-稳定使用经验分享');
  assert.strictEqual(titleFromPath('x.md', '---\ntitle: 真标题\n---\n'), '真标题');
});

// ============================================================
//  标点规范化（空格与空行归自动整理）
// ============================================================
test('标点规范化串上空白整理：常见修正', () => {
  const cases = [
    ['我用Claude写了3篇文章,效果很好!', '我用 Claude 写了 3 篇文章，效果很好！'],
    ['时间:20:00开始', '时间：20:00 开始'],
    ['他说"你好"然后走了', '他说“你好”然后走了'],
    ['等等...后来', '等等……后来'],
    ['恢复出厂设置的 Mac 、 iPhone 和安卓机', '恢复出厂设置的 Mac、iPhone 和安卓机'],
    ['工具(VoxTerra)很好', '工具（VoxTerra）很好'],
    ['**iPhone 12 mini** （没卡）', '**iPhone 12 mini**（没卡）'],
    ['**这是结论。**然后呢', '**这是结论**。然后呢'],
  ];
  for (const [a, b] of cases) assert.strictEqual(both(a), b, a);
});

test('标点规范化只管标点：不加中英文空格，不删空行，不动行尾两空格', () => {
  assert.strictEqual(fixed('我用Claude写了3篇,好'), '我用Claude写了3篇，好');
  assert.strictEqual(fixed('第一段\n\n\n\n第二段,好'), '第一段\n\n\n\n第二段，好');
  assert.strictEqual(fixed('硬换行,  \n下一行'), '硬换行，  \n下一行');
  assert.strictEqual(both('第一段\n\n\n\n第二段,好'), '第一段\n\n第二段，好');
});

test('标点规范化：不碰的东西', () => {
  const keep = ['`code,中文` 和 [链接](http://x.com/a,b)', '**01　权威原理**　_Authority_', 'See https://a.com/x,y 中文',
    'English sentence... and more', '「素材包」和“引语”各司其职'];
  for (const s of keep) assert.strictEqual(both(s), s, s);
});

test('标点规范化：被压平的多行原文只提醒、不合并空格', () => {
  const s = '我的朋友圈 · 9 月 30 日酒香不怕巷子深？ 小红书不允许个人售卖了， 早在半年前提醒过我， 整个互联网变现越来越规范';
  const r = normalize(s);
  assert.strictEqual(r.lines.length, 0);
  assert.ok(r.notes.some(n => n.rule.includes('压平')));
});

// ============================================================
//  渲染契约
// ============================================================
const SAMPLE = '## 小标题\n\n正文**重点**，见[链接](https://example.com/x)。\n第二行\n\n> **01　卡片**\n> 内容\n\n- 一\n  - 二\n\n![图](https://img.example.com/a.webp)\n> 图 1 · 图注\n\n· · ·\n';

test('公众号复制件：无 class、无 <style>、段落全内联样式、无 data-line', () => {
  for (const t of THEMES) {
    const { html } = renderWechat(SAMPLE, t, { mode: 'copy' });
    assert.ok(!/class=|<style|data-line/.test(html), t.id);
    const ps = html.match(/<p\b[^>]*>/g);
    assert.ok(ps.every(p => p.includes('style=')), t.id);
  }
});

test('公众号预览件：带 data-line，外链改文末注，分隔符居中', () => {
  const { html, todos } = renderWechat(SAMPLE, THEMES[0], { mode: 'preview', annotate: true });
  assert.ok(html.includes('data-line="0"'));
  assert.ok(!/<a\b/.test(html) && html.includes('↗1') && html.includes('文中链接'));
  assert.ok(/text-align:center;[^>]*letter-spacing:4px;">· · ·/.test(html));
  assert.ok(todos.some(t => t.includes('外链')));
});

test('X 复制件：只用 X 支持的标签，图片留占位', () => {
  const { html, todos } = renderX(SAMPLE, { mode: 'copy' });
  const tags = new Set((html.match(/<([a-z0-9]+)/g) || []).map(s => s.slice(1)));
  for (const tag of tags) assert.ok(['p', 'br', 'strong', 'em', 's', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'blockquote'].includes(tag), tag);
  assert.ok(html.includes('〔插图 1'));
  assert.ok(todos.some(t => t.includes('嵌套列表')));
});

test('模板里的填写说明（%%注释%%）不进预览与复制件', () => {
  const md = '---\nid: x\n---\n\n%%\n填写说明：subtitle 副标题\n%%\n\n正文';
  for (const t of THEMES) assert.ok(!renderWechat(md, t, { mode: 'copy' }).html.includes('填写说明'));
  assert.ok(!renderX(md, { mode: 'copy' }).html.includes('填写说明'));
});

// ============================================================
//  体检
// ============================================================
test('体检：多卡引用块、无图图注、平台备注、悬空引用、残留按钮字', () => {
  const md = '> **01　甲**\n> 原理\n>\n> **02　乙**\n> 原理\n\n> 图 1 · 没有图的图注\n\n**X 里在这里嵌入帖子**\n\n见⁠[12](#r12)。\n\n复制\n\n我在 X 上刷到一条帖子。\n';
  const kinds = diagnose(md).map(i => i.kind);
  for (const k of ['cards', 'caption', 'note', 'anchor', 'debris']) assert.ok(kinds.includes(k), k);
  assert.strictEqual(diagnose('我在 X 上刷到一条帖子。').length, 0);
});

// ============================================================
//  公众号草稿沿用预览风格
// ============================================================
test('没有单独排版配置时，草稿取预览风格的 7 个同名参数，弹窗说清来源', () => {
  const style = themeStyle('mo');
  assert.deepStrictEqual(Object.keys(style), BLOG_KEYS);
  assert.strictEqual(style.accent, THEMES.find(t => t.id === 'mo').accent);
  assert.deepStrictEqual(themeStyle('不存在'), themeStyle(THEMES[0].id));
  assert.match(styleLabel(style, { typeset: { theme: 'mo' } }), /「墨」/);
  assert.match(styleLabel({ fontSize: 15 }, { typeset: { theme: 'mo' } }), /笔记库/);
});

// ============================================================
//  作者真实文章（设置 TYPESET_SAMPLES 才跑）
// ============================================================
for (const { f, text } of real) {
  test('真实文章：' + f, () => {
    const t0 = Date.now();
    const wx = renderWechat(text, THEMES[2], { mode: 'preview', annotate: true });
    const x = renderX(text, { mode: 'copy' });
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 200, '渲染耗时 ' + elapsed + 'ms，实时预览要求 <200ms');
    assert.ok(wx.html.length > 1000 && x.html.length > 1000);
    assert.strictEqual(normalize(fixed(text)).lines.length, 0, '标点规范化应幂等');
    const tidy = formatMarkdown(text);
    assert.strictEqual(formatMarkdown(tidy), tidy, '空白整理应幂等');
    assert.ok(stats(text).chars > 1000);
    diagnose(text);
  });
}
