/**
 * [INPUT]: 依赖原始 Markdown 文本
 * [OUTPUT]: 对外提供 splitCode（隔离围栏、缩进与精确分隔符行内代码，保持原字节顺序）与 stripComments（剥离 %%注释%%）
 * [POS]: 插件与网站构建共用的引用扫描边界，代码示例中的图片语法不作为上传附件，作者注释不进入任何发布出口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
function splitInline(source) {
  const runs = [...source.matchAll(/`+/g)], next = new Map(), closing = [];
  for (let i = runs.length - 1; i >= 0; i--) {
    closing[i] = next.get(runs[i][0].length); next.set(runs[i][0].length, i);
  }
  const parts = []; let start = 0;
  for (let i = 0; i < runs.length; i++) {
    const opening = runs[i]; let slash = opening.index - 1;
    while (slash >= 0 && source[slash] === '\\') slash--;
    if ((opening.index - slash - 1) % 2 || closing[i] === undefined) continue;
    const endRun = runs[closing[i]], end = endRun.index + endRun[0].length;
    if (opening.index > start) parts.push({ code: false, text: source.slice(start, opening.index) });
    parts.push({ code: true, text: source.slice(opening.index, end) }); start = end; i = closing[i];
  }
  if (start < source.length) parts.push({ code: false, text: source.slice(start) }); return parts;
}
function splitCode(source) {
  const blocks = []; let prose = '', code = '', marker = '', length = 0, indent = 3, indented = false, paragraph = false;
  const flush = () => { if (prose) blocks.push({ code: false, text: prose }); prose = ''; };
  for (const line of source.match(/[^\n]*(?:\n|$)/g).filter(Boolean)) {
    const unquoted = line.replace(/^(?: {0,3}>[ \t]?)+/, '');
    if (marker) {
      code += line;
      if (new RegExp(`^ {0,${indent}}${marker}{${length},}\\s*$`).test(unquoted.trimEnd())) { blocks.push({ code: true, text: code }); code = ''; marker = ''; paragraph = false; }
      continue;
    }
    if (indented) {
      if (!line.trim() || /^(?: {4}|\t)/.test(unquoted)) { code += line; continue; }
      blocks.push({ code: true, text: code }); code = ''; indented = false; paragraph = false;
    }
    const list = unquoted.match(/^( {0,3}(?:[-+*]|\d+[.)])[ \t]+)(.*)/);
    const candidate = list ? list[2] : unquoted;
    const fence = candidate.match(/^ {0,3}(`{3,}|~{3,})(.*)/);
    if (fence && (fence[1][0] !== '`' || !fence[2].includes('`'))) {
      flush(); marker = fence[1][0]; length = fence[1].length; indent = 3 + (list?.[1].length || 0); code = line;
    } else if (!paragraph && /^(?: {4}|\t)/.test(unquoted)) { flush(); indented = true; code = line; }
    else { prose += line; paragraph = Boolean(line.trim()) && !/^ {0,3}#{1,6}(?:\s|$)/.test(unquoted); }
  }
  flush(); if (code) blocks.push({ code: true, text: code });
  return blocks.flatMap(block => {
    if (block.code) return [block];
    // ===== 空行结束段落，行内代码不能跨越 Markdown 块边界 =====
    return block.text.split(/(\r?\n[ \t]*\r?\n)/).flatMap(splitInline);
  });
}
/**
 * %%注释%% 是作者写给自己的话（模板里的填写说明就住在这里），博客与公众号都不该出现。
 * 注释可以跨段落，所以状态跨片段延续；代码里的 %% 是代码内容，不开合注释。
 * 未闭合的 %% 与 Obsidian 阅读视图一致：注释到全文末尾。
 */
function stripComments(source) {
  let open = false, out = '';
  for (const part of splitCode(source)) {
    if (part.code) { if (!open) out += part.text; continue; }
    let index = 0;
    for (let next = part.text.indexOf('%%'); next >= 0; next = part.text.indexOf('%%', index)) {
      if (!open) out += part.text.slice(index, next);
      open = !open; index = next + 2;
    }
    if (!open) out += part.text.slice(index);
  }
  return out;
}
module.exports = { splitCode, stripComments };
