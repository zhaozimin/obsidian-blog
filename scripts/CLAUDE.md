# scripts/
> L2 | 父级: ../CLAUDE.md

成员清单
build.cjs: 将插件模块打包为 Obsidian 的 main.js，生成三文件安装包
install.cjs: 备份已有插件至项目外并安装三文件包；保留笔记库 data.json
check-public.cjs: 检查可发布源码集合中不存在本地设置、私钥、个人内容或实际服务器配置

make-template.cjs: 生成单插件空笔记库与教程，无文章和本机设置
setup.cjs: 幂等安装模板并生成私有本机配置，不覆盖已有文件
cloudflare.cjs: Cloudflare 私有配置和空站首次部署，记录实际网址；日常更新交回插件发布事务
check-cloudflare.cjs: CI 使用真实 Wrangler 验证 Worker/资源/绑定，dry-run 不需要账号或执行部署

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
