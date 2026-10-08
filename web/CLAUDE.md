# web/ - Obsidian 博客系统的空白前端
React + TypeScript + Vite + React Router + KaTeX + marked

<directory>
src/ - 页面、内容快照适配、搜索与 Markdown 显示；详见 src/CLAUDE.md
scripts/ - 唯一博客内容契约、公开/私有边界、构建与历史双站发布工具
public/ - 通用图标和字体，无个人照片或文章
</directory>

内容来自外部笔记库上传的成功快照，不在前端维护品牌、文章或分类。栏目身份由 _栏目.md 声明，名称与顺序取目录；分类取最近子目录。密码正文和专属图片不进入静态产物，阅读服务按密码授权。博客支持代码、表格、常用 LaTeX 公式及 X 官方帖子嵌入，字体资源随构建发布。
默认 SITE_ORIGIN 为本机环回地址，生产填写 HTTPS 域名；阅读只允许 HTTPS 或环回 HTTP。../server/local-publisher.cjs 提供共用构建事务，Cloudflare 适配器上传同版本 Worker/资源与私有 R2；历史双站命令为兼容入口。
UI 基准：ui-baseline.json 锁定正式页面、组件、样式、字体和平台图标。check:ui 检查用户批准的 UI；公式、表格和 Cloudflare 授权仅为明确记录的扩展，不重写页面布局。品牌图标与 manifest 属于生成内容，不参与固定 UI 哈希。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

置顶数据流：插件/模板注册 pinned 复选框 → 采集与构建校验布尔字段 → 网络快照兼容旧笔记 → collection.ts 统一选取每栏目最新四篇 → 列表优先和可交互封面共用身份。缺封面不补第五篇，初始化不修改旧文章。
