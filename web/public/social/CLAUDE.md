# public/social/
> L2 | 父级: ../CLAUDE.md

职责边界：SocialButton 加载 App Store 的 512×512 原图，统一复用邮箱的 36px 纸墨按钮；图像完整显示为 30px 方形，CSS 灰度/透明度控制默认与悬停状态，原图颜色保持不变。

成员清单
bilibili.jpg: 512×512 哔哩哔哩 App 原图，开发者 Shanghai Bilibili Animation Co.,Ltd，来源 [App Store](https://apps.apple.com/cn/app/id736536022)
youtube.jpg: 512×512 YouTube App 原图，开发者 Google LLC，来源 [App Store](https://apps.apple.com/us/app/id544007664)
douyin.jpg: 512×512 抖音 App 原图，开发者 Beijing Douyin Technology Co., Ltd.，来源 [App Store](https://apps.apple.com/cn/app/id1142110895)
kuaishou.jpg: 512×512 快手 App 原图，开发者 Beijing Kwai Technology Co., Ltd.，来源 [App Store](https://apps.apple.com/cn/app/id440948110)
xiaohongshu.jpg: 512×512 小红书 App 原图，开发者 Xingin Information Technology (Shanghai) Co., Ltd，来源 [App Store](https://apps.apple.com/cn/app/id741292507)
x.jpg: 512×512 X App 原图，开发者 X Corp.，来源 [App Store](https://apps.apple.com/us/app/id333903271)
weibo.jpg: 512×512 微博 App 原图，开发者 SINA Corporation，来源 [App Store](https://apps.apple.com/cn/app/id350962117)
zhihu.jpg: 512×512 知乎 App 原图，开发者 Beijing Zhizhetianxia Technology Co., Ltd.，来源 [App Store](https://apps.apple.com/cn/app/id432274380)

来源核对于 2026-10-01，通过 Apple Lookup 按平台、开发者与商店 ID 验证后，从 Apple mzstatic CDN 原样保存 JPEG。替换旧 favicon 素材，不保留重复资源。默认灰度和 .65 透明度，悬停或键盘聚焦恢复完整颜色；X 原生黑白，保留正式配色。RSS 与邮箱仍由 lucide-react 绘制。

法则: 成员完整·一行一文件·父级链接·技术词前置
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
