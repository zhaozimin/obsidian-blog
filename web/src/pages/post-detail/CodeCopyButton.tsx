/**
 * [INPUT]: 依赖 React 状态、剪贴板 API 与代码块语言/正文
 * [OUTPUT]: 对外提供 CodeCopyButton
 * [POS]: 代码复制反馈边界；所有笔记文本以 React 文本节点显示，失败给出可读反馈，离开页面清理计时器
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react';
export function CodeCopyButton({ content, language }: { content: string; language: string }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (timer.current) clearTimeout(timer.current); }; }, []);
  return <button onClick={async () => {
    let result: string;
    try { await navigator.clipboard.writeText(content); result = '已复制'; }
    catch { result = '复制失败'; }
    if (!alive.current) return;
    setMessage(result);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 2000);
  }} className="zzm-btn zzm-btn--sm zzm-btn--ondark" title="点击复制代码">
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 002-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
    <span className="ml-1" role="status">{message || language || '复制'}</span>
  </button>;
}
