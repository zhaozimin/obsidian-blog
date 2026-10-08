/**
 * [INPUT]: 依赖未知 JSON 快照、Post/Collection 契约及 URL 白名单
 * [OUTPUT]: 对外提供 normalizeSnapshot，将网络输入校验为浏览器可消费的数据
 * [POS]: 快照信任边界；缺失置顶标记归 false，非布尔值拒绝，受保护正文与危险 URL 不传给视图
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { PostType, type Post } from '../types';
import { SITE, type Collection } from './site';
import type { AboutStory, HomeConfig } from './markdown';
import { safeImageUrl, safeLinkUrl } from './url';
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('内容快照格式无效');
  return value as Record<string, unknown>;
};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const list = (value: unknown): unknown[] => {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('内容快照列表无效');
  return value;
};
function postFrom(value: unknown): Post {
  const item = record(value);
  if (typeof item.id !== 'string' || !item.id || typeof item.title !== 'string' || !Object.values(PostType).includes(item.type as PostType)) throw new Error('文章数据格式无效');
  if (item.pinned != null && typeof item.pinned !== 'boolean') throw new Error('pinned 必须是复选框布尔值');
  const post: Post = { id: item.id, type: item.type as PostType, title: item.title, description: text(item.description), category: text(item.category), tags: list(item.tags).filter((tag): tag is string => typeof tag === 'string'), date: text(item.date), content: item.isProtected === true ? '' : text(item.content), isProtected: item.isProtected === true };
  for (const key of ['collectionId', 'subtitle', 'author', 'publisher', 'isbn', 'readDate', 'price', 'launchDate'] as const) post[key] = text(item[key]);
  for (const key of ['buyUrl', 'doubanUrl', 'videoUrl'] as const) post[key] = safeLinkUrl(item[key]);
  post.cover = safeImageUrl(item.cover);
  post.pinned = item.pinned === true;
  if (typeof item.rating === 'number' && Number.isFinite(item.rating)) post.rating = item.rating;
  return post;
}
export function normalizeSnapshot(value: unknown) {
  const data = record(value);
  const posts = (value: unknown) => list(value).map(postFrom);
  const articles = posts(data.articles), books = posts(data.books), products = posts(data.products);
  const allPosts = data.allPosts == null ? [...articles, ...books, ...products] : posts(data.allPosts);
  if (new Set(allPosts.map(post => post.id)).size !== allPosts.length) throw new Error('文章身份重复');
  const collections = list(data.collections).map(value => {
    const item = record(value);
    if (typeof item.id !== 'string' || !item.id || !['config', 'article', 'book', 'product', 'about'].includes(text(item.kind)) || !/^\/(?:[a-z][a-z0-9-]*)?$/.test(text(item.path))) throw new Error('栏目数据格式无效');
    const art = item.art == null ? {} : record(item.art);
    const type = ({ article: PostType.LONG_READ, book: PostType.BOOK_NOTE, product: PostType.PRODUCT } as Record<string, PostType>)[text(item.kind)];
    return { type, id: item.id, kind: item.kind, path: item.path, folder: text(item.folder), label: text(item.label), tone: text(item.tone) || 'neutral', english: text(item.english), promise: text(item.promise), description: text(item.description), visualLabel: text(item.visualLabel), topics: list(item.topics).filter((topic): topic is string => typeof topic === 'string'), cover: safeImageUrl(item.cover), art: Object.fromEntries(Object.entries(art).map(([key, value]) => [key, text(value)])) } as Collection;
  });
  if (new Set(collections.map(item => item.id)).size !== collections.length || new Set(collections.map(item => item.path)).size !== collections.length) throw new Error('栏目身份或地址重复');
  const site = data.siteConfig == null ? {} : record(data.siteConfig);
  const siteConfig = Object.fromEntries(Object.keys(SITE).filter(key => key !== 'registration').map(key => [key, text(site[key])])) as Partial<typeof SITE>;
  siteConfig.registration = list(site.registration).map(value => { const item = record(value); return { text: text(item.text), href: safeLinkUrl(item.href) }; }).filter(item => item.href && item.text);
  const rawHome = data.homeConfig == null ? {} : record(data.homeConfig);
  const homeConfig = Object.fromEntries(Object.entries(rawHome).map(([key, value]) => [key, text(value)])) as unknown as HomeConfig;
  for (const key of ['heroTitle', 'heroSubtitle'] as const) homeConfig[key] = text(rawHome[key]);
  for (const key of ['heroImage', 'heroPortrait'] as const) homeConfig[key] = safeImageUrl(rawHome[key]);
  const social = rawHome.socialLinks == null ? {} : record(rawHome.socialLinks);
  homeConfig.socialLinks = Object.fromEntries(Object.entries(social).map(([key, value]) => [key, safeLinkUrl(value)]).filter(([, value]) => value));
  const aboutStories: AboutStory[] = list(data.aboutStories).map(value => { const story = record(value); return { id: text(story.id), title: text(story.title), date: text(story.date), content: text(story.content) }; });
  return { articles, books, products, allPosts, collections, siteConfig, homeConfig, aboutStories, readerOrigin: text(data.readerOrigin) };
}
