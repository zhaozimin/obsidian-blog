# 博客前端

这是完整 Obsidian Blog System 的网站模块。安装与服务器部署见 [系统 README](../README.md)。

所有品牌、栏目和文章来自笔记库上传快照；内容字段契约见 [CONTENT.md](CONTENT.md)。本模块不存个人文章与照片。npm run build 构建空框架，服务端用相同内容契约构建真实内容。

Markdown 支持代码块、表格和常用公式。密码正文由服务器 Node 或 Cloudflare 私有 R2 + Worker 验密后提供，不进入公开 JSON、RSS 或静态图片。两种目标共用内容契约。
