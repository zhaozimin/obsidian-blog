/**
 * [INPUT]: 依赖 Obsidian Vault/附件解析、YAML、Web Crypto 与共用代码片段隔离
 * [OUTPUT]: 对外提供 collect、diff、sha256、normalizeFolder 与栏目发现能力，名称变化纳入快照
 * [POS]: 插件的内容边界；只读取博客目录与明确引用的图片，不把笔记库其他资料加入发布
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const COLLECTIONS = Object.freeze({
  config: '1.首页', article: '2.深度长文', book: '3.阅读思考',
  product: '4.产品列表', about: '5.关于'
});
const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif|apng)$/i;
const MAPS = new Set(['CLAUDE.md', 'AGENTS.md', 'README.md']);
const { splitCode } = require('../shared/markdown-parts.cjs');

function normalizeFolder(value) {
  const folder = String(value || '').trim().replace(/\/$/, '');
  if (!folder || folder.includes('\\') || folder.split('/').some(part => !part || part.startsWith('.') || part.includes(':'))) {
    throw new Error('请填写笔记库内的独立博客文件夹。');
  }
  return folder;
}

async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function metadata(content, parseYaml, name) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  try { return match ? parseYaml(match[1]) || {} : {}; }
  catch { throw new Error(`${name} 的 YAML 格式不正确。`); }
}

// ===== 栏目名称来自目录，身份来自栏目笔记 =====
async function discoverCollections(app, root, parseYaml) {
  const definitions = [];
  for (const file of app.vault.getMarkdownFiles()) {
    if (file.name !== '_栏目.md' || !file.path.startsWith(`${root}/`)) continue;
    const parts = file.path.slice(root.length + 1).split('/');
    if (parts.length !== 2) continue;
    const data = metadata(await app.vault.read(file), parseYaml, file.path);
    if (data.password || !Object.hasOwn(COLLECTIONS, data.kind) || !/^[a-z][a-z0-9-]{0,79}$/.test(data.id || '')) throw new Error('栏目笔记的 id 或 kind 无效。');
    definitions.push({ id: data.id, kind: data.kind, folder: parts[0] });
  }
  if (!definitions.length) throw new Error('博客缺少栏目配置，请初始化栏目结构或检查 _栏目.md。');
  const ids = new Set(), folders = new Set();
  for (const item of definitions) {
    if (ids.has(item.id) || folders.has(item.folder)) throw new Error('栏目身份或目录重复。');
    ids.add(item.id); folders.add(item.folder);
  }
  for (const kind of ['config', 'about']) if (definitions.filter(item => item.kind === kind).length !== 1) throw new Error(`必须且只能配置一个 ${kind} 栏目。`);
  return definitions.sort((a, b) => a.folder.localeCompare(b.folder, 'zh-CN', { numeric: true }));
}

// ===== 从引用定位附件；上传字节与快照字节保持一致 =====
async function collect(app, settings, parseYaml) {
  const root = normalizeFolder(settings.blogFolderName);
  const imageFolder = `${root}/${normalizeFolder(settings.imagesFolderName)}`;
  if (!app.vault.getAbstractFileByPath(root)) throw new Error('博客文件夹不存在，请检查设置或先初始化。');
  const collections = await discoverCollections(app, root, parseYaml);
  const candidates = app.vault.getFiles().filter(file => IMAGE.test(file.path));
  const files = [], images = new Map(), snapshot = {}, passwords = [];
  const ids = new Set(), storyIds = new Set();
  for (const file of app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path))) {
    const entry = collections.find(item => file.path.startsWith(`${root}/${item.folder}/`));
    if (!entry && file.path.startsWith(`${root}/`) && !MAPS.has(file.name) && !file.path.split('/').some(part => part.startsWith('.'))) throw new Error('博客目录含未声明栏目的笔记，请检查 _栏目.md，发布已停止。');
    if (!entry || MAPS.has(file.name) || file.path.split('/').some(part => part.startsWith('.'))) continue;
    const { kind: type, folder, id: collectionId } = entry;
    const relative = file.path.slice(`${root}/${folder}/`.length);
    let content = await app.vault.read(file);
    const data = metadata(content, parseYaml, relative);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${relative} 的 YAML 必须为字段映射。`);
    const id = String(data.id || file.basename);
    const set = type === 'about' ? storyIds : ids;
    if (type !== 'config' && file.name !== '_栏目.md') {
      if (set.has(id)) throw new Error(`重复 id：${id}，请给每篇内容设置独立 id。`);
      set.add(id);
    }
    if (data.password) passwords.push(`${folder}/${relative}`);

    function addReference(raw) {
      if (!raw || /^(?:https?:|data:)/i.test(raw)) return null;
      let ref = raw.replace(/^!?(?:\[\[)(.*?)\]\]$/, '$1').split('|')[0];
      try { ref = decodeURIComponent(ref); } catch { /* 中文文件名保持原文 */ }
      ref = ref.replace(/^<|>$/g, '');
      if (!IMAGE.test(ref)) return null;
      const name = ref.split('/').pop();
      let dest;
      if (!ref.startsWith('/images/')) dest = app.metadataCache.getFirstLinkpathDest(ref, file.path);
      if (!dest || !IMAGE.test(dest.path)) {
        const matches = candidates.filter(item => item.name === name && item.path.startsWith(`${imageFolder}/`));
        if (matches.length !== 1) throw new Error(`${relative} 引用的图片不存在或同名：${name}`);
        dest = matches[0];
      }
      const previous = images.get(dest.name);
      if (previous && previous.file.path !== dest.path) throw new Error(`图片文件名重复：${dest.name}，请重命名后发布。`);
      images.set(dest.name, { file: dest });
      const url = `/images/${encodeURIComponent(dest.name)}`;
      return url;
    }

    for (const field of ['image', 'heroImage', 'heroPortrait']) {
      if (typeof data[field] === 'string' && data[field]) {
        const url = addReference(data[field]);
        // Wiki 图片由前端转换；相对封面路径改为网站图片路径。
        if (url && !data[field].startsWith('[[') && !data[field].startsWith('/images/')) {
          const escaped = data[field].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          content = content.replace(new RegExp(`(^${field}:\\s*)(['"]?)${escaped}\\2\\s*$`, 'm'), (_, prefix) => `${prefix}"${url}"`);
        }
      }
    }
    content = splitCode(content).map(part => {
      if (part.code) return part.text;
      return part.text.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (match, ref) => { addReference(ref); return match; })
        .replace(/!\[([^\]]*)\]\((<[^>]+>|[^\s)]+)(\s+"[^"]*")?\)/g, (match, alt, ref, title = '') => { const url = addReference(ref); return url ? `![${alt}](${url}${title})` : match; });
    }).join('');
    files.push({ type, collectionId, path: relative, content });
    const key = collections.filter(item => item.kind === type).length > 1 ? `${type}/${collectionId}/${relative}` : `${type}/${relative}`;
    snapshot[key] = await sha256(content);
  }
  const imageFiles = [];
  for (const [filename, item] of [...images].sort(([a], [b]) => a.localeCompare(b))) {
    const bytes = await app.vault.readBinary(item.file);
    if (bytes.byteLength > 25 * 1024 * 1024) throw new Error(`图片 ${filename} 超过 25 MiB，请压缩后发布。`);
    const hash = await sha256(bytes);
    imageFiles.push({ filename, hash, size: bytes.byteLength, bytes });
    snapshot[`image/${filename}`] = hash;
  }
  snapshot.catalog = await sha256(JSON.stringify(collections));
  return { collections, files, images: imageFiles, snapshot, passwords };
}

function diff(current, previous = {}) {
  const result = { added: [], modified: [], deleted: [] };
  for (const [key, hash] of Object.entries(current)) {
    if (!Object.hasOwn(previous, key)) result.added.push(key);
    else if (previous[key] !== hash) result.modified.push(key);
  }
  for (const key of Object.keys(previous)) if (!Object.hasOwn(current, key)) result.deleted.push(key);
  return result;
}

module.exports = { discoverCollections, COLLECTIONS, collect, diff, sha256, normalizeFolder };
