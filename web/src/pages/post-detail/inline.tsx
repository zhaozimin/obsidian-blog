/**
 * [INPUT]: 依赖 marked 行内词法、React Router、URL 白名单、文章集合与图片回调、MathContent 公式
 * [OUTPUT]: 对外提供 createInlineRenderer
 * [POS]: Markdown 行内边界；代码、链接和图片先形成独立 token 再处理强调，全文引用定义保留资源路径与站内锚点，原始 HTML 只作文字
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Marked, type Token } from 'marked';
import { Post } from '../../types';
import { safeImageUrl, safeLinkUrl } from '../../lib/url';
import { MathContent } from './math';
const lexer = new Marked({ gfm: true, breaks: true }, { extensions: [
  { name: 'wiki', level: 'inline', start: (source: string) => source.indexOf('[['), tokenizer(source: string) {
    const match = source.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    if (match) return { type: 'wiki', raw: match[0], text: match[2] || match[1], target: match[1] };
  } },
  { name: 'embed', level: 'inline', start: (source: string) => source.indexOf('![['), tokenizer(source: string) {
    const match = source.match(/^!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
    if (match) return { type: 'embed', raw: match[0], text: match[1] };
  } },
  { name: 'highlight', level: 'inline', start: (source: string) => source.indexOf('=='), tokenizer(source: string) {
    const match = source.match(/^==([^=\n]+)==/);
    if (match) return { type: 'highlight', raw: match[0], text: match[1] };
  } },
  { name: 'math', level: 'inline', start: (source: string) => source.indexOf('$'), tokenizer(source: string) {
    const match = source.match(/^\$(?!\$)([^\n$]+?)\$(?!\d)/);
    if (match) return { type: 'math', raw: match[0], text: match[1] };
  } },
] });

export const createInlineRenderer = (allPostsList: Post[], openImage: (src: string, alt?: string) => void, referenceMarkdown = '') => {
  const references = lexer.lexer(referenceMarkdown).links;
  let key = 0;
  const image = (src: string, alt: string) => <img key={`image-${key++}`} src={src} alt={alt} className="blog-content-image" loading="lazy" role="button" tabIndex={0} onClick={() => openImage(src, alt)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openImage(src, alt); } }} style={{ cursor: 'zoom-in' }} />;
  const render = (tokens: Token[]): React.ReactNode[] => tokens.map(token => {
    const children = () => 'tokens' in token && token.tokens ? render(token.tokens) : parse('text' in token ? token.text : '');
    switch (token.type) {
      case 'codespan': return <code key={`code-${key++}`} className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-sm font-mono">{token.text}</code>;
      case 'strong': return <strong key={`strong-${key++}`} className="font-bold text-inherit">{children()}</strong>;
      case 'em': return <em key={`em-${key++}`} className="text-inherit">{children()}</em>;
      case 'del': return <del key={`del-${key++}`} className="text-slate-400 dark:text-slate-500">{children()}</del>;
      case 'highlight': return <mark key={`mark-${key++}`} className="bg-[#fff5b1] dark:bg-yellow-800/60 px-1 rounded-sm">{parse(token.text)}</mark>;
      case 'math': return <MathContent key={`math-${key++}`} expression={token.text} />;
      case 'link': {
        const href = safeLinkUrl(token.href);
        return href ? <a key={`link-${key++}`} href={href} target={href.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer" onClick={event => {
          if (!href.startsWith('#')) return;
          event.preventDefault();
          let id = href.slice(1); try { id = decodeURIComponent(id); } catch { /* 无效编码保留原文 */ }
          document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }} className="underline underline-offset-4">{children()}</a> : <React.Fragment key={`text-${key++}`}>{children()}</React.Fragment>;
      }
      case 'image': { const src = safeImageUrl(token.href); return src ? image(src, token.text || '') : token.text; }
      case 'embed': { const src = safeImageUrl(/^https?:\/\//.test(token.text) ? token.text : `/images/${token.text}`); return src ? image(src, token.text) : token.text; }
      case 'wiki': {
        const target = token.target.replace(/\.md$/i, '');
        const post = allPostsList.find(post => post.id === target) || allPostsList.find(post => post.title.toLowerCase() === target.toLowerCase());
        return post ? <Link key={`wiki-${key++}`} to={`/post/${encodeURIComponent(post.id)}`} className="text-inherit underline underline-offset-2 transition-colors decoration-dotted" title={post.title}>{token.text}</Link> : <span key={`dead-${key++}`} className="text-slate-400 dark:text-slate-500 cursor-not-allowed" title="未找到相关文章">{token.text}</span>;
      }
      case 'br': return <br key={`br-${key++}`} />;
      case 'escape': case 'html': return token.text;
      default: {
        if ('tokens' in token && token.tokens) return <React.Fragment key={`text-${key++}`}>{render(token.tokens)}</React.Fragment>;
        let opening = true;
        return ('text' in token ? token.text : token.raw).replace(/"/g, () => { const quote = opening ? '“' : '”'; opening = !opening; return quote; });
      }
    }
  });
  const parse = (text: string): React.ReactNode[] => {
    const context = new lexer.Lexer(lexer.defaults);
    context.tokens.links = references;
    return render(context.inlineTokens(text));
  };
  return parse;
};
