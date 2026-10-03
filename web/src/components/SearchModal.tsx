/**
 * [INPUT]: 依赖 静态文章数据、lib/search 的匹配句子、site 的类型颜色、React Router 与原生 dialog
 * [OUTPUT]: 对外提供 SearchModal 搜索弹窗
 * [POS]: 全站搜索视图，展示标题/副标题、16:9 缩略图与高亮匹配句子；原生 dialog 管理焦点，索引和排序交给 lib/search
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAllPosts, formatDate } from '../lib/markdown';
import { contentLabel, contentTone } from '../lib/site';
import { createSearchIndex, searchPosts } from '../lib/search';
import type { Post } from '../types';

// === 安全文本高亮：关键词仅作字符串匹配，不生成 HTML 或正则 ===
function highlight(text: string, query: string) {
  const keyword = query.trim().toLocaleLowerCase();
  if (!keyword) return text;
  const parts = [];
  let start = 0;
  let index = text.toLocaleLowerCase().indexOf(keyword);
  while (index !== -1) {
    parts.push(text.slice(start, index), <mark key={index}>{text.slice(index, index + keyword.length)}</mark>);
    start = index + keyword.length;
    index = text.toLocaleLowerCase().indexOf(keyword, start);
  }
  parts.push(text.slice(start));
  return parts;
}

export const SearchModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!isOpen) { dialog.current?.close(); setQuery(''); setActiveIndex(0); return; }
    dialog.current?.showModal(); input.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    let cancelled = false;
    setLoading(true);
    getAllPosts().then(data => { if (!cancelled) { setPosts(data); setLoading(false); } });
    return () => { cancelled = true; document.body.style.overflow = overflow; dialog.current?.close(); };
  }, [isOpen]);
  const index = useMemo(() => createSearchIndex(posts), [posts]);
  const results = useMemo(() => searchPosts(index, query), [index, query]);
  useEffect(() => {
    dialog.current?.querySelector('.blog-search-result')?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [query]);
  const openPost = (id: string) => { navigate(`/post/${id}`); onClose(); };
  return <dialog ref={dialog} className="blog-search-dialog zzm-card" aria-labelledby="search-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="blog-search-heading"><h2 id="search-title">搜索文字与创造</h2><button className="zzm-btn zzm-btn--icon" aria-label="关闭搜索" onClick={onClose}><X size={16} /></button></div>
    <div className="blog-search-field"><Search size={18} aria-hidden="true" /><input ref={input} className="zzm-input" aria-label="搜索文章、书籍与产品" placeholder="搜索文章、书籍与产品…" value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = Math.max(0, Math.min(results.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)));
        setActiveIndex(next);
        dialog.current?.querySelectorAll('.blog-search-result')[next]?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
      if (event.key === 'Enter' && results[activeIndex]) { event.preventDefault(); openPost(results[activeIndex].post.id); }
    }} /></div>
    <div className="blog-search-results" aria-live="polite">
      {loading ? <p className="blog-search-empty">正在整理内容…</p> : !query.trim() ? <p className="blog-search-empty">从一个关键词开始，找到你想读的文字。</p> : !results.length ? <p className="blog-search-empty">没有找到相关内容，试试其他关键词。</p> : results.map(({ post, context }, index) => <button key={post.id} className={`blog-search-result${index === activeIndex ? ' is-selected' : ''}`} data-content-tone={contentTone(post)} onClick={() => openPost(post.id)} onMouseEnter={() => setActiveIndex(index)}>
      <div className="blog-search-result-copy"><span className="blog-label"><span className="blog-content-color">{contentLabel(post)}</span> · {formatDate(post.date)}</span><h3>{highlight(post.title, query)}</h3>{post.subtitle && <p className="blog-search-result-subtitle">{highlight(post.subtitle, query)}</p>}</div>
      <span className="blog-search-result-cover">{post.cover ? <img src={post.cover} alt="" loading="lazy" /> : <span>暂无封面</span>}</span>
      <p className="blog-search-result-context"><span className="blog-search-context-label">{context.source}匹配</span>{highlight(context.text, query)}</p>
      </button>)}
    </div>
    <div className="blog-search-bottom"><span>↑ ↓ 选择 · Enter 打开</span><span>{query.trim() ? `${results.length} 篇相关内容` : 'Esc 关闭'}</span></div>
  </dialog>;
};
