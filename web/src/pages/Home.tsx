/**
 * [INPUT]: 依赖 首页配置与文章集合、SITE、PostCard 和 SEO
 * [OUTPUT]: 对外提供 Home 首页
 * [POS]: 有配置时通铺肖像承载作者介绍，空模板不请求默认照片；分隔线衔接自动生成的最近更新和空态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { getAllPosts, getHomeConfig, type HomeConfig } from '../lib/markdown';
import { SITE } from '../lib/site';
import { type Post } from '../types';
import { SEO } from '../components/SEO';
import { PostCard } from '../components/PostCard';

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [config, setConfig] = useState<HomeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getAllPosts(), getHomeConfig()]).then(([data, home]) => { if (!cancelled) { setPosts([...data].sort((a, b) => b.date.localeCompare(a.date))); setConfig(home); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);
  const recent = posts.slice(0, 6);
  return <div className="blog-home">
    <SEO title={config?.seoTitle || SITE.name} description={config?.seoDescription || ""} image={SITE.avatar} />
    <section className="blog-hero" aria-labelledby="home-title">
      {(config?.heroPortrait || SITE.portrait) && <img className="blog-hero-portrait" src={config?.heroPortrait || SITE.portrait} alt={`${SITE.author}的半身肖像`} fetchPriority="high" />}
      <div className="blog-container blog-hero-inner">
        <div className="blog-hero-copy">
          <p className="blog-eyebrow">{config?.eyebrow}</p>
          <h1 id="home-title">{config?.heroTitle || ''}</h1>
          <p className="blog-hero-role">{config?.heroSubtitle.split('\n')[0] || ''}</p>
          <p className="blog-hero-description">{config?.heroSubtitle.split('\n').slice(1).join('\n') || ''}</p>
          <div className="blog-hero-actions">
            <button className="zzm-btn zzm-btn--primary zzm-btn--lg" onClick={() => document.getElementById('recent-writing')?.scrollIntoView({ behavior: 'smooth' })}>开始阅读 <ArrowDown size={16} /></button>
            <Link className="zzm-btn zzm-btn--lg" to="/about">关于我 <ArrowUpRight size={16} /></Link>
          </div>
        </div>
      </div>
    </section>
    <section id="recent-writing" className="blog-recent" aria-labelledby="recent-title">
      <div className="blog-container">
        <div className="blog-section-head blog-recent-head"><span className="blog-label">{config?.recentEnglish}</span><h2 id="recent-title">{config?.recentTitle}</h2><p>{config?.recentDescription}</p></div>
        <div className="post-card-list">{loading ? <p className="blog-empty" role="status">正在载入文字…</p> : recent.length ? recent.map(post => <PostCard key={post.id} post={post} />) : <div className="blog-empty"><h3>新的文字，正在酝酿。</h3><p>这里会记录最近的思考、阅读与创造。</p></div>}</div>
      </div>
    </section>

  </div>;
}
