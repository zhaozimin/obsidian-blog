/**
 * [INPUT]: 依赖 Obsidian MarkdownView/TFile 与工作区、Vault 事件；依赖 shared/typeset/format 的 formatMarkdown
 * [OUTPUT]: 对外提供 registerFormatter（离开即整理 + 「整理当前笔记格式」命令）与 isNoteInFront
 * [POS]: 自动排版的时机层，照 ziminOS Pro 的 core/editDebts 与 modules/format 写成：
 *        规则本体在 shared/typeset/format（纯函数、可在 Node 里逐条断言），这里只回答「什么时候整理才不伤人」——
 *        正开着的那一篇绝不动，改过的笔记在切走或关掉时整理，没开着的笔记被改动后防抖整理
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const { MarkdownView, TFile } = require('obsidian');
const { formatMarkdown } = require('../shared/typeset/format.cjs');

/** 没开着的笔记：连续改动收敛成一次整理 */
const DEBOUNCE_MS = 2000;
/** 再入锁：整理写盘会再触发 modify，断环靠幂等，这把锁是保险，不把死循环押在一句注释上 */
const RE_ENTRY_MS = 1000;
/** Agent 维护的地图文件有自己的紧凑格式，不替它们排版 */
const SKIP = new Set(['CLAUDE.md', 'AGENTS.md']);

// ============================================================
//  「开在眼前」的唯一定义
// ============================================================

/**
 * 这篇此刻是否开在作者眼前：是活动文件，且真的显示在某个 Markdown 分栏里。
 * 只问 getActiveFile 不够——关掉最后一个标签页之后它仍指着刚关掉的那篇，「走开」就永远不会发生。
 */
function isNoteInFront(app, path) {
  if (app.workspace.getActiveFile()?.path !== path) return false;
  let displayed = false;
  app.workspace.iterateAllLeaves(leaf => { if (leaf.view instanceof MarkdownView && leaf.view.file?.path === path) displayed = true; });
  return displayed;
}

/** 整理前让仍显示着它的分栏先存盘：缓冲区干净了，随后的写入只是一次静默重载，不会弹三方合并 */
async function saveDisplayed(app, path) {
  const saves = [];
  app.workspace.iterateAllLeaves(leaf => { if (leaf.view instanceof MarkdownView && leaf.view.file?.path === path) saves.push(leaf.view.save()); });
  await Promise.all(saves);
}

/** 写入后把每个分栏的滚动位置放回去；视图重排可能晚一帧，所以再放一次 */
async function withScroll(app, path, write) {
  const marks = [];
  app.workspace.iterateAllLeaves(leaf => {
    if (!(leaf.view instanceof MarkdownView) || leaf.view.file?.path !== path) return;
    const scroll = leaf.view.currentMode?.getScroll?.();
    if (Number.isFinite(scroll) && scroll >= 0) marks.push({ view: leaf.view, mode: leaf.view.getMode(), scroll });
  });
  const restore = () => { for (const mark of marks) if (mark.view.file?.path === path && mark.view.getMode() === mark.mode) mark.view.currentMode.applyScroll(mark.scroll); };
  try { return await write(); }
  finally { if (marks.length) { restore(); window.requestAnimationFrame(restore); } }
}

// ============================================================
//  装配
// ============================================================

function registerFormatter(plugin) {
  const { app } = plugin;
  const debts = new Map(), lastRun = new Map();
  let version = 0;
  const eligible = file => file instanceof TFile && file.extension === 'md' && !SKIP.has(file.name);

  /**
   * 整理一篇，返回是否真的改了。先算一遍，改不动就不写——这是命门：只要「没变化也照写」，
   * 写盘 → modify → 再整理 这个环就永远转下去。真写时走 vault.process 拿最新内容重算，读写之间敲的字不会丢。
   */
  const formatFile = async (file, mayWrite = () => true) => {
    const current = await app.vault.cachedRead(file);
    if (formatMarkdown(current) === current || !mayWrite()) return false;
    let changed = false;
    await withScroll(app, file.path, () => app.vault.process(file, content => {
      if (!mayWrite()) return content;
      const next = formatMarkdown(content);
      if (next === content) return content;
      changed = true; lastRun.set(file.path, Date.now());
      return next;
    }));
    return changed;
  };

  const stop = debt => { if (debt.timer !== null) { window.clearTimeout(debt.timer); debt.timer = null; } };
  const drop = debt => { stop(debt); if (debts.get(debt.path) === debt) debts.delete(debt.path); };
  /** 没开着就排防抖；开着就什么都不排，等走开 */
  const schedule = debt => {
    stop(debt);
    if (isNoteInFront(app, debt.path)) return;
    debt.timer = window.setTimeout(() => { debt.timer = null; void settle(debt); }, DEBOUNCE_MS);
  };

  /** 结算一笔：任何一道闸没过都原样留着，等下一次走开或下一次改动 */
  const settle = async debt => {
    if (debt.settling || debts.get(debt.path) !== debt || isNoteInFront(app, debt.path)) return;
    const file = app.vault.getAbstractFileByPath(debt.path);
    if (!eligible(file)) return drop(debt);
    stop(debt);
    debt.settling = true;
    let settled = true, recorded = debt.version;
    try {
      await saveDisplayed(app, debt.path);
      // 存盘那一刻会再记一笔新账，那正是作者最后敲下的字，按新版本结算
      recorded = debt.version;
      if (!plugin.settings.autoFormat) settled = true;
      else {
        const away = () => !isNoteInFront(app, debt.path);
        settled = await formatFile(file, away) || away();
      }
    } catch { settled = true; }
    finally { debt.settling = false; }
    // 结算途中又被改过：新的那一程重新排，不能一起勾销
    if (debt.version !== recorded) { if (debts.get(debt.path) === debt && debt.timer === null) schedule(debt); return; }
    if (settled) drop(debt);
  };

  /** 走开的时刻：所有在等走开、且已不在眼前的账一并结算 */
  const sweep = () => { for (const debt of [...debts.values()]) if (debt.timer === null) void settle(debt); };

  const record = file => {
    const debt = debts.get(file.path) || { path: file.path, version: 0, timer: null, settling: false };
    debt.version = ++version;
    debts.set(debt.path, debt);
    if (!debt.settling) schedule(debt);
  };

  app.workspace.onLayoutReady(() => {
    // 换面板走 active-leaf-change，同一面板里换文件走 file-open；漏一个就有笔记永远等不到整理
    plugin.registerEvent(app.workspace.on('active-leaf-change', sweep));
    plugin.registerEvent(app.workspace.on('file-open', sweep));
    plugin.registerEvent(app.vault.on('modify', file => {
      if (!plugin.settings.autoFormat || !eligible(file)) return;
      const last = lastRun.get(file.path);
      if (last !== undefined && Date.now() - last < RE_ENTRY_MS) return;
      record(file);
    }));
    // 改名、挪文件夹：账跟着新路径走；删掉即作废
    plugin.registerEvent(app.vault.on('rename', (file, oldPath) => {
      const debt = debts.get(oldPath);
      if (!debt) return;
      debts.delete(oldPath); debt.path = file.path; debts.set(file.path, debt);
    }));
    plugin.registerEvent(app.vault.on('delete', file => { const debt = debts.get(file.path); if (debt) drop(debt); }));
  });
  plugin.register(() => { for (const debt of debts.values()) stop(debt); });

  /** 手动整理是唯一会动「眼前这一篇」的路径：此刻动手是作者自己按下的。三种结果都出声 */
  plugin.addCommand({
    id: 'format-note', name: '整理当前笔记格式',
    callback: async () => {
      const file = app.workspace.getActiveFile();
      if (!eligible(file)) return plugin.notice('先打开一篇笔记，再整理格式。');
      try {
        await saveDisplayed(app, file.path);
        const changed = await formatFile(file);
        const debt = debts.get(file.path);
        if (debt) drop(debt);
        plugin.notice(changed ? '已整理这一篇的格式。' : '这一篇的格式已经规范，没有可改的。');
      } catch { plugin.notice('整理没能写进去，这一篇没有变，稍后再试一次。'); }
    }
  });
}

module.exports = { registerFormatter, isNoteInFront };
