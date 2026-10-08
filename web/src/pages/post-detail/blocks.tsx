/**
 * [INPUT]: 依赖正文行数组、行内渲染能力、MathContent 与隔离的 extras.css
 * [OUTPUT]: 对外提供 readExtraBlock，消费 Markdown 表格和独立公式并返回下一行
 * [POS]: 现有博客块解析器的扩展边界；复用原行内格式和主题，不重写已有图片、代码或授权逻辑
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react';
import { MathContent } from './math';
import './extras.css';
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
export function readExtraBlock(lines: string[], index: number, inline: (text: string) => React.ReactNode[]) {
  const line = lines[index].trim();
  if (line.startsWith('$$')) {
    if (line.length > 4 && line.endsWith('$$')) return { node: <MathContent expression={line.slice(2, -2)} display />, next: index + 1 };
    const expression = [line.slice(2)]; let next = index + 1;
    while (next < lines.length && !lines[next].trim().endsWith('$$')) expression.push(lines[next++]);
    if (next === lines.length) return null;
    expression.push(lines[next].trim().slice(0, -2));
    return { node: <MathContent expression={expression.join('\n').trim()} display />, next: next + 1 };
  }
  const separator = lines[index + 1] || '';
  if (!line.includes('|') || !/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(separator)) return null;
  const headers = cells(line), alignment = cells(separator).map(cell => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left') as ('left' | 'right' | 'center')[];
  const rows: string[][] = []; let next = index + 2;
  while (next < lines.length && lines[next].trim() && lines[next].includes('|')) rows.push(cells(lines[next++]));
  return { next, node: <div className="blog-markdown-table"><table><thead><tr>{headers.map((cell, col) => <th key={col} style={{ textAlign: alignment[col] }}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, col) => <td key={col} style={{ textAlign: alignment[col] }}>{inline(row[col] || '')}</td>)}</tr>)}</tbody></table></div> };
}
