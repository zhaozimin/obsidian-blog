/**
 * [INPUT]: 依赖 Obsidian requestUrl、用户本地发布地址和访问密钥
 * [OUTPUT]: 对外提供 PublisherClient、normalizeEndpoint、PublicError 与业务错误映射
 * [POS]: 插件唯一 HTTP 适配器；隐藏连接细节，上传与轮询不依赖浏览器 CORS
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const MESSAGES = Object.freeze({
  WECHAT_CONFIG: '公众号账号尚未配置。请在服务端私有配置中填入自己的 AppID 和 AppSecret。',
  WECHAT_IP: '请在公众号后台把服务端出口 IP 加入接口白名单。',
  WECHAT_PERMISSION: '当前公众号没有所需接口权限，请在公众号后台检查。',
  WECHAT_COVER: '请设置一张本地封面图片；可在文章 image 属性中填写附件链接。',
  WECHAT_IMAGE: '公众号图片未能处理，请检查图片引用，远程图片请先保存到附件目录。',
  WECHAT_MATH: '公式无法转换，请检查 LaTeX 语法或缩短公式。',
  WECHAT_STYLE: '公众号排版配置无效，请检查配置 JSON。',
  WECHAT_API: '公众号接口拒绝了请求，请检查账号权限、封面或文章内容。',
  WECHAT_NETWORK: '公众号请求结果尚未确认。请先查看草稿箱，避免重复新增。',
  WECHAT_UNCERTAIN: '上次草稿保存结果不明。请在公众号后台确认；可填入 wechatDraftId 后再预览和更新。',
  WECHAT_DRAFT_GONE: '原草稿或素材已失效，请先核对公众号后台的草稿记录。',
  WECHAT_MULTI_DRAFT: '该草稿包含多篇文章，当前只更新单篇草稿，请选择独立草稿。',
  WECHAT_RATE: '公众号接口调用过于频繁，请稍后重试。',
  UNAUTHORIZED: '连接凭据无效，请在设置中更新访问密钥。',
  TOO_LARGE: '上传内容超过限制，请压缩图片或缩小文章。',
  INVALID_INPUT: '上传格式不正确，请更新插件后重试。',
  NOT_FOUND: '发布任务已失效，请重新同步。',
  BUSY: '服务器正在发布其他任务，请稍后重试。',
  INCOMPLETE: '图片尚未上传完整，请重新同步。',
  INVALID_CONTENT: '内容校验未通过，请检查重复 id、YAML 和图片引用。',
  PUBLISH_FAILED: '博客构建或发布未完成，请再次同步重试。',
  INTERRUPTED: '服务器重启中断了发布，请再次同步重试。',
  INTERNAL: '服务暂时无法完成发布，请稍后重试。',
  NETWORK: '连接暂时中断；发布任务会保留，再次同步可检查结果。'
});
class PublicError extends Error {
  constructor(code) { super(MESSAGES[code] || MESSAGES.INTERNAL); this.code = code; }
}
function normalizeEndpoint(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('请填写有效的 HTTPS 发布地址。'); }
  if (url.username || url.password || url.search || url.hash) throw new Error('发布地址不能包含账号、参数或连接凭据。');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('发布地址必须使用 HTTPS，本机测试可用 HTTP。');
  }
  url.pathname = url.pathname.replace(/\/(?:api(?:\/upload\/markdown|\/publish)?)?\/?$/, '').replace(/\/$/, '');
  return url.toString().replace(/\/$/, '');
}
class PublisherClient {
  constructor(requestUrl, settings) {
    this.requestUrl = requestUrl;
    this.endpoint = normalizeEndpoint(settings.serverUrl);
    this.key = String(settings.secretKey || '').trim();
    if (!this.key) throw new Error('请先配置访问密钥。');
  }
  async request(path, method = 'GET', body, binary = false, channel = 'publish') {
    let response;
    try {
      response = await this.requestUrl({
        url: `${this.endpoint}/api/${channel}${path}`, method, throw: false,
        headers: { 'Authorization': `Bearer ${this.key}`, ...(body !== undefined ? { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' } : {}) },
        ...(body !== undefined ? { body: binary ? body : JSON.stringify(body) } : {})
      });
    } catch { throw new PublicError('NETWORK'); }
    let result;
    try { result = response.json; } catch { throw new PublicError('INTERNAL'); }
    if (response.status < 200 || response.status >= 300) throw new PublicError(result?.code || (response.status === 401 ? 'UNAUTHORIZED' : response.status === 413 ? 'TOO_LARGE' : 'INTERNAL'));
    if (!result || typeof result !== 'object') throw new PublicError('INTERNAL');
    return result;
  }
  health() { return this.request('/health'); }
  wechatHealth() { return this.request('/health', 'GET', undefined, false, 'wechat'); }
  wechatPreview(article) { return this.request('/preview', 'POST', article, false, 'wechat'); }
  wechatDraft(previewId) { return this.request('/drafts', 'POST', { previewId }, false, 'wechat'); }
  create(collected) {
    return this.request('/batches', 'POST', {
      collections: collected.collections, files: collected.files,
      images: collected.images.map(({ filename, hash, size }) => ({ filename, hash, size }))
    });
  }
  upload(batchId, image) { return this.request(`/batches/${batchId}/images/${encodeURIComponent(image.filename)}`, 'PUT', image.bytes, true); }
  status(batchId) { return this.request(`/batches/${batchId}`); }
  commit(batchId) { return this.request(`/batches/${batchId}/commit`, 'POST', {}); }
  async wait(batchId, alive = () => true) {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (alive() && Date.now() < deadline) {
      const result = await this.status(batchId);
      if (result.state === 'published') return result;
      if (result.state === 'failed') throw new PublicError(result.code);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new PublicError('NETWORK');
  }
}
module.exports = { PublisherClient, normalizeEndpoint, PublicError, MESSAGES };
