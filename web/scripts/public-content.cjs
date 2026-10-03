/**
 * [INPUT]: 依赖私有文章集合、本地图片引用和 shared 代码片段隔离
 * [OUTPUT]: 对外提供 publicSnapshot、localImageNames、assertPublicSnapshot，隔离密码、受保护正文及专属图片
 * [POS]: 构建的公开数据边界；接收服务保留完整原稿，静态站只接收公开元数据，正文经服务器验密后读取
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
function localImageNames(content) {
  const { splitCode } = require('../../shared/markdown-parts.cjs');
  content = splitCode(content || '').filter(part => !part.code).map(part => part.text).join('');
  const names = new Set();
  for (const match of (content || '').matchAll(/\]\((\/images\/[^)]+)\)|\bsrc=["'](\/images\/[^"']+)["']/gi)) {
    const value = (match[1] || match[2]).replace(/\s+["'][^"']*["']$/, '');
    try {
      const name = decodeURIComponent(new URL(value, 'https://local.invalid').pathname.slice('/images/'.length));
      if (name && !name.includes('/') && /\.(png|jpe?g|gif|webp|svg|avif|apng)$/i.test(name)) names.add(name);
    } catch { /* 无效引用由构建的资源检查阻止 */ }
  }
  return names;
}
function publicSnapshot(source) {
  const privateImages = new Set(), publicImages = new Set();
  const publicPost = post => {
    const { password, ...metadata } = post;
    return { ...metadata, content: password ? '' : post.content, isProtected: Boolean(password) };
  };
  for (const post of source.allPosts) {
    for (const name of localImageNames(post.content)) (post.password ? privateImages : publicImages).add(name);
    for (const name of localImageNames(`![](${post.cover || ''})`)) publicImages.add(name);
  }
  for (const story of source.aboutStories) for (const name of localImageNames(story.content)) publicImages.add(name);
  for (const field of ['heroImage', 'heroPortrait']) for (const name of localImageNames(`![](${source.homeConfig[field] || ''})`)) publicImages.add(name);
  for (const collection of source.collections || []) for (const name of localImageNames(`![](${collection.cover || ''})`)) publicImages.add(name);
  for (const name of publicImages) privateImages.delete(name);
  const data = {
    ...source, articles: source.articles.map(publicPost), books: source.books.map(publicPost),
    products: source.products.map(publicPost), allPosts: source.allPosts.map(publicPost)
  };
  assertPublicSnapshot(data);
  return { data, privateImages };
}
function assertPublicSnapshot(data) {
  for (const key of ['articles', 'books', 'products', 'allPosts']) {
    for (const post of data[key] || []) {
      if (Object.hasOwn(post, 'password')) throw new Error('公开数据不能包含文章密码');
      if (post.isProtected && post.content !== '') throw new Error('公开数据不能包含受保护文章正文');
    }
  }
}
module.exports = { publicSnapshot, localImageNames, assertPublicSnapshot };
