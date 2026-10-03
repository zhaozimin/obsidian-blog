# deploy/
> L2 | 父级: ../CLAUDE.md

成员清单
receiver.env.example: 私有服务器配置的空值示例，账号可稍后填写
blog-publisher.service: 非 root 服务与运行目录写权限，公网通过反向代理
nginx-location.conf: HTTPS 站点内的同源代理，API 禁缓存与访问日志
compose.yml: 完整系统容器与独立运行卷，端口只映射至主机环回

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
