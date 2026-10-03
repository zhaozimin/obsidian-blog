/**
 * [INPUT]: 依赖网站既有 content-contract.cjs、私有发布命令、Node spawn 和批次数据
 * [OUTPUT]: 对外提供 createPublisher 与共享 validateBatch，供历史和单服务器发布共同校验
 * [POS]: 网站适配边界；字段规范由前端项目维护，构建与网络输出不进入客户端响应
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { ApiError } = require('./store.cjs');
function validateBatch(template, batch) {
  const contract = require(path.join(template, 'scripts/content-contract.cjs'));
  const content = path.join(batch, 'content'), images = path.join(batch, 'images');
  const validation = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-validation-'));
  try {
    const source = contract.readContent(content);
    const meta = JSON.parse(fs.readFileSync(path.join(batch, 'batch.json'), 'utf8'));
    if (meta.collections) {
      const identity = items => JSON.stringify(items.map(({ id, kind, folder }) => ({ id, kind, folder })).sort((a, b) => a.id.localeCompare(b.id)));
      if (identity(meta.collections) !== identity(source.collections)) throw new Error('栏目清单与笔记声明不一致');
    }
    contract.syncImages(images, path.join(validation, 'images'));
  } catch { throw new ApiError('INVALID_CONTENT', 422); }
  finally { fs.rmSync(validation, { recursive: true, force: true }); }
}
function createPublisher(template, command) {
  return async batch => {
    validateBatch(template, batch);
    const content = path.join(batch, 'content'), images = path.join(batch, 'images');
    const output = await new Promise((resolve, reject) => {
      const child = spawn(command, ['all'], {
        shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, BLOG_CONTENT_DIR: content, BLOG_IMAGES_DIR: images }
      });
      let stdout = '', settled = false, timedOut = false, killTimer;
      const finish = (error, value) => {
        if (settled) return; settled = true; clearTimeout(timer); clearTimeout(killTimer);
        if (error) reject(error); else resolve(value);
      };
      // 构建输出保留在内存中用于解析成功编号，不写入公开日志。
      child.stdout.on('data', bytes => { stdout = (stdout + bytes.toString()).slice(-65536); });
      child.stderr.resume();
      const kill = signal => {
        try { if (process.platform === 'win32') child.kill(signal); else process.kill(-child.pid, signal); } catch { /* 子进程已经退出 */ }
      };
      const timer = setTimeout(() => {
        timedOut = true; kill('SIGTERM');
        killTimer = setTimeout(() => kill('SIGKILL'), 5000); killTimer.unref();
      }, 20 * 60 * 1000);
      child.on('error', () => finish(new ApiError('PUBLISH_FAILED', 500)));
      child.on('close', code => {
        if (code !== 0 || timedOut) return finish(new ApiError('PUBLISH_FAILED', 500));
        finish(null, stdout);
      });
    });
    const release = output.match(/发布完成：([^\r\n]+)/);
    if (!release) throw new ApiError('PUBLISH_FAILED', 500);
    let result;
    try { result = JSON.parse(fs.readFileSync(path.join(release[1].trim(), 'publish-result.json'), 'utf8')); }
    catch { throw new ApiError('PUBLISH_FAILED', 500); }
    if (result.target !== 'all') throw new ApiError('PUBLISH_FAILED', 500);
    return { releaseId: result.releaseId, contentVersion: result.contentVersion };
  };
}
module.exports = { createPublisher, validateBatch };
