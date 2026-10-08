# Obsidian → 博客内容契约

内容事实源是 `BLOG_CONTENT_DIR` 与 `BLOG_IMAGES_DIR`。每次构建根据当前文件重新生成，不维护第二份文章或分类清单。

面向使用者的完整「属性 → 页面位置 → 缺省行为」矩阵以 [README.md](README.md#obsidian-属性与网站位置) 为文字源，[HTML 手册](docs/blog-handbook.html) 由同一 README 生成；本文聚焦上传/构建契约，不把已读取字段等同于已显示功能。

## 文件夹与栏目

新内容目录的每个一级栏目通过 `_栏目.md` 声明稳定 `id` 与 `kind`。支持 config/article/book/product/about 五种模板；config 和 about 各一个，内容栏目可以有多个。目录名称决定导航和栏目名，去掉开头数字排序前缀。栏目改名保留 id，栏目链接和文章链接稳定。子文件夹决定分类，新的目录忽略 category 属性。

`_栏目.md` 是配置，不进入文章或履历。可选字段 english/promise/description/topics/image/visualLabel/art 控制栏目文字与封面。`1.首页/站点设置.md` 的 `id: site` 定义站点品牌和页脚；`home.md` 的 `id: home` 定义首页。个人内容全部在外部目录，源码只有渲染框架。

上传批次包括 collections 身份/目录清单和全部 Markdown；服务器按声明保留原目录，构建再次从笔记核对声明。纯目录改名也进入 catalog 快照。未声明却包含笔记的目录阻止发布；重复 id、栏目身份、角色和路径无效均阻止发布。历史成功批次仍可按旧目录读取，不修改原稿备份。

只读取 `.md`，忽略隐藏目录与 CLAUDE.md/AGENTS.md/README.md。站点和栏目配置只允许明确的公开展示字段，密码与上传凭据不会进入公开配置。

## 元数据对应

| Markdown 字段 | 网站字段/效果 | 约定 |
| --- | --- | --- |
| `id` | `/#/post/<id>` | 文章/书籍/产品全站唯一且稳定；改标题或移动文件不改 id |
| `title` | 标题 | 缺省使用文件名 |
| `subtitle` | 副标题 | 可选文本 |
| `description` | 简介 | 卡片与搜索消费 |
| `category` | 分类与颜色标签 | 历史兼容字段；新栏目从子目录读取分类 |
| `tags` | 仅进入数据，无标签展示/筛选/搜索 | 文本列表，例如 `[AI, 工作流]` |
| `date` | 更新时间与排序 | 建议带引号的 `YYYY-MM-DD`；缺省不显示日期 |
| `pinned` | 每栏目最多四篇置顶、封面堆叠与列表优先 | 布尔复选框 `true` / `false`；缺省或空值为 false，文本/数字阻止上传或构建；超出按 `date` 倒序取最新，日期相同按 id 稳定排序 |
| `image` | `cover`，16:9 封面 | `"[[封面.webp]]"`、`/images/封面.webp` 或完整 HTTPS URL |
| 正文 | 阅读、搜索句子、目录 | 标准 Markdown，Wiki 图片自动转换；独立 `![](https://x.com/用户/status/数字ID)` 生成 X 帖子卡片 |
| `author` / `publisher` | 书籍作者/出版社 | 可选文本 |
| `isbn` | 仅进入数据，页面不显示 ISBN | 加引号保留开头的 0 |
| `rating` | 书籍评分 | 0–10 数字 |
| `doubanUrl` / `readDate` | 豆瓣按钮 / 仅保存的阅读日期 | 完整链接 / 日期；readDate 不显示、不影响排序 |
| `price` | 产品价格与付费颜色 | 数字或文本，例如 `99`、`"¥99"`、`"免费"`；正数价格为金色 |
| `link` | `buyUrl`，产品访问按钮 | 完整链接，沿用插件的 `link` |
| `videoUrl` | 视频入口 | 完整链接 |
| `password` | 服务器验密 | 非空时公开数据只有 isProtected；正文、密码与专属本地图片不入静态包 |

`products` 是旧配置透传字段，独立产品卡片仍来自 `4.产品列表/` 各个文件，不生成第二份产品清单。

日期统一为 UTC 日历日期。类型错误、重复 id、格式错误和不存在的带引号日期阻止构建。未填写 id 时仍按文件名显示，但改名会改变链接，正式内容应填写稳定 id。

`pinned` 在 Obsidian 中注册为复选框，新建长文/书籍/产品默认未勾选。修改后需要重新上传才能改变网站。四个席位先按内容选择，再显示有封面的项；缺图不以第五篇补位。只影响所属栏目，不改变首页最近更新、RSS、搜索与详情前后篇的日期排序。

`date` 是手填内容日期，不读取文件修改时间。产品内部 `launchDate` 由 `date` 派生，无页面消费者；直接填 `launchDate`、`cover`、`buyUrl` 不会代替源字段。YAML `type` 不决定栏目；`draft`、`publish`、`status`、`slug`、`order` 没有契约语义，草稿应放在已声明的发布栏目之外。

### 长文示例（仅文档示例，模板没有实际文章）

```markdown
---
id: "essay-20261002-001"
title: "文章标题"
subtitle: "补充说明"
description: "一段文章简介。"
tags: [AI, 工作流]
date: "2026-10-02"
pinned: false
image: "[[essay-20261002-001-cover.webp]]"
---

## 一个问题

文章正文。

![[essay-20261002-001-diagram.webp|640]]
```

## 首页与人生履历

首页仅允许一个 `id: home` 的 Markdown，下面 YAML 放在文件头部两行 `---` 之间：

```yaml
id: home
heroTitle: "我是赵子民。"
heroSubtitle: |-
  终身学习者，终身创业者。
  分享思考、阅读与创造。
heroImage: "[[author-avatar.png]]"
heroPortrait: "[[author-portrait.png]]"
socialLinks:
  email: "mailto:you@example.com"
  bilibili: "https://space.bilibili.com/your-id"
  tiktok: "https://www.douyin.com/user/your-id"
  x: "https://x.com/your-name"
  rss: "/feed.xml"
```

`heroPortrait` 对应首页上方通铺背景，`heroImage` 对应关于页与全站页脚头像，首页首屏不显示这个头像。`heroSubtitle` 第一行用作身份，后续行用作首页介绍；桌面关于页使用整段，手机隐藏该介绍。首页正文和通用 title/image 不读取。新增 seoTitle/seoDescription/eyebrow/recentEnglish/recentTitle/recentDescription 控制对应首页文案与静态 SEO。首页和人生履历不支持密码字段。

页脚实际支持 bilibili、youtube、tiktok（抖音）、kuaishou、xiaohongshu、x、weibo、zhihu、email、rss。douyin/twitter/github 虽可保存在映射中，当前没有对应按钮。邮箱和 RSS 点击复制；其他平台打开新标签页。RSS 缺省使用当前网站 `/feed.xml`，显式空值可隐藏。

`5.关于/` 每个文件为一段经历：头部 `id`、`title`、`date`，正文为经历说明；id 在履历集合内唯一，按完整日期倒序，页面只显示年份。正文按纯文本显示、保留换行，不经过文章 Markdown 渲染器；鼠标移入自动展开，点击/键盘可固定展开。首页与履历不进入文章、搜索或 RSS 集合。

书籍 author/publisher 显示在详情按钮行右侧，与豆瓣入口共用一行，超长单行省略，publisher 只有 author 非空时才显示；rating 为 0 时显示阅读时长。产品 price 影响价格文字和付费颜色，link 只生成外链入口，不提供支付/订单能力。category 不参与关键词搜索，tags 也不参与；搜索只消费 title/subtitle/description/公开正文。

## 图片一一对应

- 图片文件名全站唯一，即使位于不同子目录也不能同名。构建展平到 `/images/<文件名>`。
- `[[路径/图片.webp]]` 与 `![[路径/图片.webp|宽度]]` 按文件名匹配；中文与空格会编码。
- Obsidian 上传 `image`，网站适配为 `cover`；产品上传 `link`，适配为 `buyUrl`，不要把源字段改名。
- 标准 Markdown 图片使用 `/images/<文件名>`；`./图片.webp` 等 vault 相对路径没有网站上下文，不会自动复制。
- X 帖子引用保持图片语法并独占一行。网站识别 x.com/twitter.com 的数字 status，不将它当附件上传。
- 缺失的本地封面、首页照片和正文图片会阻止发布。移除引用后删除图片，下次发布同步删除公开旧图片。
- 支持 PNG、JPG/JPEG、GIF、WebP、SVG、AVIF、APNG；Blog Publisher 9.0 支持全部类型。

## 更新与删除生效

一次完整上传：Markdown → 所有引用图片 → 发布命令。上传文件不直接覆盖线上产物。发布器复制当前文件成快照并核对复制前后哈希，变化时中止。

两站 `/deploy-info.json` 的 `releaseId` 与 `contentVersion` 一致，表示使用同一份文章与图片；`siteOrigin` 按部署域名生成。

Blog Publisher 9.0 提交完整批次，携带栏目身份清单，保留原始目录、相对路径和 frontmatter，差量上传引用图片；两站完成后才保存成功快照。元数据由同一内容契约适配，不另建分类表。

验证：`npm run check:content`，覆盖字段适配、移动/改名保留 id、分类增删、中文带空格图片、重复内容失败、缺图阻断、双站版本一致及 1Panel 镜像增删，测试数据仅在系统临时目录生成。

## 阅读授权

非空 password 只留在私有原稿。公开标题、简介、封面和共用图片；专属正文图片从公开包排除，缺图仍阻止发布。搜索和 RSS 不索引受保护正文。

服务器部署 Blog Publisher 阅读接口，私有发布配置填写 BLOG_READER_ORIGIN，接收服务配置 BLOG_READER_ORIGINS 精确允许两站。页面提交阅读密码成功后才取得正文与 30 分钟专属图片地址；刷新需要重新验密，不使用 localStorage 解锁标记。授权读者仍可复制内容，外部图片与历史公开内容不受保护。
