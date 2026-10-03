/**
 * [INPUT]: 依赖 React Router 的快照生成的栏目路由和内容加载，图片预览 Provider、各页面
 * [OUTPUT]: 对外提供 App 根组件
 * [POS]: 应用编排入口，先加载唯一内容快照，再生成栏目入口，所有页面共用 Layout
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { ImageViewerProvider } from './components/ImageViewerContext';
import { Layout } from './components/Layout';
import { COLLECTIONS } from './lib/site';
import { prepareSite } from './lib/markdown';
import Home from './pages/Home';
import ListPage from './pages/ListPages';
import About from './pages/About';
import PostDetail from './pages/PostDetail';
import NotFound from './pages/NotFound';

export default function App() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => { let alive = true; prepareSite().then(() => { if (alive) setState('ready'); }).catch(() => { if (alive) setState('error'); }); return () => { alive = false; }; }, []);
  if (state !== 'ready') return <div className="blog-container blog-empty" role="status">{state === 'loading' ? '正在载入…' : '内容暂时无法载入，请刷新重试。'}</div>;
  return <ImageViewerProvider><Router><Layout><Routes>
    <Route path="/" element={<Home />} />
    {COLLECTIONS.filter(item => item.type).map(item => <Route key={item.id} path={item.path} element={<ListPage collection={item} />} />)}
    {COLLECTIONS.filter(item => item.kind === 'about').map(item => <Route key={item.id} path={item.path} element={<About collection={item} />} />)}
    <Route path="/post/:id" element={<PostDetail />} />
    <Route path="*" element={<NotFound />} />
  </Routes></Layout></Router></ImageViewerProvider>;
}
