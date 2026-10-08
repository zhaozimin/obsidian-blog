/**
 * [INPUT]: 依赖 local-runtime 的外部目录与 Node 私有环境文件加载能力
 * [OUTPUT]: 对外提供 dev:system 启动入口和 runtime:path 路径查询
 * [POS]: 本机服务生命周期入口；配置留在源码之外，服务职责仍由 server/index.cjs 承担
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const path = require('node:path');
const { local } = require('./local-runtime.cjs');
if (process.argv.includes('--path')) process.stdout.write(`${local}\n`);
else {
  try { process.loadEnvFile(path.join(local, 'server.env')); }
  catch { process.stderr.write('本机配置尚未生成，请先执行 setup --local；运行位置可用 npm run runtime:path 查询。\n'); process.exit(1); }
  require('../server/index.cjs');
}
