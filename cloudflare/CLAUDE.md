# cloudflare/
> L2 | 父级: ../CLAUDE.md

成员清单
worker.mjs: Workers 静态资源与私有 R2 阅读入口，只验证文章密码和限时图片授权，不接收发布密钥或公众号账号

本机 Node 负责完整快照、构建与公众号；Worker 只消费成功发布的公开资源和同版本私有快照。私有正文不放入静态包，R2 对象以发布版本隔离。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
