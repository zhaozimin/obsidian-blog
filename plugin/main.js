/**
 * [INPUT]: 依赖 Obsidian 生命周期、博客快照、写作入口（新建/模板/图片/排版）、公众号采集与冻结预览
 * [OUTPUT]: 对外提供 BlogPublisherPlugin，整合中控台按钮与新建、模板、图片转换命名、离开即整理、博客同步与公众号草稿
 * [POS]: 单插件编排入口；只负责装配与状态，写作与发布的细节各在自己的模块。博客与公众号状态独立，外部发布必须由用户操作触发
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { Plugin, Notice, requestUrl, parseYaml } = require('obsidian');
const { COLLECTIONS, discoverCollections, collect, diff, sha256, normalizeFolder } = require('./collector');
const { PublisherClient, PublicError } = require('./client');
const { confirmChanges, confirmPublish, PublisherSettings } = require('./ui');
const { templates, templateFiles, ensurePinnedProperty } = require('./templates');
const { createArticle, consoleButton, dashboardActions, registerAutoTemplate } = require('./authoring');
const { registerImages } = require('./images');
const { registerFormatter } = require('./format');
const { registerTypeset, TYPESET_DEFAULTS } = require('./typeset');
const { collectWechatArticle, wechatClient, styleLabel } = require('./wechat');
const { showWechatPreview } = require('./wechat-ui');
const DEFAULTS = {
  blogFolderName: 'blog-V3', imagesFolderName: '6.附件', serverUrl: '', secretKey: '', syncSnapshotV2: {}, syncTarget: '', pendingPublish: null,
  wechatServerUrl: '', wechatSecretKey: '', wechatStylePath: '发布配置/公众号排版.json',
  dashboardPath: '控制台/发布控制台.md', templateFolder: '模板', imageAuto: true, imageQuality: 0.75, autoFormat: true
};

class BlogPublisherPlugin extends Plugin {
  async onload() {
    this.settings = { ...DEFAULTS, ...await this.loadData() };
    this.settings.typeset = { ...TYPESET_DEFAULTS, ...this.settings.typeset };
    this.busy = false; this.alive = true;
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.addClass('blog-publisher-status');
    this.statusBarItem.setAttribute('role', 'status');
    this.status('');
    this.addRibbonIcon('refresh-cw', '同步所有文件到博客', () => this.syncAllFiles());
    this.addCommand({ id: 'sync-all-files', name: '同步所有文件到博客', callback: () => this.syncAllFiles() });
    this.addCommand({ id: 'force-publish', name: '重新发布完整博客', callback: () => this.syncAllFiles(true) });
    this.addCommand({ id: 'init-blog-structure', name: '初始化博客文件夹结构', callback: () => this.initBlogStructure() });
    this.addCommand({ id: 'check-connection', name: '检查博客发布连接', callback: () => this.checkConnection() });
    this.addCommand({ id: 'new-article', name: '新建文章', callback: () => createArticle(this).catch(error => this.notice(error.message)) });
    this.addCommand({ id: 'wechat-preview', name: '预览并上传当前文章到公众号草稿箱', callback: () => this.previewWechat() });
    this.addCommand({ id: 'check-wechat', name: '检查公众号连接与配置', callback: () => this.checkWechat() });
    this.addCommand({ id: 'open-dashboard', name: '打开中控台', callback: () => this.openDashboard() });
    this.addRibbonIcon('send', '预览并上传当前文章到公众号草稿箱', () => this.previewWechat());
    this.addRibbonIcon('layout-dashboard', '打开中控台', () => this.openDashboard());
    this.registerMarkdownCodeBlockProcessor?.('blog-actions', (_source, el) => dashboardActions(this, el));
    this.registerMarkdownCodeBlockProcessor?.('blog-button', (source, el) => { consoleButton(this, source, el); });
    registerAutoTemplate(this);
    registerImages(this);
    registerFormatter(this);
    this.typeset = registerTypeset(this);
    this.addSettingTab(new PublisherSettings(this.app, this));
  }
  onunload() { this.alive = false; }
  saveSettings() { return this.saveData(this.settings); }
  notice(message) { new Notice(message, 6000); }
  status(message) {
    const fallback = this.settings.pendingPublish ? '上次发布待确认' : this.settings.lastReleaseId ? '博客已发布' : '就绪';
    const text = `博客 · ${message || fallback}`;
    this.statusBarItem?.setText(text);
    this.statusBarItem?.setAttribute('title', text);
  }
  finish(message) {
    this.status(message); this.notice(message);
  }
  async checkConnection() {
    try { await new PublisherClient(requestUrl, this.settings).health(); this.finish('发布服务已连接。'); }
    catch (error) { this.finish(error instanceof PublicError ? error.message : '请检查发布地址和访问密钥。'); }
  }
  async checkWechat() {
    try { const result = await wechatClient(requestUrl, this.settings).wechatHealth(); this.notice(result.configured ? '公众号服务已连接，账号已配置。首次保存还需验证接口权限。' : '公众号预览服务已连接，账号尚未配置，可稍后添加。'); }
    catch (error) { this.notice(error.message); }
  }
  async openDashboard() {
    const file = this.app.vault.getAbstractFileByPath(this.settings.dashboardPath);
    if (file?.extension === 'md') await this.app.workspace.getLeaf(false).openFile(file);
    else this.notice('找不到中控台笔记，请在插件设置里填写它的路径。');
  }
  /** 把四个内置模板写进模板文件夹；已有的文件保持原样，作者改过的模板不会被覆盖 */
  async installTemplates() {
    let written = 0;
    for (const entry of templateFiles(this.settings.templateFolder || '模板')) {
      if (this.app.vault.getAbstractFileByPath(entry.path)) continue;
      const parts = entry.path.split('/').slice(0, -1);
      for (let index = 1; index <= parts.length; index++) {
        const folder = parts.slice(0, index).join('/');
        if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
      }
      await this.app.vault.create(entry.path, entry.content); written++;
    }
    this.notice(written ? `已写入 ${written} 个模板，打开就能改。` : '四个模板都已存在，没有覆盖。');
  }
  async previewWechat() {
    if (this.wechatBusy) return this.notice('公众号预览正在准备，请稍候。');
    this.wechatBusy = true;
    try {
      const article = await collectWechatArticle(this.app, this.settings, this.app.workspace.getActiveFile(), parseYaml);
      const client = wechatClient(requestUrl, this.settings); this.notice('正在准备公众号预览…');
      showWechatPreview(this, await client.wechatPreview(article), client, styleLabel(article.style, this.settings));
    } catch (error) { this.notice(error.message); }
    finally { this.wechatBusy = false; }
  }
  async initBlogStructure() {
    if (this.busy) return this.notice('请等待当前发布完成。');
    try {
      const root = normalizeFolder(this.settings.blogFolderName);
      const attachments = normalizeFolder(this.settings.imagesFolderName);
      await ensurePinnedProperty(this.app);
      const ensure = async folder => {
        const parts = folder.split('/');
        for (let index = 1; index <= parts.length; index++) {
          const path = parts.slice(0, index).join('/');
          if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.createFolder(path);
        }
      };
      const declared = this.app.vault.getMarkdownFiles().some(file => file.name === '_栏目.md' && file.path.startsWith(`${root}/`) && file.path.slice(root.length + 1).split('/').length === 2);
      if (declared) {
        await discoverCollections(this.app, root, parseYaml);
        await ensure(`${root}/${attachments}`);
        return this.notice('已有栏目结构完整，未创建额外文件。');
      }
      if (this.app.vault.getMarkdownFiles().some(file => file.path.startsWith(`${root}/`))) throw new Error('已有内容需要先配置栏目');
      for (const folder of [...Object.values(COLLECTIONS), attachments]) await ensure(`${root}/${folder}`);
      for (const entry of templates()) {
        const path = `${root}/${entry.path}`;
        if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.create(path, entry.content);
      }
      this.notice('博客目录已初始化，已有笔记保持原样。');
    } catch { this.notice('初始化未完成，请检查文件夹设置与笔记库权限。'); }
  }
  async acceptPublished(result, pending) {
    if (result.state !== 'published' || !result.releaseId) throw new PublicError('INTERNAL');
    this.settings.syncSnapshotV2 = pending.snapshot;
    this.settings.syncTarget = pending.target;
    this.settings.lastReleaseId = result.releaseId;
    this.settings.pendingPublish = null;
    delete this.settings.lastSyncSnapshot;
    await this.saveSettings();
  }
  async resume(client, target) {
    const pending = this.settings.pendingPublish;
    if (!pending || pending.target !== target) return false;
    this.status('正在检查上次发布结果…');
    let result;
    try { result = await client.status(pending.batchId); }
    catch (error) {
      if (error.code !== 'NOT_FOUND') throw error;
      this.settings.pendingPublish = null; await this.saveSettings(); return false;
    }
    if (result.state === 'published') {
      await this.acceptPublished(result, pending); this.notice('上次博客发布已完成，同步记录已恢复。'); return false;
    }
    if (result.state === 'failed') {
      this.settings.pendingPublish = null; await this.saveSettings(); return false;
    }
    if (result.state === 'ready') await client.commit(pending.batchId);
    result = await client.wait(pending.batchId, () => this.alive);
    await this.acceptPublished(result, pending); this.finish('博客已发布。'); return true;
  }
  async syncAllFiles(force = false) {
    if (this.busy) return this.notice('已有同步任务，请等待完成或关闭确认窗口。');
    this.busy = true;
    try {
      const client = new PublisherClient(requestUrl, this.settings);
      const target = await sha256(`${client.endpoint}\n${client.key}`);
      if (await this.resume(client, target)) return;
      this.status('正在扫描博客内容与引用图片…');
      const collected = await collect(this.app, this.settings, parseYaml);
      const previous = this.settings.syncTarget === target ? this.settings.syncSnapshotV2 : {};
      const changes = diff(collected.snapshot, previous);
      if (!force && !Object.values(changes).some(items => items.length)) return this.finish('没有检测到内容或图片变更。');
      const counts = { files: collected.files.length, images: collected.images.length };
      if (!await confirmChanges(this.app, changes, counts, force)) return this.status('');
      if (!await confirmPublish(this.app, collected, changes.deleted.length)) return this.status('');
      this.status('正在暂存本次发布…');
      const batch = await client.create(collected);
      const needed = new Set(batch.needUpload);
      let uploaded = 0;
      for (const image of collected.images) {
        if (!needed.has(image.filename)) continue;
        this.status(`正在上传图片 ${++uploaded}/${needed.size}…`);
        await client.upload(batch.batchId, image);
      }
      const pending = { batchId: batch.batchId, snapshot: collected.snapshot, target };
      this.settings.pendingPublish = pending; await this.saveSettings();
      this.status('正在校验并发布网站…');
      await client.commit(batch.batchId);
      const result = await client.wait(batch.batchId, () => this.alive);
      await this.acceptPublished(result, pending);
      this.finish('博客已发布。');
    } catch (error) {
      this.finish(error.message || '同步未完成，请稍后重试。');
    } finally { this.busy = false; }
  }
}
module.exports = BlogPublisherPlugin;
