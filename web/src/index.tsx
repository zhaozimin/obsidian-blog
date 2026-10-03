/**
 * [INPUT]: 依赖 react-dom/client 的挂载能力、App、ErrorBoundary、本地工具类、冻结设计系统与博客布局样式
 * [OUTPUT]: 对外提供 浏览器应用挂载
 * [POS]: 浏览器入口，统一启动应用及样式
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import './styles/zzm-v0.2.0.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/home.css';
import './styles/content.css';
import './styles/overlays.css';

document.documentElement.classList.remove('dark');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
