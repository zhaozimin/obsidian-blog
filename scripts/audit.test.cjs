/**
 * [INPUT]: 依赖 Node test、子进程和隔离的临时安装目录
 * [OUTPUT]: 验证真实路径、已有栏目、私有配置解析、安装预检与公开源码拒绝规则
 * [POS]: 首次安装和公开发行的回归边界，不接触用户真实笔记或运行目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-install-audit-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const code = path.join(base, 'code'), vault = path.join(base, 'vault'), local = path.join(base, 'runtime');
  fs.mkdirSync(path.join(code, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(code, 'shared'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '../shared/property-types.cjs'), path.join(code, 'shared/property-types.cjs'));
  for (const file of ['setup.cjs', 'install.cjs', 'local-runtime.cjs', 'check-public.cjs']) fs.copyFileSync(path.join(__dirname, file), path.join(code, 'scripts', file));
  const write = (file, content) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
  write(path.join(code, 'vault-template/.obsidian/plugins/blog-publisher/main.js'), 'new plugin');
  write(path.join(code, 'vault-template/blog-V3/1.首页/_栏目.md'), 'empty template');
  for (const file of ['main.js', 'manifest.json', 'styles.css']) write(path.join(code, 'dist', file), `new ${file}`);
  const run = (script, args = [], env = {}) => spawnSync(process.execPath, [path.join(code, 'scripts', script), ...args], { env: { ...process.env, BLOG_LOCAL_DIR: local, ...env }, encoding: 'utf8' });
  return { base, code, vault, local, write, run };
}
test('安装保留已改名的栏目，带引号密钥按环境语法解析，配置权限收紧', t => {
  const f = fixture(t), key = 'synthetic-quoted-key'.repeat(2);
  f.write(path.join(f.vault, 'blog-V3/自定义栏目/_栏目.md'), 'existing collection');
  f.write(path.join(f.local, 'server.env'), `BLOG_RECEIVER_KEY="${key}"\n`);
  f.write(path.join(f.vault, '.obsidian/types.json'), JSON.stringify({ types: { price: 'text' }, retained: 1 }));
  const result = f.run('setup.cjs', ['--vault', f.vault, '--local']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(f.vault, 'blog-V3/1.首页')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.vault, '.obsidian/plugins/blog-publisher/data.json'))).secretKey, key);
  assert.equal(fs.statSync(path.join(f.local, 'server.env')).mode & 0o777, 0o600);
  assert.equal(f.run('setup.cjs', ['--vault', f.vault, '--local']).status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.vault, '.obsidian/types.json'))), { types: { price: 'text', pinned: 'checkbox' }, retained: 1 });
});
test('源码别名和库内符号链接不能将运行数据或插件写回源码', t => {
  const f = fixture(t), alias = path.join(f.base, 'source-alias');
  fs.symlinkSync(f.code, alias);
  assert.notEqual(f.run('setup.cjs', ['--vault', path.join(alias, 'new-vault')]).status, 0);
  assert.notEqual(f.run('local-runtime.cjs', [], { BLOG_LOCAL_DIR: path.join(alias, 'runtime') }).status, 0);
  const rootDirectory = f.run('local-runtime.cjs', [], { BLOG_LOCAL_DIR: path.parse(f.base).root });
  assert.notEqual(rootDirectory.status, 0); assert.ok(rootDirectory.stderr.includes('源码'));
  fs.mkdirSync(f.vault);
  fs.symlinkSync(f.code, path.join(f.vault, '.obsidian'));
  assert.notEqual(f.run('setup.cjs', ['--vault', f.vault]).status, 0);
  assert.equal(fs.existsSync(path.join(f.code, 'plugins')), false);
  fs.rmSync(path.join(f.vault, '.obsidian'));
  fs.symlinkSync(path.join(f.code, 'vault-template/blog-V3'), path.join(f.vault, 'blog-V3'));
  assert.notEqual(f.run('setup.cjs', ['--vault', f.vault]).status, 0);
});
test('安装先校验全部文件，拒绝文件符号链接，完整更新保留设置与备份', t => {
  const f = fixture(t), plugin = path.join(f.base, 'plugin'), archive = path.join(f.base, 'backup');
  f.write(path.join(plugin, 'main.js'), 'old main');
  f.write(path.join(plugin, 'data.json'), 'private settings');
  fs.rmSync(path.join(f.code, 'dist/styles.css'));
  assert.notEqual(f.run('install.cjs', [plugin, archive]).status, 0);
  assert.equal(fs.readFileSync(path.join(plugin, 'main.js'), 'utf8'), 'old main');
  assert.equal(fs.existsSync(archive), false);
  f.write(path.join(f.code, 'dist/styles.css'), 'new styles');
  fs.symlinkSync(path.join(f.base, 'does-not-exist'), path.join(plugin, 'styles.css'));
  assert.notEqual(f.run('install.cjs', [plugin, archive]).status, 0);
  fs.rmSync(path.join(plugin, 'styles.css'));
  assert.equal(f.run('install.cjs', [plugin, archive]).status, 0);
  assert.equal(fs.readFileSync(path.join(archive, 'main.js'), 'utf8'), 'old main');
  assert.equal(fs.readFileSync(path.join(plugin, 'data.json'), 'utf8'), 'private settings');
});
test('公开检查拒绝环境文件变体、运行配置与符号链接而不输出内容', t => {
  const f = fixture(t);
  fs.rmSync(path.join(f.code, 'vault-template'), { recursive: true });
  for (const name of ['.env.production', '.dev.vars', 'server.env', 'cloudflare.json', 'workspace-mobile.json']) f.write(path.join(f.code, name), 'synthetic-private-value');
  fs.symlinkSync(path.join(f.base, 'missing'), path.join(f.code, 'alias.txt'));
  f.write(path.join(f.code, '.env.example'), 'BLOG_RECEIVER_KEY=synthetic-unquoted-key');
  f.write(path.join(f.code, 'nested/.local/private.json'), '{}');
  const result = f.run('check-public.cjs');
  assert.notEqual(result.status, 0);
  for (const name of ['.env.production', '.dev.vars', 'server.env', 'cloudflare.json', 'workspace-mobile.json', 'alias.txt', '.env.example', 'nested/.local']) assert.ok(result.stderr.includes(name));
  assert.ok(!result.stderr.includes('synthetic-private-value'));
});
test('插件收集引用式和带括号文件名的图片，代码示例不读取附件', async () => {
  const { collect } = require('../plugin/collector');
  const matter = require('gray-matter');
  const { templates } = require('../plugin/templates');
  const note = (filePath, content) => ({ path: filePath, name: filePath.split('/').pop(), basename: filePath.split('/').pop().replace(/\.md$/, ''), content });
  const files = templates().map(entry => note(`Blog/${entry.path}`, entry.content));
  files.push(note('Blog/2.深度长文/post.md', '---\nid: synthetic\n---\n![图片][asset]\n\n[asset]: <a(b).png>\n\n`![代码](missing.png)`'));
  files.push(note('Blog/6.附件/a(b).png', 'pixels'));
  const app = { vault: { getAbstractFileByPath: () => ({}), getFiles: () => files, getMarkdownFiles: () => files.filter(f => f.path.endsWith('.md')), read: async file => file.content, readBinary: async file => new TextEncoder().encode(file.content).buffer }, metadataCache: { getFirstLinkpathDest: ref => files.find(file => file.name === ref) } };
  const result = await collect(app, { blogFolderName: 'Blog', imagesFolderName: '6.附件' }, yaml => matter(`---\n${yaml}\n---`).data);
  assert.deepEqual(result.images.map(image => image.filename), ['a(b).png']);
  assert.match(result.files.find(file => file.path === 'post.md').content, /!\[图片\]\(\/images\/a%28b%29\.png\)/);
});

test('公众号采集引用式图片和括号文件名，代码中的图片保持原样', async () => {
  const { collectWechatArticle } = require('../plugin/wechat');
  const matter = require('gray-matter');
  const file = { extension: 'md', basename: 'post', path: 'Blog/post.md' };
  const image = { path: 'Blog/a(b).png', name: 'a(b).png' };
  const app = { vault: { read: async () => '---\nid: synthetic\n---\n![图][asset]\n\n[asset]: <a(b).png>\n\n`![示例](missing.png)`', readBinary: async () => new TextEncoder().encode('pixels').buffer, getAbstractFileByPath: () => null }, metadataCache: { getFirstLinkpathDest: ref => ref === image.name ? image : null } };
  const result = await collectWechatArticle(app, {}, file, yaml => matter(`---\n${yaml}\n---`).data);
  assert.equal(result.images.length, 1); assert.equal(result.cover, result.images[0].id);
  assert.match(result.markdown, /!\[图\]\(bp-asset:[a-f0-9]{64}\)/);
  assert.ok(result.markdown.includes('`![示例](missing.png)`'));
});

test('博客的块标量封面只重写上传属性，正文同名行与源码保持原样', async () => {
  const { collect } = require('../plugin/collector'); const { templates } = require('../plugin/templates'); const matter = require('gray-matter');
  const note = (filePath, content) => ({ path: filePath, name: filePath.split('/').pop(), basename: filePath.split('/').pop().replace(/\.md$/, ''), content });
  const source = '\uFEFF---\nid: synthetic\nimage: >-\n  cover.png\n---\nimage: cover.png\n\n[原图](/images/cover.png?size=2)';
  const files = templates().map(entry => note(`Blog/${entry.path}`, entry.content)); files.push(note('Blog/2.深度长文/post.md', source), note('Blog/6.附件/cover.png', 'pixels'));
  const app = { vault: { getAbstractFileByPath: () => ({}), getFiles: () => files, getMarkdownFiles: () => files.filter(f => f.path.endsWith('.md')), read: async file => file.content, readBinary: async file => new TextEncoder().encode(file.content).buffer }, metadataCache: { getFirstLinkpathDest: ref => files.find(file => file.name === ref) } };
  const result = await collect(app, { blogFolderName: 'Blog', imagesFolderName: '6.附件' }, yaml => matter(`---\n${yaml}\n---`).data);
  const published = matter(result.files.find(file => file.path === 'post.md').content);
  assert.equal(published.data.image, '/images/cover.png'); assert.ok(published.content.includes('image: cover.png')); assert.equal(files.find(file => file.path.endsWith('post.md')).content, source);
  assert.equal(result.images.length, 1); assert.ok(published.content.includes('[原图](/images/cover.png)'));
});

test('短发布密钥在安装时明确拒绝，不能生成无法启动的成功安装', t => {
  const f = fixture(t); f.write(path.join(f.local, 'server.env'), 'BLOG_RECEIVER_KEY=short\n');
  const result = f.run('setup.cjs', ['--vault', f.vault, '--local']);
  assert.notEqual(result.status, 0); assert.ok(result.stderr.includes('32')); assert.equal(fs.existsSync(path.join(f.vault, '.obsidian/plugins/blog-publisher/data.json')), false);
});
test('属性中的反引号不参与正文代码分段，正文图片仍转换为站点路径', async () => {
  const { collect } = require('../plugin/collector'); const { templates } = require('../plugin/templates'); const matter = require('gray-matter');
  const note = (filePath, content) => ({ path: filePath, name: filePath.split('/').pop(), basename: filePath.split('/').pop().replace(/\.md$/, ''), content });
  const files = templates().map(entry => note(`Blog/${entry.path}`, entry.content));
  files.push(note('Blog/2.深度长文/post.md', '---\nid: synthetic\ndescription: "`"\nimage: cover.png\n---\n![图](cover.png)\n`代码`'), note('Blog/6.附件/cover.png', 'pixels'));
  const app = { vault: { getAbstractFileByPath: () => ({}), getFiles: () => files, getMarkdownFiles: () => files.filter(f => f.path.endsWith('.md')), read: async file => file.content, readBinary: async file => new TextEncoder().encode(file.content).buffer }, metadataCache: { getFirstLinkpathDest: ref => files.find(file => file.name === ref) } };
  const result = await collect(app, { blogFolderName: 'Blog', imagesFolderName: '6.附件' }, yaml => matter(`---\n${yaml}\n---`).data);
  const published = matter(result.files.find(file => file.path === 'post.md').content);
  assert.equal(published.data.description, '`'); assert.ok(published.content.includes('![图](/images/cover.png)')); assert.ok(published.content.includes('`代码`'));
});
test('带 BOM 的文章及带查询参数的本地图片也可生成公众号预览输入', async () => {
  const { collectWechatArticle } = require('../plugin/wechat'); const matter = require('gray-matter');
  const image = { name: 'cover.png', path: 'Blog/cover.png' };
  const app = { vault: { read: async () => '\uFEFF---\nid: synthetic\n---\n![图](/images/cover.png?size=2#x)', getAbstractFileByPath: () => null, getFiles: () => [image], readBinary: async () => new TextEncoder().encode('pixels').buffer }, metadataCache: { getFirstLinkpathDest: () => null } };
  const result = await collectWechatArticle(app, {}, { extension: 'md', basename: 'post', path: 'Blog/post.md' }, yaml => matter(`---\n${yaml}\n---`).data);
  assert.equal(result.images.length, 1); assert.match(result.markdown, /bp-asset:[a-f0-9]{64}/);
});
