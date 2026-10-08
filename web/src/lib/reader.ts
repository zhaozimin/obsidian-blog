/**
 * [INPUT]: 依赖公开快照的阅读服务地址、服务器或 Worker 图片授权协议、浏览器 fetch 与取消信号
 * [OUTPUT]: 对外提供 unlockPost，返回服务器授权正文，转换跨站限时图片地址
 * [POS]: 阅读网络边界；密码只在 HTTPS 请求体中提交，正文和授权凭证只留在页面内存
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { getReaderOrigin } from './markdown';

export async function unlockPost(id: string, password: string, signal: AbortSignal): Promise<string> {
  const origin = await getReaderOrigin();
  signal.throwIfAborted();
  let response: Response;
  try {
    response = await fetch(new URL(`/api/reader/posts/${encodeURIComponent(id)}/unlock`, origin), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }), signal, cache: 'no-store',
      credentials: 'omit', referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('阅读服务暂时无法连接，请稍后重试。');
  }
  if (response.status === 429) throw new Error('尝试过于频繁，请一分钟后再试。');
  if (response.status === 403) throw new Error('密码不正确，请再试一次。');
  if (!response.ok) throw new Error('阅读服务暂时不可用，请稍后重试。');
  let data: { content?: unknown } | null;
  try { data = await response.json(); } catch { throw new Error('阅读服务返回异常，请稍后重试。'); }
  signal.throwIfAborted();
  if (!data || typeof data.content !== 'string') throw new Error('阅读服务返回异常，请稍后重试。');
  return data.content.replace(/(?<![A-Za-z0-9:/])\/api\/reader\/media\/[A-Za-z0-9_.-]{1,2048}\/[^\s)"'<>]+/g, path => new URL(path, origin).href);
}
