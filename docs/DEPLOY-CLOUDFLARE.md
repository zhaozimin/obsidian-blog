# 没有服务器：Cloudflare 部署

网站使用 Cloudflare Workers Static Assets；电脑 Node 服务接收 Obsidian 快照、构建并调用 Wrangler 上传。访客访问不需要电脑开机；上传和公众号操作需要电脑本机服务。无需 SSH、Cloudflare Tunnel 或常驻服务器。

## 授权与资源

AI 需要本机文件/终端权限及你的 Cloudflare 授权。推荐 `npx wrangler login`，你完成浏览器登录；`npx wrangler whoami` 确认账号 ID 和权限。也可在本机私有环境配置 API Token，限定到自己的账号及所需 Worker/R2 权限，不发聊天、不提交 GitHub。

选择专用的新 Worker 名称，避免覆盖已有网站。默认 `workers.dev` 不需要购买域名；账号需已开通自己的 workers.dev 子域名。需要密码文章时，由你启用 R2 并确认费用，再创建私有桶。全公开文章无需 R2。

参考：[静态资源与绑定](https://developers.cloudflare.com/workers/static-assets/binding/)、[Wrangler 授权](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/)、[R2 上传](https://developers.cloudflare.com/r2/objects/upload-objects/)。费用查看 [Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)和 [R2 定价](https://developers.cloudflare.com/r2/pricing/)。

## 一次性安装

```bash
git clone https://github.com/zhaozimin/obsidian-blog.git
cd obsidian-blog
npm ci
npm run check
npm run setup -- --vault /你的笔记库绝对路径 --local
npx wrangler login
npx wrangler whoami
npm run cloudflare:init -- --name my-personal-blog --account 你的32位账号ID
npm run cloudflare:deploy
```

名称和账号 ID 换成自己的。初始化写 `.local/cloudflare.json` 和 `.local/server.env`，不把云配置或 Token 放进模板。

首次 `cloudflare:deploy` 只发布空站，显示真实 `https://名称.子域.workers.dev` 并记录站点地址。若输出中未识别到网址，AI 到 Cloudflare 后台核对，再执行 `cloudflare:init -- --origin https://实际网址`；状态核对清楚再继续。部署失败先解决权限或资源问题，不把失败当成功。

启用 Obsidian 的 Blog Publisher。本机默认设置已经匹配：地址 `http://127.0.0.1:3002`，密钥来自本机配置。**不要把插件发布地址改成 workers.dev**：公开 Worker 没有上传或公众号 API。

```bash
npm run dev:system
```

保持终端运行，填写首页、站点、文章和照片，再点击“上传博客”。服务完整校验并构建后调用 Wrangler；成功后更新同步记录。日常不必手动 Git 提交或运行空站部署命令。

如果之前已经在本机体验中上传过相同内容，切换 Cloudflare 后首次使用“重新发布完整博客”，确保当前快照上传到新目标。空站首次部署只允许执行一次，已有目标会拒绝再次初始化，避免覆盖内容。

## 可选：密码文章

确认自己已启用 R2，再创建专用私有桶：

```bash
npx wrangler r2 bucket create my-blog-private
npm run cloudflare:init -- --bucket my-blog-private
```

保持桶私有，不启用公开自定义域名或 `r2.dev`。重启本机服务，文章填写 `password`，从插件重新发布完整博客。

每次发布先上传同版本保护正文和专属图片，再部署 Worker 和公开资源。私有快照只保留加盐 PBKDF2 派生值；公开资源没有私有正文和专属图片。Worker 验密后提供正文与 30 分钟图片授权，版本变动使旧授权失效。

未配置 R2 时密码文章阻止发布，可查看 `.local/cloudflare-deploy.log`，补齐后重试。封面或公开文章共享图片仍是公开资源。历史 R2 版本不自动删除，确认不需回滚后按自己的保留策略清理。

Worker 使用 Cloudflare 限速绑定，各节点分别计数，不是全球严格总限额；不能替代会员或付费访问。大量保护内容要关注 CPU、R2 请求和存储额度。[官方限速说明](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)。

## 可选：自定义域名

域名先加入自己的 Cloudflare DNS Zone：

```bash
npm run cloudflare:init -- --domain blog.example.com
```

重启服务，从插件重新发布完整博客。发布器配置 Worker 自定义域名，站点、RSS 和阅读接口使用同一 HTTPS 地址；AI 验证 DNS、证书与实际访问。不要覆盖域名上的既有服务。

## 每日使用与恢复

- 上传前启动本机服务，确保 Wrangler 授权有效；插件检查变更后上传。
- Ctrl+C 停止服务，已发布网站仍可访问；下次上传重新启动。
- 远程失败不切换本机成功版本。断网可能发生在云部署已提交之后；查看 `/api/site/health` 与 Cloudflare 部署记录，核对版本后重新发布，不声称远程自动回滚。
- 升级后重新发布当前笔记库，不用首次空站命令覆盖内容。
- 备份笔记库和 `.local`；更换私有桶或恢复服务数据后重新发布。

## 微信公众号

预览、公式转图片和保存草稿在本机 Node 服务执行。未提供账号时只可预览。宽带出口可能变化，Cloudflare Worker 不提供本系统的固定公众号出口 IP。以后接官方账号需确认白名单和权限；也可接自己的固定出口或独立公众号服务，通过插件的独立地址/密钥或私有适配模块使用。见 [WECHAT.md](WECHAT.md)。
