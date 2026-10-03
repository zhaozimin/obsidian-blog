/**
 * [INPUT]: 依赖 Obsidian 栏目快照与品牌配置、PostType、lucide-react 箭头和栏目最新内容的可选封面
 * [OUTPUT]: 对外提供 CollectionHero 栏目介绍组件
 * [POS]: 三类列表共用的左文右图首屏；画面结构在此，全部主题文字由栏目笔记提供，查询与筛选状态留在 ListPages
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { ArrowRight } from 'lucide-react';
import { SITE, type Collection } from '../lib/site';
import { PostType } from '../types';

function CollectionArtwork({ collection, cover }: { collection: Collection; cover?: string }) {
  const { type, art } = collection;
  if (type === PostType.BOOK_NOTE) return <>
    {cover ? <img className="blog-collection-book" src={cover} alt="" decoding="async" /> : <div className="blog-collection-book blog-collection-placeholder">{art.placeholder}</div>}
    <div className="blog-collection-sheet blog-collection-reading-note">
      <span className="blog-collection-sheet-label">{art.label}</span>
      <p><b>{art.primary}</b></p><p>{art.secondary}</p><p>{art.tertiary}</p>
    </div>
    <span className="blog-collection-book-label">{art.caption}</span>
  </>;
  if (type === PostType.PRODUCT) return <>
    {cover ? <img className="blog-collection-tutorial" src={cover} alt="" decoding="async" /> : <div className="blog-collection-tutorial blog-collection-placeholder">{art.placeholder}</div>}
    <div className="blog-collection-sheet blog-collection-product-note">
      <span className="blog-collection-sheet-label">{art.label}</span>
      <strong>{art.primary}</strong><p>{art.secondary}</p>
      <span className="blog-collection-paid">{art.badge}</span>
    </div>
    <span className="blog-collection-free">{art.caption}</span>
  </>;
  return <>
    <div className="blog-collection-sheet blog-collection-framework">
      <span className="blog-collection-sheet-label">{art.label}</span>
      <strong>{art.primary}</strong>
      <div className="blog-collection-stages"><span>{art.secondary}</span><ArrowRight size={12} /><span>{art.tertiary}</span><ArrowRight size={12} /><span>{art.badge}</span></div>
    </div>
    <div className="blog-collection-sheet blog-collection-note">{art.caption}</div>
  </>;
}

export function CollectionHero({ collection, cover }: { collection: Collection; cover?: string }) {
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
    <div className="blog-collection-art" role="img" aria-label={intro.visualLabel}>
      <div className="blog-collection-scene" aria-hidden="true"><CollectionArtwork collection={collection} cover={cover} /></div>
    </div>
  </header>;
}
