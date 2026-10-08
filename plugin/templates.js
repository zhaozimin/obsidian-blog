/**
 * [INPUT]: 依赖五栏目目录约定、collector 与 shared/property-types 的复选框配置
 * [OUTPUT]: 对外提供 templates（初始化栏目）、TEMPLATE_FILES、builtinTemplate、templateFiles、renderTemplate、loadTemplate、
 *           articleTemplate、today 与 ensurePinnedProperty
 * [POS]: 插件的新笔记起点。四类写作模板以笔记库「模板」文件夹为准（作者可以改），缺失时退回内置模板；
 *        每个字段该填什么写在 %%注释%% 里，编辑时看得见，任何发布出口都会剥离；
 *        新建只替作者填 id、title、date 三个键，不执行脚本，已有文章保持原稿
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { COLLECTIONS } = require('./collector');
const { pinnedPropertyTypes } = require('../shared/property-types.cjs');
const IDS = { config: 'home', article: 'long-reads', book: 'books', product: 'products', about: 'about' };
function templates() {
  return [
    ...Object.entries(COLLECTIONS).map(([kind, folder]) => ({ path: `${folder}/_栏目.md`, content: `---\nid: ${IDS[kind]}\nkind: ${kind}\nenglish: ""\npromise: ""\ndescription: ""\ntopics: []\nimage: ""\nvisualLabel: ""\nart: {}\n---\n\n栏目名称取自所在文件夹，id 保持不变。\n` })),
    { path: '1.首页/home.md', content: '---\nid: home\nheroTitle: ""\nheroSubtitle: ""\nheroImage: ""\nheroPortrait: ""\nseoTitle: ""\nseoDescription: ""\neyebrow: ""\nrecentEnglish: ""\nrecentTitle: ""\nrecentDescription: ""\nsocialLinks: {}\n---\n' },
    { path: '1.首页/站点设置.md', content: '---\nid: site\nname: ""\nauthor: ""\ntagline: ""\nfooterText: ""\nrssTitle: ""\nrssDescription: ""\nregistration: []\naboutReadLabel: ""\njourneyEnglish: ""\njourneyTitle: ""\njourneyDescription: ""\n---\n' }
  ];
}

// ============================================================
//  内置写作模板：字段与填写说明
// ============================================================

/** 栏目类型 → 笔记库「模板」文件夹里的文件名 */
const TEMPLATE_FILES = Object.freeze({ article: '长文模板.md', book: '书籍模板.md', product: '产品模板.md', about: '故事模板.md' });

const POST_FIELDS = ['subtitle: ""', 'description: ""', 'image: ""', 'date: ""', 'pinned: false', 'tags: []', 'password: ""'];
const POST_GUIDE = [
  '- id、title、date：新建时自动填好。id 是这篇的身份证，改名、挪文件夹都不变，不要改它；date 格式 2026-10-04，网站按它排先后，可以改。',
  '- subtitle 副标题：一句话，显示在列表卡片和文章页标题下面。例：写给刚开始用 Obsidian 的人',
  '- description 简介：一两句话说清讲什么，显示在列表、搜索结果和分享摘要里。例：从零搭一个能长期用的知识库，只用三个文件夹。',
  '- image 封面：库里的图片，写成 "[[封面.webp]]"；置顶时显示成右侧 16:9 的封面。',
  '- pinned 置顶：勾上后，这个栏目里日期最新的四篇置顶排在最前，并显示右侧封面。',
  '- tags 标签：文字列表，例：["AI", "写作"]；网站暂不显示，可以留空。',
  '- password 密码：留空就是公开；填了以后读者输入密码才能看正文，标题、简介和封面仍然公开。',
  '- 分类：笔记所在的子文件夹就是分类，这里不用填。'
];
const BUILTIN = {
  article: { fields: POST_FIELDS, guide: POST_GUIDE },
  book: {
    fields: [...POST_FIELDS, 'author: ""', 'publisher: ""', 'isbn: ""', 'rating: ""', 'readDate: ""', 'doubanUrl: ""'],
    guide: [...POST_GUIDE,
      '- author 作者、publisher 出版社：显示在文章页。例：彼得·德鲁克 / 机械工业出版社',
      '- rating 评分：0–10 的数字，例：8，显示成「8 / 10 分」。',
      '- readDate 读完日期（格式 2026-10-04）、isbn 书号：网站暂不显示，可以留空。',
      '- doubanUrl 豆瓣链接：填了文章页会出现「豆瓣」按钮。例：https://book.douban.com/subject/1234567/']
  },
  product: {
    fields: [...POST_FIELDS, 'price: ""', 'link: ""', 'videoUrl: ""'],
    guide: [...POST_GUIDE,
      '- price 价格：例：¥99 或 免费；留空时显示「产品与服务」。',
      '- link 链接：购买或了解详情的网址，填了产品页会出现按钮。',
      '- videoUrl 视频：介绍视频的网址，填了文章页会出现视频按钮。']
  },
  about: {
    fields: ['date: ""'],
    guide: ['- id、title、date：新建时自动填好。date 是这段经历的日期，网站按它排先后，可以改。', '- 正文写这一段经历；图片直接拖进来。']
  }
};

/** 内置模板：属性区留空，id/title/date 新建时填；说明住在注释里，读者永远看不见 */
function builtinTemplate(kind) {
  const { fields, guide } = BUILTIN[kind];
  return ['---', 'id: ""', 'title: ""', ...fields, '---', '',
    '%%', '填写说明：这段只在编辑时看得见，阅读视图和发布出去的博客、公众号都不会出现，用不着可以删。', ...guide, '%%', '', ''].join('\n');
}

/** 发行模板与笔记库安装共用：四类模板在「模板」文件夹里的路径与内容 */
function templateFiles(folder = '模板') {
  return Object.entries(TEMPLATE_FILES).map(([kind, name]) => ({ kind, path: `${folder}/${name}`, content: builtinTemplate(kind) }));
}

// ============================================================
//  渲染：只填三个键，不执行脚本
// ============================================================

/** 本地日期。toISOString 是 UTC，东八区凌晨新建会差一天 */
function today(now = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * 把模板变成一篇新笔记：属性区的 id、title、date 由插件按 YAML 规矩写入（标题里有引号也不坏），
 * 缺这几个键就补在最前；正文里可以用 {{title}}、{{date}}、{{id}} 引用同样的值。
 */
function renderTemplate(source, values) {
  const header = String(source).match(/^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const lines = header ? header[1].split(/\r?\n/) : [];
  const missing = [];
  for (const key of ['id', 'title', 'date']) {
    const line = `${key}: ${JSON.stringify(String(values[key]))}`;
    const index = lines.findIndex(item => new RegExp(`^${key}[ \\t]*:`).test(item));
    if (index >= 0) lines[index] = line; else missing.push(line);
  }
  const body = (header ? String(source).slice(header[0].length) : String(source)).replace(/\{\{(id|title|date)\}\}/g, (_, key) => String(values[key]));
  return `---\n${[...missing, ...lines].join('\n')}\n---\n${header ? '' : '\n'}${body}`;
}

/** 笔记库里的模板优先，作者改过的版本就是标准；文件不在时用内置模板，新建永远不会失败 */
async function loadTemplate(app, settings, kind) {
  const folder = String(settings.templateFolder || '').trim().replace(/\/+$/, '');
  const file = folder ? app.vault.getAbstractFileByPath(`${folder}/${TEMPLATE_FILES[kind]}`) : null;
  return file?.extension === 'md' ? app.vault.read(file) : builtinTemplate(kind);
}

function articleTemplate(kind, title) {
  return renderTemplate(builtinTemplate(kind), { id: crypto.randomUUID(), title, date: today() });
}

async function ensurePinnedProperty(app) {
  const adapter = app.vault.adapter;
  const file = `${app.vault.configDir || '.obsidian'}/types.json`;
  const current = await adapter.exists(file) ? JSON.parse(await adapter.read(file)) : {};
  const updated = pinnedPropertyTypes(current);
  if (JSON.stringify(current) !== JSON.stringify(updated)) await adapter.write(file, `${JSON.stringify(updated, null, 2)}\n`);
}
module.exports = { templates, TEMPLATE_FILES, builtinTemplate, templateFiles, renderTemplate, loadTemplate, articleTemplate, today, ensurePinnedProperty };
