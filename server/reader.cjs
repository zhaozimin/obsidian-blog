/**
 * [INPUT]: 依赖成功批次、私有内容契约、公开图片分类、共享图片改写与 Node crypto/fs
 * [OUTPUT]: 对外提供 createReader；验密后返回正文与限时、限定文章的图片访问能力
 * [POS]: 阅读授权边界，与上传 Bearer 密钥分离；未持久化成功的批次不提供正文，密码和专属图片不进入静态包
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ApiError } = require('./store.cjs');
const { rewriteReaderImages } = require('../shared/reader-images.cjs');
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', apng: 'image/apng' };
const digest = value => crypto.createHash('sha256').update(value).digest();
function createReader({ store, readContent, publicSnapshot, localImageNames, origins = [], now = Date.now }) {
  const allowed = new Set(origins), sessions = new Map(), attempts = new Map();
  let currentId, content;
  const snapshot = () => {
    const id = store.current();
    if (!id) throw new ApiError('NOT_FOUND', 404);
    if (store.load && store.load(id).state !== 'published') throw new ApiError('READ_UNAVAILABLE', 503);
    if (id !== currentId) {
      const source = readContent(path.join(store.dir(id), 'content'));
      content = { posts: source.allPosts, privateImages: publicSnapshot(source).privateImages };
      currentId = id; sessions.clear();
    }
    return content;
  };
  const prune = map => { for (const [key, value] of map) if (value.expires <= now()) map.delete(key); };
  const throttle = (ip, id) => {
    prune(attempts);
    if (attempts.size >= 10000) throw new ApiError('RATE_LIMITED', 429);
    for (const [key, limit] of [[JSON.stringify([ip]), 30], [JSON.stringify([ip, id]), 6]]) {
      const value = attempts.get(key) || { count: 0, expires: now() + 60000 };
      value.count++; attempts.set(key, value);
      if (value.count > limit) throw new ApiError('RATE_LIMITED', 429);
    }
  };
  return {
    cors(origin) {
      if (!origin) return {};
      if (!allowed.has(origin)) throw new ApiError('ORIGIN_DENIED', 403);
      return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
    },
    unlock(id, password, ip) {
      throttle(ip, id);
      const source = snapshot(), post = source.posts.find(item => item.id === id && item.password);
      // 无文章、无密码与错误密码采用同一响应，避免透露私有记录和验密细节。
      if (!post || typeof password !== 'string' || password.length > 1024 || !crypto.timingSafeEqual(digest(post.password), digest(password))) throw new ApiError('READ_DENIED', 403);
      prune(sessions);
      if (sessions.size >= 5000) throw new ApiError('RATE_LIMITED', 429);
      const token = crypto.randomBytes(32).toString('hex');
      const images = new Set([...localImageNames(post.content)].filter(name => source.privateImages.has(name)));
      sessions.set(token, { batch: currentId, images, expires: now() + 30 * 60000 });
      const rewritten = rewriteReaderImages(post.content, images, token);
      return { content: rewritten, expiresIn: 1800 };
    },
    media(token, filename) {
      snapshot(); prune(sessions);
      const session = sessions.get(token);
      if (!session || session.batch !== currentId || !session.images.has(filename) || path.basename(filename) !== filename || filename.includes('\\')) throw new ApiError('READ_DENIED', 403);
      const file = path.join(store.dir(currentId), 'images', filename);
      if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) throw new ApiError('NOT_FOUND', 404);
      return { bytes: fs.readFileSync(file), type: MIME[path.extname(filename).slice(1).toLowerCase()] || 'application/octet-stream' };
    },
  };
}
module.exports = { createReader };
