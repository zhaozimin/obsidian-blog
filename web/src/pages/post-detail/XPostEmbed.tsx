/**
 * [INPUT]: 依赖 React 生命周期与 X 官方 widgets.js，接收已校验的 status 地址
 * [OUTPUT]: 对外提供 readXPostUrl 地址解析与 XPostEmbed 渐进增强嵌入组件
 * [POS]: 文章正文的 X 帖子边界；官方脚本成功时生成卡片，被拦截或失败时保留原文链接
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React, { useEffect, useRef, useState } from 'react';

const X_WIDGETS_SRC = 'https://platform.twitter.com/widgets.js';
const X_POST_HOSTS = new Set(['x.com', 'www.x.com', 'mobile.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);

interface XWidgets {
  createTweet: (
    id: string,
    target: HTMLElement,
    options: { align: 'center'; conversation: 'none'; dnt: true; theme: 'light' },
  ) => Promise<HTMLElement | undefined>;
}

declare global {
  interface Window {
    twttr?: { widgets?: XWidgets };
  }
}

export interface XPostSource {
  id: string;
  url: string;
}

let widgetsPromise: Promise<XWidgets> | null = null;

// ---------- 地址边界 ----------
// 只接受 X/Twitter 官方主机的数字 status，避免把相似域名或任意路径交给第三方脚本。
export function readXPostUrl(source: string): XPostSource | null {
  try {
    const url = new URL(source.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !X_POST_HOSTS.has(url.hostname.toLowerCase())) return null;
    const standard = url.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/([0-9]+)(?:\/(?:photo|video)\/[0-9]+)?\/?$/);
    const legacy = url.pathname.match(/^\/i\/web\/status\/([0-9]+)\/?$/);
    if (!standard && !legacy) return null;
    const id = standard?.[2] || legacy![1];
    const author = standard?.[1] || 'i';
    return { id, url: `https://x.com/${author}/status/${id}` };
  } catch {
    return null;
  }
}

function loadXWidgets(): Promise<XWidgets> {
  if (window.twttr?.widgets) return Promise.resolve(window.twttr.widgets);
  if (widgetsPromise) return widgetsPromise;

  widgetsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${X_WIDGETS_SRC}"]`);
    const script = existing || document.createElement('script');
    const timeout = window.setTimeout(() => finish(new Error('X widgets 加载超时')), 12000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      script.removeEventListener('load', loaded);
      script.removeEventListener('error', failed);
    };
    const finish = (error?: Error) => {
      const widgets = window.twttr?.widgets;
      cleanup();
      if (!error && widgets) resolve(widgets);
      else {
        script.remove();
        reject(error || new Error('X widgets 未提供嵌入能力'));
      }
    };
    const loaded = () => finish();
    const failed = () => finish(new Error('X widgets 加载失败'));

    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });
    if (!existing) {
      script.src = X_WIDGETS_SRC;
      script.async = true;
      script.charset = 'utf-8';
      document.head.appendChild(script);
    }
  });
  widgetsPromise.catch(() => { widgetsPromise = null; });
  return widgetsPromise;
}

export function XPostEmbed({ source }: { source: XPostSource }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    setStatus('loading');

    void loadXWidgets()
      .then(widgets => {
        if (cancelled) return undefined;
        return widgets.createTweet(source.id, host, { align: 'center', conversation: 'none', dnt: true, theme: 'light' });
      })
      .then(widget => {
        if (!cancelled) setStatus(widget ? 'loaded' : 'failed');
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [source.id]);

  return (
    <figure className="blog-x-embed" data-status={status}>
      <div ref={hostRef} className="blog-x-embed__widget" />
      {status !== 'loaded' && (
        <a className="blog-x-embed__fallback" href={source.url} target="_blank" rel="noopener noreferrer">
          {status === 'failed' ? '无法加载 X 卡片，查看原文' : '正在加载 X 内容…'}
        </a>
      )}
    </figure>
  );
}
