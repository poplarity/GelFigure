/* UI: panel sections, top bar, coach line, live preview. Direct editing on the figure lives in figedit.js. */
(function (G) {
  'use strict';
  const App = G.App, E = G.Engine, L = G.L;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const toSlider = v => Math.round(Math.sqrt(Math.max(0, Math.min(1, v))) * 1000);
  const fromSlider = s => (s / 1000) ** 2;
  const pct = v => (v * 100).toFixed(v < 0.1 ? 3 : 2) + '%';
  const S = () => App.S;
  const live = fn => e => { if (!S()) return; fn(e); App.refresh(); };
  const done = fn => e => { if (!S()) return; if (fn) fn(e); App.commit(); };
  const list = a => a.join(L('、', ', '));
  // phone layout (tabs instead of side-by-side panes; mobile.js). Must match the @media rule in style.css
  const phoneMq = matchMedia('(max-width: 900px), (max-height: 520px) and (pointer: coarse)');
  const isPhone = () => phoneMq.matches;
  // where things are, in words that fit the layout on screen
  const P = (desk, ph) => (isPhone() ? ph : desk);

  function storageNotice() {
    document.querySelectorAll('.storage-note').forEach(el => el.classList.toggle('hidden', G.PrefStorage.persistent));
  }
  window.addEventListener('gelfigure-storage-unavailable', storageNotice);
  storageNotice();
  if (location.protocol === 'file:') $('offlineDownload').hidden = true;

  /* ---------- toasts / warnings ---------- */
  function toast(msg, ms) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => { el.style.transition = '.25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); }, ms || 2400);
  }
  const dismissed = new Set();
  function showWarnings(items) {
    const box = $('warnings');
    box.innerHTML = '';
    (items || []).filter(w => !dismissed.has(w)).slice(0, 3).forEach(w => {
      const d = document.createElement('div');
      d.innerHTML = `<span>⚠ ${esc(w)}</span>`;
      const x = document.createElement('button'); x.textContent = '×'; x.title = L('不再提示', 'Dismiss');
      x.onclick = () => { dismissed.add(w); d.remove(); };
      d.appendChild(x); box.appendChild(d);
    });
  }

  /* ---------- helpers ---------- */
  const range = () => (S() && App.laneRange()) || null;
  // lanes that appear in the figure, left to right
  const figLanes = () => { const r = range(); if (!r) return []; const out = []; for (let i = r[0]; i <= r[1]; i++) if (!S().lanes[i].hidden) out.push(i); return out; };
  const isMarkerLane = i => S().markers.some(m => m.lane === i);
  App.afterRangeChange = function () {
    // Cropping only changes what is displayed. Re-detection is an explicit action below.
    App.refresh();
  };

  // Finish inline/side-panel edits before capturing a project or switching pictures.
  function flushPending() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (G.FigEdit) G.FigEdit.flush();
  }
  async function archiveCurrent() {
    if (!S()) return true;
    flushPending();
    if (await App.saveDraft()) return true;
    return confirm(L('当前进度未能缓存（浏览器存储不可用或空间不足）。建议先用“保存项目”留一份。仍要切换并放弃未保存的更改吗？',
      'The current work could not be cached (storage is unavailable or full). Save a project file first. Switch anyway and discard unsaved changes?'));
  }

  /* ---------- loading ---------- */
  // files: FileList / array. A .gelfig opens a project; several images = several exposures
  async function load(files) {
    files = [...(files.length != null ? files : [files])];
    if (!files.length) return;
    const proj = files.find(f => /\.gelfig$/i.test(f.name));
    if (proj) return openProject(proj);
    if (!await archiveCurrent()) return;
    // phones: very large camera photos are scaled to what a phone browser can draw (mobile.js)
    if (G.Mobile && G.Mobile.fitPhotos) files = await G.Mobile.fitPhotos(files);
    await App.load(files.length > 1 ? files : files[0]);
    if (!S()) return;
    const r = range(), n = r ? r[1] - r[0] + 1 : 0, nw = S().lanes.length, nm = S().markers.length;
    let msg = L(`识别完成：${nw} 个加样孔，出图 ${n} 条泳道` + (nm ? `，${nm} 个 Marker` : '，未找到 Marker'),
      `Detected ${nw} wells, ${n} lanes in the figure` + (nm ? `, ${nm} marker${nm > 1 ? 's' : ''}` : ', no marker found'));
    if (App.exposures) {
      const e = App.exposures[App.expIdx], c = (e.clipFrac * 100).toFixed(2);
      msg = L(`${App.exposures.length} 张曝光中自动选了 ${e.name}（过曝 ${c}%）。`, `Picked ${e.name} of ${App.exposures.length} exposures (${c}% saturated). `) + msg;
    }
    toast(msg, 4200);
    (App.loadWarnings || []).forEach(w => toast(w, 5200));
    if (App.ladderNotice) toast(App.ladderNotice, 5200);
    if (Math.abs(S().rotation) >= App.AUTO_ROT_LIMIT - 0.3) toast(L(`自动转正达到上限 ±${App.AUTO_ROT_LIMIT}°，请人工确认角度`, `Auto-straightening reached its ±${App.AUTO_ROT_LIMIT}° limit; please check the angle`), 5200);
  }
  async function openProject(f) {
    if (!await archiveCurrent()) return;
    try { App.busy(true, L('正在打开项目…', 'Opening project…')); await App.openProject(await f.arrayBuffer()); toast(L('项目已打开', 'Project opened')); }
    catch (e) { alert(L('打开项目失败：', 'Could not open the project: ') + e.message); } finally { App.busy(false); }
  }
  App.onDropFile = f => load([f]);
  function bindFile(id) { $(id).addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) load(fs); }); }
  bindFile('fileInput'); bindFile('fileInput2'); bindFile('fileInput3');
  $('projInput').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) openProject(f); });
  $('imgChip').onclick = () => $('fileInput').click();
  const demoFile = () => new File([G.Demo.encodeTiff16(G.Demo.makeGel())], 'demo_gel.tif', { type: 'image/tiff' });
  const demoProteinFile = () => new File([G.Demo.encodeTiff16(G.Demo.makeProteinGel())], 'demo_protein_gel.tif', { type: 'image/tiff' });
  $('btnDemo').onclick = () => load([demoFile()]);
  // drop anywhere in the window
  let dragDepth = 0;
  window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
    if (e.dataTransfer.files.length) load(e.dataTransfer.files);
  });
  // Paste an image straight into the drop zone (⌘V / Ctrl+V after a screenshot or "Copy image").
  // Text fields keep their normal paste; a copied project or plain text is left alone.
  function pasteName(f, i) {
    const ext = (f.type.split('/')[1] || 'png').replace('svg+xml', 'svg').replace('jpeg', 'jpg').replace('tiff', 'tif');
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `pasted_gel_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${i ? '_' + (i + 1) : ''}.${ext}`;
  }
  window.addEventListener('paste', e => {
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const dt = e.clipboardData;
    if (!dt) return;
    let files = [];
    for (const it of dt.items || []) {
      if (it.kind !== 'file' || !/^image\//.test(it.type)) continue;
      const f = it.getAsFile(); if (f) files.push(f);
    }
    // Safari exposes copied images only through files, and always with an empty type in some versions
    if (!files.length) files = [...(dt.files || [])].filter(f => /^(image\/|$)/.test(f.type));
    if (!files.length) return;
    e.preventDefault();
    load(files.map((f, i) => f.name ? f : new File([f], pasteName(f, i), { type: f.type || 'image/png' })));
    toast(L('已粘贴图片', 'Image pasted'));
  });

  /* ---------- draft restore (offered on the start screen) ---------- */
  async function offerDraft() {
    const d = await App.peekDraft();
    if (!d || S()) { $('draftBox').classList.add('hidden'); return; }
    $('draftName').textContent = d.projectName || d.name;
    $('draftTime').textContent = L('保存于 ', 'Saved ') + new Date(d.savedAt).toLocaleString(G.I18N.lang === 'en' ? 'en' : 'zh-CN');
    $('draftBox').classList.remove('hidden');
  }
  $('btnDraftRestore').onclick = async () => {
    try { App.busy(true, L('正在恢复…', 'Restoring…')); await App.restoreDraft(); toast(L('已恢复上次的进度', 'Restored your last session')); }
    catch (e) { alert(L('恢复失败：', 'Could not restore: ') + e.message); } finally { App.busy(false); }
  };
  $('btnDraftDrop').onclick = async () => {
    if (!confirm(L('删除这份本地缓存？已下载的项目文件不会删除。', 'Delete this local cache? Downloaded project files are kept.'))) return;
    try { await App.dropDraft(); $('draftBox').classList.add('hidden'); await offerDraft(); }
    catch (e) { toast(L('删除失败：', 'Could not delete: ') + e.message); }
  };

  /* ---------- exposures strip ---------- */
  function renderExposures() {
    const ex = App.exposures, box = $('expoStrip');
    if (!ex || ex.length < 2) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const best = Math.max(...ex.map(e => e.score));
    box.innerHTML = ex.map((e, k) => {
      const sc = (e.score * 100).toFixed(0), c = (e.clipFrac * 100).toFixed(2);
      return `<div class="expo-item${k === App.expIdx ? ' on' : ''}" data-k="${k}" title="${esc(e.name)}\n${L(`评分 ${sc} · 信噪比 ${e.snr.toFixed(0)} · 过曝 ${c}%`, `score ${sc} · SNR ${e.snr.toFixed(0)} · saturated ${c}%`)}">
      <img src="${e.thumb}" alt="">
      ${e.score === best ? `<span class="best">${L('推荐', 'Best')}</span> · ` : ''}${L(`${sc} 分`, `score ${sc}`)}<br>
      <span class="${e.clipFrac > 0.0005 ? 'clip' : ''}">${L('过曝', 'sat.')} ${c}%</span></div>`;
    }).join('');
    box.querySelectorAll('.expo-item').forEach(el => el.onclick = async () => {
      const r = await App.switchExposure(+el.dataset.k);
      if (r.kept) toast(L(`已切换到 ${S().file.name}，标注全部保留`, `Switched to ${S().file.name}; all annotations kept`));
      else if (r.namesCarried) toast(L('这张尺寸不同，已重新识别；泳道名按顺序沿用，请核对', 'This image has a different size and was re-detected; lane names were carried over in order — please check'));
      else if (r.kept === false) toast(L('这张的构图与之前不同，已重新识别，标注未沿用', 'This image is framed differently and was re-detected; annotations were not carried over'), 4200);
    });
  }

  /* ---------- top bar ---------- */
  $('btnUndo').onclick = () => App.undo();
  $('btnRedo').onclick = () => App.redo();
  $('btnHelp').onclick = () => $('helpDlg').classList.remove('hidden');
  $('btnHelpClose').onclick = () => $('helpDlg').classList.add('hidden');
  // an open popover is built in the old language: finish it first
  $('btnLang').onclick = () => { if (G.FigEdit) G.FigEdit.closePop(); G.I18N.set(G.I18N.lang === 'en' ? 'zh' : 'en'); };
  G.I18N.onChange(() => {
    renderFavs(); renderExposures(); ladderStatus();
    if (S()) App.emit('change');
    else offerDraft();
  });
  function menu(btn, m) {
    $(btn).onclick = e => { e.stopPropagation(); document.querySelectorAll('.menu').forEach(x => { if (x.id !== m) x.classList.add('hidden'); }); $(m).classList.toggle('hidden'); };
  }
  menu('btnTplMenu', 'tplMenu'); menu('btnExportMenu', 'exportMenu');
  document.addEventListener('click', () => document.querySelectorAll('.menu').forEach(x => x.classList.add('hidden')));
  let listPick = false;
  document.addEventListener('mousedown', e => { if (!(e.target.closest && e.target.closest('[data-pick]'))) listPick = false; }, true);
  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? App.redo() : App.undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); App.redo(); }
    // a lane picked by its number in the side list: Delete / ⌫ removes it, as on the image. Only that
    // explicit pick arms it — typing a lane name also selects the lane, and a stray ⌫ after finishing
    // the name must never delete it
    if ((e.key === 'Delete' || e.key === 'Backspace') && listPick && S() && App.selLane >= 0 && e.target !== $('editorBox')) {
      e.preventDefault();
      listPick = false;
      App.removeLane(App.selLane); App.selLane = -1; App.commit();
      toast(L('已删除泳道（Ctrl/⌘+Z 可撤销）', 'Lane deleted (Ctrl/⌘+Z to undo)'));
    }
    if (e.key === 'Escape') $('helpDlg').classList.add('hidden');
  });
  const baseName = () => (S() ? S().file.name.replace(/\.[^.]+$/, '') : 'gel');
  $('dpiTop').addEventListener('change', done(e => { S().style.dpi = +e.target.value; }));
  const needImage = () => { if (S()) return false; toast(L('先打开一张凝胶图', 'Open a gel image first')); return true; };

  /* ---------- export (with pre-flight) ---------- */
  $('preflightOn').checked = App.prefs().preflight !== false;
  $('preflightOn').addEventListener('change', e => App.setPref('preflight', e.target.checked));
  // resolves true = go ahead, false = user went back to fix
  function preflight() {
    return new Promise(resolve => {
      if (App.prefs().preflight === false) return resolve(true);
      const items = App.preflight(), serious = items.filter(i => i.level === 'block' || i.level === 'warn');
      if (!serious.length) return resolve(true);
      const lab = { block: L('需处理', 'Fix'), warn: L('注意', 'Warning'), info: L('提示', 'Note') };
      const box = $('pfList');
      box.innerHTML = items.map((it, k) => `<div class="pf-item"><span class="lv ${it.level}">${lab[it.level]}</span><span class="tx">${esc(it.text)}</span>${it.fix ? `<button class="btn sm" data-fix="${k}">${esc(it.fix.label)}</button>` : ''}</div>`).join('');
      box.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => { items[+b.dataset.fix].fix.run(); App.commit(); b.disabled = true; b.textContent = L('已修正', 'Fixed'); });
      $('pfOff').checked = false;
      $('preflightDlg').classList.remove('hidden');
      const close = ok => { $('preflightDlg').classList.add('hidden'); if ($('pfOff').checked) { App.setPref('preflight', false); $('preflightOn').checked = false; } resolve(ok); };
      $('pfBack').onclick = () => close(false);
      $('pfGo').onclick = () => close(true);
    });
  }
  async function exportRaster(kind) {
    if (needImage()) return;
    if (!(await preflight())) return;
    App.busy(true, L('正在导出…', 'Exporting…'));
    try {
      const f = App.buildFigure(false), dpi = S().style.dpi, eff = Math.round(App.effectiveDpi()), fmt = kind === 'tiff' ? 'TIFF' : 'PNG';
      if (kind === 'tiff') await G.Export.exportTIFF(f.svg, f.w, f.h, dpi, `${baseName()}_figure_${dpi}dpi.tif`, S());
      else await G.Export.exportPNG(f.svg, f.w, f.h, dpi, `${baseName()}_figure_${dpi}dpi.png`, S());
      toast(L(`已导出 ${dpi} dpi ${fmt}`, `Exported ${dpi} dpi ${fmt}`) + (eff < dpi ? L(`（胶图本身 ${eff} dpi）`, ` (the gel itself is ${eff} dpi)`) : ''));
      G.dispatchEvent(new Event('gelfigure-figure-exported'));
    } catch (e) { alert(e.message); } finally { App.busy(false); }
  }
  $('btnPNG').onclick = () => exportRaster('png');
  $('btnTIFF').onclick = () => exportRaster('tiff');
  $('btnPPTX').onclick = async () => {
    if (needImage() || !(await preflight())) return;
    App.busy(true, L('正在生成可编辑 PPTX…', 'Building editable PPTX…'));
    try {
      await G.PPTX.exportFile(baseName() + '_figure.pptx');
      toast(L('已导出 PPTX：文字图形可编辑，选中图片 → 裁剪可调整显示范围', 'Exported PPTX: text and shapes are editable; select a picture → Crop to adjust its visible region'));
      G.dispatchEvent(new Event('gelfigure-figure-exported'));
    } catch (e) { alert(e.message); } finally { App.busy(false); }
  };
  $('btnSVG').onclick = async () => { if (needImage() || !(await preflight())) return; G.Export.exportSVG(App.buildFigure(false).svg, baseName() + '_figure.svg'); toast(L('已导出 SVG', 'Exported SVG'));G.dispatchEvent(new Event('gelfigure-figure-exported')); };
  $('btnUncropped').onclick = () => { if (needImage()) return; App.renderFull(); G.Export.exportUncropped(S(), App.fullCanvas, baseName() + '_uncropped_same-processing.png'); toast(L('已导出未裁切图（与成图同处理）', 'Exported the uncropped image (same processing as the figure)')); };
  $('btnOriginal').onclick = () => { if (needImage()) return; G.Export.exportOriginal(S(), App.srcBuffer); toast(L('已导出原始文件', 'Exported the original file') + ' (SHA-256 ' + S().file.sha256.slice(0, 12) + '…)'); };
  $('btnLog').onclick = () => { if (needImage()) return; G.Export.download(new Blob([JSON.stringify(G.Export.processingLog(S()), null, 2)], { type: 'application/json' }), baseName() + '_processing_log.json'); };

  /* ---------- project / style files ---------- */
  $('btnSaveProj').onclick = async () => {
    if (needImage()) return;
    const b = await App.projectBlob();
    G.Export.download(b, baseName() + '.gelfig');
    toast(L('项目已保存（含原图，可在其他电脑打开继续编辑）', 'Project saved (includes the original image; continue on any computer)'));
  };
  $('btnSaveTpl').onclick = () => { if (!needImage()) G.Export.download(new Blob([JSON.stringify(App.template(), null, 2)], { type: 'application/json' }), baseName() + '_style.json'); };
  $('tplInput').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f || needImage()) return;
    try {
      const t = JSON.parse(await f.text()), chk = App.checkTemplate(t), a = chk.templateLanes, b = chk.figureLanes;
      if (a && a !== b && !confirm(L(
        `样式有 ${a} 条泳道，当前出图范围是 ${b} 条。\n套用后会从当前第一条泳道起按顺序对应，并把出图范围调整为 ${a} 条。继续吗？`,
        `The style has ${a} lanes; the figure currently shows ${b}.\nNames will be applied in order from the first lane and the figure range set to ${a} lanes. Continue?`))) return;
      const r = App.applyTemplate(t);
      toast(L('样式已套用', 'Style applied') + (r.importedLadders.length ? L(`，并导入自定义 Ladder：${list(r.importedLadders)}`, `; imported custom ladders: ${list(r.importedLadders)}`) : ''));
    } catch (err) { alert(L('样式载入失败：', 'Could not apply the style: ') + err.message); }
  });
  $('btnResetAll').onclick = () => {
    if (needImage()) return;
    if (!confirm(L('重置整图：旋转、裁切、泳道、Marker、名称、分组、箭头、版式全部回到刚导入时的样子。\n此操作会清空撤销记录。继续吗？',
      'Reset everything: rotation, crop, lanes, markers, names, groups, arrows and layout go back to how they were right after import.\nThis clears the undo history. Continue?'))) return;
    App.resetAll(); G.Editor.fitCrop(); toast(L('已回到导入时的状态', 'Back to the state after import'));
  };

  /* ---------- 1 image ---------- */
  document.querySelectorAll('#gelSeg button').forEach(b => b.onclick = done(() => {
    if (b.dataset.gel === App.gelKind()) return;
    const kind = b.dataset.gel;
    App.setGelType(kind);
    toast(kind === 'protein'
      ? L('已切换为蛋白胶模式：Marker 单位为 kDa，Ladder 库和匹配容差都换成了蛋白胶的', 'Switched to protein mode: kDa marker units, protein ladder library and tolerances')
      : L('已切换为 DNA 胶模式：Marker 单位为 bp', 'Switched to DNA mode: marker units in bp'));
  }));
  $('invChk').addEventListener('change', done(e => { S().levels.invert = e.target.checked; App.invertInherited = false; }));
  $('displayModeSeg').addEventListener('click', done(e => {
    const b = e.target.closest('[data-display]');
    if (b && !b.disabled) App.setDisplayMode(b.dataset.display);
  }));
  $('lvBlack').addEventListener('input', live(e => { S().levels.black = Math.min(fromSlider(+e.target.value), S().levels.white - 0.0005); $('lvBlackV').textContent = pct(S().levels.black); drawHisto(); updateClipLine(); }));
  $('lvWhite').addEventListener('input', live(e => { S().levels.white = Math.max(fromSlider(+e.target.value), S().levels.black + 0.0005); $('lvWhiteV').textContent = pct(S().levels.white); drawHisto(); updateClipLine(); }));
  $('lvBlack').addEventListener('change', done()); $('lvWhite').addEventListener('change', done());
  // rotation: live while dragging (annotations follow), one commit + band re-check when released
  $('rot').addEventListener('input', live(e => { App.setRotation(+e.target.value); $('rotNum').value = S().rotation; $('rotV').textContent = S().rotation + '°'; G.Editor.setGrid(true); }));
  function commitRotation() {
    G.Editor.setGrid($('showGrid').checked);
    App.afterRotation(); App.commit();
    const d = S().rotation;
    if (Math.abs(d) > App.AUTO_ROT_LIMIT) toast(L(`旋转 ${d}°：角度较大，图像四角会被裁掉或拉伸，请确认裁切框只框住胶块内部`, `Rotation ${d}°: at large angles the image corners are cut off; make sure the crop box stays inside the gel`), 4200);
  }
  $('rot').addEventListener('change', () => { if (S()) commitRotation(); });
  $('rotNum').addEventListener('change', e => { if (!S()) return; App.setRotation(+e.target.value || 0); commitRotation(); });
  $('rotMinus').onclick = () => { if (!S()) return; App.setRotation(S().rotation - 0.5); commitRotation(); };
  $('rotPlus').onclick = () => { if (!S()) return; App.setRotation(S().rotation + 0.5); commitRotation(); };
  // orientation: flips carry all annotations; quarter turns re-detect and keep names in order
  function applyOrient(next, what) {
    if (!S()) return;
    const r = App.setOrient(next);
    if (!r.ok) return;
    if (r.redetected) {
      const msg = r.lanesAfter === r.lanesBefore
        ? L(`${what}：已重新识别泳道并保留泳道名`, `${what}: lanes re-detected, names kept`)
        : L(`${what}：旋转后识别到 ${r.lanesAfter} 条泳道（原来 ${r.lanesBefore} 条），泳道名已按顺序保留前 ${Math.min(r.lanesAfter, r.lanesBefore)} 个，请核对`, `${what}: ${r.lanesAfter} lanes detected (was ${r.lanesBefore}); the first ${Math.min(r.lanesAfter, r.lanesBefore)} names were kept in order — please check`);
      toast(msg, 5200);
    }
    requestAnimationFrame(() => G.Editor.resize());
  }
  $('btnRotCW').onclick = () => applyOrient({ r: 90, f: 0 }, L('顺时针 90°', 'Rotated 90° clockwise'));
  $('btnRotCCW').onclick = () => applyOrient({ r: 270, f: 0 }, L('逆时针 90°', 'Rotated 90° anticlockwise'));
  $('btnFlipH').onclick = () => applyOrient({ r: 0, f: 1 }, L('水平翻转', 'Mirrored left to right'));
  $('btnFlipV').onclick = () => applyOrient({ r: 180, f: 1 }, L('垂直翻转', 'Mirrored top to bottom'));
  let straightenRequest=0;
  $('btnDeskew').onclick = () => {
    if (!S()) return;
    const state=S(),request=++straightenRequest,busyLabel=L('正在检测角度…','Measuring the angle…');
    App.busy(true,busyLabel);
    setTimeout(() => {
      try {
        if(S()!==state)return;
        const a=App.autoDeskew();App.afterRotation();App.commit();
        toast(Math.abs(a)>=App.AUTO_ROT_LIMIT-.3
          ? L(`自动转正到达上限 ${a}°，可能还没转正，请手动确认`,`Auto-straightening hit its limit at ${a}°; the gel may still be tilted — please check`)
          : L(`已转正为 ${a}°（标注已随图转动）`,`Straightened to ${a}° (annotations rotated with the image)`),3600);
      } finally {
        // A canceled request still owns its waiting screen, but must not dismiss a newer image load.
        if(request===straightenRequest&&$('busyText').textContent===busyLabel)App.busy(false);
      }
    },20);
  };
  $('btnResetRot').onclick = () => { if (!S()) return; App.resetRotation(); App.commit(); toast(L(`已回到自动角度 ${S().rotation}°`, `Back to the automatic angle ${S().rotation}°`)); };
  $('showGrid').addEventListener('change', e => { G.Editor.setGrid(e.target.checked); });
  function clearImageGrid(){ $('showGrid').checked=false;G.Editor.setGrid(false); }
  $('rotationFine').addEventListener('toggle',()=>{if(!$('rotationFine').open)clearImageGrid();});
  $('btnResetLv').onclick = done(() => { App.resetLevels(); toast(L('对比度已重置（Ctrl+Z 可撤销）', 'Contrast reset (Ctrl+Z to undo)')); });
  $('btnAutoLv').onclick = done(() => App.autoLevels());
  function updateClipLine() {
    if (!S()) return;
    const k = App.clipStats(), bc = App.bandClipFrac();
    const p = v => (v * 100).toFixed(v < 0.001 ? 3 : 2) + '%';
    $('clipLine').innerHTML = `${L('相机过曝', 'Camera saturation')} <span class="${k.sensorFrac > 0.0005 ? 'bad' : 'ok'}">${p(k.sensorFrac)}</span> · ${L('色阶削顶', 'Contrast clipping')} <span class="${bc > 0.001 ? 'bad' : 'ok'}">${p(bc)}</span>`;
    $('clipLine').title = L(`裁切区 ${k.n} 像素中：相机饱和 ${k.sensor}；被对比度压成纯白/纯黑：亮端 ${k.high}、暗端 ${k.low}`,
      `Of ${k.n} pixels in the crop: ${k.sensor} saturated by the camera; clipped by the contrast setting: ${k.high} bright, ${k.low} dark`);
  }
  $('showSat').addEventListener('change', () => G.Editor.draw());
  $('gammaUnlock').addEventListener('change', e => {
    $('gamma').disabled = !e.target.checked;
    if (!e.target.checked && S()) { S().levels.gamma = 1; App.commit(); }
  });
  $('gamma').addEventListener('change', done(e => { S().levels.gamma = E.clamp(+e.target.value || 1, 0.2, 5); }));

  /* ---------- 2 lane alignment ---------- */
  $('btnAutoLanes').onclick = done(() => { App.autoLanes(); App.detectMarkersInCrop(); toast(L('已重新识别泳道和 Marker，请核对', 'Lanes and markers re-detected; please check')); });
  $('btnRedetectCrop').onclick = done(() => {
    const r = App.redetectCrop();
    toast(r.lanes ? L(`框内识别出 ${r.lanes} 条泳道、${r.markers} 个 Marker；请核对`, `Detected ${r.lanes} lanes and ${r.markers} markers inside the crop; please check`) : L('框内没识别到泳道，请调整红框或填写条数', 'No lanes detected; adjust the crop or enter the count'));
  });
  function setGridCount(n) {
    if (!S()) return;
    if (!Number.isFinite(n) || n < 1) { const r = App.laneRange(); $('cropLaneN').value = r ? r[1] - r[0] + 1 : 1; return; }
    G.FigEdit && G.FigEdit.flush();
    const res = App.resizeLaneGrid(n); App.commit();
    if (res.removedMarkers) toast(L('减少条数移除了对应的 Marker，Ctrl/⌘+Z 可撤销', 'Reducing the count removed a marker; Ctrl/⌘+Z undoes it'));
  }
  $('cropLaneN').addEventListener('change', e => setGridCount(+e.target.value));
  $('cropLaneN').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.target.blur(); } });
  $('laneCountMinus').onclick = () => setGridCount(Math.max(1, +$('cropLaneN').value - 1));
  $('laneCountPlus').onclick = () => setGridCount(Math.min(60, +$('cropLaneN').value + 1));
  function gridLabels() {
    $('laneCountMinus').setAttribute('aria-label', L('减少一条泳道', 'One fewer lane'));
    $('laneCountPlus').setAttribute('aria-label', L('增加一条泳道', 'One more lane'));
    $('figureTools').setAttribute('aria-label', L('成图编辑', 'Figure editing'));
  }
  gridLabels(); G.I18N.onChange(gridLabels);
  $('laneLinked').onchange = done(e => { S().laneLinked = e.target.checked; if (e.target.checked) App.resizeLaneGrid(+$('cropLaneN').value); });

  // empty lanes inside the range: suggest cutting them (never done silently)
  const ignoredEmpty = new Set();
  function updateEmptyBar() {
    const st = S(), empt = App.emptyLanes().filter(i => !ignoredEmpty.has(st.file.sha256 + ':' + i));
    $('emptyBar').classList.toggle('hidden', !empt.length);
    if (!empt.length) return;
    const wells = list(empt.map(i => i + 1));
    $('emptyText').innerHTML = L(`孔 <b>${wells}</b> 看起来是空泳道（几乎没有条带）。剪除后会自动加拼接间隙，并在处理记录里注明。`,
      `Well${empt.length > 1 ? 's' : ''} <b>${wells}</b> look${empt.length > 1 ? '' : 's'} empty (almost no bands). Removing adds a splice gap and is recorded in the processing log.`);
    $('btnCutEmpty').onclick = done(() => { empt.forEach(i => App.setLaneHidden(i, true, 'empty lane (suggested, user confirmed)')); toast(L(`已剪除 ${empt.length} 条空泳道（Ctrl+Z 可撤销）`, `Removed ${empt.length} empty lane${empt.length > 1 ? 's' : ''} (Ctrl+Z to undo)`)); });
    $('btnIgnoreEmpty').onclick = () => { empt.forEach(i => ignoredEmpty.add(st.file.sha256 + ':' + i)); updateEmptyBar(); };
  }
  // cutting a marker lane removes the size reference: always ask
  function toggleLaneHidden(i, hidden) {
    if (hidden && isMarkerLane(i) && !confirm(L(`孔 ${i + 1} 是 Marker 泳道，剪除后成图上就没有分子量参照了。确定剪除吗？`, `Well ${i + 1} is a marker lane; removing it leaves the figure without a size reference. Remove it anyway?`))) return false;
    App.setLaneHidden(i, hidden, 'manual');
    return true;
  }
  App.toggleLaneHidden = toggleLaneHidden;
  $('spliceGap').addEventListener('input', live(e => { S().style.spliceGapPt = +e.target.value; $('spliceGapV').textContent = e.target.value + ' pt'; }));
  $('spliceGap').addEventListener('change', done());
  document.querySelectorAll('#spliceSeg button').forEach(b => b.onclick = done(() => { S().style.spliceStyle = b.dataset.sp; }));
  // the splice settings only mean something once a lane in the figure has been cut out
  function updateSpliceBox() {
    const st = S(), r = range(), y = st.style;
    const cut = r ? st.lanes.slice(r[0], r[1] + 1).some(l => l.hidden) : false;
    $('spliceBox').classList.toggle('hidden', !cut);
    document.querySelectorAll('#spliceSeg button').forEach(b => b.classList.toggle('on', b.dataset.sp === (y.spliceStyle || 'gap')));
    $('spliceGapRow').classList.toggle('hidden', y.spliceStyle === 'line');
    $('spliceGap').value = y.spliceGapPt != null ? y.spliceGapPt : 1.5; $('spliceGapV').textContent = $('spliceGap').value + ' pt';
  }

  /* ---------- 3 names (bulk) ---------- */
  function applyBulk() {
    const raw = $('laneBulk').value.replace(/\r/g, '').trim();
    if (!raw) return;
    let names = raw.includes('\t') ? raw.split(/\t|\n/) : raw.includes('\n') ? raw.split('\n') : raw.split(/[,，;；]/);
    names = names.map(s => s.trim());
    let lanes = figLanes();
    // more names than lanes in the figure: widen the range to the right
    if (names.length > lanes.length) {
      const r = range(), extra = names.length - lanes.length;
      if (r && r[1] + extra < S().lanes.length) {
        App.setLaneRange(r[0], r[1] + extra); lanes = figLanes();
        toast(L(`名称有 ${names.length} 个，出图范围已向右扩展 ${extra} 孔`, `${names.length} names given: the figure range was extended by ${extra} well${extra > 1 ? 's' : ''} to the right`));
      }
    }
    lanes.forEach((li, k) => { if (k < names.length) S().lanes[li].name = names[k]; });
    $('laneBulk').value = '';
    App.commit();
    const n = Math.min(names.length, lanes.length);
    toast(L(`已填入 ${n} 个泳道名`, `Filled in ${n} lane name${n > 1 ? 's' : ''}`));
  }
  $('btnEditNames').onclick = () => {
    if (!S()) return;
    if (G.Mobile && isPhone()) G.Mobile.setView('fig');
    const lanes = figLanes(), i = lanes.find(i => !S().lanes[i].name.trim()) ?? lanes[0];
    if (i != null) G.FigEdit.openEd('lane', i);
  };
  $('btnBulkNames').onclick = () => { $('figureNames').classList.toggle('hidden'); if (!$('figureNames').classList.contains('hidden')) $('laneBulk').focus(); };
  $('btnBulkClose').onclick = () => $('figureNames').classList.add('hidden');
  $('btnBulkApply').onclick = () => { if (S()) { applyBulk(); $('figureNames').classList.add('hidden'); } };
  function placeFigureMenus(){
    const v=window.visualViewport,x=(v?.offsetLeft||0)+8,y=(v?.offsetTop||0)+8;
    // visualViewport can report the previous width for a frame during phone resizing.
    const w=Math.max(16,Math.min(v?.width||innerWidth,innerWidth-x+8)),h=Math.max(16,Math.min(v?.height||innerHeight,innerHeight-y+8));
    ['figureTextMenu','laneAngleMenu'].forEach(id=>{
      if(!$(id).open)return;const field=$(id).querySelector('.figure-text-fields'),a=$(id).querySelector('summary').getBoundingClientRect();
      field.style.maxHeight=Math.max(40,h-16)+'px';const r=field.getBoundingClientRect();
      field.style.left=E.clamp(a.right-r.width,x,Math.max(x,x+w-r.width-16))+'px';
      field.style.top=E.clamp(a.bottom+6,y,Math.max(y,y+h-r.height-16))+'px';
    });
  }
  /* A viewport change and the click that opens a menu can be delivered in either order, so the first
   * placement may still see the old width and leave the menu hanging off a phone screen. Place again
   * once the new layout is live; the repeat is a no-op on a settled page. */
  const placeFigureMenusSoon=()=>{placeFigureMenus();requestAnimationFrame(placeFigureMenus);setTimeout(placeFigureMenus,80);};
  ['figureTextMenu','laneAngleMenu'].forEach(id=>{
    // Watch the `open` attribute, not just `toggle`: toggle is a queued task, so a menu opened and
    // measured in the same tick (a phone rotating into the figure view, say) keeps its stale spot.
    new MutationObserver(placeFigureMenusSoon).observe($(id),{attributes:true,attributeFilter:['open']});
    $(id).addEventListener('toggle',placeFigureMenusSoon);
    $(id).querySelector('summary').addEventListener('click',placeFigureMenusSoon);
    document.addEventListener('pointerdown', e=>{if(!$(id).contains(e.target))$(id).open=false;});
    $(id).addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing){e.stopPropagation();$(id).open=false;$(id).querySelector('summary').focus();}});
  });
  window.addEventListener('resize',placeFigureMenusSoon);
  window.visualViewport?.addEventListener('resize',placeFigureMenusSoon);
  window.visualViewport?.addEventListener('scroll',placeFigureMenus);
  $('laneBulk').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); applyBulk(); } });

  /* ---------- 4 markers ---------- */
  $('btnAutoMarkers').onclick = done(() => {
    App.detectMarkersInCrop();
    const n = S().markers.length;
    toast(n ? L(`找到 ${n} 个 Marker 泳道`, `Found ${n} marker lane${n > 1 ? 's' : ''}`) : L('出图范围内没找到明显的 Marker 泳道', 'No clear marker lane in the figure range'));
  });
  $('btnAddMarker').onclick = () => { if (S()) G.MarkerUI.pickLane(); };
  // live feedback for the size field: people paste "5000bp, 3000bp" straight from their notes
  function customParse() {
    if (!S()) return null;
    const el = $('customParse'), text = $('customSizes').value.trim();
    if (!text) { el.textContent = ''; el.classList.remove('warn-text'); return null; }
    try {
      const r = G.Ladders.parseSizes(text, App.gelKind());
      el.classList.remove('warn-text');
      el.textContent = L(`识别到 ${r.count} 条带（${r.unit}）：`, `Read ${r.count} bands (${r.unit}): `) + r.sizes.map(v => G.Ladders.fmt(v, r.unit + '-inline')).join(', ');
      return r;
    } catch (e) {
      el.classList.add('warn-text'); el.textContent = e.message; return null;
    }
  }
  let libraryState=null,libraryMarkers=[],libraryFocus=null;
  function bindMarkerDialog(dialog,closeDialog) {
    dialog.addEventListener('keydown',e=>{
      e.stopPropagation();if(e.isComposing)return;
      if(e.key==='Escape'){e.preventDefault();closeDialog();return;}
      if(e.key!=='Tab')return;
      const all=[...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length&&el.tabIndex>=0);
      if(!all.length)return;const first=all[0],last=all.at(-1);
      if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    });
    dialog.addEventListener('click',e=>{if(e.target===dialog)closeDialog();});
  }
  function closeMarkerLibrary(restore=true){
    $('markerLibDlg').classList.add('hidden');libraryState=null;libraryMarkers=[];
    if(restore){const target=libraryFocus?.isConnected&&libraryFocus.getClientRects().length?libraryFocus:$('btnMarkerLib');target.focus({preventScroll:true});}libraryFocus=null;
  }
  function openMarkerLibrary(mi=null,anchor){
    const trigger=anchor||document.activeElement;
    flushPending();libraryState=S();libraryMarkers=S()?.markers.slice()||[];libraryFocus=trigger;
    $('customApplyTarget').innerHTML=`<option value="">${L('仅保存到库，不改变当前图','Library only — keep the figure unchanged')}</option>`+libraryMarkers.map((m,i)=>`<option value="${i}">${L('泳道','Lane')} ${m.lane+1} · ${esc(G.Ladders.get(m.ladderId)?.name||m.ladderId)}</option>`).join('');
    $('customApplyTarget').value=mi!=null&&libraryMarkers[mi]?String(mi):'';
    $('btnSaveLadder').textContent=mi!=null&&libraryMarkers[mi]?L(`保存并用于泳道 ${libraryMarkers[mi].lane+1}`,`Save and use in lane ${libraryMarkers[mi].lane+1}`):L('保存到库','Save to library');
    $('customLadderAdv').open=mi!=null;renderFavs();$('markerLibDlg').classList.remove('hidden');
    (mi!=null?$('customName'):$('btnMarkerLibClose')).focus({preventScroll:true});
  }
  $('customSizes').addEventListener('input', customParse);
  $('btnSaveLadder').onclick = async () => {
    const name=$('customName').value.trim(),state=S(),kind=App.gelKind();
    const choice=$('customApplyTarget').value,target=libraryState===state&&choice!==''?libraryMarkers[+choice]:null;
    let parsed;
    try{parsed=G.Ladders.parseSizes($('customSizes').value,kind);}
    catch(e){$('customParse').classList.add('warn-text');$('customParse').textContent=e.message;toast(e.message,4500);return;}
    $('btnSaveLadder').disabled=true;
    try{
      await G.Ladders.ready;const lad=G.Ladders.saveCustom(name,parsed.sizes,kind);
      if(!G.Ladders.isFavorite(lad.id))G.Ladders.toggleFavorite(lad.id);
      const applied=!!(target&&state===S()&&G.MarkerUI.applyModel(target,lad.id));
      renderFavs();const saved=await G.Ladders.flush();
      $('customSizes').value='';$('customParse').textContent='';
      toast(!saved?L('已保存到本次库；本机缓存不可用，请备份 Marker 库','Saved for this session; local cache unavailable, so back up the marker library'):
        applied?L(`已保存，并用于泳道 ${target.lane+1}；可撤销`,`Saved and applied to lane ${target.lane+1}; undo is available`):
        L('已保存到库；当前图没有改变，可在“型号”中选择使用','Saved to the library; figure unchanged. Choose it under Ladder to use it.'),4500);
    }catch(e){toast(e.message,4500);}finally{$('btnSaveLadder').disabled=false;}
  };
  $('customApplyTarget').onchange=()=>{const v=$('customApplyTarget').value,m=v!==''?libraryMarkers[+v]:null;$('btnSaveLadder').textContent=m?L(`保存并用于泳道 ${m.lane+1}`,`Save and use in lane ${m.lane+1}`):L('保存到库','Save to library');};
  $('btnMarkerLib').onclick=()=>openMarkerLibrary();
  $('btnMarkerLibClose').onclick=()=>closeMarkerLibrary();
  $('btnMarkerLibDone').onclick=()=>closeMarkerLibrary();
  bindMarkerDialog($('markerLibDlg'),closeMarkerLibrary);
  $('btnBackupLadders').onclick=async()=>{await G.Ladders.ready;G.Export.download(new Blob([JSON.stringify(G.Ladders.backup(),null,2)],{type:'application/json'}),'GelFigure_markers.json');};
  $('btnImportLadders').onclick=()=>$('ladderLibraryInput').click();
  $('ladderLibraryInput').onchange=async e=>{
    const f=e.target.files[0];e.target.value='';if(!f)return;
    try{
      if(f.size>2*1024*1024)throw new Error(L('Marker 库文件不能超过 2 MB','Marker library file must be at most 2 MB'));
      await G.Ladders.ready;const n=G.Ladders.importLibrary(JSON.parse(await f.text())),saved=await G.Ladders.flush();renderFavs();if(S())renderMarkers();
      toast(saved?L(`已导入并保存 ${n} 个新型号，原有型号保留`,`${n} new models imported and saved; existing models kept`):
        L('已导入，但本机缓存不可用，请保留备份文件','Imported, but local caching is unavailable; keep the backup file'),5000);
    }catch(e){toast(L('导入失败：','Import failed: ')+e.message,5000);}
  };
  function ladderStatus(){
    const status=G.Ladders.cacheStatus;
    $('ladderCacheStatus').textContent=status==='saved'?L('已保存在此浏览器，下次打开可用','Saved in this browser; available next time'):
      status==='memory'?L('未能写入本机缓存，仅本次可用。请备份 Marker 库。','Local cache unavailable; this session only. Back up the marker library.'):
      status==='loading'?L('正在读取本机 Marker 库…','Loading local marker library…'):L('正在保存 Marker 库…','Saving marker library…');
    $('ladderCacheStatus').classList.toggle('warn-text',status==='memory');
  }
  let ladderRefresh=0;
  window.addEventListener('gelfigure-ladders',()=>{
    ladderStatus();cancelAnimationFrame(ladderRefresh);ladderRefresh=requestAnimationFrame(()=>{renderFavs();if(S()&&!$('markerList').contains(document.activeElement))renderMarkers();});
  });
  ladderStatus();
  /* favourites: biased first in auto-detection, listed first in menus */
  $('onlyFav').checked = !!App.prefs().onlyFavLadders;
  $('onlyFav').addEventListener('change', e => {
    App.setPref('onlyFavLadders', e.target.checked);
    toast(e.target.checked ? L('之后的自动识别只在常用型号中挑选（不吻合时回退全库）', 'Detection now picks from favourites only (falls back to all ladders if none fits)')
      : L('自动识别在全部型号中挑选（常用型号略优先）', 'Detection picks from all ladders (favourites slightly preferred)'));
  });
  function renderFavs() {
    const kind = App.gelKind();
    const mine = G.Ladders.favoritesOf(kind);
    $('favNote').textContent = mine.length ? L(`已选 ${mine.length} 个`, `${mine.length} chosen`) : L('未设置', 'none');
    // a plain tick list: a half-lit star gave no way to tell which ladders were actually chosen
    let lastVendor = null;
    $('favList').innerHTML = G.Ladders.ordered(kind).map(l => {
      const on = G.Ladders.isFavorite(l.id);
      // vendor headings among the unticked ones: the protein list alone has dozens of entries
      const v = on ? '★' : (l.custom ? L('自定义', 'Custom') : l.name.split(' ')[0]);
      const head = v !== lastVendor ? `<div class="fav-head">${esc(v === '★' ? L('★ 已勾选', '★ Ticked') : v)}</div>` : '';
      lastVendor = v;
      return head + `<label class="item fav-row${on ? ' on' : ''}"><input type="checkbox" data-fav="${l.id}"${on ? ' checked' : ''}><span class="fav-name">${esc(l.name)}</span></label>`;
    }).join('');
    $('favList').querySelectorAll('[data-fav]').forEach(b => b.onchange = () => { G.Ladders.toggleFavorite(b.dataset.fav); renderFavs(); if (S()) renderMarkers(); });
    const custom = G.Ladders.all(kind).filter(l => l.custom);
    $('customList').innerHTML = custom.map(l => `<div class="item"><span style="flex:1">${esc(l.name)} <span class="h3-note">${L(`${l.sizes.length} 条`, `${l.sizes.length} bands`)}</span></span><button class="x" data-cdel="${l.id}" title="${L('删除', 'Delete')}">×</button></div>`).join('');
    $('customList').querySelectorAll('[data-cdel]').forEach(b => b.onclick = () => {
      const used = S() && S().markers.some(m => m.ladderId === b.dataset.cdel);
      if (used) { toast(L('当前图正在使用这个型号，先给 Marker 换一个型号再删除', 'This ladder is in use; choose another ladder for the marker first')); return; }
      if (!confirm(L('删除这个自定义 Ladder？', 'Delete this custom ladder?'))) return;
      G.Ladders.removeCustom(b.dataset.cdel); renderFavs(); if (S()) renderMarkers();
    });
  }
  renderFavs();
  function laneOpt(i, sel) { const l = S().lanes[i]; return `<option value="${i}"${i === sel ? ' selected' : ''}>${i + 1}${l.name ? ' · ' + esc(l.name.replace(/\*/g, '')).slice(0, 10) : ''}</option>`; }
  // ladder menu: the lab's own ladders first, then one group per vendor (the list runs to dozens)
  function ladderOptions(all, selId) {
    const opt = l => `<option value="${l.id}"${l.id === selId ? ' selected' : ''}>${esc(l.name)}</option>`;
    const favs = all.filter(l => G.Ladders.isFavorite(l.id)), rest = all.filter(l => !G.Ladders.isFavorite(l.id));
    const groups = new Map();
    rest.forEach(l => { const v = l.custom ? L('自定义', 'Custom') : l.name.split(' ')[0]; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(l); });
    return (favs.length ? `<optgroup label="${L('★ 常用', '★ Ours')}">${favs.map(opt).join('')}</optgroup>` : '')
      + [...groups].map(([v, ls]) => `<optgroup label="${esc(v)}">${ls.map(opt).join('')}</optgroup>`).join('');
  }
  function markerUnitOptions(kind) {
    const rows = kind === 'protein' ? [
      ['kDa', 'kDa（顶部单位）', 'kDa (heading)'], ['kDa-inline', '每条带带 kDa', 'kDa on each band']
    ] : [
      ['bp', 'bp（顶部单位）', 'bp (heading)'], ['kb', 'kb（顶部单位）', 'kb (heading)'],
      ['auto', 'bp / kb 自动', 'bp / kb auto'], ['bp-inline', '每条带带 bp', 'bp on each band'], ['kb-inline', '每条带带 kb', 'kb on each band']
    ];
    rows.push(['none', '不显示单位', 'No unit']);
    return rows.map(([v,zh,en]) => `<option value="${v}">${L(zh,en)}</option>`).join('');
  }
  function renderMarkers() {
    const st = S(), r = range(), host = $('markerList'), scroll = $('panel').scrollTop;
    const a = document.activeElement, fc = a?.closest('.mk-card');
    const focus = host.contains(a) ? {id:a.id,mi:fc?.dataset.mi,f:a.dataset.f,band:a.dataset.band} : null;
    const opened = new Map();
    host.querySelectorAll('details[data-section]').forEach(d => {
      if(d.open)opened.set(d.dataset.lane+':'+d.dataset.section,d.querySelector('.list')?.scrollTop||0);
    });
    host.innerHTML = st.markers.map((m,mi) => {
      const sc=m.score!=null?Math.round(m.score*100):null, out=!r||m.lane<r[0]||m.lane>r[1];
      const shown=m.bands.filter(b=>b.show&&!b.excluded).length,matched=m.bands.filter(b=>b.matched||b.manual).length;
      const detail=(section,title,body)=>`<details class="adv marker-detail" data-lane="${m.lane}" data-section="${section}"${opened.has(m.lane+':'+section)?' open':''}><summary>${title}</summary>${body}</details>`;
      return `<div class="mk-card${out?' out':''}" data-mi="${mi}">
        <div class="mk-head"><b class="mk-badge">${L('泳道','Lane')} ${m.lane+1}</b><span class="mk-score${sc!=null&&sc<60?' low':''}">${out?L('不在出图范围','Outside figure'):sc==null?L('请核对','Check bands'):sc<60?L('请核对型号','Check ladder'):L('吻合 ','Fit ')+sc+'%'}</span></div>
        <label class="marker-field"><span>${L('泳道','Lane')}</span><select data-f="lane" aria-label="${L('Marker 所在泳道','Marker lane')}">${st.lanes.map((l,i)=>laneOpt(i,m.lane).replace('<option ',`<option ${l.hidden||st.markers.some((q,j)=>j!==mi&&q.lane===i)?'disabled ':''}`)).join('')}</select></label>
        <div class="marker-field"><span>${L('型号','Ladder')}</span><button type="button" data-f="ladder" class="marker-model-button" aria-haspopup="dialog"><span>${esc(G.Ladders.get(m.ladderId)?.name||m.ladderId)}</span><small>${L('更换…','Change…')}</small></button></div>
        <label class="marker-field"><span>${L('单位','Units')}</span><select data-f="unit">${markerUnitOptions(App.gelKind())}</select></label>
        <p class="marker-match-summary">${L(`已定位 ${matched}/${m.bands.length} 条带 · 显示 ${shown} 条`,`Located ${matched}/${m.bands.length} bands · ${shown} shown`)}</p>
        <button class="btn sm primary marker-review" data-f="guide">${L('核对条带','Review bands')}</button>
        ${detail('style',L('标签样式','Label style'),`<label class="marker-field"><span>${L('标签位置','Label side')}</span><select data-f="side"><option value="auto">${L('自动','Auto')}</option><option value="left">${L('左侧','Left')}</option><option value="right">${L('右侧','Right')}</option></select></label>${G.FigEdit.weightField('markerCardWeight-'+mi,m.weight)}${G.FigEdit.colorField('markerCardColor-'+mi,m.color)}<p class="hint">${L('字号在成图上方的“字体与字号”统一设置；点成图数字可单独标红。','Set the shared size in Fonts and sizes above the figure. Click a figure number to colour an individual label.')}</p>`)}
        ${detail('bands',L('条带明细与修正','Band details and correction'),`<p class="hint">${L('勾选控制显示；未定位的条带请先点“定位”。','Tick to show a label; use Locate for a band that has not been located.')}</p><div class="list">${m.bands.map((b,k)=>`<div class="item"><label class="switch"><input type="checkbox" data-band="${k}" aria-label="${L('显示','Show')} ${esc(App.fmtSize(b.bp))}" ${b.show?'checked':''} ${b.excluded?'disabled':''}><span>${esc(App.fmtSize(b.bp))}${b.ref?' ★':''}</span></label><span class="tag ${b.manual?'man':b.matched?'ok':''}">${b.excluded?L('已移除','Removed'):b.manual?L('手动','Manual'):b.matched?L('已定位','Located'):L('未定位','Not located')}</span><button class="btn sm ghost" data-locate="${k}">${L('定位','Locate')}</button></div>`).join('')}</div><div class="marker-actions"><button class="btn sm" data-f="thin">${L('精简标签','Thin labels')}</button><button class="btn sm" data-f="align">${L('重新识别此泳道','Re-detect this lane')}</button></div><button class="btn sm ghost danger" data-f="del">${L('取消此 Marker','Remove marker role')}</button><p class="hint">${L('重新识别保留手动定位与隐藏/删除选择。操作均可撤销。','Re-detection keeps manual anchors and hidden/removed labels. Changes can be undone.')}</p>`)}
      </div>`;
    }).join('')||`<p class="marker-empty">${L('还没有 Marker。点“点选 Marker 泳道”，再点原图中的 Marker。','No marker yet. Choose Pick a marker lane, then click its lane on the image.')}</p>`;
    host.querySelectorAll('.mk-card').forEach(card => {
      const mi=+card.dataset.mi,m=st.markers[mi],q=f=>card.querySelector(`[data-f="${f}"]`);
      q('unit').value=m.unit;q('side').value=m.side;
      q('ladder').onclick=()=>G.MarkerUI.chooseModel(mi,q('ladder'));
      q('guide').onclick=()=>G.MarkerUI.open(mi);
      q('lane').onchange=e=>{if(!G.MarkerUI.assignLane(+e.target.value,mi))e.target.value=String(m.lane);};
      q('unit').onchange=done(e=>{m.unit=e.target.value;App.prefUnit=m.unit;});
      q('side').onchange=done(e=>{m.side=e.target.value;});
      $('markerCardWeight-'+mi).onchange=done(e=>{const w=+e.target.value;if(w===400)delete m.weight;else m.weight=w;});
      G.FigEdit.bindColor('markerCardColor-'+mi,m,true);
      q('align').onclick=done(()=>{App.alignMarker(mi);toast(L('已更新当前泳道，请核对条带','Updated this lane; check the bands'));});
      q('del').onclick=done(()=>App.removeMarker(mi));
      q('thin').onclick=done(()=>{m.bands.forEach(b=>b.show=!b.excluded&&(b.show||b.matched||b.manual));App.thinMarkerLabels(m,false);});
      card.querySelectorAll('[data-band]').forEach(cb=>cb.onchange=done(()=>{m.bands[+cb.dataset.band].show=cb.checked;}));
      card.querySelectorAll('[data-locate]').forEach(btn=>btn.onclick=()=>G.MarkerUI.open(mi,+btn.dataset.locate));
      card.querySelectorAll('details[data-section]').forEach(d=>{const top=opened.get(d.dataset.lane+':'+d.dataset.section);if(top&&d.querySelector('.list'))d.querySelector('.list').scrollTop=top;});
    });
    if(focus){
      const card=host.querySelector(`[data-mi="${focus.mi}"]`);
      const el=focus.id?$(focus.id):focus.f?card?.querySelector(`[data-f="${focus.f}"]`):focus.band!=null?card?.querySelector(`[data-band="${focus.band}"]`):null;
      el?.focus({preventScroll:true});
    }
    $('panel').scrollTop=scroll;
  }

  /* ---------- lane list (advanced) ---------- */
  function renderLanes() {
    const st = S(), r = range(), empty = new Set(App.emptyLanes());
    $('laneList').innerHTML = st.lanes.map((l, i) => {
      const out = !r || i < r[0] || i > r[1];
      return `<div class="item${i === App.selLane ? ' sel' : ''}${out ? ' out' : ''}">
        <span class="idx" data-pick="${i}" title="${L('选中这条泳道（之后可按 Delete / ⌫ 删除）', 'Select this lane (then Delete / ⌫ removes it)')}">${i + 1}</span>
        <button class="lane-name-link" data-edit-lane="${i}" title="${L('在成图中编辑', 'Edit on the figure')}">${esc(l.name || (isMarkerLane(i) ? 'M' : '—'))}</button>
        ${empty.has(i) ? `<span class="tag" title="${L('几乎没有条带', 'almost no bands')}">${L('空', 'empty')}</span>` : ''}
        <label class="switch" title="${L('取消 = 从成图剪除（自动加拼接间隙）；选中泳道后按 H 也可切换', 'Untick = remove from the figure (splice gap added); or select the lane and press H')}"><input type="checkbox" data-h="${i}" ${l.hidden ? '' : 'checked'}>${L('显示', 'Show')}</label>
        <button class="x" data-del="${i}" title="${L('删除这条泳道（误识别时用）', 'Delete this lane (if it was detected by mistake)')}">×</button></div>`;
    }).join('');
    $('laneList').querySelectorAll('[data-edit-lane]').forEach(b => b.onclick = () => { if (G.Mobile && isPhone()) G.Mobile.setView('fig'); G.FigEdit.openEd('lane', +b.dataset.editLane); });
    $('laneList').querySelectorAll('[data-h]').forEach(inp => inp.addEventListener('change', e => {
      if (toggleLaneHidden(+inp.dataset.h, !e.target.checked)) App.commit(); else e.target.checked = true;
    }));
    $('laneList').querySelectorAll('[data-pick]').forEach(el => el.onclick = () => {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      App.selLane = +el.dataset.pick; App.selArrow = -1; listPick = true; App.emit('select'); G.Editor.draw();
    });
    $('laneList').querySelectorAll('[data-del]').forEach(b => b.onclick = done(() => { App.removeLane(+b.dataset.del); App.selLane = -1; toast(L('已删除泳道（Ctrl+Z 可撤销）', 'Lane deleted (Ctrl+Z to undo)')); }));
    $('laneCountNote').textContent = L(`${st.lanes.length} 孔`, `${st.lanes.length} wells`);
    if (document.activeElement !== $('cropLaneN')) $('cropLaneN').value = r ? r[1] - r[0] + 1 : '';
    $('laneLinked').checked = st.laneLinked !== false;
  }

  /* ---------- annotation list ---------- */
  function renderAnno() {
    const st = S(), rows = [];
    st.groups.forEach((g, k) => rows.push(`<div class="item"><span class="kind">${L('分组', 'Group')}</span>
      <span class="idx" style="width:auto">${Math.min(g.from, g.to) + 1}–${Math.max(g.from, g.to) + 1}</span>
      <input type="text" data-g="${k}" value="${esc((g.text || '').replace(/\n/g, ' ↵ '))}" placeholder="${L('分组文字', 'Group label')}" title="${L('↵ = 换行', '↵ = line break')}"><button class="x" data-gdel="${k}">×</button></div>`));
    st.arrows.forEach((a, k) => rows.push(`<div class="item${k === App.selArrow ? ' sel' : ''}"><span class="kind">${L('箭头', 'Arrow')}</span>
      <button class="btn sm ghost" data-aed="${k}" style="flex:1;justify-content:flex-start">${{ star: '* ', hash: '# ', dagger: '† ' }[a.sym] || ''}${esc(App.arrowLabel(a) || L('（未命名）', '(unnamed)'))}</button><button class="x" data-adel="${k}" title="${L('删除', 'Delete')}" aria-label="${L('删除', 'Delete')}">×</button></div>`));
    st.conditions.forEach((c, r) => rows.push(`<div class="item"><span class="kind">${L('条件', 'Condition')}</span>
      <input type="text" data-c="${r}" value="${esc(c.name)}" placeholder="${L('条件名，如 EcoRI', 'Condition, e.g. EcoRI')}"><button class="x" data-cdel="${r}">×</button></div>`));
    const KIND = { box: L('区域框', 'Box'), bracket: L('括号', 'Bracket'), label: L('文字', 'Text'), note: L('胶内', 'In-gel') };
    const POS = { left: L('左侧', 'left'), right: L('右侧', 'right'), below: L('下方', 'below') };
    // where along the gel edge the text sits; only worth showing once it is off centre
    const atNote = t => {
      if (t.at == null || t.at === '' || !Number.isFinite(+t.at)) return '';
      const a = +t.at;
      return Math.abs(a - 0.5) < 0.005 ? '' : `${Math.round(a * 100)}%`;
    };
    const qrow = (kind, k, text, note) => {
      const sel = App.selAnno && App.selAnno.kind === kind && App.selAnno.k === k;
      return `<div class="item${sel ? ' sel' : ''}"><span class="kind">${KIND[kind]}</span>
        <button class="btn sm ghost" data-qed="${kind}:${k}" style="flex:1;justify-content:flex-start">${esc(text || L('（未命名）', '(unnamed)'))}${note ? ` <span class="h3-note">${note}</span>` : ''}</button><button class="x" data-qdel="${kind}:${k}" title="${L('删除', 'Delete')}" aria-label="${L('删除', 'Delete')}">×</button></div>`;
    };
    (st.boxes || []).forEach((b, k) => rows.push(qrow('box', k, b.text, b.zoom >= 2 ? L(`放大 ×${b.zoom}`, `×${b.zoom} inset`) : '')));
    (st.brackets || []).forEach((b, k) => rows.push(qrow('bracket', k, b.text, '')));
    (st.labels || []).forEach((t, k) => rows.push(qrow('label', k, t.text, [POS[t.pos] || '', atNote(t), Number.isFinite(+t.angle) ? `${Math.round(+t.angle)}°` : ''].filter(Boolean).join(' · '))));
    (st.notes || []).forEach((n, k) => {
      const legacy = n.kind === 'arrow';
      const label = n.text || (legacy ? L('箭头', 'Arrow') : L('文本框', 'Text box'));
      const note = legacy ? L('箭头', 'arrow')
        : [L('文本框', 'text box'), n.arrow ? L('带箭头', 'with arrow') : ''].filter(Boolean).join(' · ');
      rows.push(qrow('note', k, label, note));
    });
    const box = $('annoList');
    box.innerHTML = rows.join('');
    // a one-line field: line breaks of a group label show as ↵ and come back as breaks
    box.querySelectorAll('[data-g]').forEach(inp => { const g = st.groups[+inp.dataset.g]; inp.addEventListener('input', live(e => { g.text = e.target.value.replace(/\s*↵\s*/g, '\n'); })); inp.addEventListener('change', done()); });
    box.querySelectorAll('[data-c]').forEach(inp => { const c = st.conditions[+inp.dataset.c]; inp.addEventListener('input', live(e => { c.name = e.target.value; })); inp.addEventListener('change', done()); });
    box.querySelectorAll('[data-gdel]').forEach(b => b.onclick = done(() => st.groups.splice(+b.dataset.gdel, 1)));
    box.querySelectorAll('[data-cdel]').forEach(b => b.onclick = done(() => st.conditions.splice(+b.dataset.cdel, 1)));
    // an open popover may belong to the item being deleted: finish it first
    const closePop = () => { if (G.FigEdit) G.FigEdit.closePop(); };
    box.querySelectorAll('[data-adel]').forEach(b => b.onclick = done(() => { closePop(); st.arrows.splice(+b.dataset.adel, 1); App.selArrow = -1; }));
    box.querySelectorAll('[data-aed]').forEach(b => b.onclick = () => G.FigEdit.arrowPopover(+b.dataset.aed, b));
    box.querySelectorAll('[data-qed]').forEach(b => b.onclick = () => { const [kind, k] = b.dataset.qed.split(':'); App.selAnno = { kind, k: +k }; G.FigEdit.annoPopover(kind, +k, b); G.Editor.draw(); });
    box.querySelectorAll('[data-qdel]').forEach(b => b.onclick = done(() => { closePop(); const [kind, k] = b.dataset.qdel.split(':'); App.removeAnno({ kind, k: +k }); App.selAnno = null; }));
  }

  /* ---------- 6 layout ---------- */
  $('autoWidth').addEventListener('change', done(e => { S().style.autoWidth = e.target.checked; }));
  $('gelW').addEventListener('change', done(e => { S().style.gelWidthMm = E.clamp(+e.target.value || 45, 10, 180); S().style.autoWidth = false; }));
  $('fontPt').addEventListener('change', done(e => { S().style.fontPt = E.clamp(+e.target.value || 7, 4, 14); }));
  $('fontFamily').addEventListener('change', done(e => { S().style.fontFamily = G.Render.fontName(e.target.value); }));
  $('laneFace').addEventListener('change',done(e=>{S().style.laneItalic=e.target.value==='italic';}));
  $('lineW').addEventListener('change', done(e => { S().style.lineWidthPt = E.clamp(+e.target.value || 0.5, 0.25, 2); }));
  // empty = follow the figure font size
  ['lanePt', 'markerPt'].forEach(id => $(id).addEventListener('change', done(e => { const v = +e.target.value; S().style[id] = e.target.value === '' || !(v > 0) ? null : E.clamp(v, 4, 14); })));
  $('groupFit').addEventListener('change', done(e => { S().style.groupFit = e.target.value; }));
  $('minFontPt').addEventListener('change', done(e => { S().style.minFontPt = E.clamp(+e.target.value || 5, 4, 10); }));
  const anglePresets=['0','30','45','60','90'];
  function angleControls(){
    if(!S())return;const value=G.Render.labelAngle(S().style.labelAngle),auto=value==='auto';
    const angle=auto?(lastFig?.angle||0):+value;
    $('labelAngle').value=auto?'auto':anglePresets.includes(value)?value:'custom';
    if(document.activeElement!==$('laneAngleNumber'))$('laneAngleNumber').value=angle;
    $('laneAngleSlider').value=angle;
    $('angleInfo').textContent=auto?L(`自动 · 当前 ${angle}°`,`Auto · currently ${angle}°`):L(`自定义 · ${angle}°`,`Manual · ${angle}°`);
    const name=L('泳道名角度','Lane-name angle');$('laneAngleSlider').setAttribute('aria-label',name);$('laneAngleNumber').setAttribute('aria-label',name);
    placeFigureMenus();
  }
  function setAngle(value,commit){
    if(!S())return;const angle=G.Render.labelAngle(value);if(S().style.labelAngle===angle){angleControls();return;}
    S().style.labelAngle=angle;commit?App.commit():App.refresh();
  }
  $('labelAngle').addEventListener('change',e=>setAngle(e.target.value==='custom'?String(lastFig?.angle||0):e.target.value,true));
  $('laneAngleSlider').addEventListener('input',e=>setAngle(e.target.value,false));
  $('laneAngleSlider').addEventListener('change',()=>{if(S()){App.commit();angleControls();}});
  $('laneAngleNumber').addEventListener('change',e=>{
    if(e.target.value.trim()===''||!Number.isFinite(+e.target.value)){angleControls();e.target.value=G.Render.labelAngle(S()?.style.labelAngle)==='auto'?(lastFig?.angle||0):S().style.labelAngle;return;}
    const value=G.Render.labelAngle(e.target.value);e.target.value=value;setAngle(value,true);
  });
  $('laneAngleNumber').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();e.target.blur();}});
  ['laneNumbers', 'frame', 'groupTicks', 'laneNamesAboveConditions'].forEach(id => $(id).addEventListener('change', done(e => { S().style[id] = e.target.checked; })));
  $('panelLetter').addEventListener('change', done(e => { S().style.panelLetter = e.target.value.trim(); }));
  $('laneNumberMode').addEventListener('change', done(e => { S().style.laneNumberMode = e.target.value; }));
  // journal column width = total figure width (labels included): solve for the gel width
  $('widthPreset').addEventListener('change', e => {
    const target = +e.target.value; e.target.value = '';
    if (!S() || !target) return;
    const st = S().style;
    st.gelWidthMm = App.gelWidthMm(); st.autoWidth = false;
    for (let k = 0; k < 4; k++) {   // label widths depend weakly on the gel width; a few rounds converge
      const f = App.buildFigure(false), total = f.w / G.Render.MM;
      st.gelWidthMm = E.clamp(Math.round(st.gelWidthMm + (target - total)), 10, 180);
    }
    App.commit();
    const tot = (App.buildFigure(false).w / G.Render.MM).toFixed(1);
    toast(L(`成图总宽 ${tot} mm（凝胶 ${st.gelWidthMm} mm）`, `Figure width ${tot} mm (gel ${st.gelWidthMm} mm)`));
  });
  $('btnResetLayout').onclick = done(() => { App.resetLayout(); toast(L('版式已重置为默认（Ctrl+Z 可撤销）', 'Layout reset to defaults (Ctrl+Z to undo)')); });
  function updateDpiLine() {
    const eff = Math.round(App.effectiveDpi()), safe = App.maxSafeWidthMm(300), w = App.gelWidthMm();
    $('dpiLine').innerHTML = eff >= 300
      ? `${L('胶图有效分辨率', 'Effective gel resolution')} <span class="ok">${eff} dpi</span>`
      : `${L('胶图有效分辨率', 'Effective gel resolution')} <span class="bad">${eff} dpi</span>` +
        L(`（&lt;300）：凝胶宽不超过 <b>${safe} mm</b> 才能保证 300 dpi`, ` (&lt;300): keep the gel at most <b>${safe} mm</b> wide for 300 dpi`) +
        (w > safe ? ` <button class="btn sm" id="btnSafeW">${L(`改为 ${safe} mm`, `Use ${safe} mm`)}</button>` : '');
    const b = $('btnSafeW'); if (b) b.onclick = done(() => { S().style.autoWidth = false; S().style.gelWidthMm = Math.max(10, safe); });
  }
  $('fitFull').onclick = () => G.Editor.fitFull();
  $('fitCrop').onclick = () => G.Editor.fitCrop();

  /* ---------- status + coach ---------- */
  function updateStatus() {
    const st = S(), r = range(), fl = figLanes();
    const named = fl.filter(i => st.lanes[i].name).length;
    const visMk = r ? st.markers.filter(m => m.lane >= r[0] && m.lane <= r[1]) : [];
    const lowMk = visMk.filter(m => m.score != null && m.score < 0.6);
    const set = (id, txt, cls) => { const el = $(id); el.textContent = txt; el.className = 'sec-status' + (cls ? ' ' + cls : ''); };
    set('stImage', (st.rotation ? L(`已转正 ${st.rotation}° · `, `rotated ${st.rotation}° · `) : '')
      + (App.isColour() ? L('保留原色', 'original colour') : App.displayDark() ? L('黑底白带', 'white on black') : L('白底黑带', 'dark on white'))
      + (!App.isColour() && st.saturatedInCrop ? L(' · 有过曝', ' · saturated') : ''), !App.isColour() && st.saturatedInCrop ? 'warn' : '');
    set('stRange', r ? L(`孔 ${r[0] + 1}–${r[1] + 1} · ${fl.length} 条`, `wells ${r[0] + 1}–${r[1] + 1} · ${fl.length} lanes`) : '');
    set('stNames', `${named}/${fl.length}`);
    set('stMarker', visMk.length ? (lowMk.length ? L('请核对型号', 'check ladder') : String(visMk.length)) : L('无', 'none'), lowMk.length || !visMk.length ? 'warn' : '');
    const secs = document.querySelectorAll('#sections .sec');
    const state = [true, !!r, named >= fl.length && fl.length > 0, visMk.length > 0 && !lowMk.length];
    secs.forEach((s, i) => { s.classList.toggle('done', !!state[i]); s.classList.remove('todo'); });
    const firstTodo = state.findIndex(v => !v);
    if (firstTodo >= 0 && secs[firstTodo]) secs[firstTodo].classList.add('todo');
    // coach: the single most useful next step
    let msg, ok = false;
    if (!r) msg = P(L('拖动原图上的红框包含泳道，再点左侧“框内重新识别泳道和 Marker”', 'Frame the lanes with the red box, then use Re-detect lanes + markers in crop on the left'),
      L('在「原图」页拖红框包含泳道，再到「设置」点“框内重新识别泳道和 Marker”', 'Frame the lanes on the Image tab, then use Re-detect lanes + markers in crop in Settings'));
    else if (named < fl.length) msg = P(L(`下一步：在右侧成图上<b>点灰色的泳道号</b>输入名称，回车跳到下一条（还差 ${fl.length - named} 条）`,
      `Next: <b>click a grey lane number</b> on the figure and type its name; Enter moves on (${fl.length - named} to go)`),
      L(`下一步：在「成图」页<b>点灰色泳道号</b>输入名称，键盘上的“下一项”跳到下一条（还差 ${fl.length - named} 条）`,
        `Next: on the Figure tab <b>tap a grey lane number</b> and type; the keyboard’s Next key moves on (${fl.length - named} to go)`));
    else if (!visMk.length) msg = P(L('没有 Marker：在左侧 Marker 区点“点选 Marker 泳道”，再核对型号和条带', 'No marker: use Pick a marker lane in the left Marker section, choose a ladder and review its bands'),
      L('没有 Marker：在「设置 → Marker」点“点选 Marker 泳道”，再核对型号和条带', 'No marker: use Pick a marker lane in Settings → Marker, choose a ladder and review its bands'));
    else if (lowMk.length) msg = L(`孔 ${lowMk[0].lane + 1} 的 Marker 与所选 Ladder 吻合度低，<b>请核对型号</b>`, `The marker in well ${lowMk[0].lane + 1} fits the chosen ladder poorly — <b>check the ladder</b>`);
    else {
      msg = P(L('已可导出 —— 右上角<b>导出 PNG</b>；需要分组、箭头、+/− 时用左侧"标注"', 'Ready — <b>Export PNG</b> at the top right; add groups, arrows or +/− rows under "Annotations"'),
        L('已可导出 —— 点右下角<b>导出</b>；分组、箭头、+/− 在「设置 → 标注」', 'Ready — tap <b>Export</b> at the bottom right; groups, arrows and +/− rows are under Settings → Annotations'));
      ok = true;
    }
    $('coachText').innerHTML = msg;
    $('coach').classList.toggle('done', ok);
    $('imgChip').classList.toggle('warn', st.saturatedInCrop > 0);
    $('imgChip').classList.toggle('ready', !st.saturatedInCrop);
  }

  function syncControls() {
    const st = S(), y = st.style;
    $('invChk').checked = !!st.levels.invert;
    const colour = App.isColour();
    $('imageColourField').classList.toggle('hidden',!App.hasColour());
    $('imageAngleState').textContent=L(`当前 ${st.rotation}°`,`Current ${st.rotation}°`);
    $('imageAdjustState').textContent=st.levels.gamma!==1?'Gamma '+st.levels.gamma+' · '+L('非线性','nonlinear'):L('线性调整','Linear');
    $('imageAdjustState').classList.toggle('warn-text',st.levels.gamma!==1);
    $('displayModeSeg').querySelectorAll('[data-display]').forEach(b => {
      b.disabled = b.dataset.display === 'colour' && !App.hasColour();
      b.classList.toggle('on', b.dataset.display === (colour ? 'colour' : 'gray'));
    });
    $('displayModeNote').textContent = !App.hasColour()
      ? L('原文件没有可用颜色，不能还原成真实彩图。', 'The source has no colour data to restore.')
      : colour ? L('保留原色，仍可旋转、裁切和标注。灰度的反色、对比度和 Gamma 不会应用到彩图。', 'Original colours are retained; rotation, crop and annotations still work. Grayscale inversion, contrast and gamma are not applied.')
        : L('识别一直使用灰度；切换显示不会改变泳道和标注。', 'Detection always uses grayscale; switching appearance keeps lanes and annotations.');
    $('grayPolarity').classList.toggle('hidden', colour);
    $('grayAdjustments').classList.toggle('hidden', colour);
    $('lvBlack').value = toSlider(st.levels.black); $('lvWhite').value = toSlider(st.levels.white);
    $('lvBlackV').textContent = pct(st.levels.black); $('lvWhiteV').textContent = pct(st.levels.white);
    $('rot').value = st.rotation; $('rotNum').value = st.rotation; $('rotV').textContent = st.rotation + '°';
    $('rotAuto').textContent = App.autoRotation != null ? L(`自动检测 ${App.autoRotation}°`, `auto ${App.autoRotation}°`) : '';
    const kind = App.gelKind();
    document.querySelectorAll('#gelSeg button').forEach(b => b.classList.toggle('on', b.dataset.gel === kind));
    const det = App.gelDetection;
    $('gelTypeNote').textContent = det ? (det.manual ? L('手动指定', 'set by you') : L(`自动判断 ${Math.round((det.confidence || 0) * 100)}%`, `detected ${Math.round((det.confidence || 0) * 100)}%`)) : '';
    $('gelTypeWhy').textContent = det && det.reasons && det.reasons.length
      ? (det.manual ? L('识别错了可以在这里切换；切换会保留泳道名、分组和箭头。', 'Detection can be wrong — switch here. Names, groups and arrows are kept.')
        : L('判断依据：', 'Detected from: ') + det.reasons.filter(r => (r.w > 0) === (kind === 'protein')).slice(0, 3).map(r => App.gelReasonText(r)).filter(Boolean).join(L('；', '; ')))
      : '';
    // say what the figure actually looks like now: the source may already be dark-bands-on-white
    const darkBg = !!App.S.bright !== !!st.levels.invert;
    $('invNote').textContent = L(`当前成图：${darkBg ? '黑底白带' : '白底黑带'}`, `Figure now: ${darkBg ? 'white bands on black' : 'dark bands on white'}`)
      + (App.invertInherited ? L('（沿用了上次的选择）', ' (kept from last time)') : '');
    $('laneNumberMode').value = y.laneNumberMode || 'well';
    updateClipLine(); updateDpiLine(); updateEmptyBar(); updateSpliceBox();
    $('gamma').value = st.levels.gamma; $('gammaUnlock').checked = st.levels.gamma !== 1; $('gamma').disabled = st.levels.gamma === 1 && !$('gammaUnlock').checked;
    $('autoWidth').checked = !!y.autoWidth; $('gelW').value = App.gelWidthMm(); $('gelW').disabled = !!y.autoWidth;
    $('fontPt').value = y.fontPt; $('lineW').value = y.lineWidthPt; angleControls();
    $('fontFamily').value = G.Render.fontName(y.fontFamily);
    $('laneFace').value=y.laneItalic?'italic':'normal';
    ['lanePt', 'markerPt'].forEach(id => { $(id).value = y[id] || ''; $(id).placeholder = y.fontPt; });
    $('groupFit').value = y.groupFit || 'wrap'; $('minFontPt').value = y.minFontPt || 5;
    $('minFontRow').classList.toggle('hidden', (y.groupFit || 'wrap') !== 'shrink');
    ['laneNumbers', 'frame', 'groupTicks', 'laneNamesAboveConditions'].forEach(id => { $(id).checked = !!y[id]; });
    $('panelLetter').value = y.panelLetter || '';
    $('dpiTop').value = String(y.dpi);
    $('stLayout').textContent = `${App.gelWidthMm()} mm · ${y.fontPt} pt`;
    $('imgChipName').textContent = st.file.name;
    $('imgChip').title = `${App.src.w} × ${App.src.h} px · ${st.file.bits}-bit${st.file.dpi ? ' · ' + Math.round(st.file.dpi) + ' dpi' : ''}` + L('（点击更换图片）', ' (click to replace)');
    $('btnUndo').disabled = App.hist.length < 2; $('btnRedo').disabled = !App.future.length;
    drawHisto();
  }

  /* ---------- histogram ---------- */
  let histCache = null;
  function drawHisto() {
    const cv = $('histo'), st = S();
    if (!st || !cv.clientWidth) return;
    const dpr = window.devicePixelRatio || 1, W = cv.width = cv.clientWidth * dpr, H = cv.height = 40 * dpr;
    const ctx = cv.getContext('2d');
    const key = [st.rotation, st.crop.x, st.crop.y, st.crop.w, st.crop.h].join();
    if (!histCache || histCache.key !== key) {
      const c = App.cropImg(), bins = new Float32Array(200), step = Math.max(1, (c.data.length / 300000) | 0);
      for (let i = 0; i < c.data.length; i += step) bins[Math.min(199, (Math.sqrt(Math.max(0, c.data[i])) * 200) | 0)]++;
      let mx = 0; for (let i = 0; i < 200; i++) { bins[i] = Math.log1p(bins[i]); mx = Math.max(mx, bins[i]); }
      histCache = { key, bins, mx };
    }
    const { bins, mx } = histCache;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#c3cad4';
    for (let i = 0; i < 200; i++) { const h = bins[i] / mx * (H - 3); ctx.fillRect(i / 200 * W, H - h, W / 200 + 0.5, h); }
    const bx = Math.sqrt(st.levels.black) * W, wx = Math.sqrt(st.levels.white) * W;
    ctx.fillStyle = 'rgba(47,111,235,.16)'; ctx.fillRect(bx, 0, wx - bx, H);
    ctx.fillStyle = '#2f6feb'; ctx.fillRect(bx - 1, 0, 2, H); ctx.fillRect(wx - 1, 0, 2, H);
  }

  /* ---------- preview ---------- */
  let lastFig = null, buildMs = 0, lastLive = 0, liveTimer = 0;
  let figZoom = 1;   // × the fitted size; the phone's zoom button reads small labels this way
  // live updates while dragging: skip frames when building the figure is slow (large images),
  // always finishing with a final render shortly after the last input
  function livePreview() {
    clearTimeout(liveTimer);
    const gap = buildMs > 30 ? Math.min(400, buildMs * 3) : 0, now = performance.now();
    if (now - lastLive >= gap) { lastLive = now; updatePreview(); }
    else liveTimer = setTimeout(() => { lastLive = performance.now(); updatePreview(); }, gap);
  }
  // Safari draws nothing for a CSS drop-shadow() on an inline SVG group, so the edit highlight is an SVG
  // filter instead. It lives here, in the preview markup only: exported files must not carry it.
  // The region is a percentage of the element's box, so a thin arrow still gets its glow.
  const GLOW_DEFS = '<defs>'
    + '<filter id="gf-glow-hover" x="-30%" y="-30%" width="160%" height="160%">'
    + '<feDropShadow dx="0" dy="0" stdDeviation=".6" flood-color="#2f6feb"/>'
    + '<feDropShadow dx="0" dy="0" stdDeviation=".6" flood-color="#2f6feb"/></filter>'
    + '<filter id="gf-glow-active" x="-30%" y="-30%" width="160%" height="160%">'
    + '<feDropShadow dx="0" dy="0" stdDeviation="1" flood-color="#2f6feb"/>'
    + '<feDropShadow dx="0" dy="0" stdDeviation="1" flood-color="#2f6feb"/></filter>'
    + '</defs>';
  function updatePreview() {
    const st = S();
    let f;
    const t0 = performance.now();
    try { f = App.buildFigure(true); } catch (e) { console.error(e); return; }
    buildMs = buildMs ? buildMs * 0.6 + (performance.now() - t0) * 0.4 : performance.now() - t0;
    lastFig = f;
    $('preview').innerHTML = f.svg;
    $('preview').querySelector('svg')?.insertAdjacentHTML('afterbegin', GLOW_DEFS);
    const svg = $('preview').querySelector('svg'), box = $('previewBox').getBoundingClientRect();
    const pad = 2 * (parseFloat(getComputedStyle($('preview')).paddingLeft) || 24);
    const k = Math.max(0.5, Math.min((box.width - pad) / f.w, (box.height - pad) / f.h, 4)) * figZoom;
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.style.width = (f.w * k) + 'px'; svg.style.height = (f.h * k) + 'px';
    $('figSize').textContent = `${(f.w / G.Render.MM).toFixed(1)} × ${(f.h / G.Render.MM).toFixed(1)} mm`;
    angleControls();
    showWarnings(f.warnings);
    // legend suggestions are English: they go into the manuscript
    const hints = G.Export.legendHints(st);
    $('legendHints').innerHTML = hints.length ? `<b>${L('图注可参考', 'Legend notes')}</b>` + hints.map(esc).join('<br>') : '';
    if (G.FigEdit) G.FigEdit.afterRender(f);
  }

  // the favourite list depends on the gel type, which is only known once an image is loaded
  let favKind = null;
  function renderPanel() {
    renderLanes(); renderMarkers(); renderAnno();
    if (favKind !== App.gelKind()) { favKind = App.gelKind(); renderFavs(); }
  }

  App.on(what => {
    if(what==='loaded'){closeMarkerLibrary(false);for(const id of ['rotationFine','contrastManual','gammaControls','gelDetectionDetails'])$(id).open=false;clearImageGrid();}
    else if(what==='change'&&!$('markerLibDlg').classList.contains('hidden')&&(S()!==libraryState||libraryMarkers.some(m=>!S()?.markers.includes(m))))closeMarkerLibrary(false);
    if (!S()) return;
    if (what === 'loaded') {
      $('figureTools').classList.remove('hidden'); $('figureNames').classList.add('hidden');
      requestAnimationFrame(() => { G.Editor.resize(); G.Editor.fitCrop(); });
      $('emptyState').classList.add('hidden'); $('draftBox').classList.add('hidden'); $('sections').classList.remove('hidden');
      histCache = null; renderExposures();
      // lanes that had to be re-spaced because neighbours ran together: worth a look before naming
      if (App.laneNotice) toast(App.laneNotice, 6000);
      // say which kind of gel was recognised: the user must notice before typing anything
      const det = App.gelDetection;
      if (det && !det.manual) {
        const pct = Math.round((det.confidence || 0) * 100);
        if (App.gelKind() === 'protein') toast(P(L(`识别为蛋白胶（${pct}%）：Marker 按 kDa 标注。不是蛋白胶？在左侧第 1 步切换。`,
          `Read as a protein gel (${pct}%): marker sizes in kDa. Not protein? Switch in step 1 on the left.`),
          L(`识别为蛋白胶（${pct}%）：Marker 按 kDa 标注。不是蛋白胶？在「设置」第 1 步切换。`,
            `Read as a protein gel (${pct}%): marker sizes in kDa. Not protein? Switch in Settings, step 1.`)), 5200);
        else if (pct >= 60) toast(L(`识别为 DNA 胶（${pct}%）：Marker 按 bp 标注`, `Read as a DNA gel (${pct}%): marker sizes in bp`), 3200);
      }
    }
    if (what === 'refresh') { livePreview(); return; }
    clearTimeout(liveTimer);
 if (what === 'select') { renderLanes(); renderAnno(); return; }
    syncControls(); renderPanel(); updateStatus(); updatePreview();
  });
  window.addEventListener('resize', () => { if (S()) { updatePreview(); drawHisto(); } });

  G.UI = {
    toast, updatePreview, figLanes, range, esc, markerUnitOptions, openMarkerLibrary, bindMarkerDialog, flushPending, archiveCurrent, offerDraft, ladderOptions, lastFig: () => lastFig, preflight, renderExposures, openProject, load, isPhone, phoneMq,
    figZoom: () => figZoom,
    setFigZoom(z) { figZoom = z; if (S()) updatePreview(); }
  };
  $('btnUndo').disabled = $('btnRedo').disabled = true;
  offerDraft();

  /* ---------- development / self-test URL parameters ----------
   * ?demo=1 loads the synthetic gel; ?uitest=1 runs js/uitest.js; ?annot=1, ?names=, ?range=, ?groups=,
   * ?arm=arrow and ?png=<dpi> set up states for screenshots; ?src=<url> loads a local file (for tests). */
  const qs = new URLSearchParams(location.search);
  if (qs.get('demo') === '1' || qs.get('demo') === 'protein' || qs.get('src')) setTimeout(async () => {
    App.forceJsHash = true;
    if (qs.get('src')) {
      const src = qs.get('src'), buf = await (await fetch(src)).arrayBuffer();
      await App.load({ name: decodeURIComponent(src.split('/').pop()), buffer: buf });
    } else await App.load(qs.get('demo') === 'protein' ? demoProteinFile() : demoFile());
    const st = S();
    if (qs.get('annot') === '1') {
      const prot = App.gelKind() === 'protein';
      const names = prot
        ? ['M', 'WT', 'WT', 'KO-1', 'NTC', '*lacZ*-1', '*lacZ*-2', 'IP', 'IP', 'Clone A', 'Clone B']
        : ['M', 'WT', 'WT', 'KO-1', 'NTC', '*lacZ*-1', '*lacZ*-2', 'pUC19', 'pUC19', 'Clone A', 'Clone B'];
      figLanes().forEach((li, k) => { st.lanes[li].name = names[k] || ''; });
      const fl = figLanes();
      st.groups = prot ? [{ from: fl[1], to: fl[3], text: 'Input' }, { from: fl[5], to: fl[8], text: 'IP' }]
        : [{ from: fl[1], to: fl[3], text: 'Genotyping' }, { from: fl[5], to: fl[8], text: 'Plasmid' }];
      st.conditions = [{ name: prot ? 'Dox' : 'EcoRI', values: st.lanes.map((l, i) => (fl.indexOf(i) > 0 ? (fl.indexOf(i) % 2 ? '+' : '−') : '')) }];
      const target = prot ? 55 : 1500;
      const bt = st.markers[0] && st.markers[0].bands.find(b => b.bp === target);
      st.arrows = bt ? [{ y: bt.y, text: prot ? 'Target' : 'Product', size: true, side: '' }] : [];
    }
    if (qs.get('names')) { const n = qs.get('names').split(','); figLanes().forEach((li, k) => { if (n[k] != null) st.lanes[li].name = n[k]; }); }
    if (qs.get('range')) { const [a, b] = qs.get('range').split('-').map(Number); App.setLaneRange(a - 1, b - 1); App.afterRangeChange(); }
    if (qs.get('groups')) {
      const fl = figLanes();
      st.groups = qs.get('groups').split(';').map(g => { const [r, t] = g.split(':'); const [a, b] = r.split('-').map(Number); return { from: fl[a - 1], to: fl[(b || a) - 1], text: t || '' }; });
    }
    App.commit();
    if (qs.get('arm') === 'arrow') G.FigEdit.setMode('arrow');
    if (qs.get('uitest') === '1') { const s = document.createElement('script'); s.src = 'js/uitest.js'; document.body.appendChild(s); return; }
    if (qs.get('png')) {
      const f = App.buildFigure(false), c = await G.Export.svgToCanvas(f.svg, f.w, f.h, +qs.get('png'));
      const pre = document.createElement('pre'); pre.id = 'figpng'; pre.style.display = 'none'; pre.textContent = c.toDataURL('image/png'); document.body.appendChild(pre);
    }
    const r = range();
    document.title = 'READY ' + JSON.stringify({
      file: st.file.name, rot: st.rotation, crop: st.crop, lanes: st.lanes.map(l => Math.round(l.x)), range: r && [r[0] + 1, r[1] + 1],
      halfW: Math.round(st.laneHalfW), markers: st.markers.map(m => ({ lane: m.lane + 1, ladder: m.ladderId, unit: m.unit, score: Math.round((m.score || 0) * 100) / 100 })),
      gelType: App.gelKind(), gelConfidence: App.gelDetection ? Math.round((App.gelDetection.confidence || 0) * 100) / 100 : null,
      coach: $('coachText').textContent
    });
  }, 50);
})(window);
