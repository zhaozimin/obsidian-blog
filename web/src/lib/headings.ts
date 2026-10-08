/**
 * [INPUT]: 依赖正文的 ATX 标题与围栏代码行
 * [OUTPUT]: 对外提供 readHeading、createHeadingIds、readFence 与 closesFence
 * [POS]: 正文和目录共享标题身份及代码边界，重复标题有唯一锚点，代码示例不进入目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export function readHeading(line: string) {
  const match = line.match(/^(#{1,3})\s+(.+?)\s*$/);
  return match ? { level: match[1].length, text: match[2].replace(/\s+#+\s*$/, '') } : null;
}
export function createHeadingIds() {
  const used = new Set<string>();
  return (text: string) => {
    const base = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-') || 'heading';
    let id = base, suffix = 1;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id); return id;
  };
}
export function readFence(line: string) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return { marker: match[1][0], length: match[1].length, language: match[2].trim() };
}
export function closesFence(line: string, fence: NonNullable<ReturnType<typeof readFence>>) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
  return !!match && match[1][0] === fence.marker && match[1].length >= fence.length;
}
