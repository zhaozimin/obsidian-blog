/**
 * [INPUT]: 依赖 Node fs/path 与 parse-frontmatter 安全 YAML 边界，读取外部目录中的 _栏目.md
 * [OUTPUT]: 对外提供 discoverCollections、displayName、LEGACY_COLLECTIONS
 * [POS]: 栏目身份与目录名称的契约边界；新目录由笔记声明，旧映射仅用于历史批次读取
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('./parse-frontmatter.cjs');
const ROLES = { config: {}, article: { type: 'LONG_READ', key: 'articles', tone: 'red' }, book: { type: 'BOOK_NOTE', key: 'books', tone: 'green' }, product: { type: 'PRODUCT', key: 'products', tone: 'neutral' }, about: {} };
const LEGACY_COLLECTIONS = { config: { id: 'home', folder: '1.首页' }, article: { id: 'long-reads', folder: '2.深度长文' }, book: { id: 'books', folder: '3.行者百书' }, product: { id: 'products', folder: '4.产品列表' }, about: { id: 'about', folder: '5.关于' } };
const displayName = folder => folder.replace(/^\d+[.、\s_-]*/, '');
function discoverCollections(contentDir) {
  const collections = [], ids = new Set(), routes = new Set();
  const entries = fs.readdirSync(contentDir, { withFileTypes: true });
  if (entries.some(entry => !entry.name.startsWith('.') && entry.isSymbolicLink())) throw new Error('内容根目录不接受符号链接');
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const file = path.join(contentDir, entry.name, '_栏目.md');
    if (!fs.existsSync(file)) continue;
    if (fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile()) throw new Error('栏目声明必须是普通 Markdown 文件');
    const { data } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    if (data.password || !Object.hasOwn(ROLES, data.kind) || !/^[a-z][a-z0-9-]{0,79}$/.test(data.id || '')) throw new Error(`${entry.name}：栏目 id 或 kind 无效`);
    if (['article', 'book', 'product'].includes(data.kind) && ['home', 'about', 'post', 'not-found'].includes(data.id)) throw new Error('内容栏目不能使用系统保留 id');
    const route = data.kind === 'config' ? '/' : data.kind === 'about' ? '/about' : `/${data.id}`;
    if (ids.has(data.id) || routes.has(route)) throw new Error('栏目身份或地址重复');
    ids.add(data.id); routes.add(route);
    const str = key => { if (data[key] != null && typeof data[key] !== 'string') throw new Error(`${entry.name}：${key} 必须为文本`); return data[key] || ''; };
    const topics = data.topics ?? [];
    if (!Array.isArray(topics) || topics.some(value => typeof value !== 'string')) throw new Error(`${entry.name}：topics 必须为文本列表`);
    if (data.art != null && (typeof data.art !== 'object' || Array.isArray(data.art))) throw new Error(`${entry.name}：art 必须为文本映射`);
    const art = {};
    for (const key of ['label', 'primary', 'secondary', 'tertiary', 'badge', 'caption', 'placeholder']) {
      const value = data.art?.[key];
      if (value != null && typeof value !== 'string') throw new Error(`${entry.name}：art.${key} 必须为文本`);
      art[key] = value || '';
    }
    collections.push({ id: data.id, kind: data.kind, folder: entry.name, label: displayName(entry.name), path: route, ...ROLES[data.kind], english: str('english'), promise: str('promise'), description: str('description'), topics, visualLabel: str('visualLabel'), cover: str('image'), art });
  }
  const allowed = new Set((collections.length ? collections : Object.values(LEGACY_COLLECTIONS)).map(item => item.folder));
  function containsNotes(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).some(child => {
      if (child.name.startsWith('.')) return false;
      if (child.isSymbolicLink()) throw new Error('内容目录不接受符号链接');
      return child.isDirectory() ? containsNotes(path.join(dir, child.name)) : child.isFile() && child.name.endsWith('.md') && !['CLAUDE.md', 'AGENTS.md', 'README.md'].includes(child.name);
    });
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory() && !allowed.has(entry.name) && containsNotes(path.join(contentDir, entry.name))) throw new Error(`${entry.name}：含笔记但未声明 _栏目.md，发布已停止`);
    if (entry.isFile() && entry.name.endsWith('.md') && !['CLAUDE.md', 'AGENTS.md', 'README.md'].includes(entry.name)) throw new Error(`${entry.name}：根目录笔记必须移入已声明栏目`);
  }
  if (collections.length) {
    for (const kind of ['config', 'about']) if (collections.filter(item => item.kind === kind).length !== 1) throw new Error(`必须且只能声明一个 ${kind} 栏目`);
    return { configured: true, collections };
  }
  return { configured: false, collections: Object.entries(LEGACY_COLLECTIONS).map(([kind, value]) => ({ kind, ...value, ...ROLES[kind], label: displayName(value.folder), path: kind === 'config' ? '/' : `/${value.id}`, english: '', promise: '', description: '', topics: [], visualLabel: '', art: {} })) };
}
module.exports = { discoverCollections, displayName, LEGACY_COLLECTIONS };
