/**
 * [INPUT]: 依赖 node:path/module、Vite、React 插件与 path-safety 的真实路径隔离
 * [OUTPUT]: 对外提供 本地开发和静态构建配置
 * [POS]: 项目构建边界，固定本地端口以便稳定预览
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectDir = path.resolve(__dirname);
const require = createRequire(import.meta.url);
const { validateBuildPaths } = require('./scripts/path-safety.cjs');
const contentDir = process.env.BLOG_CONTENT_DIR || path.join(projectDir, 'src/content');
const imagesDir = process.env.BLOG_IMAGES_DIR || path.join(projectDir, 'public/images');
const paths = validateBuildPaths({ projectDir, contentDir, imagesDir, publicDir: process.env.BLOG_PUBLIC_DIR || path.join(projectDir, 'public'), buildDir: process.env.BLOG_BUILD_DIR || path.join(projectDir, 'dist') });

export default defineConfig({
  plugins: [react()],
  publicDir: paths.publicDir,
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  build: { outDir: paths.buildDir, emptyOutDir: true },
});
