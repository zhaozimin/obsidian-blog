/**
 * [INPUT]: 依赖 node:path、Vite、React 构建插件和可选 BLOG_BUILD_DIR/BLOG_PUBLIC_DIR
 * [OUTPUT]: 对外提供 本地开发和静态构建配置
 * [POS]: 项目构建边界，固定本地端口以便稳定预览
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: process.env.BLOG_PUBLIC_DIR || 'public',
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  build: { outDir: process.env.BLOG_BUILD_DIR || 'dist', emptyOutDir: true },
});
