# shared/
> L2 | 父级: ../CLAUDE.md

成员清单
property-types.cjs: 插件初始化与Node模板安装共用的置顶复选框类型合并，保留其他属性配置，拒绝损坏对象
markdown-parts.cjs: 不依赖 Obsidian 或浏览器的代码片段隔离，精确匹配行内反引号长度并保留缩进与引用围栏，采集和图片映射不处理代码示例；stripComments 跨段落剥离 %%注释%%，代码里的 %% 不算，插件采集与网站构建共用
reader-crypto.mjs: Node/Worker 共用 PBKDF2 密码派生与 HMAC 限时图片授权，版本改变使旧授权失效
reader-images.cjs: Node/Worker 共用本地图片授权映射，识别 Markdown、引用定义与 HTML，剥离查询参数、保留片段及外站 URL，代码示例保持原样
typeset/: 排版纯函数层（6 文件：format 空白规则、parse/render/themes 预览渲染、normalize 标点、diagnose 体检），插件写作整理、排版预览与公众号风格参数共用

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
