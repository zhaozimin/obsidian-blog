/**
 * [INPUT]: 依赖 React、KaTeX 与笔记中的 LaTeX 表达式
 * [OUTPUT]: 对外提供 MathContent，渲染行内和独立公式
 * [POS]: 博客公式显示边界；不信任公式中的链接或 HTML，资源随网站打包，无外部字体请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
export function MathContent({ expression, display = false }: { expression: string; display?: boolean }) {
  const html = katex.renderToString(expression, { displayMode: display, throwOnError: false, trust: false, strict: 'warn', maxExpand: 1000 });
  return <span className={display ? 'blog-math blog-math-block' : 'blog-math'} dangerouslySetInnerHTML={{ __html: html }} />;
}
