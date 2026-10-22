/* Recent projects: one local library for desktop, phone and the offline HTML. */
(function (G) {
  'use strict';
  const App = G.App, UI = G.UI, L = G.L, $ = id => document.getElementById(id), esc = UI.esc;
  const dlg = document.createElement('div'); dlg.id = 'historyDlg'; dlg.className = 'dlg hidden';
  dlg.innerHTML = `<div class="dlg-body history-body" role="dialog" aria-modal="true" aria-labelledby="historyTitle" tabindex="-1">
    <button class="dlg-x" id="historyClose">×</button><h3 id="historyTitle"></h3><p class="hint" id="historyHint"></p>
    <p class="history-error hidden" id="historyError" role="status"></p><div id="projectLibrary"></div>
    <div class="history-footer"><button class="btn" id="historySave"></button><button class="btn" id="historyRetry"></button></div></div>`;
  document.body.appendChild(dlg);
  let opener = null, revision = 0, working = false;
  function close() {
    revision++; dlg.classList.add('hidden');
    const target = opener && opener.isConnected && opener.getClientRects().length ? opener : $(UI.isPhone() ? 'btnMore' : 'cacheStatus');
    target.focus();
  }
  function status() {
    const text = !App.S ? L('历史项目', 'Recent projects')
      : App.cacheStatus === 'error' ? L('缓存失败 · 保存项目', 'Cache failed · save file')
      : App.cacheStatus === 'pending' ? L('正在缓存…', 'Saving locally…') : L('已缓存 · 历史项目', 'Saved · recent projects');
    $('cacheStatus').textContent = text; $('mCacheStatus').textContent = text;
    $('cacheStatus').classList.toggle('error', App.cacheStatus === 'error');
    $('cacheStatus').title = App.cacheStatus === 'error'
      ? L('浏览器缓存不可用或空间不足。点击后可保存项目文件。', 'Storage is unavailable or full. Click to save a project file.')
      : L('打开本浏览器缓存的图片和编辑进度', 'Open images and edits cached in this browser');
  }
  function labels() {
    $('historyTitle').textContent = L('历史项目', 'Recent projects');
    $('historyClose').setAttribute('aria-label', L('关闭', 'Close'));
    $('historyHint').textContent = L('原图和编辑进度自动保存在当前浏览器，清理浏览器数据会清除缓存。换电脑或备份可保存当前曝光的 .gelfig 文件；其他曝光请另存原文件。',
      'Images and edits stay in this browser; clearing browser data removes this history. Back up the selected exposure as a .gelfig file, and keep other exposure files separately.');
    $('historySave').textContent = L('保存当前项目文件', 'Save current project file');
    $('historySave').classList.toggle('hidden', !App.S);
    $('historyRetry').textContent = L('刷新 / 重试缓存', 'Refresh / retry saving');
  }
  function error(message) {
    $('historyError').textContent = message || '';
    $('historyError').classList.toggle('hidden', !message);
  }
  async function action(fn) {
    if (working) return;
    working = true; dlg.classList.add('working'); dlg.setAttribute('aria-busy', 'true');
    try { await fn(); } catch (e) { error(L('操作未完成：', 'Could not complete: ') + e.message); }
    finally { working = false; dlg.classList.remove('working'); dlg.setAttribute('aria-busy', 'false'); }
  }
  async function render() {
    const token = ++revision;
    try {
      const list = await App.listHistory();
      if (token !== revision || dlg.classList.contains('hidden')) return;
      const host = $('projectLibrary');
      host.innerHTML = list.length ? list.map(p => {
        const summary = p.summary || {}, details = [new Date(p.savedAt).toLocaleString(G.I18N.lang === 'en' ? 'en' : 'zh-CN')];
        if (summary.gelType) details.push(summary.gelType === 'protein' ? L('蛋白胶', 'Protein gel') : L('DNA 胶', 'DNA gel'));
        const count = summary.images || 1;
        details.push(count + L(' 张图', count === 1 ? ' image' : ' images'));
        if (summary.lanes != null) details.push(summary.lanes + L(' 条泳道', ' lanes'));
        const current = p.projectId === App.projectId;
        return `<div class="library-card${current ? ' current' : ''}" data-project="${esc(p.projectId)}">
          <div class="project-info"><button class="open-project">${esc(p.projectName || p.name || L('未命名项目', 'Untitled project'))}</button>
          <small>${esc(details.join(' · '))}${current ? ' · ' + L('当前项目', 'Current project') : ''}</small></div>
          <div class="project-actions"><button class="btn sm rename-project">${L('改名', 'Rename')}</button>
          <button class="btn sm delete-project" ${current ? 'disabled' : ''} title="${current ? L('当前项目正在自动缓存，切换后可删除', 'This project is being autosaved; switch projects before deleting it') : L('删除本地缓存', 'Delete local cache')}">${L('删除', 'Delete')}</button></div></div>`;
      }).join('') : `<div class="history-empty">${L('还没有历史项目。导入图片后会自动缓存，下次可从这里接着编辑。', 'No recent projects yet. Import an image to start; return here to continue editing.')}</div>`;
      host.querySelectorAll('[data-project]').forEach(card => {
        const id = card.dataset.project;
        card.querySelector('.open-project').onclick = () => action(async () => {
          if (id === App.projectId) { close(); return; }
          if (!await UI.archiveCurrent()) return;
          App.busy(true, L('正在恢复历史项目…', 'Restoring recent project…'));
          try { await App.restoreHistory(id); close(); UI.toast(L('已恢复原图和全部调整', 'Restored original images and all edits')); }
          finally { App.busy(false); }
        });
        card.querySelector('.rename-project').onclick = () => rename(card, id);
        card.querySelector('.delete-project').onclick = () => action(async () => {
          if (!confirm(L('删除这个本地缓存项目？已下载的项目文件不会删除。', 'Delete this locally cached project? Downloaded project files are kept.'))) return;
          await App.deleteHistory(id); await render(); await UI.offerDraft();
          (dlg.querySelector('.open-project') || $('historyClose')).focus();
        });
      });
    } catch (e) {
      if (token !== revision) return;
      $('projectLibrary').textContent = L('暂时无法读取浏览器缓存。仍可用“保存项目 / 打开项目”接着编辑。',
        'Browser history is unavailable. You can still save/open project files to continue later.');
    }
  }
  function rename(card, id) {
    if (working || card.querySelector('input')) return;
    const old = card.querySelector('.open-project'), input = document.createElement('input');
    input.type = 'text'; input.maxLength = 160; input.value = old.textContent;
    input.setAttribute('aria-label', L('项目名称', 'Project name'));
    old.replaceWith(input); input.focus(); input.select();
    let finished = false;
    const finish = cancel => {
      if (finished) return; finished = true;
      action(async () => {
        if (!cancel) await App.renameHistory(id, input.value); await render(); await UI.offerDraft();
        if (!dlg.classList.contains('hidden')) dlg.querySelector(`[data-project="${id}"] .rename-project`)?.focus();
      });
    };
    input.onblur = () => finish(false);
    input.onkeydown = e => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(e.key === 'Escape'); }
    };
  }
  async function open() {
    if (working) return;
    opener = document.activeElement;
    UI.flushPending();
    document.querySelectorAll('.menu').forEach(m => m.classList.add('hidden'));
    if (G.Mobile) G.Mobile.closeSheets();
    labels(); error(''); dlg.classList.remove('hidden'); $('historyClose').focus();
    $('projectLibrary').textContent = L('读取中…', 'Loading…');
    await action(async () => {
      if (!await App.saveDraft()) error(L('当前编辑未能缓存，请先保存项目文件。已有缓存仍可打开。', 'Current edits could not be cached. Save a project file first. Existing cached projects can still be opened.'));
      await render();
    });
  }
  $('historyClose').onclick = close;
  dlg.addEventListener('click', e => { if (e.target === dlg && !working) close(); });
  dlg.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;
    // Keep project shortcuts (Delete, H, undo) out of the editor beneath this dialog.
    e.stopPropagation();
    if (e.key === 'Escape' && !working) { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const els = [...dlg.querySelectorAll('button:not(:disabled),input')].filter(el => el.getClientRects().length);
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  $('historySave').onclick = () => { close(); $('btnSaveProj').click(); };
  $('historyRetry').onclick = open;
  ['btnHistory', 'btnHistoryStart', 'cacheStatus'].forEach(id => { $(id).onclick = open; });
  G.addEventListener('gelfigure-cache', status);
  G.I18N.onChange(() => { status(); if (!dlg.classList.contains('hidden')) { labels(); render(); } });
  status();
  G.HistoryUI = { open, close };
})(window);
