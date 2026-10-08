/**
 * [INPUT]: 依赖文章集合、collection 的统一置顶排序、品牌配置、CollectionHero、PostCard 和 SEO
 * [OUTPUT]: 对外提供 ListPage 内容分类页面
 * [POS]: 三类内容共用的查询与筛选入口；右侧最多四篇置顶与列表优先顺序消费同一规则，筛选不改变置顶集合，空集合有独立状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { getAllPosts } from '../lib/markdown';
import { SITE, type Collection } from '../lib/site';
import { type Post } from '../types';
import { SEO } from '../components/SEO';
import { PostCard } from '../components/PostCard';
import { CollectionHero } from '../components/CollectionHero';
import { createSearchIndex, searchPosts } from '../lib/search';
import { collectionPosts } from '../lib/collection';

export default function ListPage({ collection }: { collection: Collection }) {
  const { label: title, description } = collection;
  const [posts, setPosts] = useState<Post[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPosts([]); setQuery(''); setCategory('全部'); setLoading(true); setLoadError(false);
    getAllPosts().then(data => { if (!cancelled) { setPosts(data.filter(post => post.collectionId === collection.id)); setLoading(false); } }).catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [collection.id]);
  const view = useMemo(() => collectionPosts(posts, collection.id), [posts, collection.id]);
  const categories = useMemo(() => ['全部', ...new Set(posts.map(post => post.category).filter(Boolean))], [posts]);
  const index = useMemo(() => createSearchIndex(posts), [posts]);
  const matches = useMemo(() => new Set(searchPosts(index, query).map(result => result.post.id)), [index, query]);
  const filtered = useMemo(() => view.ordered.filter(post => (category === '全部' || category === post.category) && (!query.trim() || matches.has(post.id))), [view, query, category, matches]);
  return <div className="blog-container blog-collection">
    <SEO title={`${title} - ${SITE.author}`} description={description.replace('|', ' ')} />
    <CollectionHero collection={collection} pinnedPosts={view.pinned} />
    <div className="blog-collection-toolbar"><div className="blog-filter-tabs" role="group" aria-label="内容分类">{categories.map(item => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)} className={`zzm-btn${category === item ? ' zzm-btn--primary' : ' zzm-btn--ghost'}`}>{item}</button>)}</div><div className="blog-list-search"><Search size={16} aria-hidden="true" /><input className="zzm-input" aria-label={`搜索${title}`} placeholder={`搜索${title}…`} value={query} onChange={event => setQuery(event.target.value)} /></div></div>
    <div className="blog-collection-summary"><span>{loading ? '正在载入…' : `共 ${filtered.length} 篇内容`}</span><span>{view.pinned.length ? '置顶优先 · 按发布日期排序' : '按发布日期排序'}</span></div>
    <div className="post-card-list blog-collection-list">{loading ? <p className="blog-empty" role="status">正在载入内容…</p> : loadError ? <p className="blog-empty" role="status">内容暂时无法载入，请刷新重试。</p> : filtered.length ? filtered.map(post => <PostCard key={post.id} post={post} isPinned={view.pinnedIds.has(post.id)} />) : <div className="blog-empty"><h2>{posts.length ? '还没有找到相关内容' : '新的内容，正在酝酿。'}</h2><p>{posts.length ? '换个关键词，或试试其他分类。' : '每一次思考，都会留下新的记录。'}</p>{(query || category !== '全部') && <button className="zzm-btn" onClick={() => { setQuery(''); setCategory('全部'); }}>清除筛选</button>}</div>}</div>
  </div>;
}
