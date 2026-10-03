/**
 * [INPUT]: 依赖 Obsidian Modal/Setting 与博客、公众号两个独立操作入口
 * [OUTPUT]: 对外提供 confirmChanges、confirmPublish 与 PublisherSettings
 * [POS]: 发布的交互边界；展示内容变更和公开后果，遮蔽访问密钥与底层连接信息
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { Modal, PluginSettingTab, Setting } = require('obsidian');

class ConfirmModal extends Modal {
  constructor(app, render, resolve) { super(app); this.render = render; this.resolve = resolve; this.accepted = false; }
  onOpen() {
    this.contentEl.empty();
    const label = this.render(this.contentEl);
    const buttons = this.contentEl.createDiv({ cls: 'blog-publisher-buttons' });
    const cancel = buttons.createEl('button', { text: '取消' });
    cancel.addEventListener('click', () => this.close());
    const confirm = buttons.createEl('button', { text: label, cls: 'mod-cta' });
    confirm.addEventListener('click', () => { this.accepted = true; this.close(); });
  }
  onClose() { this.contentEl.empty(); this.resolve(this.accepted); }
}
function confirmChanges(app, changes, counts, force) {
  return new Promise(resolve => new ConfirmModal(app, el => {
    el.createEl('h2', { text: '博客内容变更' });
    el.createEl('p', { text: `本次快照：${counts.files} 篇内容，${counts.images} 张引用图片。` });
    el.createEl('p', { text: `新增 ${changes.added.length} · 修改 ${changes.modified.length} · 删除 ${changes.deleted.length}` });
    if (force) el.createEl('p', { text: '本次将重新发布完整快照。' });
    const list = el.createDiv({ cls: 'blog-publisher-changes' });
    for (const [key, label] of [['added', '新增'], ['modified', '修改'], ['deleted', '删除']]) {
      if (!changes[key].length) continue;
      list.createEl('h3', { text: label });
      const items = list.createEl('ul');
      for (const name of changes[key]) items.createEl('li', { text: name });
    }
    return '继续';
  }, resolve).open());
}
function confirmPublish(app, collected, deletions) {
  return new Promise(resolve => new ConfirmModal(app, el => {
    el.createEl('h2', { text: '确认发布到博客' });
    el.createEl('p', { text: '将用本次博客目录快照更新网站。所有文章及引用图片校验通过后，才会开始发布。' });
    if (deletions) el.createEl('p', { text: `本次移除 ${deletions} 项。成功发布后，网站上对应的旧内容会消失。`, cls: 'blog-publisher-warning' });
    if (!collected.files.length) el.createEl('p', { text: '当前没有文章，确认后网站会变为空内容状态。', cls: 'blog-publisher-warning' });
    if (collected.passwords.length) {
      el.createEl('p', { text: '以下文章需要服务器验证阅读密码后才提供正文与专属图片。标题、简介、封面和其他文章共用的图片仍会公开。', cls: 'blog-publisher-warning' });
      const list = el.createEl('ul');
      for (const name of collected.passwords) list.createEl('li', { text: name });
    }
    return '确认发布';
  }, resolve).open());
}

class PublisherSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    this.containerEl.empty();
    const el = this.containerEl, plugin = this.plugin;
    el.createEl('h2', { text: '博客发布' });
    const field = (key, name, description, placeholder, secret = false) => {
      new Setting(el).setName(name).setDesc(description).addText(input => {
        input.setPlaceholder(placeholder).setValue(plugin.settings[key]);
        if (secret) { input.inputEl.type = 'password'; input.inputEl.autocomplete = 'off'; }
        input.onChange(async value => { plugin.settings[key] = value.trim(); await plugin.saveSettings(); });
      });
    };
    field('blogFolderName', '博客文件夹', '仅发布带栏目配置的博客内容，支持子目录；目录名称会同步到网站。', 'blog-V3');
    field('imagesFolderName', '附件文件夹', '相对于博客文件夹；只上传内容实际引用的图片。', '6.附件');
    field('serverUrl', '发布地址', '填写接收服务的 HTTPS 地址；旧版 Markdown 接口地址也能自动识别。', 'https://blog.example.com');
    field('secretKey', '访问密钥', '仅保存在当前笔记库本地插件设置中，不出现在状态提示里。', '访问密钥', true);
    new Setting(el).setName('检查连接').setDesc('检查发布服务是否可用。').addButton(button => button.setButtonText('检查').onClick(() => plugin.checkConnection()));
    new Setting(el).setName('初始化博客目录').setDesc('新库创建空栏目配置和附件目录；已有栏目不补建示例文章。').addButton(button => button.setButtonText('初始化').onClick(() => plugin.initBlogStructure()));
    new Setting(el).setName('重新发布').setDesc('上传完整快照并重新构建，可用于恢复网站或重试发布。').addButton(button => button.setButtonText('重新发布').onClick(() => plugin.syncAllFiles(true)));
    new Setting(el).setName('重置同步快照').setDesc('清除成功记录；下次仍需确认后才发布。').addButton(button => button.setButtonText('重置').onClick(async () => {
      if (plugin.busy) return plugin.notice('发布期间不能重置快照。');
      plugin.settings.syncSnapshotV2 = {}; plugin.settings.syncTarget = '';
      await plugin.saveSettings(); plugin.notice('同步快照已重置。');
    }));
    new Setting(el).setName('新建文章').setDesc('选择栏目和分类，自动生成稳定 id 与日期。').addButton(button => button.setButtonText('打开控制台').onClick(() => plugin.openDashboard()));
    el.createEl('h2', { text: '微信公众号草稿' });
    field('wechatServerUrl', '公众号服务地址', '留空时使用博客发布地址；也可连接实现本系统接口的独立服务。', '留空使用博客服务');
    field('wechatSecretKey', '公众号服务访问密钥', '留空时使用博客访问密钥。公众号 AppSecret 由服务端私有保存。', '留空使用博客密钥', true);
    field('wechatStylePath', '公众号排版配置', '笔记库内的 JSON 路径；空配置使用基础排版，正式风格稍后设置。', '发布配置/公众号排版.json');
    new Setting(el).setName('检查公众号服务').setDesc('检查服务与账号是否已配置，不上传文章。').addButton(button => button.setButtonText('检查').onClick(() => plugin.checkWechat()));
    el.createEl('p', { text: '博客：同步按钮 → 查看变更 → 确认发布。公众号：打开文章 → 预览 → 保存草稿。两个入口分别操作，不自动群发。' });
  }
}
module.exports = { confirmChanges, confirmPublish, PublisherSettings };
