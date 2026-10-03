/**
 * [INPUT]: 依赖 marked 解析器、Post 契约、SITE 默认配置与 public/blog-data.json
 * [OUTPUT]: 对外提供公开内容与阅读服务地址读取、UTC 日历日期格式化与标题提取
 * [POS]: 浏览器内容适配层，把生成快照交给页面和搜索；加载成功后初始化品牌和栏目，空字段保持为空，不补写个人文案
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { marked } from 'marked';
import { Post, PostType } from '../types';
import { configureSite } from './site';

export interface AboutStory {
  id: string;
  title: string;
  date: string;
  content: string;
}

export interface HomeConfig {
  seoTitle?: string; seoDescription?: string; eyebrow?: string;
  recentEnglish?: string; recentTitle?: string; recentDescription?: string;
  heroTitle: string;
  heroSubtitle: string;
  heroImage: string;
  heroPortrait?: string;
  socialLinks?: Record<string, string>;
}

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

// 加载预生成的数据
let blogData: any = null;

async function loadBlogData() {
  if (blogData) return blogData;

  try {
    const response = await fetch('/blog-data.json');
    if (!response.ok) throw new Error('内容快照暂时不可用');
    blogData = await response.json();
    configureSite(blogData.siteConfig || {}, blogData.collections || [], blogData.homeConfig || {});
    return blogData;
  } catch (error) {
    blogData = null;
    throw error;
  }
}

// 读取所有文章
export async function getArticles(): Promise<Post[]> {
  const data = await loadBlogData();
  return data.articles || [];
}

// 读取所有书籍
export async function getBooks(): Promise<Post[]> {
  const data = await loadBlogData();
  return data.books || [];
}

// 读取所有产品
export async function getProducts(): Promise<Post[]> {
  const data = await loadBlogData();
  return data.products || [];
}

// 根据 ID 和类型获取单篇文章
export async function getPostById(id: string, type: PostType): Promise<Post | null> {
  let posts: Post[] = [];
  switch (type) {
    case PostType.LONG_READ:
      posts = await getArticles();
      break;
    case PostType.BOOK_NOTE:
      posts = await getBooks();
      break;
    case PostType.PRODUCT:
      posts = await getProducts();
      break;
  }

  return posts.find(p => p.id === id) || null;
}

// 根据 ID 在所有文章中查找（不需要指定类型）
export async function getPostByIdFromAll(id: string): Promise<Post | null> {
  const data = await loadBlogData();
  const allPosts = data.allPosts || [];
  return allPosts.find((p: Post) => p.id === id) || null;
}

// 获取所有文章（用于计算上一篇/下一篇）
export async function getAllPosts(): Promise<Post[]> {
  const data = await loadBlogData();
  return data.allPosts || [];
}

export async function getReaderOrigin(): Promise<string> {
  return (await loadBlogData()).readerOrigin || window.location.origin;
}

// 读取首页配置
export async function getHomeConfig(): Promise<HomeConfig> {
  const data = await loadBlogData();
  const home = data.homeConfig || {};
  return { ...home, heroTitle: home.heroTitle || '', heroSubtitle: home.heroSubtitle || '', heroImage: home.heroImage || '', heroPortrait: home.heroPortrait || '', socialLinks: home.socialLinks || {} };
}

// 读取关于页故事块
export async function getAboutStories(): Promise<AboutStory[]> {
  const data = await loadBlogData();
  const stories = (data.aboutStories || []) as AboutStory[];
  // 按日期降序排序（最新的在上面）
  return [...stories].sort((a, b) => b.date.localeCompare(a.date));
}

export async function prepareSite() { return loadBlogData(); }

// 将 Markdown 转换为 HTML
export function markdownToHtml(markdown: string): string {
  return marked(markdown, { async: false });
}

export function formatDate(dateString: string): string {
  if (!dateString) return '';
  try {
    // ---------- 内容日期 ----------
    // YAML 日历日期会被序列化为 UTC 午夜，避免浏览器时区将其显示为前一天。
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return dateString;
  }
}

export interface Heading {
  id: string;
  text: string;
  level: number;
}

export function extractHeadings(content: string): Heading[] {
  const lines = content.split('\n');
  const headings: Heading[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (!inCodeBlock) {
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        const id = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-');
        headings.push({ id, text, level });
      }
    }
  }
  return headings;
}
