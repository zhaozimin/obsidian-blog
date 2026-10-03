/**
 * [INPUT]: 依赖标准 Web Crypto、UTF-8 与安全随机数，供 Node 和 Worker 共用
 * [OUTPUT]: 对外提供密码派生验证与限时图片授权的签名/验签
 * [POS]: Cloudflare 私有阅读的协议边界；不依赖磁盘或平台存储
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const encoder = new TextEncoder();
export const PASSWORD_ITERATIONS = 100000;
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const unhex = text => Uint8Array.from(text.match(/../g) || [], byte => parseInt(byte, 16));
const equal = (a, b) => { let result = a.length ^ b.length; for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0); return result === 0; };
async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: PASSWORD_ITERATIONS }, key, 256));
}
export async function passwordRecord(password) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await derive(password, salt), iterations: PASSWORD_ITERATIONS };
}
export async function verifyPassword(password, record) {
  return typeof password === 'string' && password.length <= 1024 && record?.iterations === PASSWORD_ITERATIONS && /^[a-f0-9]{32}$/.test(record.salt) && /^[a-f0-9]{64}$/.test(record.hash) && equal(await derive(password, record.salt), record.hash);
}
async function hmac(value, key, action, signature) {
  const imported = await crypto.subtle.importKey('raw', unhex(key), { name: 'HMAC', hash: 'SHA-256' }, false, [action]);
  return action === 'sign' ? hex(await crypto.subtle.sign('HMAC', imported, encoder.encode(value))) : crypto.subtle.verify('HMAC', imported, unhex(signature), encoder.encode(value));
}
export async function signSession(session, key) {
  const bytes = encoder.encode(JSON.stringify(session));
  const body = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${body}.${await hmac(body, key, 'sign')}`;
}
export async function verifySession(token, key, releaseId, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const [body, signature, extra] = token.split('.');
  if (extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(body) || !/^[a-f0-9]{64}$/.test(signature || '') || !await hmac(body, key, 'verify', signature)) return null;
  try {
    const decoded = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    const session = JSON.parse(new TextDecoder().decode(Uint8Array.from(decoded, char => char.charCodeAt(0))));
    return session.releaseId === releaseId && typeof session.id === 'string' && Number.isFinite(session.expires) && session.expires > now ? session : null;
  } catch { return null; }
}
