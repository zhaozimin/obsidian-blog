/**
 * [INPUT]: 依赖 Obsidian 栏目快照、品牌配置、React Router 与栏目统一规则选出的置顶文章
 * [OUTPUT]: 对外提供 CollectionHero 栏目介绍组件
 * [POS]: 三类列表共用的左文右图首屏；置顶封面作为可聚焦的阅读入口，悬停层级与放大由样式负责，选取与列表排序留在 collection
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Link } from 'react-router-dom';
import { SITE, type Collection } from '../lib/site';
import { PostType, type Post } from '../types';

export function CollectionHero({ collection, pinnedPosts }: { collection: Collection; pinnedPosts: Post[] }) {
  const covers = pinnedPosts.filter(post => post.cover);
  const intro = collection;
  const tone = collection.type === PostType.PRODUCT ? 'gold' : collection.tone;
  return <header className="blog-collection-hero" data-content-tone={tone}>
    <div className="blog-collection-copy">
      <p className="blog-collection-eyebrow">{collection.english} / {SITE.author}</p>
      <h1>{collection.label}</h1>
      <p className="blog-collection-promise">{intro.promise}</p>
      <p className="blog-collection-description">{intro.description}</p>
      <ul className="blog-collection-topics" aria-label="栏目主题">{intro.topics.map(topic => <li key={topic}>{topic}</li>)}</ul>
    </div>
    <nav className="blog-collection-art" aria-label={`${collection.label}置顶内容`}>
      <div className="blog-collection-scene" data-cover-count={covers.length}>{covers.map(post => <Link key={post.id} className="blog-collection-cover" to={`/post/${encodeURIComponent(post.id)}`} aria-label={`阅读：${post.title}`}><img src={post.cover} alt="" decoding="async" /></Link>)}</div>
    </nav>
  </header>;
}
