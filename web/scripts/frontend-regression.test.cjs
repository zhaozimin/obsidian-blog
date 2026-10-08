/**
 * [INPUT]: 依赖 Node 测试运行器、esbuild、React SSR 与实际前端模块
 * [OUTPUT]: 对外提供前端安全、快照并发、布尔置顶与四席排序/链接、授权 URL、X 帖子嵌入、Markdown 和搜索回归验收
 * [POS]: 浏览器行为的纯数据/渲染契约验证；临时构造笔记，不读取个人内容，不改写正式 UI
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');
const root = path.resolve(__dirname, '..');
function frontend(entry) {
  const { outputFiles } = buildSync({ entryPoints: [path.join(root, 'src', entry)], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom', 'react-router-dom'], loader: { '.css': 'empty' }, logLevel: 'silent' });
  const loaded = new Module(path.join(__dirname, `regression-${entry.replace(/\W/g, '-')}.cjs`), module);
  loaded.filename = loaded.id;
  loaded.paths = module.paths;
  loaded._compile(outputFiles[0].text, loaded.filename);
  return loaded.exports;
}
const post = (extra = {}) => ({ id: 'test', type: 'LONG_READ', title: '测试', description: '简介', category: '', tags: [], date: '2026-10-03', content: '可读正文。', ...extra });
const fixture = extra => ({ allPosts: [post()], collections: [], homeConfig: {}, siteConfig: {}, ...extra });
const render = nodes => renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement('div', {}, nodes)));

test('URL 白名单阻断可执行协议、控制字符与 URL 凭据，密码仅发往 HTTPS/环回', () => {
  const { safeLinkUrl, safeImageUrl, readerServiceOrigin } = frontend('lib/url.ts');
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'vbscript:bad', 'java\tscript:bad', 'https://user:secret@example.com']) assert.equal(safeLinkUrl(value), '');
  assert.equal(safeImageUrl('mailto:a@example.com'), '');
  for (const value of ['/images/a.png?size=2', 'https://example.com/a_b', 'mailto:a@example.com']) assert.equal(safeLinkUrl(value), value);
  assert.equal(readerServiceOrigin('https://reader.example.com/path?q=1'), 'https://reader.example.com');
  assert.equal(readerServiceOrigin('http://[::1]:3000'), 'http://[::1]:3000');
  assert.throws(() => readerServiceOrigin('http://example.com'), /HTTPS/);
  assert.throws(() => readerServiceOrigin('https://user:pass@example.com'), /HTTPS/);
});

test('网络快照拒绝结构错误，并隔离保护正文和危险链接', () => {
  const { normalizeSnapshot } = frontend('lib/snapshot.ts');
  for (const input of [null, [], { allPosts: {} }, { allPosts: [null] }, { allPosts: [post({ type: 'BAD' })] }]) assert.throws(() => normalizeSnapshot(input));
  const data = normalizeSnapshot(fixture({ allPosts: [post({ isProtected: true, content: '私密正文', buyUrl: 'javascript:bad', cover: 'data:text/html,bad', rating: Infinity })] }));
  assert.equal(data.allPosts[0].content, ''); assert.equal(data.allPosts[0].buyUrl, ''); assert.equal(data.allPosts[0].cover, ''); assert.equal(data.allPosts[0].rating, undefined);
  assert.equal(data.homeConfig.heroSubtitle, '');
  assert.throws(() => normalizeSnapshot(fixture({ allPosts: [post(), post()] })), /重复/);
});

test('并发消费者只加载一份快照，失败后可以重试', async () => {
  const before = global.fetch;
  try {
    let calls = 0, finish;
    global.fetch = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
    const data = frontend('lib/markdown.ts');
    const waiting = [data.getAllPosts(), data.getHomeConfig(), data.prepareSite()];
    assert.equal(calls, 1);
    finish(new Response(JSON.stringify(fixture()), { status: 200 }));
    const values = await Promise.all(waiting); assert.equal(values[0][0].title, '测试'); assert.equal(calls, 1);
    const retry = frontend('lib/markdown.ts'); calls = 0;
    global.fetch = async () => { calls++; return calls === 1 ? new Response('', { status: 503 }) : new Response(JSON.stringify(fixture())); };
    await assert.rejects(retry.prepareSite());
    assert.equal((await retry.getAllPosts()).length, 1); assert.equal(calls, 2);
  } finally { global.fetch = before; }
});

test('阅读能力只改写相对图片路径，绝对地址保持完整，异常 JSON 给出可读错误', async () => {
  const before = global.fetch;
  try {
    const origin = 'https://reader.example.com';
    const content = `![图](/api/reader/media/token.1/file.png)\n![图](${origin}/api/reader/media/token.1/file.png)`;
    let calls = 0;
    global.fetch = async () => new Response(JSON.stringify(++calls === 1 ? fixture({ readerOrigin: origin }) : { content }));
    const { unlockPost } = frontend('lib/reader.ts');
    const result = await unlockPost('test', 'password', new AbortController().signal);
    assert.equal(result, content.replace('](/api/', `](${origin}/api/`));
    global.fetch = async () => new Response('null');
    await assert.rejects(unlockPost('test', 'password', new AbortController().signal), /返回异常/);
    global.fetch = async () => new Response('{broken');
    await assert.rejects(unlockPost('test', 'password', new AbortController().signal), /返回异常/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(unlockPost('test', 'password', controller.signal), { name: 'AbortError' });
  } finally { global.fetch = before; }
});

test('行内链接保留 URL 语法，嵌入图片优先于 Wiki 链接，HTML 与危险协议不可执行', () => {
  const { createInlineRenderer } = frontend('pages/post-detail/inline.tsx');
  const inline = createInlineRenderer([post()], () => {});
  let html = render(inline('[**链接**](https://example.com/a_b?q=a*b) ![[图片.png]] [[测试]]'));
  assert.match(html, /href="https:\/\/example.com\/a_b\?q=a\*b"/); assert.match(html, /<strong[^>]*>链接/);
  assert.match(html, /src="\/images\/图片.png"/); assert.match(html, /href="\/post\/test"/);
  html = render(inline('[坏链接](javascript:alert%281%29) <img src=x onerror=alert(1)>'));
  assert.doesNotMatch(html, /href=|<img/); assert.match(html, /&lt;img/);
  html = render(inline('`**原样**` ==高亮== ~~删除~~'));
  assert.match(html, /<code[^>]*>\*\*原样\*\*/); assert.match(html, /<mark[^>]*>高亮/); assert.match(html, /<del[^>]*>删除/);
});

test('X status 图片语法转为官方嵌入容器，相似域名与非帖子路径仍按普通图片处理', () => {
  const { readXPostUrl } = frontend('pages/post-detail/XPostEmbed.tsx');
  assert.deepEqual(readXPostUrl('https://x.com/dontbesilent/status/2016219673453592696?s=20'), {
    id: '2016219673453592696', url: 'https://x.com/dontbesilent/status/2016219673453592696',
  });
  assert.equal(readXPostUrl('https://x.com.evil.example/name/status/123'), null);
  assert.equal(readXPostUrl('https://x.com/name/article/123'), null);

  const { createContentRenderer } = frontend('pages/post-detail/content.tsx');
  const content = '![](https://x.com/dontbesilent/status/2016219673453592696?s=20)';
  const html = render(createContentRenderer({ post: post({ content }), isUnlocked: true, allPostsList: [], openImage() {}, onUnlock() {} })(content));
  assert.match(html, /class="blog-x-embed"/);
  assert.match(html, /href="https:\/\/x\.com\/dontbesilent\/status\/2016219673453592696"/);
  assert.doesNotMatch(html, /<img|<figcaption/);
});

test('正文与目录共享唯一标题身份，长/波浪围栏中的标题不产生锚点', () => {
  const { extractHeadings } = frontend('lib/markdown.ts');
  const { createContentRenderer } = frontend('pages/post-detail/content.tsx');
  const content = '# 重复\n# 重复\n# 重复-1\n~~~~ text\n# 示例\n```\n~~~~\n## 下一段 ###\n> [!note]\n> ### 引用标题';
  const headings = extractHeadings(content);
  assert.equal(extractHeadings('# C#')[0].text, 'C#');
  assert.deepEqual(extractHeadings('> # 普通引用\n\n# 实际标题').map(item => item.text), ['实际标题']);
  assert.deepEqual(headings.map(item => item.id), ['重复', '重复-1', '重复-1-1', '下一段', '引用标题']);
  const html = render(createContentRenderer({ post: post({ content }), isUnlocked: true, allPostsList: [], openImage() {}, onUnlock() {} })(content));
  for (const heading of headings) assert.match(html, new RegExp(`id="${heading.id}"`));
  assert.doesNotMatch(html, /id="示例"/);
  const locked = render(createContentRenderer({ post: post({ isProtected: true }), isUnlocked: false, allPostsList: [], openImage() {}, onUnlock() {} })('泄漏正文'));
  assert.doesNotMatch(locked, /泄漏正文/); assert.match(locked, /输入阅读密码/);
});

test('代码语言始终是文本节点，原始 HTML 标签不会注入复制按钮', () => {
  const { createContentRenderer } = frontend('pages/post-detail/content.tsx');
  const content = '```<img src=x onerror=alert(1)>\nconst x = 1;\n```';
  const html = render(createContentRenderer({ post: post(), isUnlocked: true, allPostsList: [], openImage() {}, onUnlock() {} })(content));
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img/);
});

test('搜索只命中可读正文，图片地址与保护正文不进入索引', () => {
  const { createSearchIndex, searchPosts } = frontend('lib/search.ts');
  const index = createSearchIndex([post({ content: '可读句子。\n![封面](/secret-resource.png)\n[名字](https://example.com/secret-resource)' }), post({ id: 'locked', isProtected: true, content: '私密句子' })]);
  assert.equal(searchPosts(index, '可读句子').length, 1); assert.equal(searchPosts(index, 'secret-resource').length, 0); assert.equal(searchPosts(index, '私密句子').length, 0);
});


test('引用式图片和链接跨段读取 definitions，围栏内相同语法仍为代码', () => {
  const { createContentRenderer } = frontend('pages/post-detail/content.tsx');
  const content = '![图][asset]\n\n[链接][site]\n\n[asset]: /images/image%20name.png?version=2\n[site]: https://example.com/a_b\n\n```md\n![图][asset]\n```';
  const html = render(createContentRenderer({ post: post({ content }), isUnlocked: true, allPostsList: [], openImage() {}, onUnlock() {} })(content));
  assert.match(html, /src="\/images\/image%20name.png\?version=2"/);
  assert.match(html, /href="https:\/\/example.com\/a_b"/);
  assert.equal((html.match(/<img/g) || []).length, 1);
  assert.match(html, /!\[图\]\[asset\]/);
  assert.doesNotMatch(html, /\[asset\]:/);
});


test('Wiki 图片块和行内嵌入遵守段落 DOM 边界', () => {
  const { createContentRenderer } = frontend('pages/post-detail/content.tsx');
  const content = '![[file.png]]\n\n文字 ![[another.png]] 文字';
  const html = render(createContentRenderer({ post: post({ content }), isUnlocked: true, allPostsList: [], openImage() {}, onUnlock() {} })(content));
  assert.doesNotMatch(html, /<p[^>]*>\s*<figure/);
  assert.match(html, /<figure[^>]*><img/);
  assert.match(html, /<p[^>]*>文字 <img/);
});


test('UI 校验拒绝未登记源码、重复覆盖与文件改动', () => {
  const fs = require('node:fs'), os = require('node:os'), crypto = require('node:crypto');
  const { spawnSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-ui-audit-'));
  try {
    fs.mkdirSync(path.join(directory, 'scripts')); fs.mkdirSync(path.join(directory, 'src'));
    fs.copyFileSync(path.join(__dirname, 'check-ui-baseline.cjs'), path.join(directory, 'scripts/check-ui-baseline.cjs'));
    fs.writeFileSync(path.join(directory, 'src/app.ts'), 'export const test = true;');
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, 'src/app.ts'))).digest('hex');
    const baseline = { files: { 'src/app.ts': hash }, extensions: {} };
    const check = () => { fs.writeFileSync(path.join(directory, 'ui-baseline.json'), JSON.stringify(baseline)); return spawnSync(process.execPath, [path.join(directory, 'scripts/check-ui-baseline.cjs')], { encoding: 'utf8' }); };
    assert.equal(check().status, 0);
    fs.writeFileSync(path.join(directory, 'src/new.tsx'), 'export default function New(){}');
    assert.match(check().stderr, /未登记/); fs.unlinkSync(path.join(directory, 'src/new.tsx'));
    baseline.extensions['src/app.ts'] = hash; assert.match(check().stderr, /重复登记/); delete baseline.extensions['src/app.ts'];
    fs.appendFileSync(path.join(directory, 'src/app.ts'), '\nexport const changed = true;'); assert.equal(check().status, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});


test('HTML 包装中的 Markdown 图片保持字面，与公开资源扫描一致', () => {
  const { createContentRenderer } = frontend('pages/post-detail/content.tsx');
  const content = '<div>\n![不可见资源](/images/private.png)\n</div>\n\n![真实图片](/images/public.png)';
  const html = render(createContentRenderer({ post: post({ content }), isUnlocked: true, allPostsList: [], openImage() {}, onUnlock() {} })(content));
  assert.match(html, /&lt;div&gt;/);
  assert.match(html, /!\[不可见资源\]\(\/images\/private.png\)/);
  assert.doesNotMatch(html, /src="\/images\/private.png"/);
  assert.match(html, /src="\/images\/public.png"/);
});

if (require('node:fs').existsSync(path.join(root, 'src/pages/post-detail/math.tsx'))) test('公开版公式与表格扩展仍使用 KaTeX 和安全行内链接', () => {
  const { createContentRenderer } = frontend('pages/post-detail/content.tsx');
  const content = '$x^2$\n\n| 标题 | 数值 |\n| --- | --- |\n| [链接](https://example.com/a_b) | 1 |';
  const html = render(createContentRenderer({ post: post({ content }), isUnlocked: true, allPostsList: [], openImage() {}, onUnlock() {} })(content));
  assert.match(html, /class="katex"/); assert.match(html, /<table>/); assert.match(html, /href="https:\/\/example.com\/a_b"/);
});


test('缩进代码内的媒体语法不渲染资源，与 marked 扫描边界一致', () => {
  const { createContentRenderer } = frontend('pages/post-detail/content.tsx');
  const content = '    ![代码资源](/images/private.png)\n    [a]: /images/private.png\n\n正常正文。\n\n![真实图片](/images/public.png)';
  const html = render(createContentRenderer({ post: post({ content }), isUnlocked: true, allPostsList: [], openImage() {}, onUnlock() {} })(content));
  assert.match(html, /!\[代码资源\]\(\/images\/private.png\)/);
  assert.doesNotMatch(html, /src="\/images\/private.png"/);
  assert.match(html, /正常正文/); assert.match(html, /src="\/images\/public.png"/);
});


test('每栏目只选最新四篇置顶，封面与列表共用身份，超额勾选与原数组保持不变', () => {
  const { collectionPosts } = frontend('lib/collection.ts');
  const data = Array.from({ length: 6 }, (_, index) => post({ id: `pin-${index}`, collectionId: 'test', pinned: true, date: `2026-10-0${index + 1}`, cover: '/shared.png' }));
  data.push(post({ id: 'new-normal', collectionId: 'test', date: '2026-10-09' }), post({ id: 'other-column', collectionId: 'other', pinned: true, date: '2026-10-10' }));
  const original = JSON.stringify(data), view = collectionPosts(data, 'test');
  assert.deepEqual(view.pinned.map(post => post.id), ['pin-5', 'pin-4', 'pin-3', 'pin-2']);
  assert.deepEqual(view.ordered.map(post => post.id), ['pin-5', 'pin-4', 'pin-3', 'pin-2', 'new-normal', 'pin-1', 'pin-0']);
  assert.equal(JSON.stringify(data), original);
  assert.equal(view.pinnedIds.has('pin-1'), false);
  data[5].pinned = false;
  assert.deepEqual(collectionPosts(data, 'test').pinned.map(post => post.id), ['pin-4', 'pin-3', 'pin-2', 'pin-1']);
  assert.equal(collectionPosts(data, 'empty').pinned.length, 0);
});

test('网络置顶字段不做真值强转，旧数据兼容，封面链接按文章身份生成且没有构图文字', () => {
  const { normalizeSnapshot } = frontend('lib/snapshot.ts');
  assert.equal(normalizeSnapshot(fixture()).allPosts[0].pinned, false);
  assert.equal(normalizeSnapshot(fixture({ allPosts: [post({ pinned: true })] })).allPosts[0].pinned, true);
  for (const pinned of ['true', 'false', 1, []]) assert.throws(() => normalizeSnapshot(fixture({ allPosts: [post({ pinned })] })), /pinned.*布尔值/);
  const { CollectionHero } = frontend('components/CollectionHero.tsx');
  const collection = { id: 'test', type: 'LONG_READ', label: '测试栏目', topics: [], art: { primary: '禁止出现的构图文案' } };
  const html = render(React.createElement(CollectionHero, { collection, pinnedPosts: [post({ id: 'one', cover: '/shared.png' }), post({ id: 'two', cover: '/shared.png' }), post({ id: 'no-cover' })] }));
  assert.match(html, /href="\/post\/one"/); assert.match(html, /href="\/post\/two"/);
  assert.doesNotMatch(html, /禁止出现的构图文案|href="\/post\/no-cover"|aria-hidden="true"/);
  assert.match(html, /aria-label="阅读：测试"/);
});
