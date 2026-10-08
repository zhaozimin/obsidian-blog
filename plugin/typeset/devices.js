/**
 * [INPUT]: 无依赖
 * [OUTPUT]: 对外提供 DEVICES（四种设备的尺寸与平台）、shellCss(device, dark)、OVERLAY_CSS
 * [POS]: plugin/typeset 的设备外壳规格表；公众号数值来自 2026-10 实测 mp.weixin.qq.com 文章页，X 为近似值待校准
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 *
 * 公众号实测（375 宽手机 / 1024 宽电脑）：
 *   页面左右内边距 20px → 手机正文宽 335px；电脑正文最大宽 677px 居中
 *   #js_content 基础：17px / 行高 1.6 / 字距 0.544px / 两端对齐 / rgba(0,0,0,.9)
 *   标题 22px / 字重 500 / 行高 1.4 / 下边距 14px；公众号名 15px #576b95
 *   深色模式由 mp-darkmode 算法在 iframe 内实时转换（与线上同一套算法）
 */
'use strict';

const WX_FONT = '"PingFang SC", system-ui, -apple-system, "Helvetica Neue", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", Arial, sans-serif';
const X_FONT = '"TwitterChirp", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "PingFang SC", sans-serif';

const DEVICES = [
  { id: 'wx-phone', name: '公众号 · 手机', short: '公众号手机', platform: 'wechat', width: 375, screen: 690 },
  { id: 'wx-pc', name: '公众号 · 电脑', short: '公众号电脑', platform: 'wechat', width: 717, screen: 760 },
  { id: 'x-phone', name: 'X · 手机', short: 'X 手机', platform: 'x', width: 375, screen: 700, approx: true },
  { id: 'x-web', name: 'X · 网页', short: 'X 网页', platform: 'x', width: 600, screen: 820, approx: true },
];

function wechatCss(dark) {
  return `
html,body{margin:0;background:${dark ? '#191919' : '#ffffff'};-webkit-text-size-adjust:100%;}
.area{padding:20px 20px 72px;max-width:677px;margin:0 auto;}
.title{font:500 22px/1.4 ${WX_FONT};color:${dark ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.9)'};margin:0 0 14px;letter-spacing:.5px;}
.meta{font:15px/1.4 ${WX_FONT};color:${dark ? 'rgb(125,144,169)' : '#576b95'};margin:0 0 22px;}
.meta i{font-style:normal;color:${dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.3)'};margin-left:10px;}
#js_content{font-family:${WX_FONT};font-size:17px;line-height:1.6;letter-spacing:.544px;color:${dark ? '#a3a3a3' : 'rgba(0,0,0,.9)'};text-align:justify;overflow-wrap:break-word;}
#js_content *{max-width:100%!important;box-sizing:border-box!important;overflow-wrap:break-word!important;}
#js_content p{clear:both;min-height:1em;}
#js_content img{height:auto!important;}`;
}

function xCss(dark) {
  const c = dark
    ? { bg: '#000000', fg: '#e7e9ea', sub: '#71767b', line: '#2f3336', link: '#1d9bf0' }
    : { bg: '#ffffff', fg: '#0f1419', sub: '#536471', line: '#cfd9de', link: '#1d9bf0' };
  return `
html,body{margin:0;background:${c.bg};}
.area{padding:16px 16px 72px;font-family:${X_FONT};color:${c.fg};}
.title{font-weight:800;font-size:28px;line-height:1.2;margin:4px 0 12px;letter-spacing:-.2px;}
.meta{font-size:15px;color:${c.sub};margin:0 0 20px;padding-bottom:16px;border-bottom:1px solid ${c.line};}
#js_content{font-size:17px;line-height:1.6;overflow-wrap:break-word;}
#js_content h1{font-size:24px;line-height:1.3;font-weight:800;margin:28px 0 10px;}
#js_content h2{font-size:20px;line-height:1.35;font-weight:700;margin:24px 0 8px;}
#js_content p{margin:0 0 16px;}
#js_content blockquote{margin:0 0 16px;padding:0 0 0 14px;border-left:2px solid ${c.line};color:${c.sub};}
#js_content ul,#js_content ol{margin:0 0 16px;padding-left:24px;}
#js_content li{margin:0 0 6px;}
#js_content a{color:${c.link};text-decoration:none;}
#js_content img{max-width:100%;height:auto;border-radius:16px;display:block;border:1px solid ${c.line};}`;
}

// 预览专用叠层：体检标记、可点击回跳、本地图片提示。只存在于设备 iframe，不进复制件
const OVERLAY_CSS = `
[data-line]{cursor:pointer;}
[data-pb-issue]{outline:2px dashed rgba(232,89,12,.7)!important;outline-offset:4px;position:relative;}
[data-pb-issue]::after{content:attr(data-pb-issue);position:absolute;right:-6px;top:-12px;z-index:9;max-width:78%;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;font:600 11px/18px -apple-system,"PingFang SC",sans-serif;letter-spacing:0;
  color:#fff;background:#e8590c;border-radius:9px;padding:0 8px;text-align:left;text-indent:0;}
[data-pb-local]{position:relative;}
[data-pb-local]::before{content:"本地图片 · 复制后需手动上传";position:absolute;left:8px;top:8px;z-index:9;font:600 11px/18px -apple-system,"PingFang SC",sans-serif;
  color:#fff;background:rgba(0,0,0,.6);border-radius:9px;padding:0 8px;letter-spacing:0;}
.pb-flash{animation:pbflash 1.2s ease-out;}
@keyframes pbflash{0%{background:rgba(255,214,102,.65);}100%{background:transparent;}}`;

function shellCss(device, dark) {
  return (device.platform === 'wechat' ? wechatCss(dark) : xCss(dark)) + OVERLAY_CSS;
}

module.exports = { DEVICES, shellCss, OVERLAY_CSS };
