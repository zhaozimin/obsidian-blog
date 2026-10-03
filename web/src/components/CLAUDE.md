# src/components/
> L2 | 父级: ../CLAUDE.md

职责边界：组件消费 lib 和类型，跨页面相同模式在这里复用；页面保留业务状态。

成员清单
AuthorAvatar.tsx: 作者图像的单一适配边界，有上传照片时显示原图，空模板时显示图形占位
CollectionHero.tsx: 三类栏目共用 800px 居中左文右图介绍，简介固定双行；消费栏目最新封面，空集合使用同尺寸文字构图
ErrorBoundary.tsx: 浏览器应用错误边界，复用纸墨控件，开发模式才显示堆栈诊断
ImageViewer.tsx: 图片缩放、拖拽和下载视图，打开/关闭动画独立于拖拽变换，关闭结束才释放焦点与滚动
ImageViewerContext.tsx: 跨页面图片预览状态，按原图挂载单一视图，封面与正文共享动画生命周期
Layout.tsx: 品牌导航、手机菜单与搜索编排，AuthorAvatar 兼容空照片、备案读取 SITE；页脚只保留等高作者字标、社交及版权/备案，手机作者/社交上下排列、底部左右排列
PostCard.tsx: 首页与分类共用的 16:9 公开卡片，保护标记显示锁图标，分类及长文红/书籍绿/付费金语义共用
SEO.tsx: 页面标题、摘要与结构化数据适配，作者统一读取 SITE
SearchModal.tsx: 原生 dialog 管理焦点，消费 lib/search 展示标题/副标题、16:9 缩略图与高亮匹配句子，支持键盘选择并滚入可见范围
SocialButton.tsx: 8 个 App Store 原图与邮箱/RSS 共用 36px 纸墨按钮；App 图像 30px 完整显示，默认灰度、悬停恢复原色，RSS 根路径按当前域名解析后复制
TOC.tsx: 左侧胶囊条形码与进度，点击展开单列层级目录；标题连续排列，超长列表滚动但隐藏滚动条，支持外部点击/Esc，手机左下入口且不改写路由
VideoEmbed.tsx: 用户点击后才创建第三方播放器，播放键复用冻结设计系统

法则: 成员完整·一行一文件·父级链接·技术词前置
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

内容来源：先加载 Obsidian 生成的 siteConfig/collections，再生成路由、导航、栏目介绍和品牌；可选空字段不补入个人内容。栏目稳定 id 关联文章，显示名称取目录。
