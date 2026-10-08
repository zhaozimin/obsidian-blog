/**
 * [INPUT]: 依赖 Node fs/path/crypto、共享源码路径隔离、私有数据目录和注入的网站发布器
 * [OUTPUT]: 对外提供 BatchStore、ApiError、sha256 与历史栏目映射；新批次保存笔记库声明的原始目录
 * [POS]: 上传事务边界；暂存完整快照，校验图片字节，成功切换 current；持久前一成功指针用于中断回滚
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { externalPath } = require('../scripts/local-runtime.cjs');
const COLLECTIONS = Object.freeze({ config: '1.首页', article: '2.深度长文', book: '3.行者百书', product: '4.产品列表', about: '5.关于' });
const MAX_IMAGE = 25 * 1024 * 1024;
const MAX_FILES = 10000;
const MAX_BYTES = 512 * 1024 * 1024;
class ApiError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function atomicJson(file, data) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(temporary, file);
}
function safePath(value, image = false) {
  if (typeof value !== 'string' || !value || value.length > 512 || /[\\\x00-\x1f\x7f]/.test(value)) throw new ApiError('INVALID_INPUT');
  const parts = value.split('/');
  if (parts.some(part => !part || part.startsWith('.') || part.includes(':') || Buffer.byteLength(part) > 240) || (image && parts.length !== 1)) throw new ApiError('INVALID_INPUT');
  if (image ? !/\.(png|jpe?g|gif|webp|svg|avif|apng)$/i.test(value) : !value.endsWith('.md') || ['CLAUDE.md', 'AGENTS.md', 'README.md'].includes(parts.at(-1))) throw new ApiError('INVALID_INPUT');
  return value;
}
function manifest(input) {
  let collections;
  if (input?.collections !== undefined) {
    if (!Array.isArray(input.collections) || !input.collections.length || input.collections.length > 100) throw new ApiError('INVALID_INPUT');
    const ids = new Set(), folders = new Set();
    collections = input.collections.map(item => {
      if (!item || !/^[a-z][a-z0-9-]{0,79}$/.test(item.id || '') || !Object.hasOwn(COLLECTIONS, item.kind) || typeof item.folder !== 'string' || item.folder.includes('/')) throw new ApiError('INVALID_INPUT');
      safePath(`${item.folder}/_栏目.md`);
      const folder = item.folder.normalize('NFC').toLowerCase();
      if (ids.has(item.id) || folders.has(folder)) throw new ApiError('INVALID_INPUT');
      ids.add(item.id); folders.add(folder);
      return { id: item.id, kind: item.kind, folder: item.folder };
    });
    for (const kind of ['config', 'about']) if (collections.filter(item => item.kind === kind).length !== 1) throw new ApiError('INVALID_INPUT');
  }
  if (!input || !Array.isArray(input.files) || !Array.isArray(input.images) || input.files.length + input.images.length > MAX_FILES) throw new ApiError('INVALID_INPUT');
  let total = 0;
  const names = new Set();
  const files = input.files.map(file => {
    if (!file || !Object.hasOwn(COLLECTIONS, file.type) || typeof file.content !== 'string') throw new ApiError('INVALID_INPUT');
    const relative = safePath(file.path);
    const collection = collections?.find(item => item.id === file.collectionId && item.kind === file.type);
    if (collections && !collection) throw new ApiError('INVALID_INPUT');
    const key = `${collection?.id || file.type}/${relative}`.normalize('NFC').toLowerCase();
    if (names.has(key)) throw new ApiError('INVALID_INPUT');
    names.add(key); total += Buffer.byteLength(file.content);
    if (Buffer.byteLength(file.content) > 4 * 1024 * 1024) throw new ApiError('TOO_LARGE', 413);
    return { type: file.type, ...(collection ? { collectionId: collection.id } : {}), path: relative, content: file.content };
  });
  const imageNames = new Set();
  const images = input.images.map(image => {
    if (!image || !/^[a-f0-9]{64}$/.test(image.hash) || !Number.isSafeInteger(image.size) || image.size <= 0 || image.size > MAX_IMAGE) throw new ApiError('INVALID_INPUT');
    const filename = safePath(image.filename, true), key = filename.normalize('NFC').toLowerCase();
    if (imageNames.has(key)) throw new ApiError('INVALID_INPUT');
    imageNames.add(key); total += image.size;
    return { filename, hash: image.hash, size: image.size };
  });
  if (total > MAX_BYTES) throw new ApiError('TOO_LARGE', 413);
  if (collections && collections.some(item => !files.some(file => file.collectionId === item.id && file.path === '_栏目.md'))) throw new ApiError('INVALID_INPUT');
  return { collections, files, images };
}

class BatchStore {
  constructor(root, publish) {
    this.root = externalPath(root, '运行数据目录'); this.publish = publish; this.active = null; this.unpersistedFailures = new Set();
    fs.mkdirSync(path.join(this.root, 'batches'), { recursive: true, mode: 0o700 });
    this.lockFile = path.join(this.root, '.receiver.lock');
    try { this.lockFd = fs.openSync(this.lockFile, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(fs.readFileSync(this.lockFile, 'utf8'));
      let running = true;
      try { if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error(); process.kill(pid, 0); } catch { running = false; }
      if (running) throw new Error('接收服务数据目录已有运行进程。');
      fs.unlinkSync(this.lockFile); this.lockFd = fs.openSync(this.lockFile, 'wx', 0o600);
    }
    fs.writeFileSync(this.lockFd, String(process.pid));
    // ===== 重启恢复：不把中断任务冒充成功；已完成任务保留幂等状态 =====
    for (const id of fs.readdirSync(path.join(this.root, 'batches'))) {
      if (id.startsWith('.staging-')) { fs.rmSync(path.join(this.root, 'batches', id), { recursive: true, force: true }); continue; }
      if (!/^[a-f0-9-]{36}$/.test(id)) continue;
      const meta = this.load(id);
      if (meta.state === 'failed' && meta.code === 'STORE_FAILED' && this.current() === id) this.switchCurrent(meta.previousCurrent || null);
      if (meta.state === 'publishing') {
        if (this.current() === id) this.switchCurrent(meta.previousCurrent || null);
        meta.state = 'failed'; meta.code = 'INTERRUPTED'; this.save(id, meta);
      }
    }
    this.cleanup();
  }
  close() {
    if (this.lockFd !== undefined) { fs.closeSync(this.lockFd); fs.unlinkSync(this.lockFile); this.lockFd = undefined; }
  }
  dir(id) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) throw new ApiError('NOT_FOUND', 404);
    return path.join(this.root, 'batches', id);
  }
  load(id) {
    const file = path.join(this.dir(id), 'batch.json');
    if (!fs.existsSync(file)) throw new ApiError('NOT_FOUND', 404);
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    return this.unpersistedFailures.has(id) ? { ...meta, state: 'failed', code: 'STORE_FAILED', result: undefined } : meta;
  }
  save(id, meta) { atomicJson(path.join(this.dir(id), 'batch.json'), meta); this.unpersistedFailures.delete(id); }
  current() {
    const link = path.join(this.root, 'current');
    if (!fs.existsSync(link)) return null;
    return path.basename(fs.realpathSync(link));
  }
  switchCurrent(id) {
    const current = path.join(this.root, 'current');
    if (!id) { if (fs.existsSync(current)) fs.unlinkSync(current); return; }
    const link = path.join(this.root, `.current-${crypto.randomUUID()}`);
    try { fs.symlinkSync(path.join('batches', path.basename(this.dir(id))), link); fs.renameSync(link, current); }
    finally { if (fs.existsSync(link)) fs.unlinkSync(link); }
  }
  cleanup() {
    const current = this.current();
    for (const id of fs.readdirSync(path.join(this.root, 'batches'))) {
      if (!/^[a-f0-9-]{36}$/.test(id) || id === current || id === this.active) continue;
      const meta = this.load(id);
      // 成功历史用于备份；未提交的临时批次 24 小时后回收。
      if (meta.state !== 'published' && Date.now() - new Date(meta.createdAt).getTime() > 24 * 60 * 60 * 1000) fs.rmSync(this.dir(id), { recursive: true });
    }
  }
  create(input) {
    this.cleanup();
    const unfinished = fs.readdirSync(path.join(this.root, 'batches')).filter(id => /^[a-f0-9-]{36}$/.test(id) && this.load(id).state !== 'published').length;
    if (unfinished >= 32) throw new ApiError('BUSY', 409);
    const data = manifest(input), id = crypto.randomUUID(), dir = path.join(this.root, 'batches', `.staging-${id}`);
    try {
      fs.mkdirSync(path.join(dir, 'content'), { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(dir, 'images'), { mode: 0o700 });
      for (const folder of data.collections ? data.collections.map(item => item.folder) : Object.values(COLLECTIONS)) fs.mkdirSync(path.join(dir, 'content', folder), { mode: 0o700 });
      for (const file of data.files) {
        const target = path.join(dir, 'content', data.collections ? data.collections.find(item => item.id === file.collectionId).folder : COLLECTIONS[file.type], file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
        fs.writeFileSync(target, file.content, { mode: 0o600 });
      }
      const previous = this.current(), needed = [];
      for (const image of data.images) {
        const source = previous && path.join(this.dir(previous), 'images', image.filename);
        if (source && fs.existsSync(source) && fs.statSync(source).size === image.size && sha256(fs.readFileSync(source)) === image.hash) {
          fs.copyFileSync(source, path.join(dir, 'images', image.filename));
        } else needed.push(image.filename);
      }
      atomicJson(path.join(dir, 'batch.json'), { state: 'ready', createdAt: new Date().toISOString(), collections: data.collections, files: data.files.map(({ type, collectionId, path: relative }) => ({ type, collectionId, path: relative })), images: data.images });
      fs.renameSync(dir, this.dir(id));
      return { batchId: id, state: 'ready', needUpload: needed };
    } catch (error) { fs.rmSync(dir, { recursive: true, force: true }); throw error; }
  }
  upload(id, filename, bytes) {
    const meta = this.load(id);
    if (meta.state !== 'ready') throw new ApiError('BUSY', 409);
    safePath(filename, true);
    const expected = meta.images.find(image => image.filename === filename);
    if (!expected || bytes.length !== expected.size || sha256(bytes) !== expected.hash) throw new ApiError('INVALID_INPUT');
    const target = path.join(this.dir(id), 'images', filename), temp = `${target}.tmp`;
    fs.writeFileSync(temp, bytes, { mode: 0o600 }); fs.renameSync(temp, target);
    return { success: true };
  }
  status(id) {
    const meta = this.load(id);
    return { batchId: id, state: meta.state, ...(meta.code ? { code: meta.code } : {}), ...(meta.result || {}) };
  }
  commit(id) {
    const meta = this.load(id);
    if (meta.state === 'published' || meta.state === 'publishing') return this.status(id);
    if (this.active) throw new ApiError('BUSY', 409);
    for (const image of meta.images) {
      const file = path.join(this.dir(id), 'images', image.filename);
      if (!fs.existsSync(file) || fs.statSync(file).size !== image.size || sha256(fs.readFileSync(file)) !== image.hash) throw new ApiError('INCOMPLETE', 409);
    }
    meta.state = 'publishing'; meta.previousCurrent = this.current(); delete meta.code; this.save(id, meta);
    this.active = id;
    this.job = this.run(id, meta);
    return this.status(id);
  }
  async run(id, meta) {
    let switched = false;
    try {
      const result = await this.publish(this.dir(id));
      if (!result || !/^[A-Za-z0-9-]{1,80}$/.test(result.releaseId) || !/^[a-f0-9]{64}$/.test(result.contentVersion)) throw new ApiError('PUBLISH_FAILED', 500);
      this.switchCurrent(id); switched = true;
      meta.state = 'published'; meta.result = { releaseId: result.releaseId, contentVersion: result.contentVersion, targets: result.targets || { cn: 'published', com: 'published' } };
    } catch (error) {
      meta.state = 'failed'; delete meta.result; meta.code = error instanceof ApiError ? error.code : 'PUBLISH_FAILED';
    } finally {
      try { this.save(id, meta); }
      catch {
        // ===== 提交记录失败：回滚公开指针，不让构建成功冒充持久化成功 =====
        if (switched) { try { this.switchCurrent(meta.previousCurrent || null); } catch { /* 目录不可写时由重启恢复旧指针。 */ } }
        meta.state = 'failed'; delete meta.result; meta.code = 'STORE_FAILED';
        try { this.save(id, meta); } catch { this.unpersistedFailures.add(id); }
      } finally { this.active = null; }
    }
  }
}
module.exports = { BatchStore, ApiError, sha256, COLLECTIONS, MAX_IMAGE };
