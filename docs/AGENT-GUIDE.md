# 使用者 Agent 安装指南

目标：从同一个仓库安装网站、服务端与空白 Obsidian 笔记库，只依赖一个社区插件 Blog Publisher。

1. 读取根 CLAUDE.md 和 README，确认 Node >=22.12、npm、目标笔记库路径、服务器或本机部署目标。
2. 使用 npm ci、npm run check 构建和验证。不要读取或复制作者自己的笔记、插件 data.json、服务器环境文件。
3. 对用户指定的笔记库运行 npm run setup -- --vault /用户笔记库绝对路径；本机测试可加 --local。安装不覆盖已有笔记和本机设置；更新插件时先备份已有三文件再替换。
4. 有服务器按 DEPLOY-SERVER.md，用使用者 SSH 安装 Node/Docker、私有运行数据和 HTTPS；没有服务器按 DEPLOY-CLOUDFLARE.md，用使用者本机服务与 Wrangler 授权上传 Worker 静态资源，可选私有 R2。不要为 Cloudflare 用户要求 SSH，不把插件地址填成 Worker 网址。
5. 用户启用 Blog Publisher。服务器模式填 HTTPS 地址和服务器访问密钥；Cloudflare 模式保留本机地址与本机密钥，服务内部执行云上传。先验证空站，再用合成文章核对分类、图片、代码/表格/公式、改名和删除；Cloudflare 密码文章须配置私有 R2。
6. 公众号账号未提供时只验证预览与配置提示，不伪造“已上传真实公众号”。用户以后在私有配置填写 AppID/AppSecret、设置 IP 白名单与权限后再真实验证。
7. 验收后清理测试文章，分享 vault-template；不把测试库当发行模板，不覆盖用户正式笔记库。

本机运行数据：`npm run runtime:path` 查询外部目录；默认按安装路径隔离，`BLOG_LOCAL_DIR` 可覆盖但不能放进源码。旧版本的 `.local` 应在服务停止并备份后迁移，更新 server.env 的数据路径，再从新入口启动；不要复制到发行包。

保护边界：站点内容只从 Obsidian 生成；公众号保存需独立明确点击；不会群发。生成数据、私有配置、原始文章与运行历史不提交 Git。

升级插件：构建后运行 `npm run install:plugin -- /笔记库/.obsidian/plugins/blog-publisher /源码之外的本次备份目录`，两者都用绝对路径；保留已有 data.json，并在 Obsidian 重新加载插件。备份目录需为本次更新单独创建，避免覆盖旧备份。

如果资源连接或付款需要使用者完成，先完成本机安装、可读配置和检查，再指出缺少的具体授权。记录成功网址和维护命令，不把未经连接验证的示例域名当作交付网站。
