/**
 * [INPUT]: 依赖浏览器 URL 语义和内容中的链接文本
 * [OUTPUT]: 对外提供 safeLinkUrl、safeImageUrl 与 readerServiceOrigin
 * [POS]: 前端 URL 信任边界；正文和元数据共用协议白名单，阅读密码仅发往 HTTPS 或环回服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const baseOrigin = () => typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
function safeUrl(value: unknown, protocols: string[]): string {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return '';
  const input = value.trim();
  try {
    const url = new URL(input, baseOrigin());
    return protocols.includes(url.protocol) && !url.username && !url.password ? input : '';
  } catch { return ''; }
}
export const safeLinkUrl = (value: unknown) => safeUrl(value, ['http:', 'https:', 'mailto:', 'tel:']);
export const safeImageUrl = (value: unknown) => safeUrl(value, ['http:', 'https:']);
export function readerServiceOrigin(value: unknown): string {
  const input = typeof value === 'string' && value ? value : baseOrigin();
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('阅读服务地址无效，请联系站点作者。'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) throw new Error('阅读服务必须使用 HTTPS，请联系站点作者。');
  return url.origin;
}
