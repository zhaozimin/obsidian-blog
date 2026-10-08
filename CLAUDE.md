# Obsidian Blog System - 一份笔记，博客与公众号两条发布渠道
React + TypeScript + Vite + Obsidian API + CodeMirror 6 + Node 22 + marked + MathJax + sharp + mp-darkmode + Cloudflare Workers/R2

<directory>
web/ - 空白博客前端和唯一博客内容契约
plugin/ - 单插件：中控台按钮与新建、写作模板、图片转换命名、离开即整理、公众号/X 排版预览、博客同步、公众号预览与草稿上传 (1子目录: typeset/ 排版预览视图)
server/ - 私有上传事务、受保护阅读、静态网站与公众号官方接口适配
cloudflare/ - 无服务器方案的静态资源与私有 R2 阅读 Worker
scripts/ - 构建、空白模板安装、公开文件检查
shared/ - 插件、服务端与网站构建共用的 Markdown 代码隔离与注释剥离 (1子目录: typeset/ 排版纯函数)
vault-template/ - 无个人文章、照片与凭据的笔记库模板
测试位于 tests/，部署示例位于 deploy/。
</directory>

<config>
package.json - 完整系统构建、UI 基准验证、安装、外部运行目录查询与 Cloudflare 初始化入口
README.md - 部署选择、可复制 AI 提示词与日常映射
AGENTS.md - Agent 安装和维护边界，路由至部署教程
manifest.json - 单插件身份和发行版本
Dockerfile - 可选服务器镜像，持久数据独立存放
</config>

数据流：Obsidian Markdown 和引用附件 → 插件；博客完整快照 → 私有 BatchStore → web 内容契约 → 原子静态发布；选中文章 → 独立公众号预览 → 确认 → 官方草稿接口。两条渠道的成功记录独立，不自动群发。独立 X status 图片语法在博客浏览器中转为官方卡片，不进入本地附件集合。公式在公众号版本中转为 PNG，原始笔记不改写。
公众号排版配置为空时，插件填入排版预览选中风格（素 / 墨 / 白衬衫）的同名 7 个参数；渲染器仍是服务端 marked + MathJax，预览与草稿的结构样式尚未同源。AppID、AppSecret 与接口地址由服务器私有配置提供，不进入笔记内容和发行包；自定义适配模块必须实现与官方适配器相同的能力。
服务器方案：Node 接收、构建并提供同源网站，公网经 HTTPS 反向代理。Cloudflare 方案：同一 Node 服务留在用户本机，构建后由 Wrangler 上传 Worker 静态资源；密码正文与专属图片留在私有 R2，Worker 使用共用密码/授权协议验密。电脑关闭后已发布网站仍可访问，写作上传和公众号需要本机服务启动。
默认本机 HTTP 仅允许环回地址。个人双站发布器仅作为兼容入口，通用发行按用户选择使用服务器或 Cloudflare。
维护验收：npm run check 包含安装/服务/前端/内容回归、正式 UI 基准、空白构建、公开边界与 Worker dry-run。内容解析只接受 YAML 映射；原始 HTML 与代码示例不执行。静态站与验密正文按同一已提交发布批次读取，提交记录写盘失败回滚指针。审计说明见 docs/CODE-AUDIT-2026-10-03.md。
法则：极简·稳定·导航·版本精确。

正式 UI 由 web/ui-baseline.json 锁定；公开版保留既有页面与基础样式，公式/表格样式位于正文扩展模块。本机配置和运行历史只写源码之外的 local-runtime 目录。

写作数据流：中控台 blog-button → 按栏目 id 新建 → 库内「模板」文件夹（缺失用内置）只填 id/title/date，字段说明住在 %%注释%%，任何发布出口剥离；图片进库先转 WebP、再由作者起名，存进附件；改过的笔记离开时按 shared/typeset/format 整理，正在写的那篇不动；排版预览用 shared/typeset 渲染公众号与 X，公众号草稿在没有单独排版配置时沿用预览风格的同名 7 键。

置顶数据流：插件/模板注册 pinned 复选框 → 采集与构建校验布尔字段 → 网络快照兼容旧笔记 → collection.ts 统一选取每栏目最新四篇 → 列表优先和可交互封面共用身份。缺封面不补第五篇，初始化不修改旧文章。
