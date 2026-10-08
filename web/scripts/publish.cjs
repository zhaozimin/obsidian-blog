/**
 * [INPUT]: 依赖 Node fs/path/crypto/child_process、外部内容与图片目录、npm 构建链、rsync 和 Wrangler
 * [OUTPUT]: 对外提供 prepare/all/cn/cloudflare 四种发布命令、同源双站产物及私有内容快照
 * [POS]: 阿里云上的网站发布边界；锁定单次构建，把同一内容快照按两个域名构建，GitHub 不参与内容发布
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { listMarkdownFiles } = require('./content-contract.cjs');

const { discoverCollections } = require('./catalog.cjs');

const projectDir = fs.realpathSync(path.resolve(__dirname, '..'));

const target = process.argv[2] || 'all';
const markerName = '.blog-template-site';
const markerValue = 'blog-zhaozimin-static-site';
const imageExtension = /\.(?:png|jpe?g|gif|webp|svg|avif|apng)$/i;

function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: projectDir, env: { ...process.env, ...env }, stdio: 'inherit' });
  if (result.error) throw new Error(`无法运行 ${command}：${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} 执行失败（${result.status}）`);
}

function outside(child, parent) {
  const relative = path.relative(parent, child);
  return relative !== '' && (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

function scanImages(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`图片目录不存在：${dir}`);
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || ['CLAUDE.md', 'AGENTS.md'].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`图片目录不接受符号链接：${file}`);
    if (entry.isDirectory()) return scanImages(file);
    return entry.isFile() && imageExtension.test(file) ? [file] : [];
  });
}

function sourceFiles(content, images) {
  return discoverCollections(content).collections.flatMap(config => listMarkdownFiles(path.join(content, config.folder)).map(file => ({ file, relative: `content/${path.relative(content, file)}` })))
    .concat(scanImages(images).map(file => ({ file, relative: `images/${path.relative(images, file)}` })))
    .sort((a, b) => a.relative.localeCompare(b.relative, 'en'));
}

function fingerprint(files) {
  const hash = crypto.createHash('sha256');
  for (const { file, relative } of files) {
    const bytes = fs.readFileSync(file);
    hash.update(JSON.stringify([relative, bytes.length]));
    hash.update(bytes);
  }
  return hash.digest('hex');
}

function cnRoot() {
  if (!process.env.BLOG_CN_ROOT) throw new Error('大陆站发布缺少 BLOG_CN_ROOT（1Panel 的实际站点运行目录）');
  const root = fs.realpathSync(process.env.BLOG_CN_ROOT);
  if (root === path.parse(root).root || !fs.statSync(root).isDirectory()) throw new Error('大陆站路径必须是独立的站点目录');
  const marker = path.join(root, markerName);
  if (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8').trim() !== markerValue) throw new Error(`目标目录未确认归属：先检查路径，再创建 ${markerName} 标记`);
  return root;
}

function main() {
  if (process.argv.length > 3 || !['prepare', 'all', 'cn', 'cloudflare'].includes(target)) throw new Error('用法：npm run publish -- prepare|all|cn|cloudflare');
  const content = fs.realpathSync(process.env.BLOG_CONTENT_DIR || path.join(projectDir, 'src/content'));
  const images = fs.realpathSync(process.env.BLOG_IMAGES_DIR || path.join(projectDir, 'public/images'));
  const releases = path.resolve(process.env.BLOG_RELEASES_DIR || path.join(os.tmpdir(), 'blog-zhaozimin-releases'));
  fs.mkdirSync(releases, { recursive: true, mode: 0o700 });
  const releaseRoot = fs.realpathSync(releases);
  for (const source of [content, images, projectDir]) if (!outside(releaseRoot, source) || !outside(source, releaseRoot)) throw new Error('发布产物目录必须与源码、内容和图片目录分开，不能嵌套');
  const root = ['all', 'cn'].includes(target) ? cnRoot() : null;
  if (root && [content, images, projectDir, releaseRoot].some(source => !outside(root, source) || !outside(source, root))) throw new Error('1Panel 运行目录必须与源码、内容及发布产物分开');
  if (['all', 'cloudflare'].includes(target)) {
    for (const key of ['CF_PAGES_PROJECT', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']) if (!process.env[key]) throw new Error(`Cloudflare 发布缺少 ${key}`);
  }
  const lock = path.join(releaseRoot, '.publish.lock');
  let lockFd;
  const targetLocks = root ? [{ file: path.join(root, '.blog-publish.lock'), label: '大陆站' }] : [];
  if (['all', 'cloudflare'].includes(target)) {
    const identity = JSON.stringify([process.env.CLOUDFLARE_ACCOUNT_ID, process.env.CF_PAGES_PROJECT]);
    targetLocks.push({ file: path.join(os.tmpdir(), `.blog-cloudflare-${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24)}.lock`), label: 'Cloudflare 站点' });
  }
  const acquired = [];
  try { lockFd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error(`已有发布任务或遗留锁：${lock}；确认没有构建进程后再清理`); throw error; }
  try {
    for (const { file, label } of targetLocks) {
      try { acquired.push({ file, fd: fs.openSync(file, 'wx', 0o600) }); }
      catch (error) { if (error.code === 'EEXIST') throw new Error(`${label}已有发布任务或遗留锁：${file}`); throw error; }
    }
    fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const files = sourceFiles(content, images);
    const version = fingerprint(files);
    const releaseId = `${new Date().toISOString().replace(/[-:.]/g, '')}-${version.slice(0, 12)}`;
    const release = path.join(releaseRoot, releaseId);
    fs.mkdirSync(release, { mode: 0o700 });
    const snapshot = path.join(release, 'snapshot');
    const generatedPublic = path.join(release, 'public');
    fs.cpSync(path.join(projectDir, 'public'), generatedPublic, { recursive: true, filter: source => {
      const relative = path.relative(path.join(projectDir, 'public'), source);
      if (fs.lstatSync(source).isSymbolicLink()) throw new Error('公开模板资源不接受符号链接');
      return !['blog-data.json', 'feed.xml', 'sitemap.xml', 'images'].includes(relative) && !['CLAUDE.md', 'AGENTS.md'].includes(path.basename(source));
    } });
    for (const config of discoverCollections(content).collections) fs.mkdirSync(path.join(snapshot, 'content', config.folder), { recursive: true });
    fs.mkdirSync(path.join(snapshot, 'images'), { recursive: true });
    for (const { file, relative } of files) {
      const destination = path.join(snapshot, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(file, destination);
    }
    if (version !== fingerprint(sourceFiles(content, images)) || version !== fingerprint(sourceFiles(path.join(snapshot, 'content'), path.join(snapshot, 'images')))) throw new Error('构建期间上传目录发生变化，请等待上传完成后重试');
    const sharedEnv = {
      BLOG_CONTENT_DIR: path.join(snapshot, 'content'), BLOG_IMAGES_DIR: path.join(snapshot, 'images'),
      BLOG_PUBLIC_DIR: generatedPublic,
      BLOG_RELEASE_ID: releaseId, BLOG_CONTENT_VERSION: version,
      GITHUB_SHA: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf8' }).stdout?.trim() || 'local',
    };
    run('npm', ['run', 'check:ui']);
    run('npm', ['run', 'check']);
    const builds = {
      cn: process.env.BLOG_CN_ORIGIN || 'https://blog.zhaozimin.cn',
      com: process.env.BLOG_COM_ORIGIN || 'https://blog.zhaozimin.com',
    };
    for (const [name, origin] of Object.entries(builds)) {
      run('npm', ['run', 'build'], { ...sharedEnv, SITE_ORIGIN: origin, BLOG_BUILD_DIR: path.join(release, name) });
    }
    const cloudflareProject = process.env.CF_PAGES_PROJECT;
    if (['all', 'cloudflare'].includes(target)) {
      run(path.join(projectDir, 'node_modules/.bin/wrangler'), ['pages', 'deploy', path.join(release, 'com'), '--project-name', cloudflareProject, '--branch', 'main'], { CI: 'true' });
    }
    if (root) run('rsync', ['-a', '--no-owner', '--no-group', '--delete-delay', '--delay-updates', '--chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r', '--exclude=/.well-known/', '--exclude=/.user.ini', '--exclude=/.blog-publish.lock', `--exclude=/${markerName}`, `${path.join(release, 'cn')}/`, `${root}/`]);
    fs.writeFileSync(path.join(release, 'publish-result.json'), `${JSON.stringify({ releaseId, contentVersion: version, target, completedAt: new Date().toISOString(), cnOrigin: builds.cn, comOrigin: builds.com }, null, 2)}\n`);
    process.stdout.write(`\n${target === 'prepare' ? '双站部署包准备完成' : '发布完成'}：${release}\n内容版本：${version}\n`);
  } finally {
    for (const { file, fd } of acquired.reverse()) { fs.closeSync(fd); fs.unlinkSync(file); }
    fs.closeSync(lockFd); fs.unlinkSync(lock);
  }
}

try { main(); }
catch (error) { process.stderr.write(`发布中止：${error.message}\n`); process.exitCode = 1; }
