/**
 * [INPUT]: 依赖共享 Markdown 片段隔离、公开图片分类与 Node test
 * [OUTPUT]: 对外提供精确代码分隔符、容器围栏和私有图片分类的回归验证
 * [POS]: Markdown 与隐私边界的交叉回归；代码示例不能将专属附件变成公开资源
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { splitCode, stripComments } = require('../shared/markdown-parts.cjs');
const { publicSnapshot, localImageNames } = require('../web/scripts/public-content.cjs');
const { rewriteReaderImages } = require('../shared/reader-images.cjs');

test('行内代码只由相同长度反引号闭合，不改写其中的图片示例', () => {
  for (const source of ['`code `` ![](/images/private.png) code`', '``code ` ![](/images/private.png) code``']) {
    assert.equal(splitCode(source).filter(part => !part.code).map(part => part.text).join(''), '');
    assert.equal(rewriteReaderImages(source, new Set(['private.png']), 'token'), source);
  }
  const escaped = '\\` prose ![](/images/public.png) `';
  assert.equal(splitCode(escaped).filter(part => !part.code).map(part => part.text).join(''), escaped);
});

test('缩进和引用围栏中的图片语法保留原文，正文图片仍可采集', () => {
  const source = '    ![](/images/indented.png)\n\n> ```md\n> ![](/images/quoted.png)\n> ```\n\n![](/images/public.png)';
  assert.equal(splitCode(source).map(part => part.text).join(''), source);
  const prose = splitCode(source).filter(part => !part.code).map(part => part.text).join('');
  assert.equal(prose.includes('indented.png'), false);
  assert.equal(prose.includes('quoted.png'), false);
  assert.equal(prose.includes('public.png'), true);
});

test('%%注释%% 跨段落剥离，代码里的 %% 原样保留，未闭合注释到文末', () => {
  const source = '%%\n填写说明\n\n- subtitle：副标题\n%%\n\n正文 %%私语%% 继续\n\n`echo %%` 与\n\n```\n%% 代码 %%\n```\n';
  assert.equal(stripComments(source), '\n\n正文  继续\n\n`echo %%` 与\n\n```\n%% 代码 %%\n```\n');
  assert.equal(stripComments('前文\n%%\n没有收尾\n\n![](/images/private.png)'), '前文\n');
  assert.equal(stripComments('没有注释'), '没有注释');
});

test('公开代码示例引用同名私有图片不会将附件降为公开资源', () => {
  const protectedPost = { id: 'protected', password: 'secret', content: '![](/images/private.png)' };
  const publicPost = { id: 'public', password: '', content: '`code `` ![](/images/private.png) code`' };
  const source = { articles: [protectedPost, publicPost], books: [], products: [], allPosts: [protectedPost, publicPost], aboutStories: [], homeConfig: {}, collections: [] };
  const snapshot = publicSnapshot(source);
  assert.equal(snapshot.privateImages.has('private.png'), true);
  assert.equal(snapshot.publicImages.has('private.png'), false);
  assert.deepEqual([...localImageNames(publicPost.content)], []);
});

test('授权图片解析 query/fragment 和引用定义，外站同名路径保持原样', () => {
  const content = '![](/images/private.png?v=1#detail)\n\n![引用][private]\n[private]: /images/private.png?cache=2\n\n<img src="/images/private.png?v=3">\n\n![](https://remote.invalid/images/private.png)';
  const result = rewriteReaderImages(content, new Set(['private.png']), 'token');
  assert.match(result, /!\[\]\(\/api\/reader\/media\/token\/private.png#detail\)/);
  assert.match(result, /\[private\]: \/api\/reader\/media\/token\/private.png/);
  assert.match(result, /src="\/api\/reader\/media\/token\/private.png"/);
  assert.match(result, /!\[\]\(https:\/\/remote.invalid\/images\/private.png\)/);
  assert.equal(result.includes('?'), false);
});
