# scripts/
> L2 | 父级: ../CLAUDE.md

成员清单
build.cjs: 将插件模块打包为 Obsidian 的 main.js，生成三文件安装包；Obsidian 与 CodeMirror 保持外部依赖，mp-darkmode 深色算法以虚拟模块 darkmode-src 文本内联
install.cjs: 先校验三文件与真实路径，再备份安装，失败回滚；保留笔记库 data.json
check-public.cjs: 检查源码集合，拒绝环境文件变体、私有云目录、符号链接、凭据和个人内容

make-template.cjs: 生成单插件空笔记库与置顶复选框类型、四类写作模板、带分栏新建按钮的控制台、置顶列及包含 X 帖子写法的教程，无文章和本机设置
setup.cjs: 合并注册置顶复选框并保留已有属性类型、栏目和笔记，拒绝符号链接逃逸，在外部目录生成并正确解析私有配置
cloudflare.cjs: 使用外部运行目录保存 Cloudflare 私有配置并首次部署空站；日常更新交回插件发布事务
check-cloudflare.cjs: CI 使用真实 Wrangler 验证 Worker/资源/绑定，dry-run 不需要账号或执行部署

local-runtime.cjs: setup、Cloudflare、安装与启动共享真实路径边界；解析符号链接，按安装路径隔离数据，拒绝源码嵌套
start-local.cjs: 从外部私有环境启动原服务，--path 查询目录，不改变服务协议

audit.test.cjs: 隔离临时源码与笔记库，验证安装、真实路径、配置解析、两渠道图片语法及公开源码拒绝规则

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
