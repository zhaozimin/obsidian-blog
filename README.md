# Obsidian Blog · 极简个人博客系统

在 Obsidian 写内容，点击上传，更新自己的博客；同一篇笔记还可预览并保存到微信公众号草稿箱。

这是一整套可部署系统：**博客网站 + 发布服务 + 空白 Obsidian 笔记库 + 一个社区插件 + 使用教程**。网站名称、首页介绍、照片、文章和分类由笔记库提供，发行模板不含作者文章、照片、账号或上传记录。

- **有自己的服务器**：使用服务器方案，AI 通过 SSH 部署 Node 服务和 HTTPS 网站。
- **没有服务器**：使用 Cloudflare 方案，AI 在你的电脑上安装发布服务，用你的 Cloudflare 授权上传网站。网站持续在 Cloudflare 运行。

## 把这段提示词交给你的 AI

使用能访问本机文件、执行终端命令和 Git 的 Agent。普通纯聊天窗口不能替你执行安装。先填入方括号中的信息；不知道的项目保留“待确认”，让 AI 询问。

```text
请根据 https://github.com/zhaozimin/obsidian-blog 部署完整 Obsidian 博客系统。
请实际安装并完成验收，不要只给我操作建议。

我的电脑系统：[macOS / Windows / Linux]
源码安装位置：[绝对路径]
新 Obsidian 笔记库位置：[源码目录之外的绝对路径]
我是否有自己的服务器：[有 / 没有]
博客域名：[自己的域名 / 先用 Cloudflare workers.dev]

如果有服务器：
- SSH 连接方式：[我本机的 SSH 别名或 user@host；不要在聊天中发送私钥]
- 服务器系统：[Ubuntu / Debian / 其他 / 待确认]
- 是否能使用 sudo、Docker、现有反向代理：[情况或待确认]

如果没有服务器：
- 使用我自己的 Cloudflare 账号，先协助我在本机通过 Wrangler 登录。
- 账号 ID：[已知 ID / 待确认]
- 为我创建一个专用的新 Worker 名称：[名称 / 请建议一个并确认可用]
- 是否需要密码文章：[需要 / 暂不需要]
- 若需要密码文章，确认我已启用 R2，创建私有桶；不要开启桶的公开访问。

微信公众号：[暂不配置 / 稍后由我在私有配置中填写]

执行要求：
1. 克隆仓库，先读 README.md、docs/AGENT-GUIDE.md 和对应部署文档。
2. 仅询问缺少且阻塞部署的信息；保留我的已有文件、其他网站和账号设置。
3. 安装 Node >=22.12，运行 npm ci 和 npm run check。
4. 用 setup 安装空白笔记库，只安装 Blog Publisher 一个社区插件。
5. 有服务器按 docs/DEPLOY-SERVER.md 部署；没有服务器按 docs/DEPLOY-CLOUDFLARE.md 部署。
6. 连接使用我的服务器或我的 Cloudflare 账号。密钥只写私有文件，不写文章、聊天或 GitHub。
7. 帮我配置插件。栏目和分类取笔记库文件夹名，内容来自笔记，不在前端硬编码我的信息。
8. 用可删除的测试文章验收：代码块、表格、公式、图片、目录改名、修改与删除同步；需要密码文章时还要验证正文和专属图片不公开。
9. 验收后清理测试内容并再上传；告诉我网址、启动/停止方法、备份位置和每日上传步骤。
10. 未配置公众号账号时只验证预览；不声称已上传真实草稿，不发表或群发。
```

登录、SSH 和云资源授权来自使用者本人。不要把密码、私钥、Cloudflare Token 或公众号 AppSecret 发给 AI 聊天窗口；AI 可以操作本机私有配置，遇到登录交互由你完成。启用付费产品前先确认费用。

## 两种方案有什么不同

| 项目 | 自己的服务器 | Cloudflare，无需服务器 |
| --- | --- | --- |
| AI 需要连接什么 | 你的 SSH；域名的 DNS 管理入口 | 本机终端与 Cloudflare Wrangler 授权，无需 SSH |
| 插件连接地址 | 自己的 HTTPS 博客地址 | `http://127.0.0.1:3002` 本机服务 |
| 构建和接收上传 | 服务器 Node 服务 | 电脑 Node 服务，构建后调用 Wrangler 上传 |
| 访客访问 | 服务器的公开网站 | Cloudflare Workers Static Assets |
| 密码文章和专属图片 | 服务器私有运行目录 | 可选私有 R2 + Worker 验密，需要启用 R2 |
| 电脑关机后 | 已发布网站可访问 | 已发布网站可访问；再次上传要启动本机服务 |
| 公众号 | Node 服务的独立草稿接口 | 本机 Node 服务的独立草稿接口 |

Cloudflare 路线使用 **Workers Static Assets**，包含密码阅读的 Worker；构建器、文件系统和图片处理仍在 Node 服务。当前 Cloudflare 写作上传面向电脑端 Obsidian。本项目不依赖作者的服务器、域名或云账号。

## 先在本机体验

需要 Node >=22.12、npm、Git 和 Obsidian。文章列表使用 Obsidian 原生 Bases；建议更新 Obsidian，核心上传不依赖 Bases 或其他社区插件。

```bash
git clone https://github.com/zhaozimin/obsidian-blog.git
cd obsidian-blog
npm ci
npm run check
npm run setup -- --vault /你的笔记库绝对路径 --local
npm run dev:system
```

路径含空格时用引号包住。笔记库放在源码之外，避免用户内容进入源码仓库。用 Obsidian 打开该文件夹，启用唯一社区插件 **Blog Publisher**，打开 `控制台/发布控制台.md`。本机体验地址为 <http://127.0.0.1:3002>。

`setup --local` 自动生成访问密钥、源码之外运行目录中的 `server.env` 和笔记库中的插件私有 `data.json`，已有文件不覆盖。本机体验不需要 SSH 或 Cloudflare 授权。用 `npm run runtime:path` 查询运行目录；默认位于用户主目录的 `.local/share/obsidian-blog/<安装路径标识>`。可用 `BLOG_LOCAL_DIR` 指定另一个源码之外的目录，安装、初始化和启动时需保持相同设置。

## 方案一：部署到自己的服务器

AI 按 [服务器完整部署教程](docs/DEPLOY-SERVER.md) 操作。你提供 SSH 连接方式、域名与 DNS 配合；服务器安装 Node 或 Docker，配置持久数据和 HTTPS 反向代理。一个 Node 服务同时提供网站、上传、密码阅读和公众号接口。

插件发布地址填 `https://你的博客域名`，密钥由自己的服务器私有配置生成。后续直接在 Obsidian 点击上传，不需要每次打开源码或手动 Git 提交。Cloudflare 可以只负责 DNS，服务器方案不要求使用 Cloudflare 托管网站。

## 方案二：部署到 Cloudflare

AI 按 [Cloudflare 完整部署教程](docs/DEPLOY-CLOUDFLARE.md) 操作。完成本机体验安装并停止本机服务后：

```bash
npx wrangler login
npx wrangler whoami
npm run cloudflare:init -- --name 你的专用worker名称 --account 你的账号ID
npm run cloudflare:deploy
npm run dev:system
```

首次空站部署显示真实 `workers.dev` 网址并自动写入私有配置。插件地址始终指向本机，不填 Cloudflare 网址。点击上传后本机服务按快照构建并上传公开网站。自定义域名和密码文章的私有 R2 配置见完整教程。

全公开文章无需 R2。使用密码文章前先启用并配置私有桶；缺少桶会阻止发布。Cloudflare 的额度和计费以其 [Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)与 [R2 定价](https://developers.cloudflare.com/r2/pricing/)为准，不承诺永久免费。

## Obsidian 和网站如何一对一映射

| 笔记库中的位置 | 网站中的结果 |
| --- | --- |
| `blog-V3/1.首页/站点设置.md` 属性 | 网站名称、名称生成的图标、作者、页脚、RSS、备案 |
| `blog-V3/1.首页/home.md` 属性 | 首页标题、介绍、头像、背景、社交链接与 SEO |
| 栏目的文件夹名称 | 导航和栏目名称；数字前缀用于顺序 |
| 栏目中的 `_栏目.md` | 稳定身份、展示类型、介绍和封面 |
| 文章所在子文件夹名称 | 文章分类与分类筛选 |
| 文章属性和 Markdown 正文 | 标题、日期、简介、封面、代码、表格、公式、X 帖子卡片及正文 |
| `blog-V3/5.关于/` 中的笔记 | 关于页中的经历内容 |
| 引用的本地附件 | 仅公开引用图进入网站；未引用附件不发布，密码文章专属图片通过阅读授权访问 |
| `发布配置/公众号排版.json` | 公众号排版参数，当前为 `{}` |

例如把 `3.阅读思考` 改为 `3.读书笔记`，保持 `_栏目.md` 的 `id/kind` 不变，上传后网站导航一起改名。移动文章改变分类；改文件名不应改 `id`。修改和删除以当前完整快照为准，成功后不保留旧文章列表。

首页和网站设置使用 YAML 属性，界面消费约定字段；文章正文使用 Markdown。首页属性之外的任意文字不会自动变成新页面。见[内容映射说明](docs/CONTENT-MAPPING.md)。

在正文中嵌入 X 帖子时，保持 Obsidian 写法并让它独占一行：`![](https://x.com/用户名/status/数字ID)`。网站会识别 x.com/twitter.com 地址并载入官方卡片；第三方脚本被拦截时保留原文链接。

## 每天怎样使用

1. 填写首页和站点设置，照片放到 `blog-V3/6.附件`。
2. 在控制台点栏目按钮新建，选择分类；笔记套用「模板」文件夹里的模板，顶部 %% 填写说明 %% 写明每个字段填什么，发布时自动去掉。图片直接拖进或粘贴进笔记，先转成 WebP，再请你起名字，存进附件文件夹；改完切到别处时自动整理格式（中英文空格、段间一个空行）。右侧栏「排版预览」实时显示公众号（手机/电脑/深色）与 X 的样子，可一键复制。
3. 点击“上传博客”，检查变更后确认。Cloudflare 用户先启动本机服务。
4. 要发公众号时打开文章，运行公众号预览命令，确认预览后保存到草稿箱。

只有成功发布才更新同步记录；构建失败保留成功网站。历史批次在私有数据中用于恢复，不是额外的公开文章。更换目标或恢复旧站后，用“重新发布完整博客”核对真源。

公众号只创建/更新草稿，不直接发表或群发。相同版本不重复新增，修改更新原独立草稿；结果未知时暂停盲目重试。没有账号时可以预览，保存提示未配置。

公众号草稿默认采用排版预览里选中的风格（字号、行距、段距、标题、配色与字体同一组参数）；`发布配置/公众号排版.json` 写了参数时以它为准。代码、表格和常用公式已支持；公众号公式转 PNG，博客用 KaTeX，原笔记保持 LaTeX。Cloudflare 路线需配合本机出口 IP 白名单，或接入自己的固定出口/独立公众号服务。见[公众号与自定义接口](docs/WECHAT.md)。

## UI 基准与仓库边界

网站沿用已经批准的前端 UI。页面、组件、基础排版、字体和平台图标由 `web/ui-baseline.json` 锁定，`npm run check` 会验证。表格、公式和云端阅读保留为隔离扩展；姓名、照片和文章由使用者笔记提供。没有用户明确的 UI 调整授权，不更新基准哈希。

此公开仓库包含完整系统与空白笔记库，不包含作者个人博客内容。个人实例与数据在独立私有仓库维护；本机测试数据和凭据放在源码之外。

## 仓库内容与更新

```text
vault-template/  空白笔记库、说明、控制台和已编译的单插件
plugin/          Obsidian 插件源码
web/             React 网站框架与唯一内容契约
server/          Node 上传、构建、阅读及公众号服务
cloudflare/      Cloudflare 静态网站与 R2 私有阅读 Worker
shared/          共用 Markdown 与阅读授权协议
deploy/          Docker、systemd、Nginx 示例
scripts/         构建、安装、Cloudflare 初始化与公开检查
docs/            Agent、部署、映射、公众号与验收记录
tests/           合成内容及模拟接口测试
```

升级前备份笔记库、插件私有配置和运行数据。运行 `git pull --ff-only`、`npm ci`、`npm run check`，按 Agent 指南更新插件并重启服务。笔记库、外部运行目录、`.env` 和插件 `data.json` 不提交 GitHub。Cloudflare 升级后从插件重新发布当前内容，不用空站初始化覆盖已有内容。

[Agent 指南](docs/AGENT-GUIDE.md) · [验证范围](docs/TESTING.md) · [验收记录](docs/TEST-REPORT.md) · [变更记录](CHANGELOG.md)

源码采用 [MIT](LICENSE)，第三方资源遵循各自许可证，见[第三方说明](THIRD-PARTY.md)。

## 置顶内容

每个栏目从已发布内容按 `date` 倒序选取最多四篇 `pinned: true` 的笔记。右侧只显示这四篇实际存在的16:9封面，以小幅旋转和位移错落叠放；鼠标悬停或键盘聚焦时抽到最上层并放大，点击进入对应详情。无置顶或无封面时留白，不添加文字占位，也不以更早的第五篇补图。相同四篇排在栏目列表前面并显示置顶标记，余下内容按日期倒序。搜索和分类筛选不改变置顶席位；超过四篇保留原勾选，取消其中一篇后由更早的置顶补位。

插件初始化及新建文章会注册 `pinned` 复选框，新建长文、书籍、产品默认 `pinned: false`。可以在文章属性或控制台文章表勾选，上传后生效；旧文章缺少字段时视为未置顶。文本 `"true"` 和数字不作为复选框值。
