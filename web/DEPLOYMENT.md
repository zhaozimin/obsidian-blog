# 网站部署

部署由完整系统的 [README](../README.md) 选择：[自己的服务器](../docs/DEPLOY-SERVER.md) 或 [Cloudflare](../docs/DEPLOY-CLOUDFLARE.md)。服务器提供同源网站与上传/阅读；Cloudflare 在本机构建并上传静态资源，私有 R2 + Worker 提供密码阅读。

历史 scripts/publish.cjs 可用于显式选择的双站发布环境；其私有配置由使用者提供，通用发行不依赖。
