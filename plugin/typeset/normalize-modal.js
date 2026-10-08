/**
 * [INPUT]: 依赖 obsidian 的 Modal
 * [OUTPUT]: 对外提供 NormalizeModal：列出规范化改动（逐行前后对照 + 规则名 + 仅提醒项），确认后回调应用
 * [POS]: plugin/typeset 的确认关口；标点规范化先给作者看清单，确认才改原文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
'use strict';
const { Modal } = require('obsidian');

class NormalizeModal extends Modal {
  /**
   * @param {App} app
   * @param {{lines: Array, notes: Array}} result normalize() 的结果
   * @param {() => void} onApply
   */
  constructor(app, result, onApply) {
    super(app);
    this.result = result;
    this.onApply = onApply;
  }

  onOpen() {
    const { contentEl, result } = this;
    this.titleEl.setText('规范化标点：' + result.lines.length + ' 行');
    contentEl.addClass('pb-normalize');
    contentEl.createEl('p', { cls: 'pb-hint', text: '只改标点，不动一个字；空格与空行由自动整理负责。一次撤销（Cmd/Ctrl+Z）即可全部还原。' });
    const list = contentEl.createDiv('pb-diff');
    for (const p of result.lines) {
      const item = list.createDiv('pb-diff-item');
      item.createDiv({ cls: 'pb-diff-meta', text: 'L' + (p.line + 1) + ' · ' + p.rules.join('、') });
      item.createDiv({ cls: 'pb-del', text: p.before.trim() });
      item.createDiv({ cls: 'pb-ins', text: p.after.trim() });
    }
    if (result.notes.length) {
      contentEl.createEl('div', { cls: 'pb-subhead', text: '只提醒、不修改' });
      const ul = contentEl.createEl('ul', { cls: 'pb-todos' });
      for (const n of result.notes) ul.createEl('li', { text: 'L' + (n.line + 1) + ' · ' + n.rule + '：' + n.text });
    }
    const btns = contentEl.createDiv('modal-button-container');
    btns.createEl('button', { text: '取消' }).addEventListener('click', () => this.close());
    const ok = btns.createEl('button', { cls: 'mod-cta', text: '应用 ' + result.lines.length + ' 处修改' });
    ok.addEventListener('click', () => { this.onApply(); this.close(); });
  }

  onClose() { this.contentEl.empty(); }
}

module.exports = { NormalizeModal };
