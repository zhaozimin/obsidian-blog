# scripts/
> L2 | 父级: ../CLAUDE.md

成员清单
parse-frontmatter.cjs: 标准 YAML 映射解析，关闭 gray-matter 的 JavaScript/JSON 语言引擎，内容与栏目不能执行上传代码
content-images.cjs: marked token 识别真实 Markdown 图片和可点击附件链接，代码与原始 HTML 不算公开资源，供图片边界和产物检查共用
path-safety.cjs: 真实路径解析、公开资源符号链接拒绝与原子文件替换，别名不能绕过原稿隔离或 Vite 清理边界
catalog.cjs: 栏目笔记声明稳定身份，目录决定名称和顺序，旧目录映射只供历史快照读取
content-contract.cjs: 私有原稿的字段适配和布尔置顶校验，依赖 shared 隔离代码示例并剥离 %%注释%%（不经插件直接构建也不泄漏填写说明），递归分类、日历日期/id/密码长度校验与 Wiki 图片映射，空初始化允许空品牌，实际内容发布需名称/作者；镜像支持只读验证及排除受保护文章专属图片，复制成功后才切换目录
public-content.cjs: 公开数据安全边界，图片扫描隔离代码与 HTML 示例，移除密码与受保护正文，输出公开引用图集合与专属图片边界，供生成器与验密服务复用
content-contract.test.cjs: 临时数据验证符号链接隔离、代码/HTML 私图边界、原稿一致性、RSS 与字段映射、增删/移动、重复输入、缺图阻断及服务器双站构建/1Panel 镜像，以及空初始化/正式内容的品牌校验，不携带实际文章
generate-data.cjs: 原稿经 public-content 转公开快照/RSS/地图，按站点名生成图标，保护正文不入包，RSS 原始 HTML 与脚本地址隔离，阅读域名按部署目标生成
prepare-dist.cjs: 公开产物资源与私密数据检查，快照与原稿不一致、专属或未引用附件及符号链接会阻止发布，记录同源双站版本
publish.cjs: 阿里云发布目录锁与大陆/Cloudflare 目标锁，快照目录仅当前用户可读，UI 基准检查后顺序构建两站并调用 Wrangler 和 rsync；prepare 可独立生成部署包

法则: 成员完整·一行一文件·父级链接·技术词前置
frontend-regression.test.cjs: 置顶四席排序/链接与布尔网络边界，以及实际模块的 esbuild/React SSR 验证 URL、快照并发/恢复、授权地址、X status、远程媒体居中契约、Markdown/DOM/HTML、代码注入、搜索与 UI 校验防绕过，不读个人内容
check-ui-baseline.cjs: 拒绝未登记源码与重复覆盖，核验 ui-baseline.json 中的正式 UI 与扩展哈希，未授权修改时阻止通过

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

本轮契约：目录改名保持身份、栏目清单和笔记声明一致，配置不进入文章列表；重复初始化不增加文章，未声明目录停止发布。站点 SEO 与 manifest 从同一快照生成。

图片备份与发布分离：原始附件可完整保留，generate-data 仅镜像 publicSnapshot 的公开引用集合，prepare-dist 再拒绝未引用或受保护专属图。
