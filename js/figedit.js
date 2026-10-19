/* Direct editing on the figure preview: click a lane name to type (Enter = next lane), drag across
 * lane names to make a group, click +/- cells to cycle, click an arrow for its size/label popover,
 * and the "place arrow" mode (click a band in either view). */
(function (G) {
  'use strict';
  const App = G.App, L = G.L, $ = id => document.getElementById(id);
  const S = () => App.S;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const fed = $('floatEd'), pop = $('popover'), prev = $('preview');
  const composing = e => e.isComposing || e.keyCode === 229;

  /* ---------- modes ---------- */
  function setMode(m) {
    App.mode = m;
    $('modeBanner').classList.toggle('hidden', !m);
    $('modeText').textContent = m === 'arrow' ? L('点击目标条带（原图或成图上都行），自动吸附并估算大小', 'Click the target band (on either image); it snaps to the band and estimates the size')
      : m === 'group' ? L('在成图上从第一个泳道名拖到最后一个，松开即生成分组横线', 'Drag from the first to the last lane name on the figure; release to create the group line') : '';
    $('btnAddArrow').classList.toggle('on', m === 'arrow');
    $('btnAddGroup').classList.toggle('on', m === 'group');
    prev.classList.toggle('arming', m === 'arrow');
    G.Editor.draw();
  }
  $('modeCancel').onclick = () => setMode(null);
  $('btnAddArrow').onclick = () => { if (S()) setMode(App.mode === 'arrow' ? null : 'arrow'); };
  $('btnAddGroup').onclick = () => { if (S()) setMode(App.mode === 'group' ? null : 'group'); };
  $('btnAddCond').onclick = () => {
    if (!S()) return;
    S().conditions.push({ name: '', values: S().lanes.map(() => '') });
    App.commit();
    G.UI.toast(L('在成图上点每个格子，在 + / − / 空 之间切换；点"条件"输入名称', 'Click each cell on the figure to cycle + / − / empty; click "Condition" to name the row'), 3200);
  };

  App.placeArrow = function (x, y) {
    const sy = App.snapBandY(x, y);
    S().arrows.push({ y: sy != null ? sy : y, text: '', size: true, side: '' });
    const k = S().arrows.length - 1;
    App.selArrow = k;
    setMode(null);
    App.commit();
    requestAnimationFrame(() => arrowPopover(k, prev.querySelector(`g[data-edit="arrow"][data-k="${k}"]`)));
  };

  /* ---------- inline text editor ---------- */
  let edit = null;   // { kind, id, orig }
  const getVal = (kind, id) => kind === 'lane' ? S().lanes[id].name : kind === 'group' ? S().groups[id].text : S().conditions[id].name;
  const setVal = (kind, id, v) => { if (kind === 'lane') S().lanes[id].name = v; else if (kind === 'group') S().groups[id].text = v; else S().conditions[id].name = v; };
  function openEd(kind, id) {
    closePop();
    const el = prev.querySelector(kind === 'lane' ? `g[data-edit="lane"][data-src="${id}"]` : kind === 'group' ? `g[data-edit="group"][data-k="${id}"]` : `g[data-edit="condname"][data-r="${id}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    edit = { kind, id, orig: getVal(kind, id) || '' };
    fed.value = edit.orig;
    fed.placeholder = kind === 'lane' ? L(`孔 ${id + 1} 名称`, `Well ${id + 1} name`) : kind === 'group' ? L('分组文字', 'Group label') : L('条件名', 'Condition name');
    const w = Math.max(120, Math.min(240, r.width + 50));
    fed.style.width = w + 'px';
    fed.style.left = clamp(r.left + r.width / 2 - w / 2, 4, innerWidth - w - 4) + 'px';
    fed.style.top = clamp(r.top + r.height / 2 - 15, 56, innerHeight - 40) + 'px';
    fed.classList.remove('hidden');
    fed.focus(); fed.select();
    if (kind === 'lane') { App.selLane = id; G.Editor.draw(); }
  }
  function closeEd(revert) {
    if (!edit) return;
    const e = edit; edit = null;
    if (revert) setVal(e.kind, e.id, e.orig);
    else setVal(e.kind, e.id, fed.value.trim());
    fed.classList.add('hidden');
    App.commit();
  }
  fed.addEventListener('input', () => { if (edit) { setVal(edit.kind, edit.id, fed.value); App.refresh(); } });
  fed.addEventListener('keydown', e => {
    if (!edit || composing(e)) return;          // IME is choosing characters: Enter belongs to it
    if (e.key === 'Escape') { e.preventDefault(); closeEd(true); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const { kind, id } = edit;
      closeEd(false);
      if (kind === 'lane') {
        const fl = G.UI.figLanes(), k = fl.indexOf(id) + (e.shiftKey ? -1 : 1);
        if (k >= 0 && k < fl.length) requestAnimationFrame(() => openEd('lane', fl[k]));
        else G.UI.toast(e.shiftKey ? L('已是第一条', 'This is the first lane') : L('泳道名称填完了', 'All lane names are filled in'));
      }
    }
  });
  fed.addEventListener('blur', () => { if (edit) closeEd(false); });

  /* ---------- arrow popover ---------- */
  let popK = -1;
  function closePop() { if (popK >= 0) { popK = -1; pop.classList.add('hidden'); App.commit(); } }
  function arrowPopover(k, anchor) {
    const a = S().arrows[k];
    if (!a) return;
    closeEd(false);
    popK = k; App.selArrow = k;
    const info = App.estimateInfo(a.y), est = info && info.bp;
    // honest about where the number comes from: which marker(s), and whether it lies outside the ladder
    let estHtml = L('没有可用的 Marker，无法估算大小', 'No usable marker; the size cannot be estimated');
    if (info) {
      const v = `<b>${info.extrap || info.disagree ? '≈' : ''}${App.fmtSize(est)}</b>`;
      estHtml = L(`按 Marker 估算 ${v}`, `Estimated from marker: ${v}`);
      if (info.extrap) estHtml += '<br><span class="warn-t">' + L('超出 Marker 范围，为外推值，成图会标 ≈', 'Outside the marker range: extrapolated, shown with ≈') + '</span>';
      if (info.perMarker.length > 1) estHtml += '<br>' + info.perMarker.map(p => L(`孔 ${p.lane + 1}：`, `well ${p.lane + 1}: `) + App.fmtSize(p.bp) + (p.extrap ? L('（外推）', ' (extrapolated)') : '')).join(L('；', '; '))
        + (info.disagree ? ' <span class="warn-t">' + L('两者相差 &gt;10%', 'differ by &gt;10%') + '</span>' : '');
    }
    pop.innerHTML = `<h4>${L('目标条带箭头', 'Target band arrow')}</h4>
      <div class="field"><input type="text" id="pName" placeholder="${L('名称（可空），如 GAPDH、PCR 产物', 'Name (optional), e.g. GAPDH, PCR product')}" value="${esc(a.text)}"></div>
      <div class="est">${estHtml}</div>
      <div class="field inline"><label class="switch"><input type="checkbox" id="pSize" ${a.size ? 'checked' : ''}><span>${L('标注大小', 'Show size')}</span></label>
        <input type="text" id="pSizeText" placeholder="${est ? App.fmtSize(est) : L('如 452 bp / 55 kDa', 'e.g. 452 bp / 55 kDa')}" value="${esc(a.sizeText || '')}" style="flex:1" title="${L('留空 = 用估算值；也可填理论大小', 'Empty = use the estimate; or type the expected size')}"></div>
      <div class="field inline"><label class="inline-label">${L('位置', 'Side')}</label>
        <select id="pSide" style="width:auto"><option value="">${L('自动', 'Auto')}</option><option value="right">${L('右侧', 'Right')}</option><option value="left">${L('左侧', 'Left')}</option></select>
        <span class="hint" style="margin:0">${L('上下位置在原图上拖品红线', 'Drag the magenta line on the image to move it')}</span></div>
      <div class="actions"><button class="btn sm danger" id="pDel">${L('删除', 'Delete')}</button><button class="btn sm primary" id="pOk">${L('完成', 'Done')}</button></div>`;
    pop.querySelector('#pSide').value = a.side || '';
    const r = (anchor || prev).getBoundingClientRect();
    pop.classList.remove('hidden');
    const pw = 250, ph = pop.offsetHeight;
    pop.style.left = clamp(r.right + 10 + pw > innerWidth ? r.left - pw - 10 : r.right + 10, 6, innerWidth - pw - 6) + 'px';
    pop.style.top = clamp(r.top - 20, 58, innerHeight - ph - 8) + 'px';
    const upd = () => App.refresh();
    pop.querySelector('#pName').addEventListener('input', e => { a.text = e.target.value; upd(); });
    pop.querySelector('#pName').addEventListener('keydown', e => { if (e.key === 'Enter' && !composing(e)) closePop(); });
    pop.querySelector('#pSize').addEventListener('change', e => { a.size = e.target.checked; upd(); });
    pop.querySelector('#pSizeText').addEventListener('input', e => { a.sizeText = e.target.value.trim(); if (a.sizeText) { a.size = true; pop.querySelector('#pSize').checked = true; } upd(); });
    pop.querySelector('#pSide').addEventListener('change', e => { a.side = e.target.value; upd(); });
    pop.querySelector('#pOk').onclick = closePop;
    pop.querySelector('#pDel').onclick = () => { S().arrows.splice(k, 1); App.selArrow = -1; popK = -1; pop.classList.add('hidden'); App.commit(); };
    setTimeout(() => pop.querySelector('#pName').focus(), 0);
  }
  document.addEventListener('mousedown', e => { if (popK >= 0 && !pop.contains(e.target) && !e.target.closest('[data-aed]') && !e.target.closest('g[data-edit="arrow"]')) closePop(); });

  /* ---------- preview pointer handling ---------- */
  let press = null;
  const laneAt = (x, y) => { const el = document.elementFromPoint(x, y); const g = el && el.closest && el.closest('g[data-edit="lane"]'); return g ? +g.dataset.src : null; };
  function highlight(a, b) {
    prev.querySelectorAll('g[data-edit="lane"]').forEach(g => {
      const s = +g.dataset.src;
      g.classList.toggle('active', a != null && s >= Math.min(a, b) && s <= Math.max(a, b));
    });
  }
  prev.addEventListener('mousedown', e => {
    if (!S()) return;
    const g = e.target.closest('[data-edit]');
    if (!g) return;
    if (g.dataset.edit === 'lane') { press = { src: +g.dataset.src, x: e.clientX, y: e.clientY, moved: false, end: +g.dataset.src }; e.preventDefault(); }
  });
  window.addEventListener('mousemove', e => {
    if (!press) return;
    if (Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) > 6) press.moved = true;
    if (press.moved) { const l = laneAt(e.clientX, e.clientY); if (l != null) press.end = l; highlight(press.src, press.end); }
  });
  window.addEventListener('mouseup', e => {
    if (!press) return;
    const p = press; press = null;
    highlight(null);
    if ((p.moved && p.end !== p.src) || App.mode === 'group') {
      // drag across lane names (or a click in group mode) = new group
      S().groups.push({ from: Math.min(p.src, p.end), to: Math.max(p.src, p.end), text: '' });
      const k = S().groups.length - 1;
      setMode(null);
      App.commit();
      requestAnimationFrame(() => openEd('group', k));
    } else if (!p.moved) openEd('lane', p.src);
  });
  prev.addEventListener('click', e => {
    if (!S()) return;
    const g = e.target.closest('[data-edit]');
    if (!g) { if (App.mode === 'arrow') G.UI.toast(L('请点在凝胶图像上的条带', 'Click a band on the gel image')); return; }
    const kind = g.dataset.edit;
    if (kind === 'group') openEd('group', +g.dataset.k);
    else if (kind === 'condname') openEd('condname', +g.dataset.r);
    else if (kind === 'cond') {
      const c = S().conditions[+g.dataset.r], i = +g.dataset.src, cyc = { '': '+', '+': '−', '−': '' };
      c.values[i] = cyc[c.values[i] || ''] != null ? cyc[c.values[i] || ''] : '';
      App.commit();
    } else if (kind === 'arrow') arrowPopover(+g.dataset.k, g);
    else if (kind === 'gel' && App.mode === 'arrow') {
      // map the click on the composed gel image back to raw-image coordinates
      const rect = g.getBoundingClientRect(), gel = App._lastGel, c = S().crop;
      const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
      const px = fx * gel.canvas.width;
      const seg = gel.segs.find(s => px >= s.off && px <= s.off + (s.px1 - s.px0)) || gel.segs[0];
      App.placeArrow(c.x + seg.px0 + (px - seg.off), c.y + fy * c.h);
    }
  });

  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (popK >= 0) closePop();
    else if (App.mode) setMode(null);
  });

  G.FigEdit = {
    setMode, arrowPopover, openEd,
    afterRender() {
      if (edit && edit.kind === 'lane') {
        const el = prev.querySelector(`g[data-edit="lane"][data-src="${edit.id}"]`);
        if (el) el.classList.add('active');
      }
    }
  };
})(window);
