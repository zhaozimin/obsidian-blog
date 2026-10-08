/**
 * [INPUT]: 依赖 marked 的 Markdown 词法分析与 Post 数据契约
 * [OUTPUT]: 对外提供 createSearchIndex、searchPosts 与带匹配句子/来源的 SearchResult
 * [POS]: 搜索的纯数据边界，先提取可读正文再匹配和排序；组件只负责展示与导航，不把 Markdown 语法或资源路径当作正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { marked, type Token } from 'marked';
import type { Post } from '../types';

export interface SearchResult {
  post: Post;
  score: number;
  context: { text: string; source: '正文' | '简介' | '副标题' | '标题' };
}

// === 正文索引：保留段落边界，隐藏图片/链接的资源地址 ===
function readableTokens(tokens: Token[]): string {
  return tokens.map(token => {
    if (token.type === 'image' || token.type === 'def') return '';
    if (token.type === 'space' || token.type === 'br' || token.type === 'hr') return '\n';
    if (token.type === 'list') return token.items.map(item => readableTokens(item.tokens)).join('\n');
    if (token.type === 'table') return [token.header, ...token.rows].map(row => row.map(cell => readableTokens(cell.tokens)).join(' ')).join('\n');
    if (token.type === 'html') return token.text.replace(/<[^>]*>/g, '');
    if ('tokens' in token && token.tokens) {
      const text = readableTokens(token.tokens);
      return ['paragraph', 'heading', 'blockquote'].includes(token.type) ? `${text}\n` : text;
    }
    if ('text' in token) return token.type === 'code' ? `${token.text}\n` : token.text;
    return '';
  }).join('');
}

export function createSearchIndex(posts: Post[]) {
  return posts.map(post => {
    const markdown = (post.isProtected ? '' : post.content).replace(/!\[\[[^\]]+\]\]/g, '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target);
    return { post, text: readableTokens(marked.lexer(markdown)).replace(/[\t ]+/g, ' ').replace(/\n+/g, '\n').trim() };
  });
}

// === 匹配上下文：普通句子完整保留，超长句围绕关键词截取 ===
function matchingSentence(text: string, keyword: string): string {
  const index = text.toLocaleLowerCase().indexOf(keyword);
  const boundaries = /[。！？!?；;\n]|\.(?=\s|$)/g;
  const previous = [...text.slice(0, index).matchAll(boundaries)].at(-1);
  const start = previous ? previous.index! + previous[0].length : 0;
  const after = boundaries.exec(text.slice(index + keyword.length));
  const end = after ? index + keyword.length + after.index! + after[0].length : text.length;
  const sentence = text.slice(start, end).trim();
  const limit = Math.max(180, keyword.length + 80);
  if (sentence.length <= limit) return sentence;
  const hit = sentence.toLocaleLowerCase().indexOf(keyword);
  const from = Math.max(0, hit - 60);
  const to = Math.min(sentence.length, from + limit);
  return `${from ? '…' : ''}${sentence.slice(from, to)}${to < sentence.length ? '…' : ''}`;
}

export function searchPosts(index: ReturnType<typeof createSearchIndex>, query: string): SearchResult[] {
  const keyword = query.trim().toLocaleLowerCase();
  if (!keyword) return [];
  return index.map(({ post, text }) => {
    const fields = [
      { text, source: '正文' as const, weight: 1 },
      { text: post.description, source: '简介' as const, weight: 2 },
      { text: post.subtitle || '', source: '副标题' as const, weight: 4 },
      { text: post.title, source: '标题' as const, weight: 8 },
    ].filter(field => field.text.toLocaleLowerCase().includes(keyword));
    return {
      post, score: fields.reduce((score, field) => score + field.weight, 0),
      context: { text: fields.length ? matchingSentence(fields[0].text, keyword) : '', source: fields[0]?.source || '正文' },
    };
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score || b.post.date.localeCompare(a.post.date));
}
