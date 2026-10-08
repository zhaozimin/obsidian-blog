/**
 * [INPUT]: 无依赖
 * [OUTPUT]: 对外提供 THEMES（素/墨/白衬衫）、getTheme(id)、BLOG_KEYS
 * [POS]: shared/typeset 的公众号风格表（风格真源）；前 7 键与服务端公众号 styleConfig 同名
 *
 * 带色相的浅底（卡片、标记、代码）一律用"半透明色相"而非实色：公众号深色算法（mp-darkmode）只把感知亮度 ≥250
 * 或中性灰的浅底转暗，#faf6f3 这类带色近白会被压到亮度 190，变成深色模式里的一块亮灰。半透明色相叠在白底上
 * 与原实色逐像素相同（rgba(172,105,55,.06) ≡ #faf6f3），深色下随底变暗、文字自动转亮。2026-10 实测。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
'use strict';

const FONT = '-apple-system, BlinkMacSystemFont, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif';

// Blog Publisher server/wechat-render.cjs 的 styleConfig 只认这 7 个键——风格定一次，两边共用
const BLOG_KEYS = ['fontSize', 'lineHeight', 'paragraphGap', 'headingSize', 'color', 'accent', 'fontFamily'];

const THEMES = [
  {
    id: 'su', name: '素',
    desc: '黑白灰，只靠字号、粗细、留白分层级。最不抢戏，文字本身就是主角。',
    fontSize: 16, lineHeight: 1.85, paragraphGap: 22, headingSize: 20, color: '#333333', accent: '#1a1a1a', fontFamily: FONT,
    letterSpacing: 0.5, textAlign: 'justify', strongColor: '#1a1a1a', muted: '#999999',
    quoteBg: '#f6f6f6', quoteText: '#595959', quoteBorder: '#e3e3e3', markBg: '#efefef', codeBg: '#f5f5f5',
    linkColor: '#333333', listMarker: '#999999', h1Bg: '#1a1a1a',
    variants: { h1: 'rule', h2: 'plain', h3: 'plain', strong: 'bold', quote: 'card' },
  },
  {
    id: 'mo', name: '墨',
    desc: '小一号字、宽行距、松字距，墨蓝做唯一强调色。读起来像杂志专栏。',
    fontSize: 15, lineHeight: 2.0, paragraphGap: 20, headingSize: 18, color: '#3f3f3f', accent: '#2b4a6f', fontFamily: FONT,
    letterSpacing: 1, textAlign: 'justify', strongColor: '#222222', muted: '#a0a0a0',
    quoteBg: 'rgba(43,74,111,0.06)', quoteText: '#5b6573', quoteBorder: '#c9d3e0', markBg: 'rgba(43,74,111,0.12)', codeBg: 'rgba(43,74,111,0.06)',
    linkColor: '#2b4a6f', listMarker: '#2b4a6f', h1Bg: '#2b4a6f',
    variants: { h1: 'accent', h2: 'bar', h3: 'accent', strong: 'accent', quote: 'line' },
  },
  {
    id: 'chenshan', name: '白衬衫',
    desc: '取自子民的形象：白底黑字，一级标题是一条黑领带，橙红色做批注式重点。',
    fontSize: 16, lineHeight: 1.8, paragraphGap: 20, headingSize: 19, color: '#2f2f2f', accent: '#e8590c', fontFamily: FONT,
    letterSpacing: 0.5, textAlign: 'justify', strongColor: '#111111', muted: '#9a9a9a',
    quoteBg: 'rgba(172,105,55,0.06)', quoteText: '#5c5c5c', quoteBorder: '#eadfd8', markBg: 'rgba(255,116,22,0.18)', codeBg: 'rgba(127,98,70,0.07)',
    linkColor: '#e8590c', listMarker: '#e8590c', h1Bg: '#111111',
    variants: { h1: 'band', h2: 'underline', h3: 'leftline', strong: 'marker', quote: 'card' },
  },
];

const getTheme = id => THEMES.find(t => t.id === id) || THEMES[0];

module.exports = { THEMES, getTheme, BLOG_KEYS };
