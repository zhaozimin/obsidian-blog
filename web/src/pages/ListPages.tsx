/**
 * [INPUT]: 依赖 文章集合、品牌配置、CollectionHero、PostCard 和 SEO
 * [OUTPUT]: 对外提供 ListPage 内容分类页面
 * [POS]: 三类内容共用的查询与筛选入口，分类来自当前数据，封面交给 CollectionHero，空集合有独立状态
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

export default function ListPage({ collection }: { collection: Collection }) {
  const { label: title, description } = collection;
  const [posts, setPosts] = useState<Post[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setQuery(''); setCategory('全部'); setLoading(true);
    getAllPosts().then(data => { if (!cancelled) { setPosts(data.filter(post => post.collectionId === collection.id).sort((a, b) => b.date.localeCompare(a.date))); setLoading(false); } });
    return () => { cancelled = true; };
  }, [collection.id]);
  const categories = useMemo(() => ['全部', ...new Set(posts.map(post => post.category).filter(Boolean))], [posts]);
  const filtered = useMemo(() => posts.filter(post => (category === '全部' || category === post.category) && `${post.title} ${post.subtitle || ''} ${post.description} ${post.content}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [posts, query, category]);
  return <div className="blog-container blog-collection">
    <SEO title={`${title} - ${SITE.author}`} description={description.replace('|', ' ')} />
    <CollectionHero collection={collection} cover={collection.cover || posts.find(post => post.cover)?.cover} />
    <div className="blog-collection-toolbar"><div className="blog-filter-tabs" role="group" aria-label="内容分类">{categories.map(item => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)} className={`zzm-btn${category === item ? ' zzm-btn--primary' : ' zzm-btn--ghost'}`}>{item}</button>)}</div><div className="blog-list-search"><Search size={16} aria-hidden="true" /><input className="zzm-input" aria-label={`搜索${title}`} placeholder={`搜索${title}…`} value={query} onChange={event => setQuery(event.target.value)} /></div></div>
    <div className="blog-collection-summary"><span>{loading ? '正在载入…' : `共 ${filtered.length} 篇内容`}</span><span>按更新时间排序</span></div>
    <div className="post-card-list blog-collection-list">{loading ? <p className="blog-empty" role="status">正在载入内容…</p> : filtered.length ? filtered.map(post => <PostCard key={post.id} post={post} />) : <div className="blog-empty"><h2>{posts.length ? '还没有找到相关内容' : '新的内容，正在酝酿。'}</h2><p>{posts.length ? '换个关键词，或试试其他分类。' : '每一次思考，都会留下新的记录。'}</p>{(query || category !== '全部') && <button className="zzm-btn" onClick={() => { setQuery(''); setCategory('全部'); }}>清除筛选</button>}</div>}</div>
  </div>;
}
