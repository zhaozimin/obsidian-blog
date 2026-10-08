/**
 * [INPUT]: 依赖 Obsidian 属性类型配置的普通 JSON 对象
 * [OUTPUT]: 对外提供 pinnedPropertyTypes，在保留其他配置的前提下注册置顶复选框
 * [POS]: 插件初始化与 Node 模板安装共用的属性类型契约；不依赖 Obsidian 运行时或笔记内容
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
function pinnedPropertyTypes(config = {}) {
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!record(config) || (config.types != null && !record(config.types))) throw new Error('属性类型配置格式无效，请检查 types.json。');
  return { ...config, types: { ...config.types, pinned: 'checkbox' } };
}
module.exports = { pinnedPropertyTypes };
