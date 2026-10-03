/**
 * [INPUT]: 依赖 marked、highlight.js、MathJax、sharp 和插件提交的 Markdown/本地图片
 * [OUTPUT]: 对外提供 prepareArticle、previewHtml 与校验后的公众号渲染计划
 * [POS]: 公众号内容边界；保留原始笔记，输出内联排版和公式 PNG，不加载外部图片或执行原始 HTML
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const crypto = require('node:crypto');
const sharp = require('sharp');
const hljs = require('highlight.js');
const { mathjax } = require('@mathjax/src/js/mathjax.js');
const { TeX } = require('@mathjax/src/js/input/tex.js');
const { SVG } = require('@mathjax/src/js/output/svg.js');
const { liteAdaptor } = require('@mathjax/src/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('@mathjax/src/js/handlers/html.js');
require('@mathjax/src/js/input/tex/ams/AmsConfiguration.js');
require('@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js');
require('@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js');
const { ApiError } = require('./store.cjs');
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const math = mathjax.document('', { InputJax: new TeX({ packages: ['base', 'ams', 'newcommand', 'boldsymbol'], maxBuffer: 12000 }), OutputJax: new SVG({ fontCache: 'none', linebreaks: { inline: false } }) });
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const DEFAULT_STYLE = Object.freeze({ fontSize: 16, lineHeight: 1.8, paragraphGap: 18, headingSize: 22, color: '#262626', accent: '#4b5563', fontFamily: 'system-ui, sans-serif' });
function styleConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError('WECHAT_STYLE');
  const result = { ...DEFAULT_STYLE };
  for (const [key, min, max] of [['fontSize', 12, 24], ['lineHeight', 1.2, 2.5], ['paragraphGap', 0, 48], ['headingSize', 16, 36]]) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'number' || input[key] < min || input[key] > max) throw new ApiError('WECHAT_STYLE');
    result[key] = input[key];
  }
  for (const key of ['color', 'accent']) if (input[key] !== undefined) {
    if (!/^#[a-f\d]{6}$/i.test(input[key])) throw new ApiError('WECHAT_STYLE'); result[key] = input[key];
  }
  if (input.fontFamily !== undefined) {
    if (typeof input.fontFamily !== 'string' || !/^[\p{L}\p{N} ,"'-]{1,150}$/u.test(input.fontFamily)) throw new ApiError('WECHAT_STYLE'); result.fontFamily = input.fontFamily;
  }
  return result;
}
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\x00-\x08]/.test(value)) throw new ApiError('INVALID_INPUT');
  return value.trim();
}
async function normalizeImage(bytes) {
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1400, height: 4000, fit: 'inside', withoutEnlargement: true });
    let output = await image.clone().png().toBuffer();
    if (output.length > 2 * 1024 * 1024) output = await image.clone().flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    if (output.length > 2 * 1024 * 1024) output = await sharp(output).resize({ width: 1000, height: 2400, fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
    if (output.length > 2 * 1024 * 1024) throw new Error();
    const mime = output[0] === 0xff ? 'image/jpeg' : 'image/png'; return { bytes: output, mime, name: mime === 'image/jpeg' ? 'image.jpg' : 'image.png' };
  }
  catch { throw new ApiError('WECHAT_IMAGE'); }
}
async function prepareArticle(input) {
  if (!input || !Array.isArray(input.images) || input.images.length > 100) throw new ApiError('INVALID_INPUT');
  const articleId = text(input.articleId, 160, true), title = text(input.title, 64, true);
  const markdown = text(input.markdown, 200_000, true), author = text(input.author || '', 8), digest = text(input.digest || '', 120);
  const sourceUrl = text(input.sourceUrl || '', 2048), draftId = text(input.draftId || '', 256);
  if (sourceUrl) { let url; try { url = new URL(sourceUrl); } catch { throw new ApiError('INVALID_INPUT'); } if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new ApiError('INVALID_INPUT'); }
  const style = styleConfig(input.style), assets = new Map();
  let total = 0;
  for (const image of input.images) {
    if (!image || !/^[a-f\d]{64}$/.test(image.id) || typeof image.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64)) throw new ApiError('INVALID_INPUT');
    const bytes = Buffer.from(image.base64, 'base64'); total += bytes.length;
    if (!bytes.length || bytes.length > 10 * 1024 * 1024 || total > 24 * 1024 * 1024 || assets.has(image.id)) throw new ApiError('TOO_LARGE', 413);
    assets.set(image.id, { id: image.id, ...await normalizeImage(bytes) });
  }
  if (typeof input.cover !== 'string' || !assets.has(input.cover)) throw new ApiError('WECHAT_COVER');
  const { Marked } = await import('marked');
  const formulaInfo = [];
  const mathMarkup = (expression, display) => {
    if (!expression.trim() || expression.length > 8000 || formulaInfo.length >= 100 || /\\(?:href|url|html|style|class|require)\b/.test(expression)) throw new ApiError('WECHAT_MATH');
    const id = hash(JSON.stringify({ expression, display, style }));
    formulaInfo.push({ id, display, expression });
    const img = `<img src="bp-asset:${id}" alt="${escape(expression)}" style="max-width:100%;height:auto;vertical-align:middle;" />`;
    return display ? `<p style="text-align:center;margin:${style.paragraphGap}px 0;">${img}</p>` : img;
  };
  const markdownParser = new Marked({ gfm: true, breaks: false });
  markdownParser.use({ extensions: [
    { name: 'mathBlock', level: 'block', start: src => src.indexOf('$$'), tokenizer(src) { const match = src.match(/^\$\$\s*\n?([\s\S]+?)\n?\$\$(?:\n|$)/); if (match) return { type: 'mathBlock', raw: match[0], text: match[1] }; }, renderer: token => mathMarkup(token.text, true) },
    { name: 'mathInline', level: 'inline', start: src => src.indexOf('$'), tokenizer(src) { const match = src.match(/^\$(?!\$)([^\n$]+?)\$(?!\d)/); if (match) return { type: 'mathInline', raw: match[0], text: match[1] }; }, renderer: token => mathMarkup(token.text, false) }
  ], renderer: {
    html({ text }) { return escape(text); },
    image({ href, text: caption }) {
      const id = href.replace(/^bp-asset:/, '');
      if (!href.startsWith('bp-asset:') || !assets.has(id)) throw new ApiError('WECHAT_IMAGE');
      return `<img src="bp-asset:${id}" alt="${escape(caption)}" style="max-width:100%;height:auto;display:block;margin:16px auto;" />`;
    },
    link({ href, tokens }) { const valid = /^(https?:|mailto:)/i.test(href); return valid ? `<a href="${escape(href)}" style="color:${style.accent};text-decoration:underline;">${this.parser.parseInline(tokens)}</a>` : this.parser.parseInline(tokens); },
    heading({ depth, tokens }) { return `<h${depth} style="font-size:${Math.max(style.fontSize, style.headingSize - (depth - 1) * 2)}px;line-height:1.5;margin:28px 0 14px;font-weight:700;">${this.parser.parseInline(tokens)}</h${depth}>`; },
    paragraph({ tokens }) { return `<p style="margin:0 0 ${style.paragraphGap}px;line-height:${style.lineHeight};">${this.parser.parseInline(tokens)}</p>`; },
    blockquote({ tokens }) { return `<blockquote style="margin:18px 0;padding:10px 16px;border-left:3px solid ${style.accent};background:#f6f6f6;">${this.parser.parse(tokens)}</blockquote>`; },
    code({ text: code, lang }) {
      const language = (lang || '').split(/\s/)[0];
      let rendered = language && hljs.getLanguage(language) ? hljs.highlight(code, { language, ignoreIllegals: true }).value : escape(code);
      rendered = rendered.replace(/class="([^"]+)"/g, (_, classes) => `style="color:${/keyword|built_in/.test(classes) ? '#7c3aed' : /string|attr/.test(classes) ? '#047857' : /comment/.test(classes) ? '#6b7280' : '#262626'};"`);
      return `<pre style="padding:16px;margin:18px 0;background:#f4f4f5;border-radius:6px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;font-size:13px;"><code style="font-family:monospace;white-space:pre-wrap;">${rendered}</code></pre>`;
    },
    codespan({ text: code }) { return `<code style="font-family:monospace;background:#f4f4f5;padding:2px 4px;font-size:.9em;">${code}</code>`; },
    table(token) {
      const cell = (item, header = false) => `<${header ? 'th' : 'td'} style="border:1px solid #d4d4d8;padding:8px;text-align:${item.align || 'left'};overflow-wrap:anywhere;${header ? 'background:#f4f4f5;' : ''}">${this.parser.parseInline(item.tokens)}</${header ? 'th' : 'td'}>`;
      return `<table style="border-collapse:collapse;width:100%;table-layout:fixed;margin:18px 0;font-size:14px;"><thead><tr>${token.header.map(item => cell(item, true)).join('')}</tr></thead><tbody>${token.rows.map(row => `<tr>${row.map(item => cell(item)).join('')}</tr>`).join('')}</tbody></table>`;
    }
  } });
  let html = markdownParser.parse(markdown);
  for (const { id, expression, display } of formulaInfo) {
    try {
      const node = await math.convertPromise(expression, { display, em: style.fontSize, ex: style.fontSize / 2, containerWidth: 600 });
      const output = adaptor.outerHTML(node);
      if (/data-mjx-error|merror/.test(output)) throw new Error();
      let svg = output.match(/<svg[\s\S]*<\/svg>/)?.[0]; if (!svg) throw new Error();
      svg = svg.replace(/(width|height)="([\d.]+)ex"/g, (_, key, value) => `${key}="${Math.max(1, Number(value) * style.fontSize / 2)}px"`).replace(/currentColor/g, style.color);
      const width = Number(svg.match(/width="([\d.]+)px"/)?.[1] || 16);
      const bytes = await sharp(Buffer.from(svg), { density: 192, limitInputPixels: 40_000_000 }).png().toBuffer();
      assets.set(id, { id, bytes, name: 'formula.png', mime: 'image/png' });
      html = html.replaceAll(`src="bp-asset:${id}"`, `src="bp-asset:${id}" width="${Math.ceil(width)}"`);
    } catch { throw new ApiError('WECHAT_MATH'); }
  }
  html = `<section style="font-family:${escape(style.fontFamily)};font-size:${style.fontSize}px;line-height:${style.lineHeight};color:${style.color};text-align:left;">${html}</section>`;
  if (Buffer.byteLength(html) > 512 * 1024) throw new ApiError('TOO_LARGE', 413);
  const serialized = [...assets.values()].map(({ bytes, ...rest }) => ({ ...rest, base64: bytes.toString('base64') }));
  const data = { articleId, title, author, digest, sourceUrl, draftId, cover: input.cover, html, assets: serialized };
  return { ...data, hash: hash(JSON.stringify(data)), formulas: formulaInfo.length, styleIsDefault: Object.keys(input.style || {}).length === 0 };
}
function previewHtml(plan) {
  return plan.html.replace(/bp-asset:([a-f\d]{64})/g, (_, id) => {
    const asset = plan.assets.find(item => item.id === id); if (!asset) throw new ApiError('WECHAT_IMAGE');
    return `data:${asset.mime || 'image/png'};base64,${asset.base64}`;
  });
}
module.exports = { prepareArticle, previewHtml, styleConfig };
