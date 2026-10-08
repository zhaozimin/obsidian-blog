# src/pages/post-detail/
> L2 | 父级: ../CLAUDE.md

职责边界：PostDetail 管理内容和状态，本模块根据显式输入生成正文；颜色、页面布局与控件质感由全站样式控制。

成员清单
content.tsx: Markdown 块解析与图片/视频/X 帖子分流，独立 X status 图片语法先于普通图片；HTML 块按文字显示、缩进代码与围栏控件共用，保持与公开资源扫描一致；引用式定义跨段共享且不显示，围栏闭合与唯一标题锚点同目录共享，正文图片支持键盘，空行仅分段、连续文字软换行合并，图注单次解码上传原始文件名，正文字号、行高和块间距由全站 CSS 按内容类型统一继承，未授权受保护文章仅渲染密码入口，解锁请求回传页面
XPostEmbed.tsx: 严格识别 X/Twitter 官方数字 status 地址，单例加载 widgets.js 并启用 dnt；卡片被拦截或加载失败时保留可访问原文链接
inline.tsx: marked 行内 token 保留完整链接/图片/代码，再渲染强调及 Wiki/高亮，HTML 只作文字，URL 经白名单校验，站内锚点滚动不改写 HashRouter；图片能力由显式回调注入
styles.ts: 纸墨标题字号与结构尺寸，仅供块解析器生成标题和结构，不管理正文字号、行高或块间距

CodeCopyButton.tsx: React 文本节点显示代码语言与复制反馈，剪贴板失败可读、离开页面清理计时器，拒绝 HTML 注入

法则: 成员完整·一行一文件·父级链接·技术词前置
math.tsx: KaTeX 行内/独立公式，信任关闭，字体随构建打包
blocks.tsx: 原块解析器的表格和独立公式扩展，复用行内格式与主题，加载独立扩展样式
extras.css: 仅控制表格与公式节点，正式页面 content.css 与个人版逐字节一致

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
