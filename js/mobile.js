/* Phone and touch layer. On a phone the work area shows one view at a time (Image / Figure / Settings,
 * picked in a bottom bar), and what a computer reaches through menus and keyboard shortcuts gets a
 * place for fingers: an export sheet with every format, a "more" sheet (open, project, style, help,
 * language), a selection bar on the image (nudge / cut / delete), and exported files handed over in a
 * sheet where a picture can be long-pressed into Photos or shared. The desktop layout is untouched. */
(function (G) {
  'use strict';
  const App = G.App, L = G.L, UI = G.UI, $ = id => document.getElementById(id);
  const S = () => App.S;
  const body = document.body;
  const phone = () => UI.isPhone();
  // touch-only devices also get exported files in the sheet (long-press into Photos, share sheet)
  const coarse = matchMedia('(pointer: coarse)'), anyFine = matchMedia('(any-pointer: fine)');
  const handOver = () => phone() || (coarse.matches && !anyFine.matches);
  const inWeChat = /MicroMessenger/i.test(navigator.userAgent);
  // was the last pointer a finger? (tablets and touch laptops in the desktop layout get the selection bar too)
  let lastTouch = false;
  window.addEventListener('pointerdown', e => { lastTouch = e.pointerType === 'touch'; }, true);

  /* ---------- views ---------- */
  const VIEWS = ['raw', 'fig', 'panel'];
  const view = () => VIEWS.find(v => body.classList.contains('view-' + v)) || null;
  function setView(v) {
    if (!phone()) return;
    VIEWS.forEach(k => body.classList.toggle('view-' + k, k === v));
    $('mNav').querySelectorAll('button[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    if (S()) requestAnimationFrame(() => { if (v === 'raw') G.Editor.resize(); else if (v === 'fig') UI.updatePreview(); placeBannerTop(); });
    selSync();
  }
  // the tool instructions live in the figure pane on a computer; on a phone they must show on every tab
  const banner = $('modeBanner'), bannerHome = banner.parentNode;
  function placeBanner(ph) {
    if (ph && banner.parentNode !== body) body.appendChild(banner);
    else if (!ph && banner.parentNode !== bannerHome) bannerHome.appendChild(banner);
  }
  let wasPhone = null;
  function sync() {
    const ph = phone(), has = !!S();
    body.classList.toggle('has-image', has);
    if (ph !== wasPhone) {
      wasPhone = ph; placeBanner(ph);
      if (!ph) { closeSheets(); VIEWS.forEach(k => body.classList.remove('view-' + k)); }
    }
    if (ph) {
      if (!has) setView('panel');            // the start screen lives in the settings pane
      else if (!view()) setView('fig');
    }
    mirror(); selSync();
  }

  /* ---------- coach line and bottom bar ---------- */
  function mirror() {
    const done = $('coach').classList.contains('done');
    $('mCoachText').innerHTML = $('coachText').innerHTML;
    $('mCoach').classList.toggle('done', done);
    $('mExport').classList.toggle('ready', done);
  }
  $('mNav').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'mExport') openExport(); else setView(b.dataset.view);
  });
  // tools that need the image or the figure take you there
  const TOOL_VIEW = { btnAddArrow: 'raw', btnAddBox: 'raw', btnAddBracket: 'raw', btnAddGroup: 'fig', btnAddCond: 'fig', btnAddLabel: 'fig',
    btnRedetectCrop: 'raw', btnAutoLanes: 'raw' };
  Object.entries(TOOL_VIEW).forEach(([id, v]) => $(id).addEventListener('click', () => {
    if (!phone() || !S()) return;
    if (/^btnAdd(Arrow|Box|Bracket|Group)$/.test(id) && !App.mode) return;   // the tool was switched off
    setView(v);
  }));

  /* ---------- sheets ---------- */
  function openSheet(id) { closeSheets(); $(id).classList.remove('hidden'); }
  function closeSheet(w) { if (w.classList.contains('hidden')) return; w.classList.add('hidden'); if (w.id === 'resultSheet') dropResult(); }
  function closeSheets() { document.querySelectorAll('.sheet-wrap').forEach(closeSheet); }
  document.querySelectorAll('.sheet-wrap').forEach(w => w.addEventListener('click', e => {
    if (e.target === w || e.target.closest('[data-close]')) closeSheet(w);
  }));
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });

  /* export: every format, the resolution, and a size check (phones cannot draw huge canvases) */
  const PX_LIMIT = 16.7e6;   // Safari's canvas area limit (4096²): larger renders come out blank
  function exportSync() {
    const st = S(); if (!st) return;
    const dpi = st.style.dpi;
    $('mDpiSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.dpi === dpi));
    let f = null;
    try { f = App.buildFigure(false); } catch (e) { /* the figure is reported elsewhere */ }
    if (f) {
      const w = Math.round(f.w * dpi / 72), h = Math.round(f.h * dpi / 72), mm = v => (v / G.Render.MM).toFixed(0);
      const eff = Math.round(App.effectiveDpi());
      $('mDpiInfo').innerHTML = L(`成图 ${mm(f.w)} × ${mm(f.h)} mm · ${w} × ${h} 像素`, `Figure ${mm(f.w)} × ${mm(f.h)} mm · ${w} × ${h} px`)
        + (eff < dpi ? L(`（胶图本身 ${eff} dpi）`, ` (the gel itself is ${eff} dpi)`) : '')
        + (w * h > PX_LIMIT ? '<br><span class="bad">' + L('这么大的图手机浏览器可能画不出来，请选较低的分辨率', 'Too large for a phone browser to draw — choose a lower resolution') + '</span>' : '');
    }
    $('mPreflight').checked = App.prefs().preflight !== false;
    $('mWechatNote').classList.toggle('hidden', !inWeChat);
  }
  function openExport() {
    if (!S()) { UI.toast(L('先打开一张凝胶图', 'Open a gel image first')); return; }
    if (G.FigEdit) G.FigEdit.closePop();
    exportSync();
    openSheet('exportSheet');
  }
  $('mDpiSeg').addEventListener('click', e => {
    const b = e.target.closest('button[data-dpi]'); if (!b || !S()) return;
    $('dpiTop').value = b.dataset.dpi;
    $('dpiTop').dispatchEvent(new Event('change'));
    exportSync();
  });
  // the sheet only forwards to the desktop export buttons: one code path for both layouts
  const XBTN = { png: 'btnPNG', tiff: 'btnTIFF', svg: 'btnSVG', pptx: 'btnPPTX', uncropped: 'btnUncropped', original: 'btnOriginal', log: 'btnLog', project: 'btnSaveProj' };
  $('exportSheet').addEventListener('click', e => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    closeSheets();
    $(XBTN[b.dataset.x]).click();
  });
  $('mPreflight').addEventListener('change', e => { $('preflightOn').checked = e.target.checked; $('preflightOn').dispatchEvent(new Event('change')); });

  /* more: files, style, help, language, reset */
  const MORE = {
    open: () => $('fileInput').click(),
    openProj: () => $('projInput').click(),
    history: () => G.HistoryUI.open(),
    saveProj: () => $('btnSaveProj').click(),
    saveTpl: () => $('btnSaveTpl').click(),
    loadTpl: () => $('tplInput').click(),
    help: () => $('helpDlg').classList.remove('hidden'),
    lang: () => $('btnLang').click(),
    reset: () => $('btnResetAll').click()
  };
  $('btnMore').onclick = () => {
    const has = !!S();
    $('moreSheet').querySelectorAll('[data-m="saveProj"],[data-m="saveTpl"],[data-m="loadTpl"],[data-m="reset"]').forEach(b => b.classList.toggle('hidden', !has));
    openSheet('moreSheet');
  };
  $('moreSheet').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    closeSheets();
    MORE[b.dataset.m]();   // still inside the tap: file pickers may open
  });

  /* exported files: a picture to long-press into Photos (works inside WeChat too), the system share
   * sheet ("Save to Files", other apps) where the browser has one, or a plain download */
  let resultFile = null;
  const TYPES = { png: 'image/png', tif: 'image/tiff', tiff: 'image/tiff', svg: 'image/svg+xml', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', json: 'application/json', gelfig: 'application/octet-stream' };
  const fmtBytes = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const canShare = f => { try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; } };
  function dropResult() { resultFile = null; $('rsImg').removeAttribute('src'); }
  function showResult(blob, name) {
    closeSheets();
    const ext = (name.split('.').pop() || '').toLowerCase();
    resultFile = new File([blob], name, { type: blob.type || TYPES[ext] || 'application/octet-stream' });
    const pic = /^image\/(png|jpeg)$/.test(resultFile.type), share = canShare(resultFile);
    $('rsName').textContent = name;
    $('rsSize').textContent = fmtBytes(blob.size);
    $('rsPreview').classList.toggle('hidden', !pic);
    if (pic) {
      // a data: URL, not blob: — WeChat's long-press "save image" cannot read blob URLs
      const fr = new FileReader(), file = resultFile;
      fr.onload = () => { if (resultFile === file) $('rsImg').src = fr.result; };
      fr.readAsDataURL(blob);
    }
    $('rsShare').classList.toggle('hidden', !share);
    $('rsSave').classList.toggle('hidden', inWeChat);
    $('rsWechat').classList.toggle('hidden', !inWeChat);
    $('rsTip').textContent = pic ? L('长按图片即可存到相册或发给朋友。', 'Long-press the picture to save it to Photos or send it.')
      : share ? L('用“分享 / 存储”可以存到“文件”或发到其他 App。', 'Use Share / Save to put it in Files or send it to another app.') : '';
    $('resultSheet').classList.remove('hidden');
  }
  G.Export.deliver = (blob, name) => { if (!handOver()) return false; showResult(blob, name); return true; };
  $('rsShare').onclick = async () => {
    if (!resultFile) return;
    try { await navigator.share({ files: [resultFile], title: resultFile.name }); }
    catch (e) { if (e.name !== 'AbortError') UI.toast(L('无法分享：', 'Could not share: ') + e.message); }
  };
  $('rsSave').onclick = () => { if (resultFile) G.Export.saveAs(resultFile, resultFile.name); };

  /* ---------- selection bar on the image: the keyboard's Delete / H / ← → for fingers ---------- */
  function selSync() {
    const st = S(), bar = $('selBar');
    let name = '', html = '';
    if (st && (phone() ? view() === 'raw' : lastTouch)) {
      const li = App.selLane, ai = App.selArrow;
      if (li >= 0 && st.lanes[li]) {
        const l = st.lanes[li];
        name = L(`孔 ${li + 1}`, `Well ${li + 1}`) + (l.name ? ' · ' + l.name.replace(/\*/g, '') : '') + (l.hidden ? L('（已剪除）', ' (cut)') : '');
        html = `<button data-s="left" title="${L('左移（按住连续移动）', 'Move left (hold to repeat)')}">◀</button><button data-s="right" title="${L('右移（按住连续移动）', 'Move right (hold to repeat)')}">▶</button>`
          + `<button data-s="hide">${l.hidden ? L('恢复', 'Restore') : L('剪除', 'Cut')}</button><button data-s="del" class="danger">${L('删除', 'Delete')}</button>`
          + `<button data-s="none" class="x" title="${L('取消选择', 'Deselect')}">×</button>`;
      } else if (ai >= 0 && st.arrows[ai]) {
        name = L('目标条带：', 'Target band: ') + (App.arrowLabel(st.arrows[ai]) || L('（未命名）', '(unnamed)'));
        html = `<button data-s="edit">${L('编辑', 'Edit')}</button><button data-s="adel" class="danger">${L('删除', 'Delete')}</button>`
          + `<button data-s="none" class="x" title="${L('取消选择', 'Deselect')}">×</button>`;
      }
    }
    bar.classList.toggle('hidden', !html);
    if (html && bar.dataset.sig !== name + html) { bar.dataset.sig = name + html; $('selName').textContent = name; $('selBtns').innerHTML = html; }
  }
  $('selBtns').addEventListener('click', e => {
    const b = e.target.closest('button[data-s]'), st = S(); if (!b || !st) return;
    const k = b.dataset.s, li = App.selLane, ai = App.selArrow;
    if (k === 'hide' && st.lanes[li]) { if (App.toggleLaneHidden(li, !st.lanes[li].hidden)) App.commit(); }
    else if (k === 'del' && st.lanes[li]) {
      if (G.FigEdit) G.FigEdit.closePop();
      App.removeLane(li); App.selLane = -1; App.commit();
      UI.toast(L('已删除泳道（点顶部 ↺ 可撤销）', 'Lane deleted (↺ at the top undoes it)'));
    } else if (k === 'edit' && st.arrows[ai]) G.FigEdit.arrowPopover(ai, null);
    else if (k === 'adel' && st.arrows[ai]) { G.FigEdit.closePop(); st.arrows.splice(ai, 1); App.selArrow = -1; App.commit(); }
    else if (k === 'none') { App.selLane = -1; App.selArrow = -1; App.emit('select'); }
  });
  // ◀ ▶ nudge the lane by about one screen pixel; holding the button keeps it moving
  $('selBtns').addEventListener('pointerdown', e => {
    const b = e.target.closest('button[data-s="left"], button[data-s="right"]');
    if (!b || !S()) return;
    e.preventDefault();
    const dir = b.dataset.s === 'left' ? -1 : 1;
    let timer = 0;
    const stop = () => {
      clearTimeout(timer);
      window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop);
      const st = S(), moved = st && st.lanes[App.selLane];
      if (!moved) return;
      App.sortLanesIfNeeded(); App.selLane = st.lanes.indexOf(moved); App.commit();
    };
    const step = () => {
      const l = S() && S().lanes[App.selLane];
      if (!l) return;
      App.dragLane(App.selLane, l.x + dir * Math.max(0.5, 1 / G.Editor.zoom()));
      G.Editor.draw(); App.refresh();
    };
    window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop);
    step();
    timer = setTimeout(function again() { step(); timer = setTimeout(again, 50); }, 380);
  });

  /* ---------- image and figure headers ---------- */
  $('btnAddLaneM').onclick = () => { if (S()) G.FigEdit.setMode(App.mode === 'lane' ? null : 'lane'); };
  // the banner sits just under the visible pane's header (the coach line above it varies in height)
  function placeBannerTop() {
    if (!phone() || banner.classList.contains('hidden')) { banner.style.top = ''; return; }
    const head = document.querySelector(view() === 'fig' ? '#figureTools' : '#rawGridTools');
    const r = head && head.getBoundingClientRect();
    banner.style.top = r && r.height ? Math.round(r.bottom + 6) + 'px' : '';
  }
  new MutationObserver(() => {
    $('btnAddLaneM').classList.toggle('on', App.mode === 'lane' && !banner.classList.contains('hidden'));
    placeBannerTop();
  }).observe(banner, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', placeBannerTop);
  function zoomLabel() { $('btnFigZoom').textContent = UI.figZoom() > 1 ? L('适应宽度', 'Fit') : L('放大', 'Zoom in'); }
  $('btnFigZoom').onclick = () => { UI.setFigZoom(UI.figZoom() > 1 ? 1 : 2); zoomLabel(); };
  zoomLabel();

  // a warning is cut to two lines on a phone: tap to read all of it
  $('warnings').addEventListener('click', e => { const d = e.target.closest('#warnings > div'); if (d && e.target.tagName !== 'BUTTON') d.classList.toggle('open'); });

  // how much of the layout the on-screen keyboard covers (iOS does not resize the page): popovers sit above it
  const vv = window.visualViewport;
  if (vv) {
    const kb = () => {
      const h = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', (h > 80 ? Math.round(h) : 0) + 'px');
    };
    vv.addEventListener('resize', kb); vv.addEventListener('scroll', kb);
  }

  /* ---------- camera photos ----------
   * iPhones take 24–48 MP photos, but Safari cannot draw a canvas above ~16.7 MP: the image would come
   * out blank. On touch devices photos (never TIFFs from an imager) above 10 MP are scaled to 10 MP —
   * plenty for a figure — and saved as a PNG named after the original, so the processing log and the
   * "original data" export say what was used. The photo in the library is not touched. */
  const MAX_PHOTO_PX = 10e6;
  async function fitPhotos(files) {
    if (!handOver() || typeof createImageBitmap !== 'function') return files;
    const out = [];
    for (const f of files) {
      if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type || '') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) { out.push(f); continue; }
      let bmp = null;
      try { bmp = await createImageBitmap(f); } catch (e) { out.push(f); continue; }   // the loader reports undecodable files
      const n = bmp.width * bmp.height;
      if (n <= MAX_PHOTO_PX) { bmp.close && bmp.close(); out.push(f); continue; }
      const k = Math.sqrt(MAX_PHOTO_PX / n), w = Math.floor(bmp.width * k), h = Math.floor(bmp.height * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close && bmp.close();
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      if (!blob) { out.push(f); continue; }
      out.push(new File([blob], f.name.replace(/\.[^.]+$/, '') + `_${w}x${h}.png`, { type: 'image/png' }));
      UI.toast(L(`照片有 ${(n / 1e6).toFixed(0)} MP，已缩小到 ${(w * h / 1e6).toFixed(0)} MP 以便在手机上处理（相册里的原图不变）`,
        `The photo has ${(n / 1e6).toFixed(0)} MP; scaled to ${(w * h / 1e6).toFixed(0)} MP so the phone can process it (the original stays in your library)`), 5200);
    }
    return out;
  }

  /* ---------- wiring ---------- */
  App.on(what => {
    if (what === 'refresh') return;
    if (what === 'loaded') {
      UI.setFigZoom(1); zoomLabel(); closeSheets();
      sync();
      if (phone()) {
        setView('fig');   // land on the figure: that is what was detected
        // the bars just appeared and took some height: fit the image to what is left
        requestAnimationFrame(() => { G.Editor.resize(); G.Editor.fitCrop(); UI.updatePreview(); });
      }
      return;
    }
    mirror(); selSync();
    if (!$('exportSheet').classList.contains('hidden')) exportSync();
  });
  UI.phoneMq.addEventListener('change', () => {
    sync();
    if (S()) { App.emit('change'); requestAnimationFrame(() => { G.Editor.resize(); G.Editor.fitCrop(); }); }
  });
  G.I18N.onChange(() => { zoomLabel(); selSync(); if (S()) exportSync(); });
  sync();

  G.Mobile = { setView, view, openExport, showResult, closeSheets, fitPhotos };
})(window);
