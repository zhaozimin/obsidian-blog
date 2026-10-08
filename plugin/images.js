/**
 * [INPUT]: 依赖 Obsidian Modal/Setting/TFile/MarkdownView、编辑器粘贴/拖放事件与 Vault 新建事件、
 *          FileManager 的附件路径/链接/改名，浏览器图片解码（createImageBitmap + canvas）
 * [OUTPUT]: 对外提供 registerImages、cleanImageName、suggestImageName、IMAGE_EXTENSION
 * [POS]: 图片入口：任何进入笔记库的图片都先转 WebP、再由作者起名，最后存进附件目录。
 *        编辑器里粘贴/拖入的由插件接管，链接每张独占一行插入；从文件列表拖入、从访达复制等其他途径进来的，
 *        在新建事件里补问名字、转码并挪进附件，笔记里的链接随改名更新。转完更大、动图、矢量图与解不开的格式原样保存
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { Modal, Setting, TFile, MarkdownView } = require('obsidian');

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|svg|bmp|tiff?|heic|heif|avif|apng)$/i;
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/tiff': 'tif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/avif': 'avif', 'image/apng': 'apng' };
const MIME = Object.fromEntries(Object.entries(EXTENSIONS).map(([mime, extension]) => [extension, mime]));
MIME.jpeg = 'image/jpeg'; MIME.tiff = 'image/tiff';
/** 不转码：动图转了只剩第一帧，矢量图转了会糊，WebP 已经是目标格式 */
const KEEP = new Set(['image/gif', 'image/apng', 'image/svg+xml', 'image/webp']);
/** 这类原名没有信息量，建议名改用笔记名 */
const GENERIC = /^(image|img|pasted image.*|截屏.*|截图.*|屏幕快照.*|screenshot.*|screen shot.*|未命名.*|untitled.*|img_\d+|dsc_?\d+)$/i;

// ============================================================
//  名字
// ============================================================

/** 作者起的名字只去掉会弄坏路径与双链的符号，空格保留、连续空白收成一个 */
function cleanImageName(value) {
  return String(value || '').replace(/[\\/:*?"<>|#^[\]{}\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80);
}

/** 建议名：原文件名有意义就用原名，截图之类没意义的原名就用笔记名 */
function suggestImageName(fileName, noteName = '') {
  const base = String(fileName || '').replace(/\.[^.]+$/, '');
  return cleanImageName(GENERIC.test(base.trim()) || !cleanImageName(base) ? noteName : base);
}

const extensionOf = (name, mime = '') => EXTENSIONS[mime] || (String(name).match(/\.([A-Za-z0-9]+)$/)?.[1] || 'png').toLowerCase();
const isImage = file => file.type?.startsWith('image/') || IMAGE_EXTENSION.test(file.name || '');

/** 发布要求全库图片不重名：重名在起名时就拦下 */
const nameTaken = (app, fileName, except) => app.vault.getFiles().some(item => item.name === fileName && item !== except);

// ============================================================
//  起名窗口
// ============================================================

class NameImageModal extends Modal {
  constructor(app, options, resolve) {
    super(app);
    this.options = options; this.resolve = resolve; this.answer = { name: null, keepRest: false };
  }
  onOpen() {
    const { contentEl, options } = this;
    let value = options.suggestion;
    this.titleEl.setText(options.total > 1 ? `给图片起个名字（${options.index}/${options.total}）` : '给图片起个名字');
    if (options.preview) contentEl.createEl('img', { cls: 'blog-image-name-preview', attr: { src: options.preview, alt: '' } });
    const hint = contentEl.createEl('p', { cls: 'blog-image-name-hint' });
    const check = () => {
      const name = cleanImageName(value), taken = name && options.taken(`${name}.${options.extension}`);
      hint.setText(!name ? '名字不能为空' : taken ? `已有同名图片「${name}.${options.extension}」，换个名字` : `将保存为 ${name}.${options.extension}，存进附件文件夹`);
      hint.toggleClass('blog-publisher-warning', !name || Boolean(taken));
      return name && !taken ? name : null;
    };
    const submit = keepRest => { const name = check(); if (!name) return; this.answer = { name, keepRest }; this.close(); };
    new Setting(contentEl).setName('图片名').addText(input => {
      input.setValue(value).onChange(next => { value = next; check(); });
      // 中文输入法回车是选字，不是提交
      input.inputEl.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); submit(false); } });
      window.setTimeout(() => { input.inputEl.focus(); input.inputEl.select(); }, 0);
    });
    check();
    const buttons = new Setting(contentEl);
    buttons.addButton(button => button.setButtonText('不要这张').onClick(() => this.close()));
    if (options.total > 1 && options.index < options.total) buttons.addButton(button => button.setButtonText('这张和其余都用建议名').onClick(() => submit(true)));
    buttons.addButton(button => button.setButtonText('保存').setCta().onClick(() => submit(false)));
  }
  onClose() { this.contentEl.empty(); this.resolve(this.answer); }
}

const askName = (app, options) => new Promise(resolve => new NameImageModal(app, options, resolve).open());

// ============================================================
//  转码
// ============================================================

async function decode(blob) {
  // 按照片自带的方向摆正；老内核不认这个参数时退回默认
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch (error) { if (error instanceof TypeError) return createImageBitmap(blob); throw error; }
}

/** 转成 WebP；转不了返回 null。iPhone/iPad 的 Obsidian 编不出 WebP：照片退回 JPG，带透明的 PNG 原样保存 */
async function encode(blob, quality) {
  if (KEEP.has(blob.type) || !blob.type.startsWith('image/')) return null;
  let bitmap;
  try { bitmap = await decode(blob); } catch { return null; }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const toBlob = type => new Promise(resolve => canvas.toBlob(resolve, type, quality));
  const webp = await toBlob('image/webp');
  if (webp?.type === 'image/webp') return webp;
  if (blob.type !== 'image/jpeg') return null;
  const jpeg = await toBlob('image/jpeg');
  return jpeg?.type === 'image/jpeg' ? jpeg : null;
}

/** 先转码再起名：起名时就知道最终扩展名，重名检查才准 */
async function prepare(blob, quality) {
  const encoded = await encode(blob, quality);
  const smaller = Boolean(encoded) && encoded.size < blob.size;
  return { output: smaller ? encoded : blob, converted: smaller, failed: !encoded && !KEEP.has(blob.type), extension: smaller ? EXTENSIONS[encoded.type] : null };
}

/** 附件放在 Obsidian 设置的附件位置；名字已经查过不重名 */
async function attachmentPath(app, fileName, sourcePath) {
  const probe = await app.fileManager.getAvailablePathForAttachment(fileName, sourcePath);
  const folder = probe.includes('/') ? probe.slice(0, probe.lastIndexOf('/')) : '';
  if (folder && !app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
  return folder ? `${folder}/${fileName}` : fileName;
}

function warn(plugin, failed) {
  if (failed.some(name => /\.hei[cf]$/i.test(name))) plugin.notice('HEIC 照片转不了格式，已原样保存；网站和公众号不认这种格式，建议先导出成 JPG。');
  else if (failed.length) plugin.notice(`${failed.length} 张图片没能转换，已按原格式保存。`);
}

// ============================================================
//  编辑器里粘贴 / 拖入：插件接管，起名后插入链接
// ============================================================

async function importIntoNote(plugin, files, note, editor) {
  const { app } = plugin, links = [], failed = [];
  let keepRest = false;
  for (const [index, file] of files.entries()) {
    const { output, converted, failed: broken, extension } = await prepare(file, plugin.settings.imageQuality);
    const finalExtension = extension || extensionOf(file.name, file.type);
    const taken = fileName => nameTaken(app, fileName);
    let name = suggestImageName(file.name, note.basename);
    if (!keepRest || !name || taken(`${name}.${finalExtension}`)) {
      const preview = URL.createObjectURL(output);
      const answer = await askName(app, { preview, suggestion: name, extension: finalExtension, taken, index: index + 1, total: files.length });
      URL.revokeObjectURL(preview);
      if (!answer.name) continue;
      name = answer.name; keepRest = answer.keepRest;
    }
    if (broken && !converted) failed.push(file.name);
    const path = await attachmentPath(app, `${name}.${finalExtension}`, note.path);
    plugin.imageWrites.add(path);
    const created = await app.vault.createBinary(path, await output.arrayBuffer());
    links.push(`!${app.fileManager.generateMarkdownLink(created, note.path)}`);
  }
  if (links.length) insertOnOwnLines(editor, links);
  warn(plugin, failed);
}

/** 博客里图片是一整块：每张独占一行，光标前后有字就各补一个换行，不和文字或上一张图挤在同一行 */
function insertOnOwnLines(editor, links) {
  const cursor = editor.getCursor('from'), line = editor.getLine(cursor.line);
  const before = line.slice(0, cursor.ch).trim(), after = line.slice(editor.getCursor('to').ch).trim();
  editor.replaceSelection(`${before ? '\n' : ''}${links.join('\n')}${after ? '\n' : ''}`);
}

// ============================================================
//  其他途径进库的图片：补问名字、转码、挪进附件
// ============================================================

/**
 * 链接还没进元数据缓存时（刚插入、尚未存盘），改名不会顺带改它：眼前这篇里指向旧名字的链接由这里补改。
 * 双链按原文认，Markdown 链接按原文与网址编码两种写法认；从后往前改，位置互不干扰。
 */
function relinkActiveEditor(app, oldName, newName) {
  const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
  if (!editor || oldName === newName) return;
  const text = editor.getValue();
  const pairs = [[`[[${oldName}`, `[[${newName}`], [`](${oldName}`, `](${newName}`]];
  if (encodeURI(oldName) !== oldName) pairs.push([`](${encodeURI(oldName)}`, `](${encodeURI(newName)}`]);
  const changes = [];
  for (const [find, replace] of pairs) {
    for (let at = text.indexOf(find); at >= 0; at = text.indexOf(find, at + find.length)) changes.push({ at, find, replace });
  }
  if (!changes.length) return;
  editor.transaction({
    changes: changes.sort((a, b) => b.at - a.at).map(({ at, find, replace }) => ({ from: editor.offsetToPos(at), to: editor.offsetToPos(at + find.length), text: replace }))
  });
}

async function adoptImage(plugin, file) {
  const { app } = plugin;
  if (!(app.vault.getAbstractFileByPath(file.path) instanceof TFile)) return;
  const bytes = await app.vault.readBinary(file);
  const original = new Blob([bytes], { type: MIME[file.extension.toLowerCase()] || '' });
  const { output, converted, failed, extension } = await prepare(original, plugin.settings.imageQuality);
  const finalExtension = extension || file.extension.toLowerCase();
  const note = app.workspace.getActiveFile();
  const answer = await askName(app, {
    preview: app.vault.getResourcePath(file), suggestion: suggestImageName(file.name, note?.extension === 'md' ? note.basename : ''),
    extension: finalExtension, taken: fileName => nameTaken(app, fileName, file), index: 1, total: 1
  });
  if (!answer.name || !(app.vault.getAbstractFileByPath(file.path) instanceof TFile)) return;
  const oldName = file.name;
  const target = await attachmentPath(app, `${answer.name}.${finalExtension}`, note?.path || '');
  if (target !== file.path) await app.fileManager.renameFile(file, target);
  if (converted) await app.vault.modifyBinary(file, await output.arrayBuffer());
  relinkActiveEditor(app, oldName, file.name);
  warn(plugin, failed && !converted ? [oldName] : []);
}

// ============================================================
//  装配
// ============================================================

/**
 * 编辑器：只接管「全是图片」的粘贴与拖入（按类型或扩展名认）；混着 PDF 等文件、或别的插件已处理过的交还 Obsidian。
 * 笔记库：布局就绪后新出现的图片（插件自己写的除外），排队逐张补问名字。取消就原样留着，不替作者做主。
 */
function registerImages(plugin) {
  plugin.imageWrites = new Set();
  let queue = Promise.resolve();
  const handle = (evt, data, editor, info, drop) => {
    if (!plugin.settings.imageAuto || evt.defaultPrevented || !data) return;
    const files = Array.from(data.files || []);
    if (!files.length || !files.every(isImage)) return;
    const note = info?.file;
    if (!note) return;
    evt.preventDefault();
    if (drop) {
      const offset = editor.cm?.posAtCoords?.({ x: evt.clientX, y: evt.clientY });
      if (offset != null) editor.setCursor(editor.offsetToPos(offset));
    }
    queue = queue.then(() => importIntoNote(plugin, files, note, editor)).catch(error => plugin.notice(`图片没能保存：${error.message}`));
  };
  plugin.registerEvent(plugin.app.workspace.on('editor-paste', (evt, editor, info) => handle(evt, evt.clipboardData, editor, info, false)));
  plugin.registerEvent(plugin.app.workspace.on('editor-drop', (evt, editor, info) => handle(evt, evt.dataTransfer, editor, info, true)));
  plugin.app.workspace.onLayoutReady(() => {
    plugin.registerEvent(plugin.app.vault.on('create', file => {
      if (!plugin.settings.imageAuto || !(file instanceof TFile) || !IMAGE_EXTENSION.test(file.name)) return;
      if (plugin.imageWrites.delete(file.path)) return;
      queue = queue.then(() => adoptImage(plugin, file)).catch(error => plugin.notice(`图片没能整理：${error.message}`));
    }));
  });
}

module.exports = { registerImages, cleanImageName, suggestImageName, IMAGE_EXTENSION };
