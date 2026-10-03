/**
 * [INPUT]: 依赖选中文件、Obsidian YAML/附件解析、collector 哈希与统一 PublisherClient
 * [OUTPUT]: 对外提供 collectWechatArticle 与 wechatClient，只收集当前文章和引用图片
 * [POS]: 公众号采集边界；排版配置来自独立笔记库文件，正文与原附件不改写，不复制公众号账号密钥
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { sha256 } = require('./collector');
const { PublisherClient } = require('./client');
const { splitCode } = require('../shared/markdown-parts.cjs');
const IMAGE = /\.(png|jpe?g|webp|gif|svg|avif|apng)$/i;
function base64(bytes) {
  const array = new Uint8Array(bytes); let binary = '';
  for (let start = 0; start < array.length; start += 0x8000) binary += String.fromCharCode(...array.subarray(start, start + 0x8000));
  return btoa(binary);
}
function wechatClient(requestUrl, settings) { return new PublisherClient(requestUrl, { serverUrl: settings.wechatServerUrl || settings.serverUrl, secretKey: settings.wechatSecretKey || settings.secretKey }); }
async function collectWechatArticle(app, settings, file, parseYaml) {
  if (!file || file.extension !== 'md' || ['_栏目', 'home', '站点设置', 'CLAUDE', 'AGENTS', 'README'].includes(file.basename)) throw new Error('请先打开要上传的文章笔记。');
  const source = await app.vault.read(file), header = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  let data; try { data = header ? parseYaml(header[1]) || {} : {}; } catch { throw new Error('文章属性格式有误，请检查 YAML。'); }
  if (!data.id || typeof data.id !== 'string') throw new Error('请先为文章设置稳定 id；用“新建文章”可自动生成。');
  let markdown = header ? source.slice(header[0].length) : source;
  const images = new Map(); let totalBytes = 0;
  const resolve = async value => {
    let ref = String(value || '').replace(/^!?\[\[([\s\S]*?)\]\]$/, '$1').split('|')[0].replace(/^<|>$/g, '');
    try { ref = decodeURIComponent(ref); } catch { /* 保留原引用 */ }
    if (/^(?:https?:|data:)/i.test(ref) || !IMAGE.test(ref)) throw new Error('公众号图片必须引用本地附件，远程图片请先保存到笔记库。');
    let image = app.metadataCache.getFirstLinkpathDest(ref, file.path);
    if (!image && ref.startsWith('/images/')) {
      const candidates = app.vault.getFiles().filter(item => item.name === ref.split('/').pop()); if (candidates.length === 1) image = candidates[0];
    }
    if (!image || !IMAGE.test(image.path)) throw new Error(`图片引用未找到：${ref}`);
    const id = await sha256(image.path);
    if (!images.has(id)) {
      const bytes = await app.vault.readBinary(image);
      if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('公众号单张图片超过 10 MiB，请先压缩。');
      totalBytes += bytes.byteLength; if (totalBytes > 24 * 1024 * 1024) throw new Error('公众号引用图片总量超过 24 MiB，请先压缩。');
      images.set(id, { id, base64: base64(bytes) });
    }
    return id;
  };
  // ===== 代码示例保持原文，不将代码中的图片语法当作附件 =====
  const parts = splitCode(markdown);
  for (const part of parts) {
    if (part.code) continue;
    let segment = part.text;
    const matches = [...segment.matchAll(/!\[\[([^\]]+)\]\]|!\[([^\]]*)\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)];
    for (const match of matches.reverse()) {
      const ref = match[1] || match[3], id = await resolve(ref), caption = match[1] ? match[1].split('|')[1] || '' : match[2];
      segment = segment.slice(0, match.index) + `![${caption.replace(/[\[\]]/g, '')}](bp-asset:${id})` + segment.slice(match.index + match[0].length);
    }
    part.text = segment;
  }
  markdown = parts.map(part => part.text).join('');
  const coverRef = data.wechatCover || data.image || data.cover;
  const cover = coverRef ? await resolve(coverRef) : images.keys().next().value;
  if (!cover) throw new Error('请在文章 image 属性中设置本地封面，或在正文中插入图片。');
  let style = {};
  const styleFile = app.vault.getAbstractFileByPath(settings.wechatStylePath || '发布配置/公众号排版.json');
  if (styleFile) { try { style = JSON.parse(await app.vault.read(styleFile)); } catch { throw new Error('公众号排版配置不是有效 JSON。'); } }
  return { articleId: data.id, title: String(data.title || file.basename), author: String(data.wechatAuthor || ''), digest: String(data.wechatDigest || data.description || ''), sourceUrl: String(data.wechatSourceUrl || ''), draftId: String(data.wechatDraftId || ''), markdown, cover, images: [...images.values()], style };
}
module.exports = { collectWechatArticle, wechatClient };
