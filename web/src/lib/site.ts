/**
 * [INPUT]: 依赖 PostType 与文章数据契约
 * [OUTPUT]: 对外提供 SITE、CONTENT_TYPES、COLLECTIONS、NAV_ITEMS、configureSite、collectionFor、readingLabel、categoryTone、contentTone、contentLabel
 * [POS]: 快照到视图的运行配置适配；品牌和栏目文案来自 Obsidian，空模板没有个人内容，新增分类有稳定配色，页面和卡片共同消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { PostType, type Post } from '../types';

export interface Collection {
  id: string; kind: 'config' | 'article' | 'book' | 'product' | 'about'; folder: string;
  label: string; path: string; type?: PostType; tone: string; english: string;
  promise: string; description: string; topics: string[]; visualLabel: string; cover?: string;
  art: Record<string, string>;
}
export const SITE = {
  name: '', author: '', tagline: '', avatar: '', portrait: '', footerText: '',
  rssTitle: '', rssDescription: '', aboutReadLabel: '', journeyEnglish: '', journeyTitle: '', journeyDescription: '',
  registration: [] as { text: string; href: string }[],
};
const emptyType = (tone: string) => ({ label: '', path: '/', english: '', tone });
export const CONTENT_TYPES = {
  [PostType.LONG_READ]: emptyType('red'),
  [PostType.BOOK_NOTE]: emptyType('green'),
  [PostType.PRODUCT]: emptyType('neutral'),
};
export const COLLECTIONS: Collection[] = [];
export const NAV_ITEMS: { label: string; path: string }[] = [];
export function configureSite(site: Partial<typeof SITE>, collections: Collection[], home: { heroImage?: string; heroPortrait?: string }) {
  Object.assign(SITE, site, { avatar: home.heroImage || '', portrait: home.heroPortrait || '' });
  COLLECTIONS.splice(0, COLLECTIONS.length, ...collections);
  NAV_ITEMS.splice(0, NAV_ITEMS.length, ...collections.map(({ label, path }) => ({ label, path })));
  for (const item of collections) if (item.type) Object.assign(CONTENT_TYPES[item.type], item);
}
export function collectionFor(post: Post) {
  return COLLECTIONS.find(item => item.id === post.collectionId) || CONTENT_TYPES[post.type];
}

// === 分类颜色：已知分类沿用配色，新分类由名称稳定生成 ===
const CATEGORY_TONES: Record<string, string> = { '经济学': 'teal', '创业': 'orange', '工作流': 'blue', 'AI': 'purple', '社群': 'gold', '工具': 'neutral' };
export function categoryTone(category: string) {
  if (!category) return 'neutral';
  if (CATEGORY_TONES[category]) return CATEGORY_TONES[category];
  const tones = ['teal', 'orange', 'blue', 'purple', 'gold'];
  const hash = [...category].reduce((value, char) => (value * 31 + char.codePointAt(0)!) >>> 0, 0);
  return tones[hash % tones.length];
}

export function contentTone(post: Post): string {
  const amount = Number.parseFloat((post.price || '').replace(/[^\d.]/g, ''));
  const paid = post.type === PostType.PRODUCT && !/免费|free/i.test(post.price || '') && amount > 0;
  return paid ? 'gold' : collectionFor(post).tone;
}

export function contentLabel(post: Post): string {
  return contentTone(post) === 'gold' ? '付费产品' : collectionFor(post).label;
}

export function readingLabel(post: Post): string {
  if (post.isProtected && !post.content) return '密码阅读';
  if (post.type === PostType.PRODUCT) return post.price || '产品与服务';
  if (post.type === PostType.BOOK_NOTE && post.rating) return `${post.rating} / 10 分`;
  return `约 ${Math.max(1, Math.ceil(post.content.replace(/\s/g, '').length / 500))} 分钟阅读`;
}
