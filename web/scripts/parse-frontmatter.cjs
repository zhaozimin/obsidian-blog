/**
 * [INPUT]: 依赖 gray-matter 的 YAML 安全解析与原始 Markdown 文本
 * [OUTPUT]: 对外提供 parseFrontmatter，只接受 YAML 映射，拒绝语言引擎标记
 * [POS]: 内容和栏目读取的解析入口；上传笔记属于数据，不能触发 gray-matter 内置 JavaScript eval
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const matter = require('gray-matter');
const reject = () => { throw new Error('只允许标准 YAML frontmatter，禁止可执行语言引擎'); };
function parseFrontmatter(raw) {
  const source = raw.replace(/^\uFEFF/, '');
  const opening = source.match(/^---(?!-)([^\r\n]*)/);
  if (opening && opening[1].trim()) reject();
  const record = matter(source, { engines: { javascript: { parse: reject }, json: { parse: reject } } });
  if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data) || ![Object.prototype, null].includes(Object.getPrototypeOf(record.data))) throw new Error('frontmatter 必须为 YAML 字段映射');
  return record;
}
module.exports = { parseFrontmatter };
