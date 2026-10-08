/**
 * [INPUT]: 依赖私有文章集合与 content-images 的 Markdown token 扫描
 * [OUTPUT]: 对外提供 publicSnapshot、localImageNames、assertPublicSnapshot，输出公开图片集合并隔离密码、受保护正文及专属图片
 * [POS]: 构建的公开数据边界；接收服务保留完整原稿，静态站只接收公开元数据，正文经服务器验密后读取
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { imageSources } = require('./content-images.cjs');
function localImageNames(content) {
  const names = new Set();
  for (const value of imageSources(content)) {
    if (!value.startsWith('/images/')) continue;
    const name = decodeURIComponent(new URL(value, 'https://local.invalid').pathname.slice('/images/'.length));
    if (!name || /[/\\\x00-\x1f\x7f]/.test(name)) throw new Error('本地图片引用必须使用有效的扁平文件名');
    if (/\.(png|jpe?g|gif|webp|svg|avif|apng)$/i.test(name)) names.add(name);
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
  return { data, privateImages, publicImages };
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
