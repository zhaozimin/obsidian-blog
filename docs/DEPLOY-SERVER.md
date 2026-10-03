# 服务器部署

目标：一个自己的 HTTPS 域名，提供网站、上传、密码阅读和可选公众号接口。AI 通过你的 SSH 操作服务器，本机安装 Obsidian 笔记库；Cloudflare 账号不是必要条件。

## 开始前确认

提供 SSH 别名或 `user@host`、服务器系统与 sudo 权限、博客域名和 DNS 管理方式。使用本机 SSH 密钥或代理，不在聊天中粘贴私钥。AI 先检查现有服务、端口和反向代理，为新博客选独立目录，保留已有网站。

建议源码 `/opt/blog-system`、运行数据 `/var/lib/blog-system`、环境文件 `/etc/blog-system.env`，可以按服务器调整。DNS 指向自己的服务器，HTTPS 证书和代理由实际环境决定。

## Docker 路线

服务器安装 Docker Compose 和 Git。克隆仓库：

```bash
git clone https://github.com/zhaozimin/obsidian-blog.git /opt/blog-system
cd /opt/blog-system
```

将 `deploy/receiver.env.example` 复制到 `/etc/blog-system.env`，权限设为 `600`。生成至少 32 字符的随机 `BLOG_RECEIVER_KEY`，填写 `SITE_ORIGIN=https://你的博客域名`；公众号变量留空。Compose 自动使用镜像内 `/app/web` 和 `/data`，不需要把示例主机路径当作容器路径。

```bash
docker compose -f deploy/compose.yml --env-file /etc/blog-system.env up -d --build
docker compose -f deploy/compose.yml --env-file /etc/blog-system.env ps
```

镜像构建含网站和服务端。主机只映射 `127.0.0.1:3002` 给反向代理，数据在 `blog-data` 命名卷；更新容器不删除卷。初次提供空网站，Obsidian 上传后切换到自己的内容。

## 原生 Node 路线

服务器安装 Node >=22.12、npm 和 Git，创建 `blog` 服务用户，克隆到代码目录后执行：

```bash
cd /opt/blog-system
npm ci
npm run check
```

构建需要完整依赖，不使用 `npm ci --omit=dev`。创建 `/var/lib/blog-system` 并允许服务用户写入，源码和依赖只需读取。配置 `/etc/blog-system.env`：

```dotenv
BLOG_RECEIVER_KEY=由AI在私有文件中生成的随机访问密钥
BLOG_RECEIVER_DATA=/var/lib/blog-system
BLOG_TEMPLATE_DIR=/opt/blog-system/web
BLOG_RECEIVER_HOST=127.0.0.1
BLOG_RECEIVER_PORT=3002
BLOG_PUBLISH_MODE=server
SITE_ORIGIN=https://blog.example.com
BLOG_READER_ORIGINS=https://blog.example.com
WECHAT_APP_ID=
WECHAT_APP_SECRET=
```

替换自己的域名；环境文件只供管理员/服务读取。检查 `deploy/blog-publisher.service` 中的用户、目录和 Node 路径，再安装：

```bash
sudo cp deploy/blog-publisher.service /etc/systemd/system/blog-publisher.service
sudo systemctl daemon-reload
sudo systemctl enable --now blog-publisher
sudo systemctl status blog-publisher
```

不在日志中输出密钥。运行数据不得放到 `web/public`、`web/dist` 或其他静态目录。

## HTTPS 和笔记库

在自己的域名 TLS `server` 块使用 `deploy/nginx-location.conf`，或配置等价 Caddy/1Panel 代理。网站、`/api/publish`、`/api/reader`、`/api/wechat` 均指向 `127.0.0.1:3002`，上传体允许 40 MB，API 不缓存，不记录含图片授权的请求日志。

电脑端安装仓库依赖，运行 `npm run setup -- --vault /笔记库绝对路径`。Obsidian 打开新库并启用 Blog Publisher：

- 博客文件夹 `blog-V3`，图片文件夹 `6.附件`。
- 发布地址：自己的 HTTPS 根地址，如 `https://blog.example.com`。
- 访问密钥：对应服务器的 `BLOG_RECEIVER_KEY`，在插件设置或私有文件填写。

电脑不需要启动本机接收服务。AI 可在授权下写插件私有 `data.json`，保留已有历史和其他设置。先检查发布连接，再上传空配置。

## 验收和维护

按 `docs/TESTING.md` 用合成文章验证图片、代码、表格、公式、目录改名与删除。密码文章用错误和正确密码分别验证，公开 JSON/RSS 不含私密正文，专属图片不可直接访问。

构建成功才切换网站，失败保留旧站；故意失败只在测试环境验证。清除测试文章再上传。公众号未配置时只验证预览，真实草稿以后单独验收。

升级前备份笔记库、环境文件和数据目录/卷；更新源码、依赖和构建后重启。systemd 用 `systemctl restart blog-publisher`，Docker 用上方 Compose 命令。恢复或换服务器后从插件重新发布完整博客。不执行删除数据卷的命令。
