/**
 * [INPUT]: 依赖空栏目模板、四类写作模板、复选框属性契约、三文件插件发行包与包含 X 帖子写法的安全使用说明
 * [OUTPUT]: 对外提供可独立打开的 vault-template 空白笔记库与完整写作教程
 * [POS]: 发行模板生成边界；仅创建空配置、写作模板和说明，X 嵌入只记录 Markdown 契约；不包含测试文章、图片或本机 data.json
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const { templates, templateFiles } = require('../plugin/templates');
const { pinnedPropertyTypes } = require('../shared/property-types.cjs');
const root = path.resolve(__dirname, '..'), vault = path.join(root, 'vault-template');
function write(relative, content) { const file = path.join(vault, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
fs.mkdirSync(path.join(vault, 'blog-V3/6.附件'), { recursive: true });
write('blog-V3/6.附件/.gitkeep', '');
for (const entry of templates()) write(`blog-V3/${entry.path}`, entry.content);
for (const entry of templateFiles('模板')) write(entry.path, entry.content);
write('发布配置/公众号排版.json', '{}\n');
const button = (label, collection) => `\`\`\`blog-button\n文字: ${label}\n栏目: ${collection}\n\`\`\`\n`;
write('控制台/发布控制台.md', `# 发布控制台\n\n${button('写长文', 'long-reads')}\n${button('写读书笔记', 'books')}\n${button('添加产品', 'products')}\n${button('记一段经历', 'about')}\n\`\`\`blog-actions\n\`\`\`\n\n公众号操作前，请先打开要上传的文章。\n\n- [[使用说明/开始使用|开始使用]]\n- [[使用说明/微信公众号|微信公众号]]\n- [[使用说明/内容填写|内容填写]]\n- [[控制台/文章列表.base|文章列表]]\n`);
write('控制台/文章列表.base', 'filters:\n  and:\n    - file.inFolder("blog-V3")\n    - file.ext == "md"\n    - file.name != "_栏目"\n    - file.name != "home"\n    - file.name != "站点设置"\n    - file.name != "CLAUDE"\nviews:\n  - type: table\n    name: 文章\n    order:\n      - file.name\n      - title\n      - pinned\n      - date\n      - file.folder\n');
write('使用说明/开始使用.md', '# 开始使用\n\n这是空白模板，没有示例文章或个人照片。只需要 Blog Publisher 一个社区插件。\n\n1. 部署仓库中的服务端与网站，或按仓库 README 在本机启动。\n2. 启用 Blog Publisher，在设置中填写发布地址和访问密钥。\n3. 打开发布控制台，点击栏目按钮，输入标题、选分类，笔记会套上「模板」文件夹里的模板。\n4. 模板顶部的 %% 填写说明 %% 只在编辑时可见，发布时自动去掉；模板可以直接改。\n5. 图片直接拖进或粘贴进笔记：先转成 WebP，再请你起名字，存进 blog-V3/6.附件；从文件列表或访达放进笔记库的图片也会补问名字。\n6. 写完切到别的笔记时，插件会自动整理格式：中英文之间一个空格，段与段之间一个空行。\n7. 填写首页、站点设置和栏目配置，点击“上传博客”，检查变更后确认。\n8. 公众号：打开文章，运行“预览并上传当前文章到公众号草稿箱”。\n\n本机连接配置与上传历史由插件私有保存，不要将插件 data.json 分享给其他人。\n');
write('使用说明/部署选择.md', '# 部署选择\n\n完整源码与教程：https://github.com/zhaozimin/obsidian-blog\n\n- 有服务器：让 AI 按仓库 docs/DEPLOY-SERVER.md 通过自己的 SSH 部署；插件连接自己的 HTTPS 网站。\n- 没有服务器：让 AI 按 docs/DEPLOY-CLOUDFLARE.md 在电脑运行本机服务并上传 Cloudflare；插件连接 http://127.0.0.1:3002。已上传网站不依赖电脑保持开机，下一次上传需启动本机服务。\n\n可直接复制 README 中的 AI 部署提示词。全公开文章不要求 R2，密码文章使用私有 R2；公众号账号可稍后接入，排版目前为空。\n');
write('使用说明/内容填写.md', '# 内容填写\n\n- blog-V3/1.首页/站点设置.md：网站名称、作者、页脚、RSS 与备案。\n- blog-V3/1.首页/home.md：首页标题、介绍、头像、背景与社交入口。\n- 每个栏目下的 _栏目.md：稳定 id、展示类型、介绍与图片。栏目显示名称取文件夹名称，改名时保留 id/kind。\n- 文章属性：id 为稳定身份，title 是标题，date 是日期，description 是简介，image 是本地封面，例如 "[[封面.png]]"。\n- pinned 是置顶复选框，默认未勾选；勾选并发布后，每个栏目最多展示发布日期最新的四篇置顶内容，封面可以悬停放大、点击阅读。\n- 分类取文章所在子目录。正文使用 Markdown，图片用 ![[图片.png]] 或标准 Markdown 引用。\n- X 帖子使用 `![](https://x.com/用户名/status/数字ID)` 并独占一行。上传后网站显示官方卡片，不需要改变 Obsidian 写法。\n- password 属性沿用博客服务器验密阅读；公众号上传是独立操作，不继承网站密码保护。\n\n新建文章会生成 id 与日期。清理或重命名栏目后，上传前检查变更清单。\n');
write('使用说明/微信公众号.md', '# 微信公众号\n\n当前目标为草稿箱，不直接发表或群发。公众号账号尚未配置时，仍能通过服务端预览。\n\n正文支持标题、列表、引用、代码块、表格、行内公式 $E=mc^2$ 与独立公式 $$...$$。公式会在公众号版本中生成 PNG，原笔记保留 LaTeX。原始 HTML 作为文字显示；远程图片需要先保存到本地附件。动画图片当前取首帧。\n\n## 文章属性\n\n- image 或 wechatCover：本地封面；没有设置时使用正文首张图片。\n- wechatAuthor：公众号署名（可选）。\n- wechatDigest：摘要（可选，默认 description）。\n- wechatSourceUrl：原文链接（可选）。\n- wechatDraftId：已有的独立单篇草稿标识（可选，通常由服务端自动记录）。\n\n## 排版\n\n发布配置/公众号排版.json 目前为 {}，此时草稿采用插件「排版预览」里选中的风格参数；写了参数则以文件为准。可配置 fontSize、lineHeight、paragraphGap、headingSize、color、accent、fontFamily，详情见仓库 docs/WECHAT.md。\n\n## 以后接入账号\n\n在服务器私有配置中填写 WECHAT_APP_ID、WECHAT_APP_SECRET；添加服务器出口 IP 白名单并确认草稿接口权限，再重启服务。插件只填写服务地址与访问密钥。不要在聊天、文章、GitHub 中填写 AppSecret。\n\n## 草稿与重试\n\n重复保存同一版本不新增，修改后更新原独立草稿。如果草稿新增请求断线且结果不明，会暂停新增；先检查后台，将实际草稿标识填入 wechatDraftId，再重新预览。公众号真实版式需以后用你的账号在手机预览验收。\n');
write('.obsidian/community-plugins.json', '["blog-publisher"]\n');
write('.obsidian/core-plugins.json', '["file-explorer","global-search","switcher","backlink","properties","outline","command-palette","bases"]\n');
write('.obsidian/app.json', JSON.stringify({ attachmentFolderPath: 'blog-V3/6.附件', alwaysUpdateLinks: true }, null, 2) + '\n');
write('.obsidian/types.json', JSON.stringify(pinnedPropertyTypes(), null, 2) + '\n');
for (const file of ['main.js', 'manifest.json', 'styles.css']) { const dest = path.join(vault, '.obsidian/plugins/blog-publisher', file); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(root, 'dist', file), dest); }
write('CLAUDE.md', '# 空白博客笔记库\n\nblog-V3/ 是唯一网站内容来源；控制台/ 是插件操作入口与原生文章列表；模板/ 是四类写作模板（填写说明在 %% 注释里，发布时剥离）；发布配置/ 是公众号样式；使用说明/ 是用户教程。\n.obsidian/ 仅附带单个核心插件和通用设置；types.json 注册 pinned 复选框，文章列表展示此属性，无连接信息、历史、workspace 或个人内容。\n[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md\n');
process.stdout.write('空白笔记库模板已生成，未加入文章与凭据。\n');
