/**
 * [INPUT]: 依赖原始 Markdown 文本
 * [OUTPUT]: 对外提供 splitCode，区分正文和围栏/行内代码且保持原字节顺序
 * [POS]: 插件与网站构建共用的引用扫描边界，代码示例中的图片语法不作为上传附件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
function splitCode(source) {
  const blocks = []; let prose = '', code = '', marker = '', length = 0;
  const flush = () => { if (prose) blocks.push({ code: false, text: prose }); prose = ''; };
  for (const line of source.match(/[^\n]*(?:\n|$)/g).filter(Boolean)) {
    if (marker) {
      code += line;
      if (new RegExp(`^ {0,3}${marker}{${length},}\\s*$`).test(line.trimEnd())) { blocks.push({ code: true, text: code }); code = ''; marker = ''; }
      continue;
    }
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) { flush(); marker = fence[1][0]; length = fence[1].length; code = line; }
    else prose += line;
  }
  flush(); if (code) blocks.push({ code: true, text: code });
  return blocks.flatMap(block => {
    if (block.code) return [block];
    const result = []; let start = 0;
    for (const match of block.text.matchAll(/(`+)[\s\S]*?\1(?!`)/g)) {
      if (match.index > start) result.push({ code: false, text: block.text.slice(start, match.index) });
      result.push({ code: true, text: match[0] }); start = match.index + match[0].length;
    }
    if (start < block.text.length) result.push({ code: false, text: block.text.slice(start) }); return result;
  });
}
module.exports = { splitCode };
