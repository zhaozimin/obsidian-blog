/**
 * [INPUT]: 依赖服务器私有账号配置、Node fetch 与公众号 token/图片/草稿接口
 * [OUTPUT]: 对外提供 WechatApi 和可注入的官方接口适配边界
 * [POS]: 公众号网络边界；密钥与 token 不返回客户端，只创建或更新草稿，不发布或群发
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { ApiError } = require('./store.cjs');
const CODES = { 40164: 'WECHAT_IP', 48001: 'WECHAT_PERMISSION', 48002: 'WECHAT_PERMISSION', 40013: 'WECHAT_CONFIG', 40125: 'WECHAT_CONFIG', 45009: 'WECHAT_RATE', 40007: 'WECHAT_DRAFT_GONE' };
class WechatApi {
  constructor({ appId = '', appSecret = '', baseUrl = 'https://api.weixin.qq.com', transport = fetch } = {}) {
    const url = new URL(baseUrl);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('公众号接口地址无效。');
    this.base = url.toString().replace(/\/$/, ''); this.appId = appId; this.appSecret = appSecret; this.accountId = appId; this.transport = transport;
    this.token = null; this.tokenRequest = null;
  }
  configured() { return Boolean(this.appId && this.appSecret); }
  async send(path, params, method = 'GET', body) {
    let response, result;
    try {
      response = await this.transport(`${this.base}${path}?${new URLSearchParams(params)}`, { method, redirect: 'error', signal: AbortSignal.timeout(30_000), ...(body === undefined ? {} : body instanceof FormData ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
      result = await response.json();
    } catch { throw new ApiError('WECHAT_NETWORK', 502); }
    if (!response.ok) throw new ApiError('WECHAT_API', 502);
    if (result.errcode) throw new ApiError(CODES[result.errcode] || (result.errcode === 40001 || result.errcode === 42001 ? 'WECHAT_TOKEN' : 'WECHAT_API'), 502);
    return result;
  }
  async accessToken() {
    if (!this.configured()) throw new ApiError('WECHAT_CONFIG', 409);
    if (this.token?.expires > Date.now()) return this.token.value;
    if (!this.tokenRequest) this.tokenRequest = (async () => {
      const result = await this.send('/cgi-bin/token', { grant_type: 'client_credential', appid: this.appId, secret: this.appSecret });
      if (typeof result.access_token !== 'string' || !Number.isFinite(result.expires_in)) throw new ApiError('WECHAT_API', 502);
      this.token = { value: result.access_token, expires: Date.now() + Math.max(30, result.expires_in - 120) * 1000 }; return result.access_token;
    })().finally(() => { this.tokenRequest = null; });
    return this.tokenRequest;
  }
  async call(path, method, body, extra = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return await this.send(path, { access_token: await this.accessToken(), ...extra }, method, body); }
      catch (error) { if (error.code !== 'WECHAT_TOKEN' || attempt) throw error; this.token = null; }
    }
  }
  async upload(bytes, cover) {
    const jpeg = bytes[0] === 0xff, mime = jpeg ? 'image/jpeg' : 'image/png';
    const form = new FormData(); form.append('media', new Blob([bytes], { type: mime }), `${cover ? 'cover' : 'image'}.${jpeg ? 'jpg' : 'png'}`);
    const result = await this.call(cover ? '/cgi-bin/material/add_material' : '/cgi-bin/media/uploadimg', 'POST', form, cover ? { type: 'image' } : {});
    if (typeof result[cover ? 'media_id' : 'url'] !== 'string') throw new ApiError('WECHAT_API', 502);
    return result[cover ? 'media_id' : 'url'];
  }
  async add(article) { const result = await this.call('/cgi-bin/draft/add', 'POST', { articles: [article] }); if (!result.media_id) throw new ApiError('WECHAT_API', 502); return result.media_id; }
  async update(mediaId, article) { await this.call('/cgi-bin/draft/update', 'POST', { media_id: mediaId, index: 0, articles: article }); return mediaId; }
  async get(mediaId) { return this.call('/cgi-bin/draft/get', 'POST', { media_id: mediaId }); }
}
module.exports = { WechatApi };
