/**
 * [INPUT]: 依赖 esbuild、插件源模块、manifest 与主题样式
 * [OUTPUT]: 对外提供 dist/main.js、manifest.json、styles.css 三文件安装包
 * [POS]: 插件打包边界；Obsidian API 保持外部依赖，包中不携带用户 data.json 或运行内容
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(root, 'plugin/main.js')], outfile: path.join(dist, 'main.js'),
  bundle: true, platform: 'browser', format: 'cjs', external: ['obsidian'],
  target: 'es2022', minify: true, sourcemap: false,
  banner: { js: '/* [INPUT]: Obsidian API 与本地设置\n * [OUTPUT]: BlogPublisherPlugin\n * [POS]: plugin/ 模块的生成安装包，源代码见 plugin/main.js\n * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md\n */' }
});
for (const [source, target] of [['manifest.json', 'manifest.json'], ['plugin/styles.css', 'styles.css']]) fs.copyFileSync(path.join(root, source), path.join(dist, target));
process.stdout.write('插件三文件安装包已生成。\n');
