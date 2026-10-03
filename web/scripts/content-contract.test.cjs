/**
 * [INPUT]: 依赖 Node test/assert/fs、内容契约与构建前后脚本，使用临时生成的 Markdown 和图片
 * [OUTPUT]: 对外提供栏目/分类/元数据/图片映射、增删同步及失败阻断的自动验证
 * [POS]: 插件与网站之间的数据回归边界；所有测试内容在系统临时目录，不进入模板或 Git
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { COLLECTIONS, readContent, syncImages } = require('./content-contract.cjs');
const { publicSnapshot, assertPublicSnapshot } = require('./public-content.cjs');
const projectDir = path.resolve(__dirname, '..');

test('公开边界剔除密码和全文，共用图片保持公开，专属图片不进 JSON/RSS 或产物', t => {
  const { root, content, images, write } = fixture(t);
  write('2.深度长文/private.md', '---\nid: private\npassword: PRIVATE_PASSWORD_SENTINEL\nimage: "[[shared.webp]]"\n---\nPRIVATE_BODY_SENTINEL\n![[private.webp]]\n![[shared.webp]]\n');
  write('3.行者百书/public.md', '---\nid: public\n---\n公开内容\n![[shared.webp]]\n');
  for (const name of ['private.webp', 'shared.webp']) fs.writeFileSync(path.join(images, name), name);
  const { data, privateImages } = publicSnapshot(readContent(content));
  assert.equal(data.articles[0].content, ''); assert.equal(data.articles[0].isProtected, true);
  assert.equal(JSON.stringify(data).includes('PRIVATE_PASSWORD_SENTINEL'), false);
  assert.equal(JSON.stringify(data).includes('PRIVATE_BODY_SENTINEL'), false);
  assert.deepEqual([...privateImages], ['private.webp']);
  assert.throws(() => assertPublicSnapshot({ allPosts: [{ isProtected: true, content: 'leak' }] }), /正文/);
  assert.throws(() => assertPublicSnapshot({ allPosts: [{ password: 'leak' }] }), /密码/);
  const publicDir = path.join(root, 'public');
  const env = { ...process.env, BLOG_CONTENT_DIR: content, BLOG_IMAGES_DIR: images, BLOG_PUBLIC_DIR: publicDir, BLOG_BUILD_DIR: publicDir, BLOG_READER_ORIGIN: 'https://example.com' };
  const run = file => spawnSync(process.execPath, [`scripts/${file}.cjs`], { cwd: projectDir, env, encoding: 'utf8' });
  assert.equal(run('generate-data').status, 0);
  for (const name of ['blog-data.json', 'feed.xml']) {
    const value = fs.readFileSync(path.join(publicDir, name), 'utf8');
    assert.equal(value.includes('PRIVATE_BODY_SENTINEL'), false);
    assert.equal(value.includes('PRIVATE_PASSWORD_SENTINEL'), false);
  }
  assert.equal(fs.existsSync(path.join(publicDir, 'images/private.webp')), false);
  assert.equal(fs.existsSync(path.join(publicDir, 'images/shared.webp')), true);
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<html></html>');
  assert.equal(run('prepare-dist').status, 0);
  fs.writeFileSync(path.join(publicDir, 'images/private.webp'), 'leak');
  assert.notEqual(run('prepare-dist').status, 0);
  fs.unlinkSync(path.join(images, 'private.webp'));
  assert.notEqual(run('generate-data').status, 0);
});

test('首页和履历不能误用文章保护字段', t => {
  const { content, write } = fixture(t);
  const home = write('1.首页/home.md', '---\nid: home\npassword: test\n---\n');
  assert.throws(() => readContent(content), /首页配置不支持密码/); fs.unlinkSync(home);
  write('5.关于/about.md', '---\nid: about\npassword: test\n---\n');
  assert.throws(() => readContent(content), /人生履历不支持密码/);
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-contract-'));
  const content = path.join(root, 'content');
  const images = path.join(root, 'images');
  fs.mkdirSync(images);
  for (const config of Object.values(COLLECTIONS)) fs.mkdirSync(path.join(content, config.folder), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relative, body) => {
    const file = path.join(content, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body);
    return file;
  };
  return { root, content, images, write };
}

test('文件夹和元数据映射：五类目录、稳定 id、数值字段、日期和 Wiki 图片', t => {
  const { content, write } = fixture(t);
  write('1.首页/home.md', '---\nid: home\nheroTitle: 测试作者\nheroImage: "[[头像.png]]"\nheroPortrait: "[[图片/人像.webp]]"\nsocialLinks:\n  github: https://github.com/example\n---\n');
  write('2.深度长文/新分类/改名后的文章.md', '---\nid: stable-001\ntitle: 正文标题\nsubtitle: 副标题\ndescription: 简介\ndate: "2026-10-02"\ntags: [AI, 写作]\nimage: "[[图片/封 面.webp]]"\n---\n## 思考\n![[图片/封 面.webp|640]]\n');
  write('3.行者百书/book.md', '---\nid: book-001\ncategory: 经济学\nisbn: "0012345678901"\nrating: 8.5\nauthor: 作者\npublisher: 出版社\nreadDate: "2026-09-30"\ndoubanUrl: https://book.douban.com/example\n---\n读书笔记');
  write('4.产品列表/product.md', '---\nid: product-001\nprice: 99\nlink: https://example.com/buy\nvideoUrl: https://example.com/video\ndate: 2026-10-01\n---\n产品介绍');
  write('5.关于/经历.md', '---\nid: life-001\ntitle: 人生经历\ndate: "2020-01-01"\n---\n我的经历');
  write('2.深度长文/CLAUDE.md', '# 地图不是文章');
  const data = readContent(content);
  assert.equal(data.allPosts.length, 3);
  assert.deepEqual(data.allPosts.map(post => post.type), ['LONG_READ', 'BOOK_NOTE', 'PRODUCT']);
  const article = data.articles[0];
  assert.equal(article.id, 'stable-001'); assert.equal(article.title, '正文标题');
  assert.equal(article.category, '新分类'); assert.equal(article.date, '2026-10-02');
  assert.deepEqual(article.tags, ['AI', '写作']);
  assert.equal(article.cover, '/images/%E5%B0%81%20%E9%9D%A2.webp');
  assert.match(article.content, /!\[\]\(\/images\/%E5%B0%81%20%E9%9D%A2.webp\)/);
  assert.equal(data.books[0].isbn, '0012345678901'); assert.equal(data.books[0].rating, 8.5);
  assert.equal(data.products[0].price, '99'); assert.equal(data.products[0].buyUrl, 'https://example.com/buy');
  assert.equal(data.products[0].launchDate, '2026-10-01');
  assert.equal(data.aboutStories[0].id, 'life-001'); assert.equal(data.homeConfig.heroImage, '/images/%E5%A4%B4%E5%83%8F.png');
});

test('新增、修改、移动和删除：分类与内容由当前文件生成，不保留旧记录', t => {
  const { content, write } = fixture(t);
  assert.equal(readContent(content).allPosts.length, 0);
  const old = write('2.深度长文/甲类/文章.md', '---\nid: stable\n---\n第一版');
  assert.equal(readContent(content).articles[0].category, '甲类');
  const next = write('2.深度长文/乙类/新标题.md', '---\nid: stable\ncategory: 元数据分类\n---\n第二版');
  fs.unlinkSync(old);
  const updated = readContent(content).articles[0];
  assert.equal(updated.id, 'stable'); assert.equal(updated.title, '新标题');
  assert.equal(updated.category, '元数据分类'); assert.match(updated.content, /第二版/);
  fs.unlinkSync(next);
  assert.equal(readContent(content).allPosts.length, 0);
});

test('重复 id、无效字段及重复首页配置阻止生成', t => {
  const { content, write } = fixture(t);
  const article = write('2.深度长文/a.md', '---\nid: same\n---\n正文');
  const duplicate = write('3.行者百书/b.md', '---\nid: same\n---\n正文');
  assert.throws(() => readContent(content), /id 重复/); fs.unlinkSync(duplicate);
  for (const [yaml, message] of [['tags: AI', /tags/], ['date: "不是日期"', /日期/], ['date: "2026-02-31"', /日期不存在/], ['date: 123', /日期/], ['rating: 11', /rating/], ['title: [a, b]', /title/]]) {
    fs.writeFileSync(article, `---\n${yaml}\n---\n正文`);
    assert.throws(() => readContent(content), message);
  }
  fs.unlinkSync(article);
  write('1.首页/a.md', '---\nid: home\n---\n'); write('1.首页/b.md', '---\nid: home\n---\n');
  assert.throws(() => readContent(content), /首页配置重复/);
});

test('图片同步：支持子目录，镜像删除旧图片，重复文件名失败时保留原目标', t => {
  const { root, images } = fixture(t);
  const target = path.join(root, 'output');
  fs.mkdirSync(path.join(images, 'nested')); fs.writeFileSync(path.join(images, 'nested/a.webp'), 'image');
  syncImages(images, target); assert.equal(fs.readFileSync(path.join(target, 'a.webp'), 'utf8'), 'image');
  fs.writeFileSync(path.join(images, 'a.webp'), 'duplicate');
  assert.throws(() => syncImages(images, target), /图片文件名重复/);
  assert.equal(fs.readFileSync(path.join(target, 'a.webp'), 'utf8'), 'image');
  fs.unlinkSync(path.join(images, 'a.webp')); fs.unlinkSync(path.join(images, 'nested/a.webp'));
  syncImages(images, target); assert.deepEqual(fs.readdirSync(target), []);
});

test('完整生成链：外部数据、图片、域名、RSS、安全转义与缺图阻断', t => {
  const { root, content, images, write } = fixture(t);
  const publicDir = path.join(root, 'public');
  write('2.深度长文/a.md', '---\nid: stable\ntitle: "标题 ]]> 结尾"\nimage: "[[封面.png]]"\ndate: "2026-10-02"\n---\n![[封面.png]]\n');
  fs.writeFileSync(path.join(images, '封面.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  const env = { ...process.env, BLOG_CONTENT_DIR: content, BLOG_IMAGES_DIR: images, BLOG_PUBLIC_DIR: publicDir, BLOG_BUILD_DIR: publicDir, SITE_ORIGIN: 'https://example.com', BLOG_RELEASE_ID: 'test-release', BLOG_CONTENT_VERSION: 'test-content' };
  const generate = spawnSync(process.execPath, ['scripts/generate-data.cjs'], { cwd: projectDir, env, encoding: 'utf8' });
  assert.equal(generate.status, 0, generate.stderr);
  const data = JSON.parse(fs.readFileSync(path.join(publicDir, 'blog-data.json')));
  assert.equal(data.siteOrigin, 'https://example.com'); assert.equal(data.allPosts[0].id, 'stable');
  const rss = fs.readFileSync(path.join(publicDir, 'feed.xml'), 'utf8');
  assert.match(rss, /https:\/\/example.com\/#\/post\/stable/); assert.match(rss, /\]\]\]\]><!\[CDATA\[>/);
  assert.match(rss, /src="https:\/\/example.com\/images\//);
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(publicDir, '.DS_Store'), 'private file list');
  fs.writeFileSync(path.join(publicDir, 'CLAUDE.md'), 'private map');
  const prepare = () => spawnSync(process.execPath, ['scripts/prepare-dist.cjs'], { cwd: projectDir, env, encoding: 'utf8' });
  assert.equal(prepare().status, 0);
  assert.equal(fs.existsSync(path.join(publicDir, '.DS_Store')), false);
  assert.equal(fs.existsSync(path.join(publicDir, 'CLAUDE.md')), false);
  const info = JSON.parse(fs.readFileSync(path.join(publicDir, 'deploy-info.json')));
  assert.equal(info.posts, 1); assert.equal(info.releaseId, 'test-release'); assert.equal(info.contentVersion, 'test-content');
  fs.unlinkSync(path.join(publicDir, 'images/封面.png'));
  assert.notEqual(prepare().status, 0);
});

test('服务器发布链：外部内容新增/删除、双站同版本与 1Panel 镜像保留验证目录', t => {
  const { root, content, images, write } = fixture(t);
  const site = path.join(root, 'site');
  const releases = path.join(root, 'releases');
  fs.mkdirSync(path.join(site, '.well-known'), { recursive: true });
  fs.writeFileSync(path.join(site, '.blog-template-site'), 'blog-zhaozimin-static-site\n');
  fs.writeFileSync(path.join(site, '.well-known/check'), 'verification');
  const note = write('2.深度长文/AI/文章.md', '---\nid: server-publish\nimage: "[[cover.svg]]"\n---\n## 文章正文\n');
  fs.writeFileSync(path.join(images, 'cover.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#eee"/></svg>');
  const env = { ...process.env, BLOG_CONTENT_DIR: content, BLOG_IMAGES_DIR: images, BLOG_RELEASES_DIR: releases, BLOG_CN_ROOT: site };
  const publish = () => spawnSync(process.execPath, ['scripts/publish.cjs', 'cn'], { cwd: projectDir, env, encoding: 'utf8' });
  const first = publish(); assert.equal(first.status, 0, `${first.stderr}\n${first.stdout}`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(site, 'blog-data.json'))).allPosts[0].category, 'AI');
  const release = fs.readdirSync(releases).find(name => !name.startsWith('.'));
  const cn = JSON.parse(fs.readFileSync(path.join(releases, release, 'cn/deploy-info.json')));
  const com = JSON.parse(fs.readFileSync(path.join(releases, release, 'com/deploy-info.json')));
  assert.equal(cn.releaseId, com.releaseId); assert.equal(cn.contentVersion, com.contentVersion);
  assert.notEqual(cn.siteOrigin, com.siteOrigin); assert.equal(cn.posts, 1);
  fs.unlinkSync(note); fs.unlinkSync(path.join(images, 'cover.svg'));
  const second = publish(); assert.equal(second.status, 0, `${second.stderr}\n${second.stdout}`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(site, 'blog-data.json'))).allPosts.length, 0);
  assert.equal(fs.existsSync(path.join(site, 'images/cover.svg')), false);
  assert.equal(fs.readFileSync(path.join(site, '.well-known/check'), 'utf8'), 'verification');
  assert.equal(fs.existsSync(path.join(releases, '.publish.lock')), false);
});

test('目录真源：栏目改名保留身份，配置不进入文章，分类服从子目录', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-catalog-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relative, content) => { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; };
  write('1.开始/_栏目.md', '---\nid: home\nkind: config\n---\n');
  write('1.开始/home.md', '---\nid: home\nheroTitle: 标题来自笔记\n---\n');
  write('1.开始/站点设置.md', '---\nid: site\nname: 我的网站\nauthor: 作者\nrssTitle: RSS 来自笔记\n---\n');
  write('3.阅读思考/_栏目.md', '---\nid: books\nkind: book\npromise: 介绍来自笔记\n---\n');
  write('3.阅读思考/经济学/一篇.md', '---\nid: stable-book\ncategory: 过期分类\n---\n正文');
  write('5.成长/_栏目.md', '---\nid: about\nkind: about\n---\n');
  let data = readContent(root);
  assert.equal(data.books.length, 1); assert.equal(data.aboutStories.length, 0);
  assert.equal(data.books[0].category, '经济学');
  assert.equal(data.siteConfig.name, '我的网站');
  assert.equal(data.collections.find(item => item.id === 'books').promise, '介绍来自笔记');
  const before = data.books[0];
  fs.renameSync(path.join(root, '3.阅读思考'), path.join(root, '8.阅读生活'));
  data = readContent(root);
  assert.deepEqual(data.books[0], before);
  assert.equal(data.collections.find(item => item.id === 'books').label, '阅读生活');
  assert.equal(data.collections.find(item => item.id === 'books').path, '/books');
  write('漏掉配置/文章.md', '---\nid: hidden\n---\n');
  assert.throws(() => readContent(root), /未声明/);
});

// ===== 空发行模板允许先上传框架；真实内容要求填写站点身份 =====
test('空初始化可发布，新增文章后必须填写站点名称与作者', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-vault-contract-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { templates } = require('../../plugin/templates.js');
  for (const item of templates()) { const file = path.join(root, item.path); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, item.content); }
  assert.equal(readContent(root).allPosts.length, 0);
  fs.writeFileSync(path.join(root, '2.深度长文/测试.md'), '---\nid: blank-site-test\ntitle: 测试\ndate: 2026-10-03\n---\n正文');
  assert.throws(() => readContent(root), /站点名称和作者/);
});
