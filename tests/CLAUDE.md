# tests/
> L2 | 父级: ../CLAUDE.md

成员清单
publisher.test.cjs: HTTP 鉴权、上传完整性、路径逃逸、构建失败、互斥与幂等重试测试，临时目录作为唯一运行数据
plugin.test.cjs: 递归笔记与引用图片，验证成功快照时机、上传失败停止、断线恢复与常驻状态
reader.test.cjs: 合成受保护文章验证 HTTP 验密、禁止匿名取文、猜测限速、精确 CORS、限时专属图片与版本失效

wechat.test.cjs: 合成图文、模拟官方接口、重复草稿与不确定结果恢复
cloudflare.test.cjs: 真实构建配合注入云接口，验证密码派生、Worker 阅读、图片签名、先私有后公开和失败保留旧版

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

本轮契约：目录改名保持身份、栏目清单和笔记声明一致，配置不进入文章列表；重复初始化不增加文章，未声明目录停止发布。站点 SEO 与 manifest 从同一快照生成。
