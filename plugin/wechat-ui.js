/**
 * [INPUT]: 依赖 Obsidian Modal、已冻结的公众号 HTML 预览与上传回调
 * [OUTPUT]: 对外提供 showWechatPreview，只有明确点击保存才调用草稿接口
 * [POS]: 公众号交互边界；隔离预览 HTML，展示基础排版状态与单篇草稿结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { Modal } = require('obsidian');
function showWechatPreview(plugin, preview, client) {
  class Preview extends Modal {
    onOpen() {
      this.contentEl.createEl('h2', { text: `公众号草稿 · ${preview.title}` });
      this.contentEl.createEl('p', { text: `${preview.images} 张图片（含 ${preview.formulas} 个公式）。${preview.styleIsDefault ? '当前使用基础测试排版，正式风格尚未设置。' : '使用笔记库中的自定义排版配置。'}` });
      const frame = this.contentEl.createEl('iframe', { cls: 'blog-wechat-preview' });
      frame.setAttribute('sandbox', ''); frame.setAttribute('title', '公众号正文预览');
      frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"><style>body{margin:20px;background:white;}img{max-width:100%;}</style></head><body>${preview.html}</body></html>`;
      const result = this.contentEl.createEl('p', { text: '保存后进入公众号草稿箱，可在公众号后台预览和发表。' });
      const controls = this.contentEl.createDiv({ cls: 'blog-publisher-buttons' });
      const close = controls.createEl('button', { text: '关闭' }); close.addEventListener('click', () => this.close());
      const save = controls.createEl('button', { text: '保存到公众号草稿箱', cls: 'mod-cta' });
      save.addEventListener('click', async () => {
        save.disabled = true; result.setText('正在上传图片并保存草稿…');
        try {
          const receipt = await client.wechatDraft(preview.previewId);
          plugin.settings.lastWechatDraft = { title: preview.title, mediaId: receipt.mediaId, savedAt: new Date().toISOString() }; await plugin.saveSettings();
          result.setText(receipt.reused ? '此版本已在草稿箱，未重复新增。' : receipt.updated ? '已更新原公众号草稿。' : '已保存到公众号草稿箱。');
          plugin.notice(result.textContent);
        } catch (error) { result.setText(error.message); save.disabled = false; }
      });
    }
    onClose() { this.contentEl.empty(); }
  }
  new Preview(plugin.app).open();
}
module.exports = { showWechatPreview };
