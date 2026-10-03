/**
 * [INPUT]: 依赖 ASSETS、可选 PRIVATE_CONTENT R2、限速与共用密码/签名/图片协议
 * [OUTPUT]: 对外提供 Cloudflare Worker fetch，提供静态博客、版本检查与密码文章阅读
 * [POS]: 无服务器方案的公开访问边界；构建、上传及公众号留在用户本机
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { verifyPassword, signSession, verifySession } from '../shared/reader-crypto.mjs';
import readerImages from '../shared/reader-images.cjs';
const SESSION_MS = 30 * 60000;
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const reply = (status, data) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
const denied = () => reply(403, { code: 'READ_DENIED' });
async function snapshot(env) {
  if (!env.PRIVATE_CONTENT) return null;
  const object = await env.PRIVATE_CONTENT.get(`releases/${env.BLOG_RELEASE_ID}/snapshot.json`);
  if (!object) return null;
  const data = await object.json();
  if (data.version !== 1 || data.releaseId !== env.BLOG_RELEASE_ID || !/^[a-f0-9]{64}$/.test(data.signingKey) || !Array.isArray(data.posts)) throw new Error('私有阅读快照无效');
  return data;
}
async function readJson(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return null;
  const reader = request.body?.getReader(); if (!reader) return null;
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 8192) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const joined = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(joined)); } catch { return null; }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (url.search) return reply(400, { code: 'INVALID_INPUT' });
      if (url.pathname === '/api/site/health' && request.method === 'GET') return reply(200, { releaseId: env.BLOG_RELEASE_ID, privateReader: Boolean(env.PRIVATE_CONTENT) });
      if (!url.pathname.startsWith('/api/reader/')) return reply(404, { code: 'NOT_FOUND' });
      const origin = request.headers.get('Origin');
      if (origin && origin !== (env.BLOG_SITE_ORIGIN || url.origin)) return reply(403, { code: 'ORIGIN_DENIED' });
      if (request.method === 'OPTIONS') return reply(204, null);
      const unlock = url.pathname.match(/^\/api\/reader\/posts\/([^/]+)\/unlock$/);
      if (unlock && request.method === 'POST') {
        const id = decodeURIComponent(unlock[1]), ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!env.READER_IP_LIMIT || !env.READER_POST_LIMIT) return reply(503, { code: 'READER_CONFIG' });
        const ipLimit = await env.READER_IP_LIMIT.limit({ key: ip });
        const postLimit = await env.READER_POST_LIMIT.limit({ key: JSON.stringify([ip, id]) });
        if (!ipLimit.success || !postLimit.success) return reply(429, { code: 'RATE_LIMITED' });
        const input = await readJson(request); if (!input) return reply(400, { code: 'INVALID_INPUT' });
        const data = await snapshot(env), post = data?.posts.find(item => item.id === id);
        if (!post || !await verifyPassword(input.password, post.password)) return denied();
        const token = await signSession({ id, releaseId: data.releaseId, expires: Date.now() + SESSION_MS }, data.signingKey);
        const names = new Set(post.images.map(image => image.name));
        const content = readerImages.rewriteReaderImages(post.content, names, token);
        return reply(200, { content, expiresIn: SESSION_MS / 1000 });
      }
      const media = url.pathname.match(/^\/api\/reader\/media\/([A-Za-z0-9_.-]{1,2048})\/([^/]+)$/);
      if (media && request.method === 'GET') {
        const data = await snapshot(env); if (!data) return denied();
        const session = await verifySession(media[1], data.signingKey, data.releaseId); if (!session) return denied();
        const name = decodeURIComponent(media[2]);
        const image = data.posts.find(post => post.id === session.id)?.images.find(item => item.name === name);
        if (!image) return denied();
        const object = await env.PRIVATE_CONTENT.get(image.key); if (!object) return reply(404, { code: 'NOT_FOUND' });
        return new Response(object.body, { headers: { ...headers, 'Content-Type': image.type, 'Content-Security-Policy': "default-src 'none'; sandbox" } });
      }
      return reply(404, { code: 'NOT_FOUND' });
    } catch { return reply(500, { code: 'INTERNAL' }); }
  }
};
