/**
 * [INPUT]: 依赖 人生故事、首页头像配置、AuthorAvatar、SITE、COLLECTIONS 与 SEO
 * [OUTPUT]: 对外提供 About 关于页面
 * [POS]: 作者身份与经历共用 960px 居中限宽容器；手机首屏左侧座右铭、右侧头像，下接简历，故事支持鼠标展开与点击固定
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getAboutStories, getHomeConfig, type AboutStory, type HomeConfig } from '../lib/markdown';
import { SITE, COLLECTIONS, type Collection } from '../lib/site';
import { SEO } from '../components/SEO';
import { AuthorAvatar } from '../components/AuthorAvatar';

function LifeStory({ story }: { story: AboutStory }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = hovered || pinned;
  const contentId = `story-${story.id}`;
  return <article className="blog-story" data-expanded={expanded} onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }} onPointerLeave={() => setHovered(false)}>
    <h3><button className="blog-story-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => setPinned(value => !value)}><span className="blog-story-year">{story.date ? new Date(story.date).getUTCFullYear() : '—'}</span><span className="blog-story-title">{story.title}</span><Plus size={18} aria-hidden="true" /></button></h3>
    <div id={contentId} className="blog-story-body"><p>{story.content}</p></div>
  </article>;
}

export default function About({ collection }: { collection: Collection }) {
  const [stories, setStories] = useState<AboutStory[]>([]);
  const [config, setConfig] = useState<HomeConfig | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getAboutStories(), getHomeConfig()]).then(([data, home]) => { if (!cancelled) { setStories(data); setConfig(home); } }).catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, []);
  return <div className="blog-container blog-about">
    <SEO title={`${collection.label} - ${SITE.author}`} description={collection.description} image={config?.heroImage || SITE.avatar} />
    <header className="blog-about-intro"><div className="blog-about-copy"><p className="blog-eyebrow">{collection.english} <span>/</span> {SITE.author}</p><h1><span className="blog-about-heading">{collection.promise}</span><span className="blog-about-motto">{SITE.tagline.replace('，', '，\n')}</span></h1><p className="blog-about-description">{collection.description || ''}</p><Link to={COLLECTIONS.find(item => item.kind === 'article')?.path || '/'} className="zzm-btn zzm-btn--primary zzm-btn--lg blog-about-read">{SITE.aboutReadLabel} <ArrowUpRight size={16} /></Link></div><AuthorAvatar className="blog-about-avatar" src={config?.heroImage || SITE.avatar} alt={`${SITE.author}头像`} /></header>
    <section className="blog-life"><div className="blog-section-head"><div><span className="blog-label">{SITE.journeyEnglish}</span><h2>{SITE.journeyTitle}</h2></div><span>{SITE.journeyDescription}</span></div><div className="blog-timeline">{loadError ? <p className="blog-empty" role="status">经历暂时无法载入，请刷新重试。</p> : stories.length ? stories.map(story => <LifeStory key={story.id} story={story} />) : <p className="blog-empty">经历正在整理中。</p>}</div></section>
  </div>;
}
