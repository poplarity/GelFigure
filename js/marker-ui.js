/* Guided marker editing. The reference is a schematic from the existing ladder catalogue;
 * only clicks/drags on the real image create calibration anchors. No image pixels are changed. */
(function (G) {
  'use strict';
  const App = G.App, UI = G.UI, L = G.L, E = G.Engine, $ = id => document.getElementById(id), esc = UI.esc;
  const S = () => App.S;
  let active = -1, moving = null, candidate = '', selected = null, placing = false, drag = null, geometry = null, opener;
  const dlg = document.createElement('div'); dlg.id = 'markerGuide'; dlg.className = 'dlg hidden';
  dlg.innerHTML = '<div class="dlg-body marker-guide-body" role="dialog" aria-modal="true" aria-labelledby="markerGuideTitle"></div>';
  document.body.appendChild(dlg);
  const popup = document.createElement('div'); popup.id = 'markerLabelPop'; popup.className = 'marker-label-pop hidden'; document.body.appendChild(popup);
  const current = () => S() && S().markers[active];
  const sizeText = (v, lad) => { const unit = G.Ladders.kindOf(lad) === 'protein' ? 'kDa' : 'bp'; return G.Ladders.fmt(v, unit) + ' ' + unit; };
  function closeLabel() { popup.classList.add('hidden'); }
  function close() {
    const wasOpen = !dlg.classList.contains('hidden');
    if (drag) finishDrag(true);
    dlg.classList.add('hidden');
    if (wasOpen) {
      const target = opener && opener.isConnected && opener.getClientRects().length ? opener : $('btnEditNames').getClientRects().length ? $('btnEditNames') : $('editorBox');
      target.focus({ preventScroll: true });
    }
  }
  function show() { if (G.Mobile && UI.isPhone()) G.Mobile.closeSheets(); dlg.classList.remove('hidden'); render(true); $('markerGuideClose').focus(); }
  function open(mi, band) {
    if (!S() || !S().markers[mi]) return;
    UI.flushPending(); closeLabel(); G.FigEdit.setMode(null);
    active = mi; const m = current(); candidate = G.Ladders.get(m.ladderId) ? m.ladderId : App.defaultLadder(App.gelKind());
    selected = m.bands[band]?.bp ?? null; placing = false; opener = document.activeElement;
    show();
  }
  function assignLane(i, mi) {
    if (!S() || !S().lanes[i] || S().lanes[i].hidden) { UI.toast(L('请选择未剪除的泳道', 'Choose a lane that has not been cut out')); return false; }
    const used = S().markers.findIndex(m => m.lane === i);
    if (mi != null && used >= 0 && used !== mi) { UI.toast(L('这条泳道已经是另一个 Marker', 'This lane is already another marker')); return false; }
    if (mi == null && used >= 0) { open(used); return true; }
    if (mi == null) { mi = S().markers.length; S().markers.push(App.newMarker(i)); }
    else if (!S().markers[mi]) return false;
    else if (S().markers[mi].lane !== i) { S().markers[mi].lane = i; S().markers[mi].bands = []; }
    App.selLane = i;
    if (!S().lanes[i].name) S().lanes[i].name = 'M';
    App.matchMarkers(false); App.commit(); open(mi); return true;
  }
  function pickLane(mi) {
    if (!S()) return;
    UI.flushPending(); close(); closeLabel(); moving = mi == null ? null : mi;
    G.FigEdit.setMode('marker-lane');
    if (G.Mobile && UI.isPhone()) G.Mobile.setView('raw');
    G.Editor.fitCrop();
  }
  function chooseLane(i) { if (assignLane(i, moving)) { moving = null; G.FigEdit.setMode(null); } }
  function pickAt(x) {
    const lanes = UI.figLanes(); if (!lanes.length) return;
    chooseLane(lanes.reduce((a, b) => Math.abs(S().lanes[a].x - x) < Math.abs(S().lanes[b].x - x) ? a : b));
  }
  function reference(lad) {
    const ks = lad.sizes, top = 16, h = Math.max(250, ks.length * 23), lo = Math.log(ks[0]), span = Math.max(1e-9, lo - Math.log(ks[ks.length - 1]));
    const used = candidate === current().ladderId ? new Set(current().bands.filter(b => b.manual).map(b => b.bp)) : new Set();
    let last = -Infinity;
    const ys = ks.map(k => { last = Math.max(top + (lo - Math.log(k)) / span * h, last + 17); return last; });
    const H = Math.max(h + top * 2, ys[ys.length - 1] + top);
    return `<svg class="ladder-reference" width="150" height="${H}" viewBox="0 0 150 ${H}" role="img" aria-label="${L('Marker 标准条带示意', 'Schematic ladder bands')}"><rect x="8" y="3" width="48" height="${H - 6}" rx="5" fill="#f1f4fa"/>${ks.map((k, i) => {
      const ref = (lad.ref || []).includes(k), on = k === selected;
      return `<g data-size="${k}" role="button" tabindex="0" aria-label="${esc(sizeText(k, lad))}" aria-pressed="${on}">
        <rect x="2" y="${ys[i] - 8}" width="145" height="17" rx="4" fill="${on ? '#dbeafe' : 'transparent'}"/>
        <rect x="12" y="${ys[i] - (ref ? 3 : 2)}" width="40" height="${ref ? 6 : 4}" rx="2" fill="${ref ? '#db6a24' : '#4263eb'}"/>
        <text x="65" y="${ys[i] + 4}" font-size="12" font-weight="${ref ? 700 : 500}" fill="#24324a">${k}${used.has(k) ? ' ✓' : ''}</text></g>`;
    }).join('')}</svg>`;
  }
  function render(resetScroll) {
    const m = current(); if (!m) { close(); return; }
    const referenceTop = resetScroll ? 0 : dlg.querySelector('.marker-reference-scroll')?.scrollTop || 0;
    const lad = G.Ladders.get(candidate) || G.Ladders.get(m.ladderId), changed = candidate !== m.ladderId;
    if (!lad) return;
    const band = m.bands.find(b => b.bp === selected), unit = App.sizeUnit();
    dlg.firstElementChild.innerHTML = `<button class="dlg-x" id="markerGuideClose" aria-label="${L('关闭', 'Close')}">×</button>
      <h3 id="markerGuideTitle">${L('Marker 核对与补标', 'Review and correct marker bands')}</h3>
      <div class="marker-guide-top"><label>${L('1 · Marker 泳道', '1 · Marker lane')}<select id="markerGuideLane">${S().lanes.map((l,i) => `<option value="${i}"${i === m.lane ? ' selected' : ''}${l.hidden || S().markers.some((o,k) => k !== active && o.lane === i) ? ' disabled' : ''}>${i + 1}${l.name ? ' · ' + esc(l.name) : ''}</option>`).join('')}</select></label>
      <button class="btn sm" id="markerGuidePick">${L('在原图上点选', 'Pick on image')}</button></div>
      <label class="field">${L('2 · 预览型号', '2 · Preview a ladder')}<select id="markerGuideModel">${UI.ladderOptions(G.Ladders.ordered(App.gelKind()), candidate)}</select></label>
      ${changed ? `<div class="marker-model-apply"><span>${L('正在预览，原标注尚未改变', 'Preview only; existing labels are unchanged')}</span><button class="btn sm primary" id="markerUseModel">${L('使用此型号', 'Use this ladder')}</button></div>` : ''}
      <p class="marker-guide-instruction" role="status">${changed ? L('查看图例后点“使用此型号”，再核对实际条带。', 'Review the reference, then use this ladder before marking.') : placing ? L(`已选 ${sizeText(selected, lad)}：现在点左侧实际条带的位置。`, `${sizeText(selected, lad)} selected: click its real band on the left.`) : L('3 · 对不上？先点右侧条带大小，再点左侧实际条带；拖动黄线可微调。', '3 · A band is wrong? Select its size on the right, then click the real band on the left. Drag yellow lines to fine-tune.')}</p>
      <div class="marker-compare"><div><div class="marker-compare-title">${L('当前泳道', 'Actual lane')} ${m.lane + 1}</div><canvas id="markerLanePreview" width="180" height="380" aria-label="${L('点击或拖动校准条带位置', 'Click or drag to correct a band position')}"></canvas></div>
        <div><div class="marker-compare-title">${L('标准图例', 'Ladder reference')} · ${unit}</div><div class="marker-reference-scroll">${reference(lad)}</div></div></div>
      <p class="hint">${L('图例按 log 大小示意并避让文字，不代表真实迁移间距。橙色为厂家参考带，不代表真实染料颜色；✓ 为已手动定位。', 'The reference is a log-size sketch with spaced labels, not measured migration. Orange highlights reference bands, not actual dye colours; ✓ means manually positioned.')}</p>
      <div class="marker-guide-selection">${selected != null && !changed ? `<b>${esc(sizeText(selected, lad))}</b><label class="switch"><input id="markerBandShown" type="checkbox" ${band?.show ? 'checked' : ''}>${L('显示标签', 'Show label')}</label><span class="hint">${band?.manual ? L('手动定位', 'Manually positioned') : band?.matched ? L('自动匹配，请核对', 'Auto-matched; check it') : L('预测位置，请在左图定位', 'Predicted; locate it on the image')}</span>` : `<span class="hint">${L('只标注实际能看见的条带。隐藏标签不会删除校准点。', 'Mark only visible bands. Hiding a label keeps its calibration point.')}</span>`}</div>
      <div class="actions"><button class="btn sm" id="markerGuideLabels">${L('字号与显示', 'Font and visibility')}</button><button class="btn sm primary" id="markerGuideDone">${L('完成', 'Done')}</button></div>`;
    $('markerGuideClose').onclick = $('markerGuideDone').onclick = close;
    $('markerGuidePick').onclick = () => pickLane(active);
    $('markerGuideLane').onchange = e => assignLane(+e.target.value, active);
    $('markerGuideModel').onchange = e => { candidate = e.target.value; selected = null; placing = false; render(true); };
    if ($('markerUseModel')) $('markerUseModel').onclick = () => {
      m.ladderId = candidate; m.bands = []; App.prefLadder = candidate; App.matchMarkers(false); App.commit(); placing = false; render();
    };
    dlg.querySelectorAll('[data-size]').forEach(el => {
      const select = () => { selected = +el.dataset.size; placing = !changed; render(); };
      el.onclick = select; el.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && !e.isComposing) { e.preventDefault(); e.stopPropagation(); select(); } };
    });
    if ($('markerBandShown')) $('markerBandShown').onchange = e => { if (band) { band.show = e.target.checked; App.commit(); drawLane(); } };
    $('markerGuideLabels').onclick = () => { const i = active; close(); labelPopover(i, -1, $('figureTools')); };
    const canvas = $('markerLanePreview');
    dlg.querySelector('.marker-reference-scroll').scrollTop = referenceTop;
    canvas.onpointerdown = startDrag; canvas.onpointermove = moveDrag;
    canvas.onpointerup = () => finishDrag(false); canvas.onpointercancel = () => finishDrag(true);
    drawLane();
  }
  function drawLane() {
    const canvas = $('markerLanePreview'), m = current(); if (!canvas || !m) return;
    App.renderFull();
    const c = S().crop, x0 = App.laneEdge(m.lane, -1), x1 = App.laneEdge(m.lane, 1);
    const w = Math.max(1, x1 - x0), h = Math.max(1, c.h), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#eef1f6'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(130 / w, 350 / h), dw = w * scale, dh = h * scale, ox = (canvas.width - dw) / 2, oy = (canvas.height - dh) / 2;
    ctx.drawImage(App.fullCanvas, x0, c.y, w, h, ox, oy, dw, dh);
    geometry = { ox, oy, dw, dh, y: c.y, h };
    m.bands.forEach(b => {
      if (b.y < c.y || b.y > c.y + c.h || (!b.show && b.bp !== selected)) return;
      const y = oy + (b.y - c.y) / h * dh;
      ctx.strokeStyle = b.bp === selected ? '#2f6feb' : '#f4b529'; ctx.lineWidth = b.bp === selected ? 2 : 1;
      ctx.setLineDash(b.manual || b.matched ? [] : [4, 3]); ctx.beginPath(); ctx.moveTo(ox - 6, y); ctx.lineTo(ox + dw + 6, y); ctx.stroke();
    }); ctx.setLineDash([]);
  }
  function canvasPoint(e) {
    const cv = $('markerLanePreview'), r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * cv.width, y: (e.clientY - r.top) / r.height * cv.height };
  }
  function startDrag(e) {
    if (e.button != null && e.button !== 0 || !geometry) return;
    if (drag) { if (e.pointerId !== drag.pointerId) finishDrag(true); return; }
    const m = current(); if (candidate !== m.ladderId) { UI.toast(L('请先使用当前预览的型号', 'Use the previewed ladder first')); return; }
    const p = canvasPoint(e), g = geometry;
    if (p.y < g.oy || p.y > g.oy + g.dh || p.x < g.ox - 12 || p.x > g.ox + g.dw + 12) return;
    const y = g.y + (p.y - g.oy) / g.dh * g.h;
    let b = placing ? m.bands.find(b => b.bp === selected) : m.bands.filter(b => b.show).reduce((best, b) => !best || Math.abs(b.y - y) < Math.abs(best.y - y) ? b : best, null);
    if (!b || !placing && Math.abs(b.y - y) > g.h / g.dh * 10) { UI.toast(L('先在右侧图例中选一个大小', 'Select a size in the reference first')); return; }
    selected = b.bp; drag = { bands: m.bands.map(b => ({ ...b })), bp: b.bp, changed: false, placing, pointerId: e.pointerId };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events / older browsers */ } e.preventDefault();
    if (placing) moveDrag(e);
  }
  function moveDrag(e) {
    if (!drag || !geometry || e.pointerId !== drag.pointerId) return;
    const m = current(), g = geometry, p = canvasPoint(e);
    let y = E.clamp(g.y + (p.y - g.oy) / g.dh * g.h, g.y, g.y + g.h);
    if (!e.altKey) {
      const tol = g.h / g.dh * 7;
      const peaks = App.lanePeaks(m.lane).map(p => p.y + S().crop.y);
      const near = peaks.reduce((best, py) => Math.abs(py - y) < Math.abs(best - y) ? py : best, Infinity);
      if (Math.abs(near - y) <= tol) y = near;
    }
    const b = m.bands.find(b => b.bp === drag.bp); if (!b) return;
    b.y = y; b.manual = true; b.matched = true; b.show = true; drag.changed = true;
    drawLane(); App.refresh();
  }
  function finishDrag(cancel) {
    if (!drag) return;
    const d = drag; drag = null; const m = current(); if (!m) return;
    if (cancel) { m.bands = d.bands; App.refresh(); drawLane(); return; }
    if (d.changed) { App.matchMarkers(false); App.commit(); }
    placing = false; render();
  }
  function labelPopover(mi, bi, anchor) {
    if (!S() || !S().markers[mi]) return;
    UI.flushPending(); G.FigEdit.setMode(null); closeLabel(); const m = S().markers[mi];
    popup.innerHTML = `<div class="marker-pop-head"><b>${L('Marker 标签', 'Marker labels')} · ${L('泳道', 'lane')} ${m.lane + 1}</b><button class="btn sm ghost" id="markerPopClose" aria-label="${L('关闭', 'Close')}">×</button></div>
      <label class="inline-label">${L('全部 Marker 字号', 'Global marker font')} <input id="markerPopPt" class="num" type="number" min="4" max="14" step="0.5" value="${S().style.markerPt || ''}" placeholder="${S().style.fontPt}"> pt</label>
      <div class="marker-pop-options"><label>${L('单位', 'Unit')}<select id="markerPopUnit">${(App.gelKind() === 'protein' ? ['kDa'] : ['bp','kb','auto']).map(u=>`<option value="${u}">${u==='auto'?'bp / kb':u}</option>`).join('')}</select></label><label>${L('标签位置', 'Label side')}<select id="markerPopSide"><option value="auto">${L('自动', 'Auto')}</option><option value="left">${L('左侧', 'Left')}</option><option value="right">${L('右侧', 'Right')}</option></select></label></div>
      <p class="hint">${L('仅改变文字大小，不移动条带。取消勾选只隐藏标签。', 'Font size changes text only. Unchecking hides a label but keeps its calibration.')}</p>
      <div class="marker-pop-bands">${m.bands.map((b,k) => `<label class="switch${k === bi ? ' selected' : ''}"><input type="checkbox" data-visible-band="${k}" ${b.show ? 'checked' : ''}>${esc(App.fmtSize(b.bp))}</label>`).join('')}</div>
      <div class="actions"><button class="btn sm" id="markerPopFit">${L('适配字号', 'Fit font')}</button><button class="btn sm primary" id="markerPopGuide">${L('核对位置 / 型号', 'Review positions / ladder')}</button></div>`;
    popup.classList.remove('hidden');
    const r = (anchor || $('preview')).getBoundingClientRect(), w = popup.offsetWidth;
    popup.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right + 8)) + 'px';
    popup.style.top = Math.max(56, Math.min(innerHeight - popup.offsetHeight - 10, r.top)) + 'px';
    $('markerPopClose').onclick = closeLabel;
    $('markerPopUnit').value = m.unit; $('markerPopSide').value = m.side;
    $('markerPopUnit').onchange = e => { m.unit = e.target.value; App.commit(); };
    $('markerPopSide').onchange = e => { m.side = e.target.value; App.commit(); };
    $('markerPopPt').onchange = e => { S().style.markerPt = e.target.value === '' ? null : E.clamp(+e.target.value || 7, 4, 14); App.commit(); };
    popup.querySelectorAll('[data-visible-band]').forEach(cb => cb.onchange = () => { m.bands[+cb.dataset.visibleBand].show = cb.checked; App.commit(); });
    $('markerPopGuide').onclick = () => { closeLabel(); open(mi, bi); };
    $('markerPopFit').onclick = () => {
      const scale = App.gelWidthMm() * G.Render.MM / App.visibleWidthPx(); let fit = S().style.markerPt || S().style.fontPt;
      S().markers.forEach(m => { const ys = m.bands.filter(b => b.show && b.y >= S().crop.y && b.y <= S().crop.y + S().crop.h).map(b => b.y).sort((a,b) => a-b); for (let k=1;k<ys.length;k++) fit = Math.min(fit, (ys[k]-ys[k-1])*scale/1.05); });
      S().style.markerPt = E.clamp(Math.floor(fit * 2) / 2, 4, 14); $('markerPopPt').value = S().style.markerPt; App.commit();
    };
  }
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
  dlg.addEventListener('keydown', e => {
    e.stopPropagation(); if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') { const els=[...dlg.querySelectorAll('button,select,input,[tabindex="0"]')].filter(e=>!e.disabled&&e.getClientRects().length); const first=els[0],last=els[els.length-1]; if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();} }
  });
  popup.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape' && !e.isComposing) closeLabel(); });
  document.addEventListener('pointerdown', e => { if (!popup.contains(e.target) && !e.target.closest('[data-edit="marker"]')) closeLabel(); });
  App.on(w => { if (w === 'loaded') { close(); closeLabel(); moving = null; } });
  G.I18N.onChange(() => { closeLabel(); if (!dlg.classList.contains('hidden')) render(); });
  G.MarkerUI = { open, close, labelPopover, pickLane, chooseLane, pickAt, assignLane };
})(window);
