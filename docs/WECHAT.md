# 微信公众号草稿

本系统只创建或更新草稿，不直接发表或群发。默认排版配置为 `{}`，正式写作风格尚未定义；基础排版仅用于功能验证。

## 账号接入

在服务端私有环境文件中设置：

```dotenv
WECHAT_APP_ID=
WECHAT_APP_SECRET=
WECHAT_API_BASE=https://api.weixin.qq.com
WECHAT_ADAPTER_MODULE=
```

重启服务，在公众号后台确认草稿与素材接口权限，将服务实际出口 IP 加入白名单。服务器方案使用服务器出口，Cloudflare 博客方案的公众号仍在本机 Node 中运行，需处理本机出口变化或使用自己的固定出口/独立接口。博客 Worker 不直接承担公众号发布，也不提供固定出口。账号留空时预览可用，保存草稿返回未配置提示。插件保存服务地址和访问密钥，不保存公众号 AppSecret。

## 排版配置

笔记库 `发布配置/公众号排版.json` 是唯一排版配置来源。当前文件为 `{}`。可选字段如下：

| 字段 | 默认 | 可用范围 |
| --- | --- | --- |
| fontSize | 16 | 12–24 像素 |
| lineHeight | 1.8 | 1.2–2.5 |
| paragraphGap | 18 | 0–48 像素 |
| headingSize | 22 | 16–36 像素 |
| color | #262626 | 六位十六进制颜色 |
| accent | #4b5563 | 六位十六进制颜色 |
| fontFamily | system-ui, sans-serif | 字体名称与安全回退列表 |

不接受任意 CSS 或脚本。以后明确正式风格后再扩展必要排版项；手机实际字体取决于设备与公众号保留能力，需真实草稿预览验收。

## 内容支持

标题、段落、强调、列表、引用、代码块、表格、本地图片、常用 LaTeX 行内与独立公式。代码使用内联着色；表格自动换行；公众号公式转换为 PNG，博客公式由 KaTeX 显示，原始笔记不改写。两种公式引擎的高级命令支持可能不同，常用 AMS 公式纳入验收。

原始 HTML 作为文字显示。远程图片需先保存为本地附件。图片自动限宽和压缩，处理不覆盖原件；动画图片目前取首帧。字体、复杂表格和高阶公式的最终视觉一致性需在自己的公众号后台和手机预览确认。

## 文章属性

`id` 必须稳定；标题取 `title`。封面优先 `wechatCover`，其次 `image`/`cover`，再取正文首张本地图片。`wechatAuthor`（最多 8 字）、`wechatDigest`（最多 120 字，默认 description）、`wechatSourceUrl` 为可选属性。

每篇笔记、每个账号分别记录草稿标识，重复保存同一版本复用；修改更新原单篇草稿。后台直接改动、发表或删除草稿后，需要核对对应状态；已发表内容不承诺自动同步。若新增请求断线导致结果不明，暂停新增，检查后台后可把真实标识填入 `wechatDraftId`，重新预览再更新。只允许独立单篇草稿，避免覆盖多篇图文中的其他内容。

## 自定义接口

有两种接入方式：插件配置独立的公众号服务地址/访问密钥；或服务端设置 `WECHAT_ADAPTER_MODULE` 为私有适配模块的绝对路径。模块导出 `createAdapter(env)`，返回：

```js
// [INPUT]: 用户私有账号环境与自己的接口客户端
// [OUTPUT]: 与默认 WechatApi 一致的草稿适配对象
// [POS]: 私有替换模块，不放入公开笔记库模板
// [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
exports.createAdapter = env => ({
  accountId: '使用者自己的稳定账号标识',
  configured: () => false,
  upload: async (bytes, cover) => { /* cover=true 返回素材 media_id，否则返回图片 URL */ },
  add: async article => { /* 返回新增单篇草稿 media_id */ },
  update: async (mediaId, article) => { /* 返回更新后的 media_id */ },
  get: async mediaId => { /* 返回 { news_item: [单篇文章] } */ }
});
```

这是接口契约示例，需要实现实际请求后才能启用。账号标识改变会隔离上传记录。已知拒绝可抛 `ApiError`；网络结果不明应抛 `WECHAT_NETWORK`，不能把未知结果当成功。

插件 HTTP 契约：Bearer 鉴权；`GET /api/wechat/health` 返回配置状态；`POST /api/wechat/preview` 接收文章、样式和引用图片，返回 `previewId/html`；`POST /api/wechat/drafts` 仅提交冻结的 `previewId`。草稿状态、正文与图片在私有运行目录中，响应不返回账号密钥。

官方接口入口：[新增草稿](https://developers.weixin.qq.com/doc/offiaccount/Draft_Box/Add_draft.html)。开发时以本机模拟服务验证请求路径和结构；未配置真实账号，接口权限和真实版式仍待实测。
