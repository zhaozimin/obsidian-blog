/**
 * [INPUT]: 依赖文章与解锁状态、行内格式、表格/公式扩展、共享样式和媒体能力
 * [OUTPUT]: 对外提供 createContentRenderer
 * [POS]: Markdown 块渲染器，空行只划分段落而不生成占位，软换行归入同段，图注解码上传原名；正文字号、行高和间距由 CSS 按内容类型统一，未授权文章只显示密码入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react';
import { Info, FileText, Zap, Check, AlertTriangle, XOctagon, Bug, Quote, Lock } from 'lucide-react';
import { VideoEmbed } from '../../components/VideoEmbed';
import { Post } from '../../types';
import { createInlineRenderer } from './inline';
import { adjustments } from './styles';
import { readExtraBlock } from './blocks';

interface ContentOptions {
  post: Post;
  isUnlocked: boolean;
  allPostsList: Post[];
  openImage: (src: string, alt?: string) => void;
  onUnlock: () => void;
}

// ---------- 图片命名 ----------
// 路径保持 URL 编码以供请求；显示名只解码一次，查询参数与片段不属于文件名。
function uploadedImageName(url: string): string {
  const name = url.split(/[?#]/, 1)[0].split('/').pop() || '';
  try { return decodeURIComponent(name); }
  catch { return name; }
}

export const createContentRenderer = ({ post, isUnlocked, allPostsList, openImage, onUnlock }: ContentOptions) => {
  const parseInlineMarkdown = createInlineRenderer(allPostsList, openImage);
  const renderContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;
    let keyCounter = 0;
    const paragraphLines: string[] = [];
    const flushParagraph = () => {
      if (!paragraphLines.length) return;
      elements.push(
        <p key={keyCounter++} className="text-slate-700 dark:text-slate-300 font-normal">
          {parseInlineMarkdown(paragraphLines.join('\n'))}
        </p>,
      );
      paragraphLines.length = 0;
    };

    // ---------- 授权边界 ----------
    // 公开快照无受保护正文；此处也拒绝渲染未授权内容，避免页面状态交叉。
    const maxLines = (!isUnlocked && post.isProtected) ? 0 : lines.length;

    // ---------- 正文起点 ----------
    // 空行只划分段落；间距交给 CSS，不让空行数量改变页面布局。
    while (i < maxLines && !lines[i].trim()) i++;

    while (i < maxLines) {
      const line = lines[i];
      const trimmed = line.trim();

      // ---------- 公式与表格 ----------
      const extra = readExtraBlock(lines.slice(0, maxLines), i, parseInlineMarkdown);
      if (extra) { flushParagraph(); elements.push(<React.Fragment key={keyCounter++}>{extra.node}</React.Fragment>); i = extra.next; continue; }

      // 标题处理
      if (line.startsWith('# ')) {
        flushParagraph();
        const text = line.replace('# ', '');
        const headingId = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-');
        elements.push(
          <h1
            key={keyCounter++}
            id={headingId}
            className="font-bold leading-tight"
            style={{
              fontSize: `${adjustments.markdown.h1.fontSize}px`,
              paddingBottom: `${adjustments.markdown.h1.paddingBottom}px`,
              borderBottomWidth: `${adjustments.markdown.h1.borderBottomWidth}px`,
            }}
          >
            {parseInlineMarkdown(text)}
          </h1>
        );
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        flushParagraph();
        const text = line.replace('## ', '');
        const headingId = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-');
        elements.push(
          <h2
            key={keyCounter++}
            id={headingId}
            className="font-bold"
            style={{
              fontSize: `${adjustments.markdown.h2.fontSize}px`,
            }}
          >
            {parseInlineMarkdown(text)}
          </h2>
        );
        i++;
        continue;
      }
      if (line.startsWith('### ')) {
        flushParagraph();
        const text = line.replace('### ', '');
        const headingId = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-');
        elements.push(
          <h3
            key={keyCounter++}
            id={headingId}
            className="font-bold text-slate-800 dark:text-slate-200"
            style={{
              fontSize: `${adjustments.markdown.h3.fontSize}px`,
            }}
          >
            {parseInlineMarkdown(text)}
          </h3>
        );
        i++;
        continue;
      }

      // 代码块处理
      if (trimmed.startsWith('```')) {
        flushParagraph();
        const language = trimmed.slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        const codeContent = codeLines.join('\n');
        const codeBlockKey = keyCounter++;

        elements.push(
          <div key={codeBlockKey} className="relative group">
            {/* 复制按钮 - 仅在 hover 时显示 */}
            <div className="absolute top-2 right-2 z-10">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(codeContent);
                  // 显示复制成功提示
                  const btn = document.getElementById(`copy-btn-${codeBlockKey}`);
                  if (btn) {
                    const iconHtml = btn.querySelector('svg')?.outerHTML || '';
                    btn.innerHTML = `${iconHtml} <span class="ml-1">已复制</span>`;
                    setTimeout(() => {
                      btn.innerHTML = `${iconHtml} <span class="ml-1">${language || '复制'}</span>`;
                    }, 2000);
                  }
                }}
                id={`copy-btn-${codeBlockKey}`}
                className="zzm-btn zzm-btn--sm zzm-btn--ondark"
                title="点击复制代码"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="ml-1">{language || '复制'}</span>
              </button>
            </div>
            <pre className="bg-slate-900 dark:bg-slate-950 text-slate-100 rounded-lg overflow-x-auto text-sm font-mono pt-3 pb-4 px-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent hover:scrollbar-thumb-slate-600">
              <code className={language ? `language-${language}` : ''}>
                <table className="border-collapse">
                  <tbody>
                    {codeLines.map((codeLine, lineIdx) => (
                      <tr key={lineIdx} className="leading-relaxed">
                        <td className="pr-4 text-right text-slate-500 select-none w-8 align-top" style={{ minWidth: '2rem' }}>
                          {lineIdx + 1}
                        </td>
                        <td className="whitespace-pre">{codeLine}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </code>
            </pre>
          </div>
        );
        i++;
        continue;
      }

      // 引用块处理 & Callout 处理
      if (trimmed.startsWith('>')) {
        flushParagraph();
        const quoteLines: string[] = [];
        let isCallout = false;
        let calloutType = '';
        let calloutTitle = '';
        let calloutFold = ''; // '+' or '-'

        // 检查第一行是否是 Callout 定义
        const calloutMatch = trimmed.match(/^>\s*\[!(\w+)\]([+-]?)(.*)$/);

        if (calloutMatch) {
          isCallout = true;
          calloutType = calloutMatch[1].toLowerCase();
          calloutFold = calloutMatch[2];
          calloutTitle = calloutMatch[3].trim();
          // 如果只有类型没有标题，标题默认为类型首字母大写
          if (!calloutTitle) {
            calloutTitle = calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
          }
          // 如果是 Callout，第一行只是定义，不需要作为内容处理
          // 注意：如果是 Callout，我们跳过第一行，继续收集后续行作为 content
          i++;
        }

        // 收集引用块内容 (包括 Callout 的 Body)
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          const quoteLine = lines[i].trim();
          // 去掉前缀 '>' 或 '> '
          // 如果是以 '> ' 开头，去掉 2 个字符；如果是 '>' 开头（紧接内容），去掉 1 个字符
          let contentWithoutQuote = '';
          if (quoteLine.startsWith('> ')) {
            contentWithoutQuote = quoteLine.slice(2);
          } else if (quoteLine.startsWith('>')) {
            contentWithoutQuote = quoteLine.slice(1);
          }

          quoteLines.push(contentWithoutQuote);
          i++;
        }

        if (isCallout) {
          // === 引用提示：图标保留类型语义，颜色由阅读样式统一 ===
          const calloutIcons: Record<string, typeof Info> = {
            info: Info, note: FileText, trigger: Zap, tip: Zap, check: Check,
            help: AlertTriangle, warning: AlertTriangle, fail: XOctagon,
            error: XOctagon, bug: Bug, example: FileText, quote: Quote,
          };
          const Icon = calloutIcons[calloutType] || FileText;

          const calloutContent = quoteLines.join('\n');

          elements.push(
            <div key={keyCounter++} className="blog-callout" data-callout={calloutType}>
              <div className="blog-callout-heading">
                <Icon size={18} className="shrink-0" />
                <span>{calloutTitle}</span>
              </div>
              <div className="blog-callout-body">
                {/* 递归渲染内部 Markdown */}
                {renderContent(calloutContent)}
              </div>
            </div>
          );
        } else {
          // 普通引用
          elements.push(
            <blockquote
              key={keyCounter++}
              className="border-l-4 border-blue-400 dark:border-blue-500 pl-4 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-r-lg"
            >
              {quoteLines.map((ql, qi) =>
                ql === '' ? <br key={qi} /> : (
                  <p key={qi} className="text-slate-600 dark:text-slate-400 italic">
                    {parseInlineMarkdown(ql)}
                  </p>
                )
              )}
            </blockquote>
          );
        }
        continue;
      }

      // 水平线处理
      if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
        flushParagraph();
        elements.push(
          <hr key={keyCounter++} className="border-t border-slate-200 dark:border-slate-700" />
        );
        i++;
        continue;
      }

      // 待办事项处理（支持嵌套，带树状引导线）
      if (trimmed.startsWith('- [ ] ') || trimmed.startsWith('- [x] ') || trimmed.startsWith('- [X] ')) {
        flushParagraph();
        const todoItems: { level: number; text: string; checked: boolean }[] = [];
        while (i < lines.length) {
          const currentLine = lines[i];
          const currentTrimmed = currentLine.trim();
          const leadingSpaces = currentLine.length - currentLine.trimStart().length;
          const level = Math.floor(leadingSpaces / 2);

          if (currentTrimmed.startsWith('- [ ] ') || currentTrimmed.startsWith('- [x] ') || currentTrimmed.startsWith('- [X] ')) {
            const isChecked = currentTrimmed.startsWith('- [x] ') || currentTrimmed.startsWith('- [X] ');
            todoItems.push({ level, text: currentTrimmed.slice(6), checked: isChecked });
            i++;
          } else {
            break;
          }
        }

        // 计算每个项是否为其层级的最后一项
        const isLastAtLevel = todoItems.map((item, idx) => {
          for (let j = idx + 1; j < todoItems.length; j++) {
            if (todoItems[j].level === item.level) return false;
            if (todoItems[j].level < item.level) return true;
          }
          return true;
        });

        // 计算每个项是否有子项
        const hasChildren = todoItems.map((item, idx) => {
          if (idx + 1 < todoItems.length && todoItems[idx + 1].level > item.level) return true;
          return false;
        });

        elements.push(
          <div key={keyCounter++} className="tree-list tree-list-checkbox my-2" style={{ marginLeft: `${adjustments.markdown.list.marginLeft}px` }}> {/* my-4 -> my-2 */}
            {todoItems.map((item, idx) => (
              <div
                key={idx}
                className={`tree-item tree-item-checkbox relative flex items-start ${isLastAtLevel[idx] ? 'tree-item-last' : ''
                  } ${hasChildren[idx] ? 'tree-item-has-children' : ''}`}
                style={{
                  marginLeft: `${item.level * 20}px`, // 24 -> 20
                  paddingLeft: '22px', // 24 -> 22
                  paddingTop: '2px', // 4 -> 2
                  paddingBottom: '2px', // 4 -> 2
                }}
                data-level={item.level}
              >
                {/* 垂直引导线 */}
                <div
                  className={`tree-line-vertical absolute left-[7px] top-0 w-[1.5px] bg-slate-200 dark:bg-slate-700 ${isLastAtLevel[idx] ? 'h-[14px]' : 'h-full'
                    }`}
                  style={{ display: item.level === 0 ? 'none' : 'block' }}
                />
                {/* 水平连接线 */}
                <div
                  className="tree-line-horizontal absolute left-[7px] top-[14px] h-[1.5px] w-[12px] bg-slate-200 dark:bg-slate-700"
                  style={{ display: item.level === 0 ? 'none' : 'block' }}
                />
                {/* 复选框标记 */}
                <input
                  type="checkbox"
                  checked={item.checked}
                  readOnly
                  className="tree-marker w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-500 focus:ring-blue-500 flex-shrink-0 z-10 mt-[5px]"
                />
                <span
                  className={`tree-content text-slate-700 dark:text-slate-300 font-normal ml-2 ${item.checked ? 'line-through opacity-60' : ''}`} // text-slate-600 -> 700, font-light -> normal
                >
                  {parseInlineMarkdown(item.text)}
                </span>
              </div>
            ))}
          </div>
        );
        continue;
      }

      // 无序列表处理（支持嵌套，带树状引导线）
      if (trimmed.startsWith('- ')) {
        flushParagraph();
        const listItems: { level: number; text: string }[] = [];
        while (i < lines.length) {
          const currentLine = lines[i];
          const currentTrimmed = currentLine.trim();
          const leadingSpaces = currentLine.length - currentLine.trimStart().length;
          const level = Math.floor(leadingSpaces / 2);

          if (currentTrimmed.startsWith('- ') && !currentTrimmed.startsWith('- [ ]') && !currentTrimmed.startsWith('- [x]') && !currentTrimmed.startsWith('- [X]')) {
            listItems.push({ level, text: currentTrimmed.slice(2) });
            i++;
          } else {
            break;
          }
        }

        // 计算每个项是否为其层级的最后一项
        const isLastAtLevel = listItems.map((item, idx) => {
          for (let j = idx + 1; j < listItems.length; j++) {
            if (listItems[j].level === item.level) return false;
            if (listItems[j].level < item.level) return true;
          }
          return true;
        });

        // 计算每个项是否有子项
        const hasChildren = listItems.map((item, idx) => {
          if (idx + 1 < listItems.length && listItems[idx + 1].level > item.level) return true;
          return false;
        });

        elements.push(
          <div key={keyCounter++} className="tree-list tree-list-ul" style={{ marginLeft: `${adjustments.markdown.list.marginLeft}px` }}>
            {listItems.map((item, idx) => (
              <div
                key={idx}
                className={`tree-item tree-item-ul relative flex items-start ${isLastAtLevel[idx] ? 'tree-item-last' : ''
                  } ${hasChildren[idx] ? 'tree-item-has-children' : ''}`}
                style={{
                  marginLeft: `${item.level * 20}px`, // 24 -> 20
                  paddingLeft: '22px', // 24 -> 22
                  paddingTop: '2px', // 4 -> 2
                  paddingBottom: '2px', // 4 -> 2
                }}
                data-level={item.level}
              >
                {/* 垂直引导线 */}
                <div
                  className={`tree-line-vertical absolute left-[7px] top-0 w-[1.5px] bg-slate-200 dark:bg-slate-700 ${isLastAtLevel[idx] ? 'h-[14px]' : 'h-full'
                    }`}
                  style={{ display: item.level === 0 ? 'none' : 'block' }}
                />
                {/* 水平连接线 */}
                <div
                  className="tree-line-horizontal absolute left-[7px] top-[14px] h-[1.5px] w-[12px] bg-slate-200 dark:bg-slate-700"
                  style={{ display: item.level === 0 ? 'none' : 'block' }}
                />
                {/* 圆点标记 - 优化样式 */}
                <div
                  className={`tree-marker flex-shrink-0 rounded-full z-10 ${item.level === 0
                    ? 'w-[5px] h-[5px] bg-slate-800 dark:bg-slate-200 mt-[10px]' // 更黑、更显眼
                    : 'w-[4px] h-[4px] bg-slate-400 dark:bg-slate-500 mt-[11px] border border-slate-200 dark:border-slate-600' // 空心/浅色效果
                    }`}
                />
                <span
                  className="tree-content text-slate-700 dark:text-slate-300 font-normal ml-2" // text-slate-600 -> 700
                >
                  {parseInlineMarkdown(item.text)}
                </span>
              </div>
            ))}
          </div>
        );
        continue;
      }

      // 有序列表处理（支持嵌套，带树状引导线）
      if (line.match(/^\s*\d+\. /)) {
        flushParagraph();
        const listItems: { level: number; text: string; number: number }[] = [];
        const levelCounters: { [key: number]: number } = {};

        while (i < lines.length) {
          const currentLine = lines[i];
          const currentTrimmed = currentLine.trim();
          const leadingSpaces = currentLine.length - currentLine.trimStart().length;
          const level = Math.floor(leadingSpaces / 3);

          if (currentTrimmed.match(/^\d+\. /)) {
            // 计算当前层级的序号
            if (!levelCounters[level]) levelCounters[level] = 0;
            levelCounters[level]++;
            // 重置更深层级的计数器
            Object.keys(levelCounters).forEach(k => {
              if (parseInt(k) > level) levelCounters[parseInt(k)] = 0;
            });

            listItems.push({ level, text: currentTrimmed.replace(/^\d+\. /, ''), number: levelCounters[level] });
            i++;
          } else {
            break;
          }
        }

        // 计算每个项是否为其层级的最后一项
        const isLastAtLevel = listItems.map((item, idx) => {
          for (let j = idx + 1; j < listItems.length; j++) {
            if (listItems[j].level === item.level) return false;
            if (listItems[j].level < item.level) return true;
          }
          return true;
        });

        // 计算每个项是否有子项
        const hasChildren = listItems.map((item, idx) => {
          if (idx + 1 < listItems.length && listItems[idx + 1].level > item.level) return true;
          return false;
        });

        elements.push(
          <div key={keyCounter++} className="tree-list tree-list-ol" style={{ marginLeft: `${adjustments.markdown.list.marginLeft}px` }}>
            {listItems.map((item, idx) => (
              <div
                key={idx}
                className={`tree-item tree-item-ol relative flex items-start ${isLastAtLevel[idx] ? 'tree-item-last' : ''
                  } ${hasChildren[idx] ? 'tree-item-has-children' : ''}`}
                style={{
                  marginLeft: `${item.level * 20}px`, // 24 -> 20
                  paddingLeft: '28px', // 28 -> 26
                  paddingTop: '2px', // 4 -> 2
                  paddingBottom: '2px', // 4 -> 2
                }}
                data-level={item.level}
              >
                {/* 垂直引导线 */}
                <div
                  className={`tree-line-vertical absolute left-[9px] top-0 w-[1.5px] bg-slate-200 dark:bg-slate-700 ${isLastAtLevel[idx] ? 'h-[14px]' : 'h-full'
                    }`}
                  style={{ display: item.level === 0 ? 'none' : 'block' }}
                />
                {/* 水平连接线 */}
                <div
                  className="tree-line-horizontal absolute left-[9px] top-[14px] h-[1.5px] w-[14px] bg-slate-200 dark:bg-slate-700"
                  style={{ display: item.level === 0 ? 'none' : 'block' }}
                />
                {/* 序号标记 - 优化 */}
                <span
                  className={`tree-marker flex-shrink-0 font-bold z-10 ${item.level === 0
                    ? 'text-slate-700 dark:text-slate-300 min-w-[20px] text-[15px] pt-[2px]' // 加黑、字体调整
                    : 'text-slate-500 dark:text-slate-500 min-w-[18px] text-[13px] pt-[3px]'
                    }`}
                >
                  {item.number}.
                </span>
                <span
                  className="tree-content text-slate-700 dark:text-slate-300 font-normal ml-1" // text-slate-600 -> 700
                >
                  {parseInlineMarkdown(item.text)}
                </span>
              </div>
            ))}
          </div>
        );
        continue;
      }

      // 图片处理 ![alt](url)
      const imageRegex = /^!\[([^\]]*)\]\(([^)]+)\)$/;
      const imageMatch = trimmed.match(imageRegex);
      if (imageMatch) {
        flushParagraph();
        const altText = imageMatch[1] || '';
        const imageUrl = imageMatch[2];
        const fileName = uploadedImageName(imageUrl);
        const caption = fileName.replace(/\.(?:png|jpe?g|gif|webp|svg|avif|apng)$/i, '');

        elements.push(
          <figure key={keyCounter++} className="flex flex-col items-center">
            <div className="w-full flex justify-center">
              <img
                src={imageUrl}
                alt={altText || caption}
                className="blog-content-image"
                loading="lazy"
                onClick={() => {
                  openImage(imageUrl, altText || caption);
                }}
                style={{ cursor: 'zoom-in' }}
              />
            </div>
            {caption && (
              <figcaption className="text-center text-slate-500 dark:text-slate-400 italic" title={fileName}>
                {caption}
              </figcaption>
            )}
          </figure>
        );
        i++;
        continue;
      }

      // 视频处理 (Bilibili & YouTube)
      const bilibiliRegex = /(?:https?:\/\/)?(?:www\.)?bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/;
      const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/;

      const bilibiliMatch = trimmed.match(bilibiliRegex);
      if (bilibiliMatch) {
        flushParagraph();
        const bvid = bilibiliMatch[1];
        elements.push(
          <div key={keyCounter++}>
            <VideoEmbed type="bilibili" id={bvid} />
          </div>
        );
        i++;
        continue;
      }

      const youtubeMatch = trimmed.match(youtubeRegex);
      if (youtubeMatch) {
        flushParagraph();
        const videoId = youtubeMatch[1];
        elements.push(
          <div key={keyCounter++}>
            <VideoEmbed type="youtube" id={videoId} />
          </div>
        );
        i++;
        continue;
      }

      // ---------- 段落边界 ----------
      if (trimmed === '') {
        flushParagraph();
        i++;
        continue;
      }
      paragraphLines.push(line);
      i++;
    }
    flushParagraph();

    // 未验密时仅提供阅读入口。
    if (!isUnlocked && post.isProtected) {
      elements.push(
        <div key="password-lock" className="blog-unlock-notice">
          <Lock size={24} aria-hidden="true" />
          <h3>输入密码，继续阅读</h3>
          <p>这篇内容需要阅读密码才能展开。</p>
          <button onClick={onUnlock} className="zzm-btn zzm-btn--primary">输入阅读密码</button>
        </div>
      );
    }

    return elements;
  };

  return renderContent;
};
