/**
 * [INPUT]: 依赖 web 内容契约、Vite 构建器、私有批次、本机发布目录与可选云部署回调
 * [OUTPUT]: 对外提供 createLocalPublisher，每次构建成功后原子切换静态网站
 * [POS]: 通用单服务器发布边界；构建失败保留旧站，生产双站适配仍由 publisher.cjs 提供
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { ApiError } = require('./store.cjs');
const { validateBatch } = require('./publisher.cjs');
function run(file, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], { cwd, env, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new ApiError('PUBLISH_FAILED', 500)); }, 600_000);
    child.on('error', () => { clearTimeout(timer); reject(new ApiError('PUBLISH_FAILED', 500)); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new ApiError('PUBLISH_FAILED', 500)); });
  });
}
function createLocalPublisher(template, siteRoot, origin, { deploy } = {}) {
  return async batch => {
    validateBatch(template, batch);
    const releaseId = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const release = path.join(siteRoot, 'releases', releaseId), output = path.join(release, 'public'), dist = path.join(release, 'dist');
    const meta = JSON.parse(fs.readFileSync(path.join(batch, 'batch.json')));
    const contentVersion = crypto.createHash('sha256').update(JSON.stringify({ files: meta.files, images: meta.images, collections: meta.collections })).digest('hex');
    const env = { ...process.env, BLOG_CONTENT_DIR: path.join(batch, 'content'), BLOG_IMAGES_DIR: path.join(batch, 'images'), BLOG_PUBLIC_DIR: output, BLOG_BUILD_DIR: dist, SITE_ORIGIN: origin, BLOG_READER_ORIGIN: origin, BLOG_RELEASE_ID: releaseId, BLOG_CONTENT_VERSION: contentVersion };
    fs.mkdirSync(release, { recursive: true });
    fs.cpSync(path.join(template, 'public'), output, { recursive: true, filter: source => !['blog-data.json', 'feed.xml', 'sitemap.xml'].includes(path.basename(source)) });
    try {
      await run(path.join(template, 'scripts/generate-data.cjs'), [], template, env);
      const vite = path.join(path.dirname(require.resolve('vite/package.json', { paths: [template] })), 'bin/vite.js');
      await run(vite, ['build'], template, env);
      await run(path.join(template, 'scripts/prepare-dist.cjs'), [], template, env);
      if (deploy) await deploy({ batch, dist, releaseId, release });
      const next = path.join(siteRoot, `.current-${releaseId}`);
      fs.symlinkSync(path.relative(siteRoot, dist), next, 'dir'); fs.renameSync(next, path.join(siteRoot, 'current'));
      return { releaseId, contentVersion, targets: { site: 'published' } };
    } catch (error) { fs.rmSync(release, { recursive: true, force: true }); throw error; }
  };
}
module.exports = { createLocalPublisher };
