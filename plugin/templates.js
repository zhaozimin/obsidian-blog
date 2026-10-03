/**
 * [INPUT]: 依赖五栏目目录约定、collector 的初始化栏目定义
 * [OUTPUT]: 对外提供 templates 空初始化清单和 articleTemplate 分类写作模板
 * [POS]: 插件的新笔记起点；初始化不生成文章，新建按栏目提供完整空字段和稳定身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { COLLECTIONS } = require('./collector');
const IDS = { config: 'home', article: 'long-reads', book: 'books', product: 'products', about: 'about' };
function templates() {
  return [
    ...Object.entries(COLLECTIONS).map(([kind, folder]) => ({ path: `${folder}/_栏目.md`, content: `---\nid: ${IDS[kind]}\nkind: ${kind}\nenglish: ""\npromise: ""\ndescription: ""\ntopics: []\nimage: ""\nvisualLabel: ""\nart: {}\n---\n\n栏目名称取自所在文件夹，id 保持不变。\n` })),
    { path: '1.首页/home.md', content: '---\nid: home\nheroTitle: ""\nheroSubtitle: ""\nheroImage: ""\nheroPortrait: ""\nseoTitle: ""\nseoDescription: ""\neyebrow: ""\nrecentEnglish: ""\nrecentTitle: ""\nrecentDescription: ""\nsocialLinks: {}\n---\n' },
    { path: '1.首页/站点设置.md', content: '---\nid: site\nname: ""\nauthor: ""\ntagline: ""\nfooterText: ""\nrssTitle: ""\nrssDescription: ""\nregistration: []\naboutReadLabel: ""\njourneyEnglish: ""\njourneyTitle: ""\njourneyDescription: ""\n---\n' }
  ];
}
function articleTemplate(kind, title) {
  const base = { id: crypto.randomUUID(), title, date: new Date().toISOString().slice(0, 10) };
  if (kind !== 'about') Object.assign(base, { subtitle: '', description: '', image: '', password: '', tags: [] });
  if (kind === 'article') Object.assign(base, { link: '' });
  if (kind === 'book') Object.assign(base, { author: '', publisher: '', isbn: '', rating: '', doubanUrl: '', readDate: '' });
  if (kind === 'product') Object.assign(base, { price: '', link: '', videoUrl: '' });
  return `---\n${Object.entries(base).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n`;
}
module.exports = { templates, articleTemplate };
