/**
 * [INPUT]: 依赖私有预览目录、wechat-render 和官方或用户自定义公众号适配器
 * [OUTPUT]: 对外提供 WechatService，生成可预览计划并幂等创建/更新公众号草稿
 * [POS]: 双渠道中的公众号事务；先本地预览再外部上传，跨账号隔离记录，结果不明时阻止重复新增
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ApiError } = require('./store.cjs');
const { prepareArticle, previewHtml, mapAssetImages } = require('./wechat-render.cjs');
function save(file, data) { const temp = `${file}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temp, JSON.stringify(data), { mode: 0o600 }); fs.renameSync(temp, file); }
class WechatService {
  constructor(root, adapter) {
    this.root = path.resolve(root); this.adapter = adapter; this.busy = new Set();
    for (const dir of ['previews', 'records', 'media']) fs.mkdirSync(path.join(this.root, dir), { recursive: true, mode: 0o700 });
    for (const name of fs.readdirSync(path.join(this.root, 'previews'))) if (Date.now() - fs.statSync(path.join(this.root, 'previews', name)).mtimeMs > 86400_000) fs.rmSync(path.join(this.root, 'previews', name));
  }
  health() { return { configured: Boolean(this.adapter.configured()), mode: 'draft-only', style: 'basic-unconfirmed' }; }
  async preview(input) {
    const plan = await prepareArticle(input), previewId = crypto.randomUUID();
    save(path.join(this.root, 'previews', `${previewId}.json`), { ...plan, createdAt: Date.now() });
    return { previewId, html: previewHtml(plan), title: plan.title, images: plan.assets.length, formulas: plan.formulas, styleIsDefault: plan.styleIsDefault };
  }
  load(previewId) {
    if (!/^[a-f\d-]{36}$/.test(previewId || '')) throw new ApiError('INVALID_INPUT');
    let plan; try { plan = JSON.parse(fs.readFileSync(path.join(this.root, 'previews', `${previewId}.json`))); } catch { throw new ApiError('NOT_FOUND', 404); }
    if (Date.now() - plan.createdAt > 86400_000) throw new ApiError('NOT_FOUND', 404); return plan;
  }
  record(account, article) { return path.join(this.root, 'records', `${crypto.createHash('sha256').update(`${account}\n${article}`).digest('hex')}.json`); }
  async media(asset, account, cover) {
    const bytes = Buffer.from(asset.base64, 'base64');
    const key = crypto.createHash('sha256').update(account).update(cover ? 'cover' : 'inline').update(bytes).digest('hex');
    const file = path.join(this.root, 'media', `${key}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file)).value;
    const value = await this.adapter.upload(bytes, cover); save(file, { value }); return value;
  }
  async draft(previewId) {
    if (!this.adapter.configured() || !this.adapter.accountId) throw new ApiError('WECHAT_CONFIG', 409);
    const plan = this.load(previewId), account = this.adapter.accountId, file = this.record(account, plan.articleId);
    if (this.busy.has(file)) throw new ApiError('BUSY', 409); this.busy.add(file);
    try {
      let state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};
      if (state.phase === 'saving' || state.phase === 'unknown') {
        if (!plan.draftId) throw new ApiError('WECHAT_UNCERTAIN', 409);
      }
      const mediaId = plan.draftId || state.mediaId;
      if (mediaId) {
        const remote = await this.adapter.get(mediaId);
        if (!Array.isArray(remote.news_item) || remote.news_item.length !== 1) throw new ApiError('WECHAT_MULTI_DRAFT', 409);
        if (state.hash === plan.hash && state.phase === 'saved' && mediaId === state.mediaId) return { state: 'draft', mediaId, reused: true };
      }
      const cover = await this.media(plan.assets.find(item => item.id === plan.cover), account, true);
      let html = plan.html;
      const imageIds = new Set(); mapAssetImages(html, id => { imageIds.add(id); return `bp-asset:${id}`; });
      const uploaded = new Map();
      for (const asset of plan.assets) {
        if (!imageIds.has(asset.id)) continue;
        const url = await this.media(asset, account, false);
        if (!/^https?:\/\//.test(url)) throw new ApiError('WECHAT_API', 502);
        uploaded.set(asset.id, url.replace(/[&"<>]/g, char => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[char])));
      }
      html = mapAssetImages(html, id => { if (!uploaded.has(id)) throw new ApiError('WECHAT_IMAGE'); return uploaded.get(id); });
      const article = { title: plan.title, author: plan.author, digest: plan.digest, content: html, content_source_url: plan.sourceUrl, thumb_media_id: cover, need_open_comment: 0, only_fans_can_comment: 0 };
      save(file, { ...state, phase: 'saving', pendingHash: plan.hash, mediaId });
      let result;
      try {
        result = mediaId ? await this.adapter.update(mediaId, article) : await this.adapter.add(article);
        if (typeof result !== 'string' || !result.trim()) throw new ApiError('WECHAT_UNCERTAIN', 502);
      } catch (error) {
        save(file, { ...state, mediaId, phase: !(error instanceof ApiError) || ['WECHAT_NETWORK', 'WECHAT_UNCERTAIN'].includes(error.code) ? 'unknown' : 'failed' }); throw error;
      }
      save(file, { phase: 'saved', mediaId: result, hash: plan.hash, savedAt: new Date().toISOString() });
      return { state: 'draft', mediaId: result, updated: Boolean(mediaId) };
    } finally { this.busy.delete(file); }
  }
}
module.exports = { WechatService };
