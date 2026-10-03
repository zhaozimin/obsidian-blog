/**
 * [INPUT]: 依赖 public/social 的 App Store 原图、lucide 功能图标、传入链接与浏览器域名/剪贴板
 * [OUTPUT]: 对外提供 SocialButton、SocialPlatform、getAvailablePlatforms
 * [POS]: 全部入口复用邮箱的纸墨按钮，App 原图保留完整方形画面；功能入口复制反馈，RSS 根路径解析为当前站点域名
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react';
import { Mail, Rss } from 'lucide-react';

const platforms = {
  bilibili: { logo: '/social/bilibili.jpg', name: '哔哩哔哩' }, youtube: { logo: '/social/youtube.jpg', name: 'YouTube' },
  tiktok: { logo: '/social/douyin.jpg', name: '抖音' }, kuaishou: { logo: '/social/kuaishou.jpg', name: '快手' },
  xiaohongshu: { logo: '/social/xiaohongshu.jpg', name: '小红书' }, x: { logo: '/social/x.jpg', name: 'X' },
  weibo: { logo: '/social/weibo.jpg', name: '微博' }, zhihu: { logo: '/social/zhihu.jpg', name: '知乎' },
  rss: { icon: Rss, name: 'RSS订阅' }, email: { icon: Mail, name: '邮件' },
};
export type SocialPlatform = keyof typeof platforms;
export const getAvailablePlatforms = () => Object.keys(platforms) as SocialPlatform[];

export function SocialButton({ platform, href }: { platform: SocialPlatform; href: string }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const config = platforms[platform];
  const resolvedHref = platform === 'rss' ? new URL(href, window.location.origin).href : href;
  const copyText = platform === 'rss' ? resolvedHref : platform === 'email' ? href.replace(/^mailto:/, '').split('?')[0] : null;
  return <div className="blog-social-control">
    <a className={`blog-social-button zzm-btn zzm-btn--icon${'logo' in config ? ' blog-social-app' : ''}`} data-platform={platform} href={resolvedHref} target="_blank" rel="noopener noreferrer" aria-label={config.name} title={copyText ? `复制${config.name}` : config.name} onClick={async event => {
      if (!copyText) return;
      event.preventDefault();
      try { await navigator.clipboard.writeText(copyText); setMessage('已复制'); }
      catch { setMessage('复制失败，请重试'); }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(''), 2400);
    }}>{'logo' in config ? <img className="blog-social-logo" src={config.logo} alt="" aria-hidden="true" width={30} height={30} /> : <config.icon className="blog-social-utility" size={18} />}</a>
    <span className="blog-social-feedback" role="status">{message}</span>
  </div>;
}
