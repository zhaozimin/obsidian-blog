/**
 * [INPUT]: 依赖 Node HTTP/crypto、BatchStore、Reader、公众号草稿服务与静态站点
 * [OUTPUT]: 对外提供 createReceiver，隔离公开阅读与鉴权博客上传/公众号草稿路由
 * [POS]: 接收服务的外部边界；先鉴权再读取上传体，异常只返回业务错误码，不返回握手、路径或构建输出
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const http = require('node:http');
const crypto = require('node:crypto');
const { ApiError, MAX_IMAGE } = require('./store.cjs');
async function read(req, limit) {
  if (Number(req.headers['content-length']) > limit) throw new ApiError('TOO_LARGE', 413);
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new ApiError('TOO_LARGE', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function json(req, limit = 32 * 1024 * 1024) {
  if (!String(req.headers['content-type']).startsWith('application/json')) throw new ApiError('INVALID_INPUT');
  try { return JSON.parse((await read(req, limit)).toString('utf8')); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('INVALID_INPUT'); }
}
function createReceiver(store, key, reader, { wechat, staticSite } = {}) {
  if (typeof key !== 'string' || key.length < 32) throw new Error('访问密钥至少需要 32 个字符。');
  const expected = crypto.createHash('sha256').update(`Bearer ${key}`).digest();
  const server = http.createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    let cors = {};
    const reply = (status, data) => {
      if (res.destroyed) return;
      res.writeHead(status, { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        if (staticSite && staticSite(req, res, url.pathname)) return;
        return reply(404, { code: 'NOT_FOUND' });
      }
      if (url.search) throw new ApiError('INVALID_INPUT');
      if (reader && url.pathname.startsWith('/api/reader/')) {
        cors = reader.cors(req.headers.origin);
        if (req.method === 'OPTIONS') return reply(204, null);
        const unlock = url.pathname.match(/^\/api\/reader\/posts\/([^/]+)\/unlock$/);
        if (unlock && req.method === 'POST') {
          let id; try { id = decodeURIComponent(unlock[1]); } catch { throw new ApiError('INVALID_INPUT'); }
          const address = req.socket.remoteAddress || '';
          const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
          const ip = local ? String(req.headers['x-real-ip'] || address) : address;
          const input = await json(req, 8192);
          return reply(200, reader.unlock(id, input?.password, ip));
        }
        const media = url.pathname.match(/^\/api\/reader\/media\/([a-f0-9]{64})\/([^/]+)$/);
        if (media && req.method === 'GET') {
          let name; try { name = decodeURIComponent(media[2]); } catch { throw new ApiError('INVALID_INPUT'); }
          const result = reader.media(media[1], name);
          res.writeHead(200, { ...cors, 'Content-Type': result.type, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
          return res.end(result.bytes);
        }
        throw new ApiError('NOT_FOUND', 404);
      }
      const given = crypto.createHash('sha256').update(String(req.headers.authorization || '')).digest();
      if (!crypto.timingSafeEqual(expected, given)) throw new ApiError('UNAUTHORIZED', 401);
      if (wechat && url.pathname.startsWith('/api/wechat/')) {
        if (req.method === 'GET' && url.pathname === '/api/wechat/health') return reply(200, wechat.health());
        if (req.method === 'POST' && url.pathname === '/api/wechat/preview') return reply(200, await wechat.preview(await json(req, 36 * 1024 * 1024)));
        if (req.method === 'POST' && url.pathname === '/api/wechat/drafts') return reply(200, await wechat.draft((await json(req, 8192))?.previewId));
        throw new ApiError('NOT_FOUND', 404);
      }
      if (req.method === 'GET' && url.pathname === '/api/publish/health') return reply(200, { status: 'ok', protocol: 1 });
      if (req.method === 'POST' && url.pathname === '/api/publish/batches') return reply(201, store.create(await json(req)));
      const route = url.pathname.match(/^\/api\/publish\/batches\/([a-f0-9-]+)(?:\/(commit)|\/images\/([^/]+))?$/);
      if (!route) throw new ApiError('NOT_FOUND', 404);
      const [, id, commit, image] = route;
      if (req.method === 'GET' && !commit && !image) return reply(200, store.status(id));
      if (req.method === 'POST' && commit) { await json(req); return reply(202, store.commit(id)); }
      if (req.method === 'PUT' && image) {
        let filename; try { filename = decodeURIComponent(image); } catch { throw new ApiError('INVALID_INPUT'); }
        return reply(200, store.upload(id, filename, await read(req, MAX_IMAGE)));
      }
      throw new ApiError('NOT_FOUND', 404);
    } catch (error) { reply(error instanceof ApiError ? error.status : 500, { code: error instanceof ApiError ? error.code : 'INTERNAL' }); }
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  return server;
}
module.exports = { createReceiver };
