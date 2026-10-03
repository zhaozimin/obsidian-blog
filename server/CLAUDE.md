# server/
> L2 | 父级: ../CLAUDE.md

成员清单
index.cjs: 私有环境启动与停止，按 server/cloudflare 模式组装发布器、阅读和公众号服务
http.cjs: 同源静态入口、独立阅读路由和 Bearer 鉴权发布/公众号路由，业务错误不泄露底层响应
reader.cjs: 成功批次验密、限速与限时图片授权，复用共用图片改写保持代码示例
store.cjs: 内容批次与完整性检查、互斥发布、成功指针和失败恢复
publisher.cjs: 历史外部发布命令适配，复用 web 的内容契约
local-publisher.cjs: 共用构建事务，可选云部署成功后切换本机产物，失败保留旧站
cloudflare-publisher.cjs: Wrangler 配置与发布适配，版本隔离私有 R2 对象先于公开部署，密码只保留派生值
static.cjs: 只提供公开构建文件，禁止访问源码与私有数据
wechat-render.cjs: Markdown 内联排版、代码/表格和 MathJax 公式图片，输入 HTML 不执行
wechat-api.cjs: 官方账号 token/图片/草稿请求，可配置接口地址，不发表或群发
wechat.cjs: 预览冻结与草稿保存事务，账号隔离、幂等更新及结果不明时暂停新增

依赖方向：HTTP → 事务服务 → 注入适配器；公众号渲染与官方账号配置解耦，账号留空时仍可预览。博客和公众号成功记录互不影响。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
