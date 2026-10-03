# Agent 工作入口

这是可公开分发的完整 Obsidian 博客系统。安装先读 README.md 和 docs/AGENT-GUIDE.md；有服务器读取 docs/DEPLOY-SERVER.md，否则读取 docs/DEPLOY-CLOUDFLARE.md。按使用者真实账号和目标部署，不能连接作者的环境。

Obsidian 是内容真源。网站消费内容契约；栏目身份保留在 _栏目.md，名称取目录，文章身份保留在 id。只安装 Blog Publisher 一个社区插件。未提供公众号账号时只验证预览与未配置提示。

缺少部署目标、SSH 或云授权时询问必要信息。已有授权内持续完成安装与验收，保留用户现有服务。登录交互由用户完成，付费资源先确认。源码目录之外安装用户笔记库，私有配置、data.json、.local 和个人内容不得提交 Git。

维护代码先读对应 CLAUDE.md，更新文件头 INPUT/OUTPUT/POS/PROTOCOL 与模块地图。完成 npm run check，报告实际验证结果；模拟接口、Wrangler dry-run 和本机模拟器不能描述为真实云部署或真实公众号上传。
