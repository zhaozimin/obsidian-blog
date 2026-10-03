/**
 * [INPUT]: 依赖 React Router、站点配置、首页社交数据、AuthorAvatar、搜索与社交按钮
 * [OUTPUT]: 对外提供 Layout 站点框架
 * [POS]: 共享品牌字标与导航/搜索状态，页脚只编排作者、社交及版权/备案，手机作者与社交上下排列
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowUp, Menu, Search, X } from 'lucide-react';
import { getHomeConfig, type HomeConfig } from '../lib/markdown';
import { NAV_ITEMS, SITE } from '../lib/site';
import { SearchModal } from './SearchModal';
import { SocialButton, getAvailablePlatforms } from './SocialButton';
import { AuthorAvatar } from './AuthorAvatar';

const BrandName = () => <>{SITE.name}<span className="blog-logo-dot" aria-hidden="true">.</span></>;

export const Layout = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [config, setConfig] = useState<HomeConfig | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const mobileNavigation = useRef<HTMLDivElement>(null);

  useEffect(() => { getHomeConfig().then(setConfig); }, []);
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 480);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setSearchOpen(value => !value);
      }
      if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    mobileNavigation.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    const onOutside = (event: PointerEvent) => {
      if (!mobileNavigation.current?.contains(event.target as Node) && !menuButton.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [menuOpen]);

  const links = config?.socialLinks || {};
  return (
    <div className="blog-shell">
      <a className="blog-skip" href="#main-content" onClick={event => { event.preventDefault(); const main = document.getElementById('main-content'); main?.focus(); main?.scrollIntoView(); }}>跳到正文</a>
      <header className="blog-header">
        <div className="blog-container blog-header-inner">
          <Link to="/" className="blog-logo" aria-label={`${SITE.name} 首页`}><BrandName /></Link>
          <nav className="blog-nav" aria-label="主导航">
            {NAV_ITEMS.map(item => <NavLink key={item.path} to={item.path} end className={({ isActive }) => `blog-nav-item${isActive ? ' is-active' : ''}`}>{item.label}</NavLink>)}
          </nav>
          <div className="blog-header-actions">
            <button className="zzm-btn blog-search-trigger" onClick={() => setSearchOpen(true)} aria-label="搜索全站"><Search size={16} /><span>搜索</span><kbd>⌘ K</kbd></button>
            <button ref={menuButton} className="zzm-btn zzm-btn--icon blog-menu-toggle" aria-label={menuOpen ? '关闭导航' : '打开导航'} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={18} /> : <Menu size={18} />}</button>
          </div>
        </div>
        <div ref={mobileNavigation} id="mobile-navigation" className="blog-mobile-navigation" hidden={!menuOpen}>
          <nav aria-label="手机导航">{NAV_ITEMS.map(item => <NavLink key={item.path} to={item.path} end className={({ isActive }) => `blog-nav-item${isActive ? ' is-active' : ''}`} onClick={() => setMenuOpen(false)}>{item.label}</NavLink>)}</nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="blog-footer">
        <div className="blog-container">
          <div className="blog-footer-main">
            <Link to="/about" className="blog-footer-author"><AuthorAvatar src={config?.heroImage || SITE.avatar} alt={`${SITE.author}头像`} /><div><strong><BrandName /></strong><span className="blog-footer-tagline">{SITE.tagline}</span></div></Link>
            <div className="blog-socials">{getAvailablePlatforms().filter(platform => links[platform]).map(platform => <SocialButton key={platform} platform={platform} href={links[platform]} />)}</div>
          </div>
          <div className="blog-footer-bottom"><div className="blog-footer-copyright"><span>© {new Date().getFullYear()} {SITE.author}</span><span>{SITE.footerText}</span></div><div className="blog-footer-registration">{SITE.registration.map(item => <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer">{item.text}</a>)}</div></div>
        </div>
      </footer>
      {showTop && <button className="zzm-btn zzm-btn--icon blog-back-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="回到顶部"><ArrowUp size={18} /></button>}
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
};
