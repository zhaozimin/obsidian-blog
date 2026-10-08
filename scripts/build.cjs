/**
 * [INPUT]: 依赖 esbuild、插件源模块、mp-darkmode 的压缩版算法文本、manifest 与插件样式
 * [OUTPUT]: 对外提供 dist/main.js、manifest.json、styles.css 三文件安装包
 * [POS]: 插件打包边界；Obsidian API 与 CodeMirror 由宿主提供保持外部依赖，包中不携带用户 data.json 或运行内容。
 *        公众号深色算法以字符串内联（虚拟模块 darkmode-src）：预览在设备 iframe 自己的 window 里执行它，不碰 Obsidian 主文档
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');

const darkmodeText = {
  name: 'darkmode-text',
  setup(build) {
    build.onResolve({ filter: /^darkmode-src$/ }, () => ({ path: 'darkmode-src', namespace: 'darkmode' }));
    build.onLoad({ filter: /.*/, namespace: 'darkmode' }, () => ({
      contents: `module.exports = ${JSON.stringify(fs.readFileSync(require.resolve('mp-darkmode/dist/darkmode.min.js'), 'utf8'))};`,
      loader: 'js'
    }));
  }
};

async function build() {
  fs.mkdirSync(dist, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(root, 'plugin/main.js')], outfile: path.join(dist, 'main.js'),
    bundle: true, platform: 'browser', format: 'cjs', external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
    target: 'es2022', minify: true, sourcemap: false, plugins: [darkmodeText], legalComments: 'inline', logLevel: 'warning',
    banner: { js: '/* [INPUT]: Obsidian API 与本地设置\n * [OUTPUT]: BlogPublisherPlugin\n * [POS]: plugin/ 模块的生成安装包，源代码见 plugin/main.js\n * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md\n */' }
  });
  for (const [source, target] of [['manifest.json', 'manifest.json'], ['plugin/styles.css', 'styles.css']]) fs.copyFileSync(path.join(root, source), path.join(dist, target));
  process.stdout.write('插件三文件安装包已生成。\n');
}

build().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
