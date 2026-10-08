# src/
> L2 | 父级: ../CLAUDE.md

成员清单
App.tsx: HashRouter 路由与图片预览上下文的编排，所有页面共用 Layout
components/: 共享视图与交互边界，详见 components/CLAUDE.md
content/: 本地空模板的五类内容目录契约，服务器通过外部目录提供数据，详见 content/CLAUDE.md
index.css: Tailwind 工具类入口，服务已有 Markdown 渲染器
index.tsx: 浏览器挂载与样式加载次序：工具类 → 冻结系统 → 博客布局
lib/: 品牌配置、公开数据适配、服务器阅读请求与可读正文搜索，详见 lib/CLAUDE.md
pages/: 首页、分类、作者及阅读页面，详见 pages/CLAUDE.md
styles/: 冻结设计系统及博客语义排版，详见 styles/CLAUDE.md
types.ts: 公开文章布尔置顶、保护标记和经历的数据契约，供数据读取与视图共同消费

法则: 成员完整·一行一文件·父级链接·技术词前置
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

内容来源：先加载 Obsidian 生成的 siteConfig/collections，再生成路由、导航、栏目介绍和品牌；可选空字段不补入个人内容。栏目稳定 id 关联文章，显示名称取目录。
