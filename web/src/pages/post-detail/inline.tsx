/**
 * [INPUT]: 依赖 React、站内链接、图片回调与 MathContent 的行内公式能力
 * [OUTPUT]: 对外提供 createInlineRenderer
 * [POS]: Markdown 行内格式解析，负责链接、强调及嵌入，供块渲染器消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Post } from '../../types';
import { MathContent } from './math';

export const createInlineRenderer = (
  allPostsList: Post[],
  openImage: (src: string, alt?: string) => void,
) => {
  // 行内格式解析函数
  const parseInlineMarkdown = (text: string): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let remaining: any = text;
    let keyCounter = 0;

    // 1. 优先处理行内代码 `code` (防止其他格式污染代码内容)
    const processInlineCode = (content: any): any => {
      if (typeof content !== 'string') return content;
      const codeRegex = /`([^`]+)`/g;
      const parts = content.split(codeRegex);
      return parts.map((part: string, idx: number) => {
        if (idx % 2 === 1) {
          return <code key={`code-${keyCounter++}`} className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-sm font-mono">{part}</code>;
        }
        return part;
      });
    };
    remaining = processInlineCode(remaining); // First pass (string -> array)
    if (!Array.isArray(remaining)) remaining = [remaining]; // Ensure array
    // ---------- 公式在代码之后解析，后续文本格式不改写 LaTeX ----------
    remaining = remaining.flatMap((part: unknown) => {
      if (typeof part !== 'string') return part;
      return part.split(/\$(?!\$)([^\n$]+?)\$(?!\d)/g).map((value: string, index: number) => index % 2 ? <MathContent key={`math-${keyCounter++}`} expression={value} /> : value);
    });

    // 2. 智能标点 (Smart Quotes) - 将直角引号转换为全角/弯引号
    // 必须在代码块处理之后，其他格式处理之前
    // 2. 智能标点 (Smart Quotes) - 将直角引号转换为全角/弯引号
    // 必须在代码块处理之后，其他格式处理之前
    const processSmartQuotes = (content: any): any => {
      if (typeof content !== 'string') return content;
      let isOpen = true; // 默认每行(每段文本)开始时，遇到的第一个引号认为是开引号
      // 使用回调函数来交替替换
      return content.replace(/"/g, () => {
        const char = isOpen ? '“' : '”';
        isOpen = !isOpen;
        return char;
      });
    };
    remaining = remaining.flatMap(processSmartQuotes);

    // 处理高亮 ==text==
    const processHighlight = (content: any): any => {
      if (typeof content !== 'string') return content;
      const highlightRegex = /==([^=]+)==/g;
      const parts = content.split(highlightRegex);
      return parts.map((part: string, idx: number) => {
        if (idx % 2 === 1) {
          return <mark key={`mark-${keyCounter++}`} className="bg-[#fff5b1] dark:bg-yellow-800/60 px-1 rounded-sm">{part}</mark>;
        }
        return part;
      });
    };
    remaining = remaining.flatMap(processHighlight);

    // 处理删除线 ~~text~~
    const processStrikethrough = (content: any): any => {
      if (typeof content !== 'string') return content;
      const strikeRegex = /~~([^~]+)~~/g;
      const parts = content.split(strikeRegex);
      return parts.map((part: string, idx: number) => {
        if (idx % 2 === 1) {
          return <del key={`del-${keyCounter++}`} className="text-slate-400 dark:text-slate-500">{part}</del>;
        }
        return part;
      });
    };
    remaining = remaining.flatMap(processStrikethrough);

    // 处理粗斜体 ***text*** 或 **text*text***
    const processBoldItalic = (content: any): any => {
      if (typeof content !== 'string') return content;
      // 先处理 **text*text*** 格式
      const mixedRegex = /\*\*([^*]+)\*([^*]+)\*\*\*/g;
      let parts = content.split(mixedRegex);
      if (parts.length > 1) {
        return parts.map((part: string, idx: number) => {
          if (idx % 3 === 1) {
            return <strong key={`strong-${keyCounter++}`} className="font-bold text-inherit">{part}</strong>;
          } else if (idx % 3 === 2) {
            return <em key={`em-${keyCounter++}`} className="text-inherit">{part}</em>;
          }
          return part;
        });
      }
      // 处理 ***text*** 格式
      const boldItalicRegex = /\*\*\*([^*]+)\*\*\*/g;
      parts = content.split(boldItalicRegex);
      return parts.map((part: string, idx: number) => {
        if (idx % 2 === 1) {
          return <strong key={`strong-em-${keyCounter++}`} className="font-bold text-inherit"><em className="text-inherit">{part}</em></strong>;
        }
        return part;
      });
    };
    remaining = remaining.flatMap(processBoldItalic);

    // 处理加粗 **text**
    const processBold = (content: any): any => {
      if (typeof content !== 'string') return content;
      const boldRegex = /\*\*([^*]+)\*\*/g;
      const parts = content.split(boldRegex);
      return parts.map((part: string, idx: number) => {
        if (idx % 2 === 1) {
          return <strong key={`strong-${keyCounter++}`} className="font-bold text-inherit">{part}</strong>;
        }
        return part;
      });
    };
    remaining = remaining.flatMap(processBold);

    // 处理斜体 *text* 或 _text_
    const processItalic = (content: any): any => {
      if (typeof content !== 'string') return content;
      const italicRegex = /[*_]([^*_]+)[*_]/g;
      const parts = content.split(italicRegex);
      return parts.map((part: string, idx: number) => {
        if (idx % 2 === 1) {
          return <em key={`em-${keyCounter++}`} className="text-inherit">{part}</em>;
        }
        return part;
      });
    };
    remaining = remaining.flatMap(processItalic);

    // 已移动到最上方处理行内代码

    // 处理超链接 [text](url)
    const processLink = (content: any): any => {
      if (typeof content !== 'string') return content;
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      const result: any[] = [];
      let lastIndex = 0;
      let match;

      while ((match = linkRegex.exec(content)) !== null) {
        // 添加链接前的文本
        if (match.index > lastIndex) {
          result.push(content.slice(lastIndex, match.index));
        }
        // 添加链接
        result.push(
          <a
            key={`link-${keyCounter++}`}
            href={match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            {match[1]}
          </a>
        );
        lastIndex = match.index + match[0].length;
      }
      // 添加剩余文本
      if (lastIndex < content.length) {
        result.push(content.slice(lastIndex));
      }
      return result.length > 0 ? result : [content];
    };
    remaining = remaining.flatMap(processLink);
    // 处理 Obsidian Wiki Link [[Link|Text]]
    const processWikiLink = (content: any): any => {
      if (typeof content !== 'string') return content;
      const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

      const parts = content.split(wikiLinkRegex);
      if (parts.length === 1) return content;

      const result: any[] = [];
      for (let i = 0; i < parts.length; i += 3) {
        result.push(parts[i]); // 前面的文本
        if (i + 1 < parts.length) {
          const linkTarget = parts[i + 1];
          const text = parts[i + 2] || linkTarget;

          // 查找目标文章 (不区分大小写)
          // 注意：这是一个同步函数里的闭包，我们需要外部的 allPosts 数据。
          // 通过调用方传入 allPostsList 查找目标文章
          const targetPost = allPostsList.find(p => p.title.toLowerCase() === linkTarget.toLowerCase());

          if (targetPost) {
            result.push(
              <Link
                key={`wiki-link-${keyCounter++}`}
                to={`/post/${targetPost.id}`}
                className="text-inherit underline underline-offset-2 transition-colors decoration-dotted"
                title={targetPost.title}
              >
                {text}
              </Link>
            );
          } else {
            // 如果找不到文章，显示为死链或者仅仅是普通文本但带有一点样式提示
            result.push(
              <span
                key={`wiki-link-dead-${keyCounter++}`}
                className="text-slate-400 dark:text-slate-500 cursor-not-allowed"
                title="未找到相关文章"
              >
                {text}
              </span>
            );
          }
        }
      }
      return result;
    };
    remaining = remaining.flatMap(processWikiLink);

    // 处理 Obsidian Embed ![[File]]
    const processEmbed = (content: any): any => {
      if (typeof content !== 'string') return content;
      const embedRegex = /!\[\[([^\]]+)\]\]/g;
      const parts = content.split(embedRegex);
      if (parts.length === 1) return content;

      const result: any[] = [];
      for (let i = 0; i < parts.length; i += 2) {
        result.push(parts[i]);
        if (i + 1 < parts.length) {
          const file = parts[i + 1];
          // 尝试解析文件名，假设它在 images 目录下，或者是一个完整的 URL (虽然 Obsidian 通常是文件名)
          // 简单起见，我们假设用户会把这些图片放在 public/images 或者类似的路径，或者我们需要一个映射
          // 这里暂时直接使用文件名作为路径，实际可能需要调整
          // 为了兼容性，如果不是 url，假设在 /images/
          const src = file.match(/^https?:\/\//) ? file : `/images/${file}`;

          result.push(
            <figure key={`embed-${keyCounter++}`} className="my-4 flex flex-col items-center">
              <img
                src={src}
                alt={file}
                className="blog-content-image"
                loading="lazy"
                onClick={() => openImage(src, file)}
                style={{ cursor: 'zoom-in' }}
              />
            </figure>
          );
        }
      }
      return result;
    };
    remaining = remaining.flatMap(processEmbed);

    return remaining.filter(item => item !== '' && item !== null && item !== undefined);
  };

  return parseInlineMarkdown;
};
