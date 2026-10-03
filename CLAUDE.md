# Obsidian Blog System - 一份笔记，博客与公众号两条发布渠道
React + TypeScript + Vite + Obsidian API + Node 22 + marked + MathJax + sharp + Cloudflare Workers/R2

<directory>
web/ - 空白博客前端和唯一博客内容契约
plugin/ - 单插件初始化、新建笔记、博客同步、公众号预览与草稿上传
server/ - 私有上传事务、受保护阅读、静态网站与公众号官方接口适配
cloudflare/ - 无服务器方案的静态资源与私有 R2 阅读 Worker
scripts/ - 构建、空白模板安装、公开文件检查
shared/ - 插件与网站构建共用的 Markdown 代码隔离
vault-template/ - 无个人文章、照片与凭据的笔记库模板
测试位于 tests/，部署示例位于 deploy/。
</directory>

<config>
package.json - 完整系统构建、验证、安装与 Cloudflare 初始化入口
README.md - 部署选择、可复制 AI 提示词与日常映射
AGENTS.md - Agent 安装和维护边界，路由至部署教程
manifest.json - 单插件身份和发行版本
Dockerfile - 可选服务器镜像，持久数据独立存放
</config>

数据流：Obsidian Markdown 和引用附件 → 插件；博客完整快照 → 私有 BatchStore → web 内容契约 → 原子静态发布；选中文章 → 独立公众号预览 → 确认 → 官方草稿接口。两条渠道的成功记录独立，不自动群发。公式在公众号版本中转为 PNG，原始笔记不改写。
公众号模板配置保留为空，基础排版只供功能测试。AppID、AppSecret 与接口地址由服务器私有配置提供，不进入笔记内容和发行包；自定义适配模块必须实现与官方适配器相同的能力。
服务器方案：Node 接收、构建并提供同源网站，公网经 HTTPS 反向代理。Cloudflare 方案：同一 Node 服务留在用户本机，构建后由 Wrangler 上传 Worker 静态资源；密码正文与专属图片留在私有 R2，Worker 使用共用密码/授权协议验密。电脑关闭后已发布网站仍可访问，写作上传和公众号需要本机服务启动。
默认本机 HTTP 仅允许环回地址。个人双站发布器仅作为兼容入口，通用发行按用户选择使用服务器或 Cloudflare。
法则：极简·稳定·导航·版本精确。
