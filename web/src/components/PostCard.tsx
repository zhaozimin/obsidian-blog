/**
 * [INPUT]: 依赖 React Router、公开 Post 保护标记、日期格式与站点分类/类型颜色语义
 * [OUTPUT]: 对外提供 PostCard 内容卡片
 * [POS]: 首页与分类共用的 16:9 封面入口，分类标签独立配色，类型标识和阅读入口使用长文红/书籍绿/付费金
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { ArrowUpRight, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PostType, type Post } from '../types';
import { formatDate } from '../lib/markdown';
import { collectionFor, readingLabel, categoryTone, contentTone, contentLabel } from '../lib/site';

export function PostCard({ post }: { post: Post }) {
  return (
    <Link to={`/post/${post.id}`} className="post-card zzm-cardlink" data-content-tone={contentTone(post)}>
      <div className="post-card-cover">
        {post.cover ? <img src={post.cover} alt="" loading="lazy" /> : <span className="post-card-cover-label">{collectionFor(post).english}</span>}
        <span className="post-card-kind">{contentLabel(post)}</span>
      </div>
      <div className="post-card-copy">
        <div className="post-card-meta"><span className="blog-badge" data-tone={categoryTone(post.category)}>{post.category || collectionFor(post).label}</span><time dateTime={post.date}>{formatDate(post.date)}</time></div>
        <h3>{post.isProtected && <Lock size={14} aria-label="需要密码" />}<span>{post.title}</span></h3>
        {post.subtitle && <p className="post-card-subtitle">{post.subtitle}</p>}
        <p className="post-card-description">{post.description}</p>
        <div className="post-card-bottom"><span className={post.type === PostType.PRODUCT ? 'blog-content-color' : undefined}>{readingLabel(post)}</span><span className="post-card-read">{post.type === PostType.PRODUCT ? '查看产品' : '阅读全文'} <ArrowUpRight size={14} aria-hidden="true" /></span></div>
      </div>
    </Link>
  );
}
