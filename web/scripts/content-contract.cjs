/**
 * [INPUT]: 依赖 Node fs/path、gray-matter、五类目录中的 Markdown frontmatter 与 shared 代码隔离
 * [OUTPUT]: 对外提供私有内容适配与图片镜像；syncImages 支持排除受保护文章的专属图片
 * [POS]: 上传文件到前端数据的唯一字段适配边界；目录决定内容类型，新栏目目录决定分类，栏目笔记声明身份与展示，旧快照兼容读取，构建与契约检查共用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');
const { discoverCollections, LEGACY_COLLECTIONS } = require('./catalog.cjs');

const COLLECTIONS = LEGACY_COLLECTIONS;
const MAP_FILES = new Set(['CLAUDE.md', 'AGENTS.md', 'README.md']);
const IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|webp|svg|avif|apng)$/i;

// ===== 输入规范 =====
function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1).flatMap(entry => {
    if (entry.name.startsWith('.') || MAP_FILES.has(entry.name)) return [];
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`内容目录不接受符号链接：${file}`);
    if (entry.isDirectory()) return listMarkdownFiles(file);
    return entry.isFile() && entry.name.endsWith('.md') ? [file] : [];
  });
}

function text(value, field, file) {
  if (value === undefined || value === null) return '';
  if (!['string', 'number'].includes(typeof value)) throw new Error(`${file}：${field} 必须是文本或数字`);
  return String(value);
}

function date(value, field, file) {
  if (value === undefined || value === null || value === '') return '';
  if (!(value instanceof Date) && typeof value !== 'string') throw new Error(`${file}：${field} 必须是日期或日期文本`);
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${file}：${field} 日期无效`);
  const result = parsed.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value !== result) throw new Error(`${file}：${field} 日期不存在`);
  return result;
}

function convertImage(value) {
  if (!value) return '';
  const wiki = value.match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/);
  if (wiki) return `/images/${encodeURIComponent(path.basename(wiki[1]))}`;
  return value;
}

function convertImages(content) {
  const { splitCode } = require('../../shared/markdown-parts.cjs');
  return splitCode(content).map(part => part.code ? part.text : part.text.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (match, file) => IMAGE_EXTENSION.test(file) ? `![](/images/${encodeURIComponent(path.basename(file))})` : match)).join('');
}

function readRecord(file) {
  try { return matter(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`${file}：YAML 解析失败，${error.message}`); }
}

function normalizePost(file, type, collectionDir, collection) {
  const { data, content } = readRecord(file);
  const get = field => text(data[field], field, file);
  const title = get('title') || path.basename(file, '.md');
  if (data.tags != null && (!Array.isArray(data.tags) || data.tags.some(tag => typeof tag !== 'string'))) throw new Error(`${file}：tags 必须是文本列表`);
  const rating = data.rating == null || data.rating === '' ? undefined : Number(data.rating);
  if (rating !== undefined && (!Number.isFinite(rating) || rating < 0 || rating > 10)) throw new Error(`${file}：rating 必须是 0–10 的数字`);
  return {
    id: get('id') || path.basename(file, '.md'), type, title, collectionId: collection.id,
    subtitle: get('subtitle'), description: get('description'), category: collection.configured ? (path.dirname(file) === collectionDir ? '' : path.basename(path.dirname(file))) : get('category') || (path.dirname(file) === collectionDir ? '' : path.basename(path.dirname(file))),
    tags: data.tags || [], date: date(data.date, 'date', file), content: convertImages(content),
    cover: convertImage(get('image')), password: get('password'),
    author: get('author'), publisher: get('publisher'), isbn: get('isbn'), rating,
    doubanUrl: get('doubanUrl'), readDate: date(data.readDate, 'readDate', file),
    price: get('price'), buyUrl: get('link'), products: data.products,
    videoUrl: get('videoUrl'), launchDate: date(data.date, 'date', file),
  };
}

// ===== 五类目录：沿用插件的 type 与路径 =====
function readContent(contentDir) {
  const result = { articles: [], books: [], products: [], aboutStories: [], homeConfig: {}, allPosts: [] };
  const catalog = discoverCollections(contentDir);
  result.collections = catalog.configured ? catalog.collections : [];
  const records = dir => listMarkdownFiles(dir).filter(file => path.basename(file) !== '_栏目.md');
  for (const config of catalog.collections) {
    if (!config.type) continue;
    const collectionDir = path.join(contentDir, config.folder);
    result[config.key].push(...records(collectionDir).map(file => normalizePost(file, config.type, collectionDir, { ...config, configured: catalog.configured })));
  }
  result.allPosts = [...result.articles, ...result.books, ...result.products];
  const ids = new Set();
  for (const post of result.allPosts) {
    if (ids.has(post.id)) throw new Error(`文章 id 重复：${post.id}；同一 id 只能对应一篇文章`);
    ids.add(post.id);
  }
  result.aboutStories = records(path.join(contentDir, catalog.collections.find(item => item.kind === 'about').folder)).map(file => {
    const { data, content } = readRecord(file);
    if (data.password) throw new Error('人生履历不支持密码字段，请将受保护内容放入文章、书籍或产品栏目');
    return { id: text(data.id, 'id', file) || path.basename(file, '.md'), title: text(data.title, 'title', file) || path.basename(file, '.md'), date: date(data.date, 'date', file), content: convertImages(content.trim()) };
  });
  const storyIds = new Set();
  for (const story of result.aboutStories) {
    if (storyIds.has(story.id)) throw new Error(`人生履历 id 重复：${story.id}`);
    storyIds.add(story.id);
  }
  const homeFiles = records(path.join(contentDir, catalog.collections.find(item => item.kind === 'config').folder)).filter(file => readRecord(file).data.id === 'home');
  if (homeFiles.length > 1) throw new Error('首页配置重复：只允许一个 id: home 文件');
  if (homeFiles.length) {
    const file = homeFiles[0];
    const { data } = readRecord(file);
    if (data.password) throw new Error('首页配置不支持密码字段');
    const links = data.socialLinks || {};
    if (typeof links !== 'object' || Array.isArray(links)) throw new Error(`${file}：socialLinks 必须是链接映射`);
    result.homeConfig = {
      heroTitle: text(data.heroTitle, 'heroTitle', file), heroSubtitle: text(data.heroSubtitle, 'heroSubtitle', file),
      heroImage: convertImage(text(data.heroImage, 'heroImage', file)), heroPortrait: convertImage(text(data.heroPortrait, 'heroPortrait', file)),
      ...Object.fromEntries(['seoTitle', 'seoDescription', 'eyebrow', 'recentEnglish', 'recentTitle', 'recentDescription'].map(key => [key, text(data[key], key, file)])),
      socialLinks: Object.fromEntries(Object.entries(links).map(([key, value]) => [key, text(value, `socialLinks.${key}`, file)])),
    };
  }
  const configDir = path.join(contentDir, catalog.collections.find(item => item.kind === 'config').folder);
  const siteFiles = records(configDir).filter(file => readRecord(file).data.id === 'site');
  if (catalog.configured && siteFiles.length !== 1) throw new Error('必须且只能有一个 id: site 的站点设置笔记');
  result.siteConfig = {};
  if (siteFiles.length) {
    const file = siteFiles[0], { data } = readRecord(file);
    if (data.password) throw new Error('站点设置不支持密码字段');
    const fields = ['name', 'author', 'tagline', 'footerText', 'rssTitle', 'rssDescription', 'aboutReadLabel', 'journeyEnglish', 'journeyTitle', 'journeyDescription'];
    result.siteConfig = Object.fromEntries(fields.map(key => [key, text(data[key], key, file)]));
    if ((result.allPosts.length || result.aboutStories.length) && (!result.siteConfig.name || !result.siteConfig.author)) throw new Error('发布文章前请填写站点名称和作者');
    const registration = data.registration || [];
    if (!Array.isArray(registration)) throw new Error('registration 必须为列表');
    result.siteConfig.registration = registration.map(item => {
      if (!item || typeof item.href !== 'string' || !/^https:\/\//.test(item.href) || typeof item.text !== 'string') throw new Error('备案项需要文本和 HTTPS 地址');
      return { href: item.href, text: item.text };
    });
  }
  for (const collection of result.collections) collection.cover = convertImage(collection.cover);
  return result;
}

// ===== 外部图片：源码和运行数据分离 =====
function syncImages(source, target, { exclude = new Set() } = {}) {
  source = path.resolve(source); target = path.resolve(target);
  if (source === target) {
    if (exclude.size) throw new Error('受保护图片原稿目录必须与公开图片目录分开');
    return;
  }
  if (source.startsWith(`${target}${path.sep}`) || target.startsWith(`${source}${path.sep}`)) throw new Error('外部图片目录不能与构建图片目录相互嵌套');
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) throw new Error(`外部图片目录不存在：${source}`);
  const files = [];
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || MAP_FILES.has(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`图片目录不接受符号链接：${file}`);
      if (entry.isDirectory()) scan(file);
      else if (entry.isFile() && IMAGE_EXTENSION.test(entry.name)) files.push(file);
    }
  }
  scan(source);
  const names = new Set();
  for (const file of files) {
    const name = path.basename(file);
    if (names.has(name)) throw new Error(`图片文件名重复：${name}；Obsidian 图片需使用全站唯一文件名`);
    names.add(name);
  }
  for (const name of exclude) if (!names.has(name)) throw new Error(`受保护文章图片不存在：${name}`);
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(target)) {
    if (entry !== 'CLAUDE.md') fs.rmSync(path.join(target, entry), { recursive: true, force: true });
  }
  for (const file of files) if (!exclude.has(path.basename(file))) fs.copyFileSync(file, path.join(target, path.basename(file)));
}

module.exports = { COLLECTIONS, readContent, listMarkdownFiles, convertImage, convertImages, syncImages };
