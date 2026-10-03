/**
 * [INPUT]: 依赖正文标题提取、浏览器滚动与键盘事件
 * [OUTPUT]: 对外提供左侧胶囊触发、阅读进度与单列层级目录
 * [POS]: 保留 V11 胶囊交互，标题按正文顺序连续排列；超长列表滚动且隐藏滚动条，目录跳转不改写 HashRouter
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { List, X } from 'lucide-react';
import { extractHeadings } from '../lib/markdown';

export default function TOC({ content }: { content: string }) {
  const headings = useMemo(() => extractHeadings(content), [content]);
  const rootLevel = Math.min(...headings.map(heading => heading.level));
  const [active, setActive] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [progress, setProgress] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // === 阅读状态：跟随正文，不把页脚算入阅读进度 ===
  useEffect(() => {
    const update = () => {
      const reached = headings.filter(heading => {
        const element = document.getElementById(heading.id);
        return element && element.getBoundingClientRect().top <= 160;
      });
      setActive(reached.at(-1)?.id || headings[0]?.id || '');
      const prose = document.querySelector<HTMLElement>('.blog-prose');
      if (prose) {
        const bounds = prose.getBoundingClientRect();
        const readableHeight = Math.max(bounds.height - window.innerHeight + 160, 1);
        setProgress(Math.round(Math.min(Math.max((160 - bounds.top) / readableHeight, 0), 1) * 100));
      }
    };
    update(); window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [headings]);

  // === 展开与关闭：保留点击锁定，补齐外部点击和 Esc ===
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setExpanded(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setExpanded(false); trigger.current?.focus({ preventScroll: true }); }
    };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [expanded]);

  if (!headings.length) return null;
  return <div ref={root} className="blog-floating-toc" data-expanded={expanded}>
    <button ref={trigger} className="blog-toc-capsule" aria-label={expanded ? '收起文章目录' : '展开文章目录'} aria-expanded={expanded} aria-controls={panelId} title="点击展开/收起目录" onClick={() => setExpanded(value => !value)}>
      <span className="blog-toc-progress" aria-hidden="true"><span>{progress}%</span><span className="blog-toc-progress-track"><span style={{ width: `${progress}%` }} /></span></span>
      <span className="blog-toc-bars" aria-hidden="true">{headings.map((heading, index) => <span key={`${heading.id}-${index}`} data-level={Math.min(heading.level, 3)} className={active === heading.id ? 'is-current' : ''} title={heading.text} />)}</span>
      <List className="blog-toc-mobile-icon" size={18} aria-hidden="true" />
    </button>
    <nav id={panelId} className="blog-toc-panel" aria-label="文章目录" inert={!expanded}>
      <div className="blog-toc-panel-heading"><span>文章目录</span><button className="zzm-btn zzm-btn--icon" aria-label="关闭文章目录" onClick={() => { setExpanded(false); trigger.current?.focus({ preventScroll: true }); }}><X size={14} /></button></div>
      <ul className="blog-toc-list">{headings.map((heading, index) => <li key={`${heading.id}-${index}`} data-heading-id={heading.id} data-root={heading.level === rootLevel} style={{ '--toc-indent': `${(heading.level - rootLevel) * 10}px` } as CSSProperties}>
        <a className={active === heading.id ? 'is-current' : ''} href={`#${heading.id}`} title={heading.text} aria-current={active === heading.id ? 'location' : undefined} onClick={event => {
          event.preventDefault();
          document.getElementById(heading.id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          if (window.matchMedia('(max-width: 1000px)').matches) { setExpanded(false); trigger.current?.focus({ preventScroll: true }); }
        }}>{heading.text}</a>
      </li>)}</ul>
    </nav>
  </div>;
}
