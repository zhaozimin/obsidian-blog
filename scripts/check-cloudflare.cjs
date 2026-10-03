/**
 * [INPUT]: 依赖生成的空白网站、Cloudflare 配置和锁定的 Wrangler CLI
 * [OUTPUT]: 对外提供无账号 dry-run 编译检查，验证 Worker 与绑定的真实配置
 * [POS]: CI 平台兼容边界，只检查打包，不创建资源或上传内容
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const { wranglerConfig } = require('../server/cloudflare-publisher.cjs');
const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-worker-check-'));
try {
  const config = wranglerConfig({ name: 'blog-system-check', accountId: 'a'.repeat(32), origin: 'https://blog.example.com', bucket: 'blog-system-check-private' }, path.join(root, 'web/dist'), 'check-version');
  const file = path.join(temp, 'wrangler.json'); fs.writeFileSync(file, JSON.stringify(config));
  const cli = path.join(path.dirname(require.resolve('wrangler/package.json', { paths: [root] })), 'bin/wrangler.js');
  const result = spawnSync(process.execPath, [cli, 'deploy', '--dry-run', '--config', file, '--outdir', path.join(temp, 'output')], { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout || 'Wrangler 编译失败'); process.exitCode = 1; }
  else process.stdout.write('Cloudflare Worker、静态资源、私有 R2 与限速绑定 dry-run 检查通过，未上传云端。\n');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
