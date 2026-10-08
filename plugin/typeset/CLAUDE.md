# plugin/typeset/
> L2 | 父级: ../CLAUDE.md

排版预览：边写边看同一篇笔记在公众号（手机 / 电脑 / 深色）与 X Articles（手机 / 网页）上的样子，一键复制、体检标记、标点规范化。
由原「排版预览」插件（paiban-preview）并入；分层与依赖方向是 index → 视图 → shared/typeset 内核，内核不依赖 Obsidian/DOM，服务端也能直接引用。
预览与复制走同一个渲染器，只差 mode：preview 带 data-line、显示本地真图；copy 干净、本地图片留占位。

成员清单
index.js: 控制器（原插件编排中心），registerTypeset 注册两个视图、侧栏图标、五条命令与编辑/滚动监听；追踪当前在写的那篇（换面板走 active-leaf-change，同一面板换笔记走 file-open），editor-change 防抖刷新，CM6 updateListener 驱动预览跟随，预览点击回跳编辑器；设置住在 Blog Publisher 的 settings.typeset
preview-view.js: PreviewView（侧栏单设备 + 切换 + 复制 + 体检面板）与 CompareView（主区四设备并排）；每台设备单独兜错，尺寸变化时补画 pending 的设备；视图类型 id 沿用 paiban-preview / paiban-compare，已保存的面板重启后原位接管
device-frame.js: 一台设备 = 一个同源 iframe；浅色常驻只换正文，公众号深色每次新建 iframe 跑 mp-darkmode；实测长段、无标题区与深色亮斑；外壳写好文档才算建成，视图未挂上页面时记 pending 等挂上补画，画不出来把原因写在设备里（真机教训：半成品 iframe 会让预览永远空白）
devices.js: 四种设备外壳规格与 iframe 内 CSS；公众号数值为 2026-10 实测，X 为近似待校准；预览叠层（体检标记、本地图片提示）
compose.js: 视图与内核的唯一编排点，预览/复制同源，页头署名，HTML→纯文本
normalize-modal.js: 标点规范化确认框，逐行前后对照与只提醒项；空格与空行交给离开即整理

深色算法 darkmode-src 是构建期虚拟模块（scripts/build.cjs 内联 mp-darkmode 压缩版文本），只在设备 iframe 自己的 window 里执行。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
