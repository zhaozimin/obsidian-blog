/**
 * [INPUT]: 依赖 content-contract 私有原稿、public-content 公开边界、path-safety 原子文件替换、marked 与外部图片，BLOG_READER_ORIGIN 提供验密服务域名
 * [OUTPUT]: 对外提供同源内容快照、地图、RSS 和由站点名称生成的图标
 * [POS]: 构建前的静态快照入口；同一目录契约供本地空模板与服务器上传数据共用，按 SITE_ORIGIN 生成，本机允许环回 HTTP 阅读接口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const fs = require('fs');
const path = require('path');
const { readContent, syncImages } = require('./content-contract.cjs');
const { publicSnapshot } = require('./public-content.cjs');
const { assertSeparate, writeAtomic } = require('./path-safety.cjs');

const contentDir = path.resolve(process.env.BLOG_CONTENT_DIR || path.join(__dirname, '../src/content'));
const outputDir = path.resolve(process.env.BLOG_PUBLIC_DIR || path.join(__dirname, '../public'));
const escapeXml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
const cdata = value => String(value || '').replace(/\]\]>/g, ']]]]><![CDATA[>');

// 生成数据
async function main() {
  try {
    assertSeparate(outputDir, contentDir, '公开输出目录不能覆盖内容原稿');
    console.log('📝 Generating blog data...');

    const siteUrl = new URL(process.env.SITE_ORIGIN || 'http://127.0.0.1:3002');
    if (!['http:', 'https:'].includes(siteUrl.protocol) || siteUrl.pathname !== '/' || siteUrl.search || siteUrl.hash || siteUrl.username || siteUrl.password) {
      throw new Error('SITE_ORIGIN 必须是完整的 http/https 站点域名，不能包含路径、查询参数或凭据');
    }
    const domain = siteUrl.origin;

    // RSS 与网站共用安全语义：原始 HTML 作为文字，地址只允许网页和邮箱。
    const { marked, Renderer } = await import('marked');
    const renderer = new Renderer(), renderLink = renderer.link, renderImage = renderer.image;
    renderer.html = ({ text }) => escapeXml(text);
    renderer.link = function(token) {
      let valid = false;
      try { valid = ['http:', 'https:', 'mailto:'].includes(new URL(token.href, domain).protocol); } catch { /* 无效地址只保留文字 */ }
      return valid ? renderLink.call(this, token) : this.parser.parseInline(token.tokens);
    };
    renderer.image = function(token) {
      let valid = false;
      try { valid = ['http:', 'https:'].includes(new URL(token.href, domain).protocol); } catch { /* 无效图片只保留说明 */ }
      return valid ? renderImage.call(this, token) : escapeXml(token.text);
    };

    let readerOrigin = '';
    if (process.env.BLOG_READER_ORIGIN) {
      const reader = new URL(process.env.BLOG_READER_ORIGIN);
      if ((reader.protocol !== 'https:' && !(reader.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(reader.hostname))) || reader.pathname !== '/' || reader.username || reader.password || reader.search || reader.hash) throw new Error('BLOG_READER_ORIGIN 必须为 HTTPS 域名，本机可使用环回 HTTP');
      readerOrigin = reader.origin;
    }
    if (!fs.existsSync(contentDir) || !fs.statSync(contentDir).isDirectory()) throw new Error(`内容目录不存在：${contentDir}`);
    const { data, privateImages, publicImages } = publicSnapshot(readContent(contentDir));
    const { articles, books, products, aboutStories, homeConfig, siteConfig, collections, allPosts } = data;
    if (allPosts.some(post => post.isProtected) && !process.env.BLOG_IMAGES_DIR) throw new Error('受保护文章必须使用源码外的 BLOG_IMAGES_DIR 图片目录');
    if (process.env.BLOG_IMAGES_DIR) syncImages(process.env.BLOG_IMAGES_DIR, path.join(outputDir, 'images'), { exclude: privateImages, include: publicImages });
    fs.mkdirSync(outputDir, { recursive: true });

    const appManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/manifest.json'), 'utf8'));
    Object.assign(appManifest, { name: siteConfig.name || '', short_name: siteConfig.name || '', description: homeConfig.seoDescription || '' });
    writeAtomic(path.join(outputDir, 'manifest.json'), JSON.stringify(appManifest, null, 2));
    const initial = [...String(siteConfig.name || '').trim()][0];
    if (!initial) writeAtomic(path.join(outputDir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#F6F6F4"/><circle cx="32" cy="32" r="5" fill="#A6402F"/></svg>');
    if (initial) writeAtomic(path.join(outputDir, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#F6F6F4"/><text x="8" y="45" fill="#161616" font-family="sans-serif" font-size="40" font-weight="700">${escapeXml(initial)}</text><circle cx="52" cy="49" r="3" fill="#A6402F"/></svg>`);

    // 写入数据文件
    writeAtomic(
      path.join(outputDir, 'blog-data.json'),
      JSON.stringify({ siteOrigin: domain, readerOrigin, articles, books, products, aboutStories, homeConfig, siteConfig, collections, allPosts }, null, 2)
    );

    console.log(`✅ Generated data for ${allPosts.length} posts`);
    console.log(`   - Articles: ${articles.length}`);
    console.log(`   - Books: ${books.length}`);
    console.log(`   - Products: ${products.length}`);
    console.log(`   - About Stories: ${aboutStories.length}`);

    // ==========================================
    // 生成 Sitemap.xml
    // ==========================================
    console.log('🗺️ Generating sitemap.xml...');

    const today = new Date().toISOString().split('T')[0];

    // HashRouter 的栏目和详情由 URL 片段区分；地图只列出真实的服务器入口。
    const staticPages = [
      { url: '/', priority: '1.0', changefreq: 'daily' },
    ];

    let sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    // 添加静态页
    staticPages.forEach(page => {
      sitemapContent += `
  <url>
    <loc>${domain}${page.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
    });

    sitemapContent += `
</urlset>`;

    writeAtomic(path.join(outputDir, 'sitemap.xml'), sitemapContent);
    console.log(`✅ Sitemap generated at ${path.join(outputDir, 'sitemap.xml')}`);

    // ==========================================
    // 生成 RSS Feed (RSS 2.0)
    // ==========================================
    console.log('📡 Generating RSS feed...');

    const rssDate = (dateStr) => {
      const date = dateStr ? new Date(dateStr) : new Date();
      return date.toUTCString();
    };

    let rssContent = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>${escapeXml(siteConfig.rssTitle || siteConfig.name || "")}</title>
  <link>${domain}</link>
  <description>${escapeXml(siteConfig.rssDescription || "")}</description>
  <language>zh-cn</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`;

    // 对文章进行排序（按日期倒序）
    const sortedPosts = [...allPosts].sort((a, b) => {
      return new Date(b.date || 0) - new Date(a.date || 0);
    });

    // 添加最近 20 篇文章
    sortedPosts.slice(0, 20).forEach(post => {
      const link = `${domain}/#/post/${encodeURIComponent(post.id)}`;

      // 处理副标题和简介
      let descText = '';
      if (post.subtitle && post.description) {
        descText = `${post.subtitle} - ${post.description}`;
      } else {
        descText = post.subtitle || post.description || '';
      }
      const safeDescription = descText.replace(/[#*`>]/g, '').trim();

      // 生成正文 HTML
      let contentHtml = post.isProtected ? '本文需要在网站输入阅读密码。' : post.content || '';
      contentHtml = marked(contentHtml, { renderer });

      // RSS 阅读器没有本站页面的路径上下文，正文图片使用当前部署域名。
      contentHtml = contentHtml.replace(/src="(\/images\/[^\"]+)"/g, (_, src) => `src="${new URL(src, domain).href}"`);

      rssContent += `
  <item>
    <title><![CDATA[${cdata(post.title)}]]></title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <pubDate>${rssDate(post.date)}</pubDate>
    <description><![CDATA[${cdata(safeDescription)}]]></description>
    <content:encoded><![CDATA[${cdata(contentHtml)}]]></content:encoded>
  </item>`;
    });

    rssContent += `
</channel>
</rss>`;

    writeAtomic(path.join(outputDir, 'feed.xml'), rssContent);
    console.log(`✅ RSS Feed generated at ${path.join(outputDir, 'feed.xml')}`);

  } catch (error) {
    console.error('❌ Error generating data:', error);
    process.exit(1);
  }
}

main();
