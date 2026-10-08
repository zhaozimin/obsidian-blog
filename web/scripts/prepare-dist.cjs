/**
 * [INPUT]: 依赖 Node fs/path、content-images 语法扫描、path-safety 隔离与 Vite 产物/私有内容快照
 * [OUTPUT]: 对外提供经过资源及私密数据检查的发布目录，公开快照必须与原稿派生值一致，专属/未引用附件及符号链接阻止发布
 * [POS]: npm postbuild 的产物边界，排除文档地图，保证文章、图片和版本记录一同发布
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const { readContent } = require('./content-contract.cjs');
const { publicSnapshot, assertPublicSnapshot } = require('./public-content.cjs');
const { imageSources } = require('./content-images.cjs');
const { realPath, overlaps, assertSeparate } = require('./path-safety.cjs');

const distDir = path.resolve(process.env.BLOG_BUILD_DIR || path.join(__dirname, '../dist'));
const requiredFiles = ['index.html', 'blog-data.json', 'feed.xml', 'sitemap.xml'];

// ===== 发布边界 =====
function removePrivateFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('公开产物不能包含符号链接');
    if (entry.name.startsWith('.')) fs.rmSync(filePath, { recursive: true, force: true });
    else if (entry.isDirectory()) removePrivateFiles(filePath);
    else if (['CLAUDE.md', 'AGENTS.md'].includes(entry.name)) fs.unlinkSync(filePath);
  }
}

function checkImage(src, owner) {
  if (!src || !src.startsWith('/')) return;
  const pathname = decodeURIComponent(new URL(src, 'https://local.invalid').pathname);
  const filePath = path.resolve(distDir, `.${pathname}`);
  if (!filePath.startsWith(`${distDir}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${owner} 引用的本地图片不存在：${src}`);
  }
}

function checkContentImages(content, owner) {
  for (const src of imageSources(content)) checkImage(src, owner);
}
function checkPublishedImages(dir, publicImages) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !publicImages.has(entry.name)) throw new Error('未被公开内容引用的附件或子目录不能进入公开产物');
  }
}

function main() {
  const contentDir = path.resolve(process.env.BLOG_CONTENT_DIR || path.join(__dirname, '../src/content'));
  const imagesDir = process.env.BLOG_IMAGES_DIR || path.join(__dirname, '../public/images');
  const project = realPath(path.join(__dirname, '..'));
  if (overlaps(distDir, project) && realPath(distDir) !== path.join(project, 'dist')) throw new Error('产物清理只能使用仓库 dist 或隔离的外部目录');
  for (const source of [contentDir, imagesDir].filter(Boolean)) assertSeparate(distDir, source, '产物清理目录不能覆盖内容或图片原稿');
  removePrivateFiles(distDir);
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(distDir, file))) throw new Error(`发布产物缺少 ${file}`);
  }
  const data = JSON.parse(fs.readFileSync(path.join(distDir, 'blog-data.json'), 'utf8'));
  assertPublicSnapshot(data);
  const htmlPath = path.join(distDir, 'index.html');
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const html = fs.readFileSync(htmlPath, 'utf8').replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(data.homeConfig.seoTitle || data.siteConfig.name || 'Blog')}</title>`).replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeHtml(data.homeConfig.seoDescription || '')}" />`);
  fs.writeFileSync(htmlPath, html);
  const { data: expected, privateImages, publicImages } = publicSnapshot(readContent(contentDir));
  for (const key of Object.keys(expected)) if (JSON.stringify(data[key]) !== JSON.stringify(expected[key])) throw new Error(`公开内容快照与当前原稿不一致：${key}`);
  for (const name of privateImages) if (fs.existsSync(path.join(distDir, 'images', name))) throw new Error('受保护文章专属图片不能进入公开产物');
  const imageDir = path.join(distDir, 'images');
  if (fs.existsSync(imageDir)) checkPublishedImages(imageDir, publicImages);
  const ids = new Set();
  for (const post of data.allPosts) {
    const id = String(post.id);
    if (!id || ids.has(id)) throw new Error(`文章 id 为空或重复：${id}`);
    ids.add(id);
    checkImage(post.cover, post.title);
    checkContentImages(post.content, post.title);
  }
  for (const story of data.aboutStories) checkContentImages(story.content, story.title);
  for (const collection of data.collections || []) checkImage(collection.cover, collection.label);
  checkImage(data.homeConfig.heroImage, '首页头像');
  checkImage(data.homeConfig.heroPortrait, '首页半身像');

  const info = {
    siteOrigin: data.siteOrigin,
    releaseId: process.env.BLOG_RELEASE_ID || 'local',
    contentVersion: process.env.BLOG_CONTENT_VERSION || 'local',
    commit: process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || 'local',
    builtAt: new Date().toISOString(),
    posts: data.allPosts.length,
    aboutStories: data.aboutStories.length,
  };
  fs.writeFileSync(path.join(distDir, 'deploy-info.json'), `${JSON.stringify(info, null, 2)}\n`);
  process.stdout.write(`发布产物检查通过：${info.posts} 篇内容，本地图片齐全，文档地图已排除。\n`);
}

try { main(); }
catch (error) {
  process.stderr.write(`发布产物检查失败：${error.message}\n`);
  process.exitCode = 1;
}
