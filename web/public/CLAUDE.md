# public/
> L2 | 父级: ../CLAUDE.md

成员清单
blog-data.json: 构建生成的完整内容快照与站点域名，由数据适配层读取；不手工修改，不进入 Git
favicon.svg: 空模板通用书页图标，发布时按站点名称生成品牌字形
feed.xml: 构建生成的 RSS，文章链接和正文图片使用 SITE_ORIGIN；不进入 Git
fonts/: 子模块边界，详见 fonts/CLAUDE.md
images/: 子模块边界，详见 images/CLAUDE.md
manifest.json: 从笔记库生成应用名称，保留通用主题与图标配置
sitemap.xml: 构建生成的首页地图，HashRouter 片段不作为独立路径收录；不进入 Git
social/: App Store 平台原图与开发者/商店来源地图，详见 social/CLAUDE.md
备案图标.png: 站点静态资源，浏览器通过根路径加载

Vite 会复制本目录，postbuild 从 dist 中排除 CLAUDE.md/AGENTS.md，源码地图仅供开发导航。

法则: 成员完整·一行一文件·父级链接·技术词前置
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

本轮契约：目录改名保持身份、栏目清单和笔记声明一致，配置不进入文章列表；重复初始化不增加文章，未声明目录停止发布。站点 SEO 与 manifest 从同一快照生成。
