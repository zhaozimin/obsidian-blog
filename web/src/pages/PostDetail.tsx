/**
 * [INPUT]: 依赖公开内容集合、服务器阅读授权、统一品牌与类型、TOC 及正文渲染
 * [OUTPUT]: 对外提供 PostDetail 阅读页面与显式内容类型样式入口，验密成功才在内存加载受保护正文
 * [POS]: 三类详情将元信息独立置顶，下方紧凑四段文字与 16:9 封面居中对齐，书籍作者在按钮行右侧并限制宽度，标签文字双向居中；胶囊目录与正文渲染独立
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, Lock, X } from 'lucide-react';
import { getAllPosts, formatDate } from '../lib/markdown';
import { unlockPost } from '../lib/reader';
import { collectionFor, SITE, readingLabel, categoryTone, contentTone, contentLabel } from '../lib/site';
import { PostType, type Post } from '../types';
import TOC from '../components/TOC';
import { SEO } from '../components/SEO';
import { useImageViewer } from '../components/ImageViewerContext';
import { createContentRenderer } from './post-detail/content';

export default function PostDetail() {
  const { id } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const unlockRequest = useRef<AbortController | null>(null);
  const passwordDialog = useRef<HTMLDialogElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const { openImage } = useImageViewer();
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setPasswordOpen(false); setPassword(''); setPasswordError('');
    setUnlocking(false);
    getAllPosts().then(data => {
      if (cancelled) return;
      const current = data.find(item => item.id === id) || null;
      setPost(current); setAllPosts([...data].sort((a, b) => b.date.localeCompare(a.date)));
      setUnlocked(!current?.isProtected); setLoading(false);
    });
    return () => { cancelled = true; unlockRequest.current?.abort(); };
  }, [id]);
  useEffect(() => {
    const dialog = passwordDialog.current;
    if (!passwordOpen) { dialog?.close(); setPassword(''); setPasswordError(''); return; }
    dialog?.showModal(); passwordInput.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; dialog?.close(); };
  }, [passwordOpen]);
  if (loading) return <div className="blog-container blog-empty" role="status">正在打开这篇内容…</div>;
  if (!post) return <Navigate to="/not-found" replace />;
  const kind = collectionFor(post);
  const readingInfo = readingLabel(post);
  const bookMetadata = post.type === PostType.BOOK_NOTE && post.author ? `${post.author}${post.publisher ? ` / ${post.publisher}` : ''}` : '';
  const index = allPosts.findIndex(item => item.id === post.id);
  const previous = allPosts[index - 1];
  const next = allPosts[index + 1];
  const renderContent = createContentRenderer({ post, isUnlocked: unlocked, allPostsList: allPosts, openImage, onUnlock: () => setPasswordOpen(true) });
  const unlock = async () => {
    if (unlocking || !password) return;
    const controller = new AbortController(); unlockRequest.current = controller;
    setUnlocking(true); setPasswordError('');
    try {
      const content = await unlockPost(post.id, password, controller.signal);
      if (controller.signal.aborted) return;
      setPost({ ...post, content }); setUnlocked(true); setPasswordOpen(false); setPassword('');
    } catch (error) {
      if (!controller.signal.aborted) setPasswordError(error instanceof Error ? error.message : '解锁失败，请重试。');
    } finally { if (!controller.signal.aborted) setUnlocking(false); }
  };
  return <div className="blog-container blog-detail">
    <SEO title={`${post.title} - ${SITE.author}`} description={post.description || post.title} type="article" image={post.cover} />
    <TOC key={post.id} content={post.content} />
    <nav className="blog-breadcrumb" aria-label="面包屑"><Link to="/">首页</Link><span>/</span><Link to={kind.path}>{kind.label}</Link><span>/</span><span aria-current="page">{post.title}</span></nav>
    <div className="blog-reading-layout"><article className="blog-article" data-post-type={post.type} data-content-tone={contentTone(post)}>
      <header className={`blog-post-header${post.cover ? ' blog-post-header--split' : ''}`}>
        <div className="post-card-meta"><span className="blog-badge blog-kind-badge"><span>{contentLabel(post)}</span></span><span className="blog-badge" data-tone={categoryTone(post.category)} title={post.category || kind.label}><span>{post.category || kind.label}</span></span><time dateTime={post.date}>{formatDate(post.date)}</time><span className={post.type === PostType.PRODUCT ? 'blog-content-color' : undefined} title={readingInfo}>{readingInfo}</span></div>
        <div className="blog-post-main">
          <div className="blog-post-intro">
            <h1 title={post.title}>{post.title}</h1>
            <p className="blog-post-subtitle" title={post.subtitle}>{post.subtitle}</p>
            <p className="blog-post-description" title={post.description}>{post.description}</p>
            <div className="blog-post-actions">
              {post.type === PostType.PRODUCT && post.buyUrl && <a className="zzm-btn zzm-btn--primary blog-product-action" href={post.buyUrl} target="_blank" rel="noopener noreferrer"><span>{post.price?.includes('免费') ? '立即获取' : '了解产品'}</span><ArrowUpRight size={14} /></a>}
              {post.videoUrl && <a className="zzm-btn" href={post.videoUrl} target="_blank" rel="noopener noreferrer"><span>观看相关视频</span><ArrowUpRight size={14} /></a>}
              {post.type === PostType.BOOK_NOTE && post.doubanUrl && <a className="zzm-btn" href={post.doubanUrl} target="_blank" rel="noopener noreferrer"><span>在豆瓣查看</span><ArrowUpRight size={14} /></a>}
              {bookMetadata && <p className="blog-post-book-meta" title={bookMetadata}>{bookMetadata}</p>}
            </div>
          </div>
          {post.cover && <button className="blog-post-cover" onClick={() => openImage(post.cover!, post.title)} aria-label={`放大${post.title}封面`}><img src={post.cover} alt={`${post.title}封面`} /></button>}
        </div>
      </header>
      <div className="markdown-content blog-prose">{renderContent(post.content)}</div>
      <div className="blog-post-end"><span>—</span><p>{SITE.tagline}</p><Link to="/about">{SITE.author}</Link></div>
      <nav className="blog-adjacent-posts" aria-label="前后篇导航">{previous ? <Link to={`/post/${previous.id}`} className="zzm-cardlink"><span><ArrowLeft size={14} />上一篇</span><strong>{previous.title}</strong><p>{previous.subtitle}</p></Link> : <div />}{next && <Link to={`/post/${next.id}`} className="zzm-cardlink"><span>下一篇<ArrowRight size={14} /></span><strong>{next.title}</strong><p>{next.subtitle}</p></Link>}</nav>
    </article></div>
    <dialog ref={passwordDialog} className="blog-password-dialog zzm-card" aria-labelledby="password-title" onCancel={event => { event.preventDefault(); setPasswordOpen(false); }} onClick={event => { if (event.target === passwordDialog.current) setPasswordOpen(false); }}><div className="blog-search-heading"><h2 id="password-title"><Lock size={18} />输入阅读密码</h2><button className="zzm-btn zzm-btn--icon" aria-label="关闭密码窗口" onClick={() => setPasswordOpen(false)}><X size={16} /></button></div><p>输入密码，继续阅读完整内容。</p><form onSubmit={event => { event.preventDefault(); unlock(); }}><input ref={passwordInput} className="zzm-input" type="password" autoComplete="off" required disabled={unlocking} aria-label="阅读密码" placeholder="请输入密码" value={password} onChange={event => setPassword(event.target.value)} aria-invalid={!!passwordError} aria-describedby="password-error" /><p id="password-error" role="status">{passwordError}</p><button className="zzm-btn zzm-btn--primary" type="submit" disabled={unlocking}>{unlocking ? '正在验证…' : '解锁阅读'} <ArrowRight size={14} /></button></form></dialog>
  </div>;
}
