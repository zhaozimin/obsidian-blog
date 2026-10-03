/**
 * [INPUT]: 依赖 Obsidian Modal/Setting、稳定栏目声明和 Vault 创建能力
 * [OUTPUT]: 对外提供 createArticle 与 dashboardActions，替代新建流程中的三个社区插件
 * [POS]: 本地写作入口；目录决定分类，自动分配稳定身份，不执行脚本模板，不覆盖已有文章
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { Modal, Setting, parseYaml } = require('obsidian');
const { discoverCollections, normalizeFolder } = require('./collector');
const { articleTemplate } = require('./templates');
async function createArticle(plugin) {
  const root = normalizeFolder(plugin.settings.blogFolderName);
  const collections = (await discoverCollections(plugin.app, root, parseYaml)).filter(item => ['article', 'book', 'product', 'about'].includes(item.kind));
  class NewArticle extends Modal {
    onOpen() {
      let title = '', category = '', collectionId = collections[0]?.id;
      this.contentEl.createEl('h2', { text: '新建文章' });
      new Setting(this.contentEl).setName('栏目').addDropdown(input => { for (const item of collections) input.addOption(item.id, item.folder); input.setValue(collectionId).onChange(value => { collectionId = value; }); });
      new Setting(this.contentEl).setName('标题').addText(input => input.setPlaceholder('文章标题').onChange(value => { title = value.trim(); }));
      new Setting(this.contentEl).setName('分类文件夹').setDesc('可留空，也可使用 分类/子分类。').addText(input => input.onChange(value => { category = value.trim(); }));
      new Setting(this.contentEl).addButton(button => button.setButtonText('创建').setCta().onClick(async () => {
        button.setDisabled(true);
        try {
          if (!title || /[\\/:*?"<>|\x00-\x1f]/.test(title) || title === '.' || title === '..') throw new Error('请输入有效标题，不能包含路径分隔符。');
          if (category) category = normalizeFolder(category);
          const collection = collections.find(item => item.id === collectionId);
          const folder = `${root}/${collection.folder}${category ? `/${category}` : ''}`, file = `${folder}/${title}.md`;
          if (plugin.app.vault.getAbstractFileByPath(file)) throw new Error('同名文章已存在，请换一个标题。');
          const parts = folder.split('/');
          for (let index = 1; index <= parts.length; index++) { const current = parts.slice(0, index).join('/'); if (!plugin.app.vault.getAbstractFileByPath(current)) await plugin.app.vault.createFolder(current); }
          const content = articleTemplate(collection.kind, title);
          const created = await plugin.app.vault.create(file, content); this.close(); await plugin.app.workspace.getLeaf(false).openFile(created);
        } catch (error) { plugin.notice(error.message); button.setDisabled(false); }
      }));
    }
    onClose() { this.contentEl.empty(); }
  }
  new NewArticle(plugin.app).open();
}
function dashboardActions(plugin, el) {
  const actions = [['新建文章', () => createArticle(plugin)], ['上传博客', () => plugin.syncAllFiles()], ['公众号预览', () => plugin.previewWechat()], ['检查连接', () => plugin.checkConnection()]];
  for (const [label, callback] of actions) { const button = el.createEl('button', { text: label }); button.addEventListener('click', () => Promise.resolve(callback()).catch(error => plugin.notice(error.message))); }
}
module.exports = { createArticle, dashboardActions };
