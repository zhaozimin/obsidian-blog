/**
 * [INPUT]: 依赖 shared/typeset 的 renderWechat/renderX/diagnose/stats/getTheme
 * [OUTPUT]: 对外提供 composePreview(source, device, settings, resolve)、composeCopy(source, platform, settings, resolve)、toPlain(html)
 * [POS]: plugin/typeset 视图与 shared/typeset 内核之间的唯一编排点；预览与复制走同一个渲染器、同一套参数，只差 mode——所见即所粘
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
'use strict';
const { renderWechat, renderX } = require('../../shared/typeset/render.cjs');
const { diagnose, stats } = require('../../shared/typeset/diagnose.cjs');
const { getTheme } = require('../../shared/typeset/themes.cjs');

const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function render(source, platform, settings, resolve, mode) {
  const opts = { mode, annotate: mode === 'preview', resolveImage: resolve };
  return platform === 'wechat' ? renderWechat(source.text, getTheme(settings.theme), opts) : renderX(source.text, opts);
}

/** 预览：HTML + 设备页头 + 结构体检 + 待办。 */
function composePreview(source, device, settings, resolve) {
  const r = render(source, device.platform, settings, resolve, 'preview');
  const today = new Date();
  const date = (today.getMonth() + 1) + '月' + today.getDate() + '日';
  const meta = device.platform === 'wechat'
    ? esc(settings.account || settings.author || '公众号名称') + '<i>' + date + '</i>'
    : esc(settings.author || '作者') + ' <span style="opacity:.8">' + esc(settings.xHandle ? '@' + settings.xHandle.replace(/^@/, '') : '') + '</span>';
  return { html: r.html, todos: r.todos, images: r.images, title: source.title, meta, issues: diagnose(source.text), stats: stats(source.text) };
}

/** 复制件：干净的平台 HTML（无 data-line、本地图片留占位）。 */
function composeCopy(source, platform, settings, resolve) {
  return render(source, platform, settings, resolve, 'copy');
}

function toPlain(html) {
  const text = html.replace(/<br\s*\/?>/g, '\n').replace(/<\/(p|h\d|li|section|blockquote|pre)>/g, '\n').replace(/<[^>]+>/g, '');
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { composePreview, composeCopy, toPlain };
