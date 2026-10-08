/**
 * [INPUT]: 依赖 Obsidian Modal/Setting，shared/typeset 的风格表与 typeset 的设备表，以及博客、写作、排版预览、公众号四组操作入口
 * [OUTPUT]: 对外提供 confirmChanges、confirmPublish 与 PublisherSettings
 * [POS]: 发布与设置的交互边界；展示内容变更和公开后果，遮蔽访问密钥与底层连接信息；写作组管中控台、模板、图片与自动排版，排版预览组管风格、设备与页头署名
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { Modal, PluginSettingTab, Setting } = require('obsidian');
const { THEMES, getTheme } = require('../shared/typeset/themes.cjs');
const { DEVICES } = require('./typeset/devices');

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
    el.createEl('h2', { text: '写作' });
    field('dashboardPath', '中控台笔记', '左侧图标和「打开中控台」命令打开的笔记。按钮写法：```blog-button 代码块，一行「文字: …」，一行「栏目: 栏目 id」。', '控制台/发布控制台.md');
    field('templateFolder', '模板文件夹', '里面的 长文模板、书籍模板、产品模板、故事模板 决定新建笔记的字段和填写说明；缺哪个就用内置的。', '模板');
    new Setting(el).setName('写入模板').setDesc('把四个内置模板写进模板文件夹；已有的模板不会被覆盖。').addButton(button => button.setButtonText('写入').onClick(() => plugin.installTemplates().catch(error => plugin.notice(error.message))));
    new Setting(el).setName('图片进库先起名').setDesc('拖进或粘贴进笔记的图片，以及从文件列表、访达放进笔记库的图片，都先转成 WebP，再请你起名字，然后存进附件文件夹。动图、矢量图和转完更大的图保持原格式。')
      .addToggle(toggle => toggle.setValue(plugin.settings.imageAuto).onChange(async value => { plugin.settings.imageAuto = value; await plugin.saveSettings(); }));
    new Setting(el).setName('图片质量').setDesc('越低文件越小，0.75 看不出差别。')
      .addSlider(slider => slider.setLimits(0.5, 1, 0.05).setValue(plugin.settings.imageQuality).setDynamicTooltip().onChange(async value => { plugin.settings.imageQuality = value; await plugin.saveSettings(); }));
    new Setting(el).setName('离开笔记时自动整理格式').setDesc('中英文、数字之间留一个空格，连续空格收成一个，段与段之间留一个空行。只整理改过的笔记，正在写的那篇不动；也可以运行「整理当前笔记格式」。')
      .addToggle(toggle => toggle.setValue(plugin.settings.autoFormat).onChange(async value => { plugin.settings.autoFormat = value; await plugin.saveSettings(); }));
    el.createEl('h2', { text: '排版预览（公众号 / X）' });
    const typeset = plugin.settings.typeset, update = patch => plugin.typeset.updateSettings(patch);
    new Setting(el).setName('公众号风格').setDesc(`${getTheme(typeset.theme).desc} 没有单独的公众号排版配置时，草稿也用这套风格的字号、行距与配色。`).addDropdown(dropdown => {
      for (const theme of THEMES) dropdown.addOption(theme.id, theme.name);
      dropdown.setValue(typeset.theme).onChange(async value => { await update({ theme: value }); this.display(); });
    });
    new Setting(el).setName('默认预览设备').addDropdown(dropdown => {
      for (const device of DEVICES) dropdown.addOption(device.id, device.name);
      dropdown.setValue(typeset.device).onChange(value => update({ device: value }));
    });
    new Setting(el).setName('显示体检标记').setDesc('在预览里标出长段落、连续几屏无小标题、加粗过密、多卡引用块等。')
      .addToggle(toggle => toggle.setValue(typeset.showIssues).onChange(value => update({ showIssues: value })));
    for (const [key, name, placeholder] of [['account', '公众号名称', '例如：子民'], ['author', '作者名', '例如：赵子民'], ['xHandle', 'X 账号', '例如：ZiminZhao']]) {
      new Setting(el).setName(name).setDesc('只在预览页头显示，不写进复制内容。').addText(input => input.setPlaceholder(placeholder).setValue(typeset[key]).onChange(value => plugin.typeset.updateSettings({ [key]: value.trim() }, false)));
    }
    el.createEl('h2', { text: '微信公众号草稿' });
    field('wechatServerUrl', '公众号服务地址', '留空时使用博客发布地址；也可连接实现本系统接口的独立服务。', '留空使用博客服务');
    field('wechatSecretKey', '公众号服务访问密钥', '留空时使用博客访问密钥。公众号 AppSecret 由服务端私有保存。', '留空使用博客密钥', true);
    field('wechatStylePath', '公众号排版配置', '笔记库内的 JSON 路径；文件不在或为空 {} 时，草稿使用上面选的排版预览风格。', '发布配置/公众号排版.json');
    new Setting(el).setName('检查公众号服务').setDesc('检查服务与账号是否已配置，不上传文章。').addButton(button => button.setButtonText('检查').onClick(() => plugin.checkWechat()));
    el.createEl('p', { text: '博客：同步按钮 → 查看变更 → 确认发布。公众号：打开文章 → 预览 → 保存草稿。两个入口分别操作，不自动群发。' });
  }
}
module.exports = { confirmChanges, confirmPublish, PublisherSettings };
