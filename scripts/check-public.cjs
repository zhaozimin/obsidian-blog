/**
 * [INPUT]: 依赖源码文件集合与敏感文件/内容特征，忽略构建和本地依赖
 * [OUTPUT]: 开源前检查结果，发现问题只报文件名和规则，不输出匹配值
 * [POS]: 仓库发布边界；检查不替代人工审核，实际连接配置必须放在项目外
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const skip = new Set(['.git', 'node_modules', 'dist', '.local']);
const findings = [];
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const file = path.join(dir, entry.name), relative = path.relative(root, file);
    if (entry.isDirectory()) { scan(file); continue; }
    if (entry.name === '.DS_Store') continue;
    if (/^(data\.json|\.env)$|\.(pem|key|p12|log|zip)$/.test(entry.name)) findings.push([relative, '私有运行文件']);
    if (!/\.(?:cjs|mjs|js|ts|tsx|css|md|json|html|yml|yaml)$|\.env\.example$/.test(entry.name)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----/.test(text)) findings.push([relative, '私钥']);
    if (/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})/.test(text)) findings.push([relative, '凭据特征']);
    if (/\/Volumes\/|\/Users\/[^/\s]+\//.test(text)) findings.push([relative, '本机绝对路径']);
    if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text.replace(/127\.0\.0\.1|0\.0\.0\.0/g, 'localhost'))) findings.push([relative, '实际网络地址']);
    if (/\b(?:secretKey|BLOG_RECEIVER_KEY|CLOUDFLARE_API_TOKEN)\s*[:=]\s*['"][A-Za-z0-9_-]{24,}['"]/.test(text)) findings.push([relative, '硬编码凭据']);
  }
}
scan(root);
const template = path.join(root, 'vault-template/blog-V3');
if (fs.existsSync(template)) {
  const { readContent } = require('../web/scripts/content-contract.cjs');
  try { const data = readContent(template); if (data.allPosts.length || data.aboutStories.length) findings.push(['vault-template/blog-V3', '发行模板含文章']); }
  catch { findings.push(['vault-template/blog-V3', '发行模板内容契约无效']); }
  const attachments = path.join(template, '6.附件');
  if (fs.existsSync(attachments) && fs.readdirSync(attachments).some(name => !['CLAUDE.md', '.gitkeep'].includes(name))) findings.push(['vault-template/blog-V3/6.附件', '发行模板含附件']);
}
if (findings.length) {
  for (const [file, reason] of findings) process.stderr.write(`${file}: ${reason}\n`);
  process.exitCode = 1;
} else process.stdout.write('公开源码检查通过：无本机设置、连接凭据或个人内容。\n');
