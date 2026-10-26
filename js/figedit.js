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
  const coarse = matchMedia('(pointer: coarse)');
  const phone = () => !!(G.UI && G.UI.isPhone());
  let groupStart = null;   // touch: first lane name tapped for a group line

  /* ---------- modes ---------- */
  function setMode(m) {
    App.mode = m;
    groupStart = null;
    $('modeBanner').classList.toggle('hidden', !m);
    // on a phone the image is a tab of its own, not "on the left"
    $('modeText').textContent = m === 'arrow' ? L('点击目标条带（原图或成图上都行），自动吸附并估算大小', 'Click the target band (on either image); it snaps to the band and estimates the size')
      : m === 'group' ? (coarse.matches ? L('依次点第一个和最后一个泳道名，生成分组横线', 'Tap the first lane name, then the last, to make the group line')
        : L('在成图上从第一个泳道名拖到最后一个，松开即生成分组横线', 'Drag from the first to the last lane name on the figure; release to create the group line'))
      : m === 'box' ? (phone() ? L('在原图上按住拖出一个矩形，框住要强调的条带', 'Drag a rectangle on the image around the bands to highlight')
        : L('在左侧原图上按住拖出一个矩形，框住要强调的条带', 'On the image on the left, drag a rectangle around the bands to highlight'))
      : m === 'bracket' ? (phone() ? L('在原图上从上往下拖，选出括号覆盖的区域（如拖尾、多聚体）', 'Drag from top to bottom on the image over the region the bracket covers (smear, oligomers …)')
        : L('在左侧原图上从上往下拖，选出括号覆盖的区域（如拖尾、多聚体）', 'On the image on the left, drag from top to bottom over the region the bracket covers (smear, oligomers …)'))
      : m === 'marker-lane' ? L('点原图中的 Marker 泳道，或点成图上的泳道名；选中后可核对型号和条带', 'Click the marker lane on the image, or its name on the figure; then review the ladder and bands')
      : m === 'marker-band' ? L('点黄色 Marker 泳道的实际条带选大小，或先点参考图大小再定位；拖黄线微调', 'Click a band on the yellow marker lane to choose its size, or choose a reference size first; drag yellow lines to adjust')
      : m === 'lane' ? L('点一下要加泳道的位置（红框内）', 'Tap where the new lane goes (inside the red box)') : '';
    $('btnAddArrow').classList.toggle('on', m === 'arrow');
    $('btnAddGroup').classList.toggle('on', m === 'group');
    $('btnAddBox').classList.toggle('on', m === 'box');
    $('btnAddBracket').classList.toggle('on', m === 'bracket');
    prev.classList.toggle('arming', m === 'arrow');
    if (G.MarkerUI) G.MarkerUI.modeChanged(m);
    G.Editor.draw();
  }
  $('modeCancel').onclick = () => setMode(null);
  $('btnAddArrow').onclick = () => { if (S()) setMode(App.mode === 'arrow' ? null : 'arrow'); };
  $('btnAddGroup').onclick = () => { if (S()) setMode(App.mode === 'group' ? null : 'group'); };
  $('btnAddBox').onclick = () => { if (S()) setMode(App.mode === 'box' ? null : 'box'); };
  $('btnAddBracket').onclick = () => { if (S()) setMode(App.mode === 'bracket' ? null : 'bracket'); };
  $('btnAddLabel').onclick = () => {
    if (!S()) return;
    // the first side text goes on the left (where blot panels name the stain / antibody), later ones below
    S().labels.push({ text: '', pos: S().labels.some(t => t.pos === 'left') ? 'below' : 'left' });
    App.commit();
    App.openAnno('label', S().labels.length - 1);
  };

  // a box / bracket was drawn on the image (r in image pixels); tiny drags become a sensible default
  App.createAnno = function (kind, r) {
    const c = S().crop;
    if (kind === 'box') {
      if (r.w < 6 || r.h < 6) { const w = c.w * 0.14, h = c.h * 0.07; r = { x: r.x - w / 2, y: r.y - h / 2, w, h }; }
      S().boxes.push({ x: r.x, y: r.y, w: r.w, h: r.h, text: '', dash: true, zoom: 0 });
    } else {
      let y1 = r.y, y2 = r.y + r.h;
      if (y2 - y1 < 6) { y1 = r.y - c.h * 0.05; y2 = r.y + c.h * 0.05; }
      S().brackets.push({ y1: Math.max(c.y, y1), y2: Math.min(c.y + c.h, y2), text: '', side: '' });
    }
    setMode(null);
    App.commit();
    App.openAnno(kind, (kind === 'box' ? S().boxes : S().brackets).length - 1);
  };
  App.openAnno = function (kind, k) {
    App.selAnno = { kind, k };
    requestAnimationFrame(() => annoPopover(kind, k, prev.querySelector(`g[data-edit="${kind}"][data-k="${k}"]`)));
  };
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

  /* ---------- inline text editor (with a size / line-break bar) ---------- */
  let edit = null;   // { kind, id, orig }
  const bar = $('fedBar');
  function nameEditSnapshot(){
    const lane=S().lanes[edit.id];return {data:JSON.parse(JSON.stringify({name:lane.name,nameRuns:lane.nameRuns,nameStyle:lane.nameStyle,lanePt:S().style.lanePt})),runs:G.NameText.normalize(edit.runs),a:fed.selectionStart,z:fed.selectionEnd};
  }
  function recordNameEdit(){
    if(edit?.kind!=='lane'||!edit.stack||edit.composing)return;
    const next=nameEditSnapshot();if(JSON.stringify(next.data)===JSON.stringify(edit.stack[edit.cursor].data))return;
    edit.stack=edit.stack.slice(0,edit.cursor+1);edit.stack.push(next);if(edit.stack.length>100)edit.stack.shift();edit.cursor=edit.stack.length-1;
  }
  function nameUndoKey(e){
    if(edit?.kind!=='lane'||edit.composing||composing(e)||!(e.ctrlKey||e.metaKey)||!['z','y'].includes(e.key.toLowerCase()))return false;
    if(e.target!==fed&&/^(input|select)$/i.test(e.target.tagName))return false;
    e.preventDefault();e.stopPropagation();
    const redo=e.key.toLowerCase()==='y'||e.shiftKey,at=edit.cursor+(redo?1:-1);if(at<0||at>=edit.stack.length)return true;
    edit.cursor=at;const snap=edit.stack[at],lane=S().lanes[edit.id];
    for(const k of ['name','nameRuns','nameStyle']){if(snap.data[k]===undefined)delete lane[k];else lane[k]=JSON.parse(JSON.stringify(snap.data[k]));}
    S().style.lanePt=snap.data.lanePt??null;edit.runs=G.NameText.normalize(snap.runs);fed.value=G.NameText.plain(edit.runs);fed.focus({preventScroll:true});fed.setSelectionRange(snap.a,snap.z);syncBar();autoRows();App.refresh();return true;
  }
  const getVal = (kind, id) => kind === 'lane' ? S().lanes[id].name : kind === 'group' ? S().groups[id].text : S().conditions[id].name;
  const setVal = (kind, id, v) => { if (kind === 'lane') S().lanes[id].name = v; else if (kind === 'group') S().groups[id].text = v; else S().conditions[id].name = v; };
  // font size of what is being edited: lane names share one size; a group label or a +/− row has its own
  const sizeHost = () => (edit.kind === 'lane' ? S().lanes[edit.id].nameStyle?{o:S().lanes[edit.id].nameStyle,k:'pt'}:{ o: S().style, k: 'lanePt' } : { o: edit.kind === 'group' ? S().groups[edit.id] : S().conditions[edit.id], k: 'pt' });
  const curSize = () => { const h = sizeHost(); return h.o[h.k] || (edit.kind==='lane'?S().style.lanePt:0)||S().style.fontPt; };
  function setSize(v) {
    const h = sizeHost();
    const fallback=edit.kind==='lane'&&h.o!==S().style?(S().style.lanePt||S().style.fontPt):S().style.fontPt;
    if (v == null || v === fallback) { if (h.k === 'pt') delete h.o.pt; else h.o[h.k] = null; }
    else h.o[h.k] = clamp(Math.round(v * 2) / 2, 4, 14);
    syncBar(); App.refresh();
    recordNameEdit();
  }
  function syncBar() {
    if (!edit) return;
    fed.style.fontFamily = G.Render.fontStack(S().style.fontFamily);
    const own = sizeHost().o[sizeHost().k];
    $('fedSizeLbl').textContent = edit.kind === 'lane' ? (S().lanes[edit.id].nameStyle?L('此泳道字号','This lane'):L('统一泳道字号', 'All lane names')) : edit.kind === 'group' ? L('字号', 'Size') : L('本行字号', 'Row size');
    $('fedSize').textContent = curSize() + ' pt';
    $('fedReset').classList.toggle('hidden', !own);
    $('fedBr').classList.toggle('hidden', edit.kind !== 'group');
    $('fedMarker').classList.toggle('hidden', edit.kind !== 'lane');
    $('fedTextTools').classList.toggle('hidden',edit.kind!=='lane');$('fedLaneSettings').classList.toggle('hidden',edit.kind!=='lane');
    if(edit.kind==='lane'){
      const own=S().lanes[edit.id].nameStyle;$('fedOwn').checked=!!own;$('fedOwnFields').classList.toggle('hidden',!own);
      if(document.activeElement!==$('fedOwnPt'))$('fedOwnPt').value=curSize();
      if(document.activeElement!==$('fedOwnAngle'))$('fedOwnAngle').value=own?.angle==='auto'?'':own?.angle??'';
      const a=fed.selectionStart,b=fed.selectionEnd,r=G.NameText.slice(edit.runs,a===b?0:a,a===b?fed.value.length:b);
      for(const button of $('fedTextTools').querySelectorAll('button')){
        const k=button.dataset.format,on=r.length&&r.every(r=>k==='normal'?!(r.italic??S().style.laneItalic):k==='italic'?(r.italic??S().style.laneItalic):r.script===k);
        button.setAttribute('aria-pressed',String(!!on));button.disabled=!!edit.composing;
      }
    }
    if (edit.kind === 'lane') $('fedMarker').textContent = S().markers.some(m => m.lane === edit.id) ? L('Marker 设置', 'Marker settings') : L('设为 Marker', 'Use as marker');
    $('fedHint').textContent = edit.kind === 'group' && !coarse.matches ? L('Shift+Enter 换行', 'Shift+Enter: new line') : '';
  }
  function placeBar() {
    const r = fed.getBoundingClientRect();
    bar.classList.remove('hidden');
    const v=window.visualViewport,bottom=(v?.offsetTop||0)+(v?.height||innerHeight);
    bar.style.maxHeight=Math.max(70,bottom-r.bottom-12)+'px';
    const below = r.bottom + 4 + bar.offsetHeight < bottom;
    bar.style.left = clamp(r.left, 4, Math.max(4, innerWidth - bar.offsetWidth - 4)) + 'px';
    bar.style.top = Math.max(4,below?r.bottom+4:r.top-bar.offsetHeight-4)+'px';
  }
  // the textarea grows with typed line breaks (group labels only)
  const autoRows = () => { fed.rows = Math.min(4, Math.max(1, fed.value.split('\n').length)); if (edit) placeBar(); };
  function openEd(kind, id) {
    if (edit) closeEd(false);   // a previous editor whose blur has not been handled yet
    closePop();
    const el = prev.querySelector(kind === 'lane' ? `g[data-edit="lane"][data-src="${id}"]` : kind === 'group' ? `g[data-edit="group"][data-k="${id}"]` : `g[data-edit="condname"][data-r="${id}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    edit = { kind, id, orig: getVal(kind, id) || '',state:S() };
    if(kind==='lane'){
      edit.original=JSON.parse(JSON.stringify(S().lanes[id]));edit.origLanePt=S().style.lanePt;edit.runs=G.NameText.runs(S().lanes[id]);
    }
    fed.value = kind==='lane'?G.NameText.plain(edit.runs):edit.orig;
    $('fedLaneSettings').open=false;
    fed.placeholder = kind === 'lane' ? L(`孔 ${id + 1} 名称`, `Well ${id + 1} name`) : kind === 'group' ? L('分组文字', 'Group label') : L('条件名', 'Condition name');
    // the on-screen keyboard labels Enter "Next" while lane names are filled in one after another
    fed.setAttribute('enterkeyhint', kind === 'lane' ? 'next' : 'done');
    const w = Math.max(120, Math.min(240, r.width + 50));
    fed.style.width = w + 'px';
    fed.style.left = clamp(r.left + r.width / 2 - w / 2, 4, innerWidth - w - 4) + 'px';
    fed.style.top = clamp(r.top + r.height / 2 - 15, 56, innerHeight - 40) + 'px';
    fed.classList.remove('hidden');
    fed.rows = 1; autoRows();
    syncBar(); placeBar();
    fed.focus(); fed.select();
    if(kind==='lane'){edit.stack=[nameEditSnapshot()];edit.cursor=0;}
    if (kind === 'lane') { App.selLane = id; G.Editor.draw(); }
  }
  // only a group label keeps line breaks; tidy spaces around them
  const clean = (kind, v) => (kind === 'group'
    ? v.split('\n').map(s => s.trim()).join('\n').replace(/\n{2,}/g, '\n').trim()
    : v.replace(/\s*\n\s*/g, ' ').trim());
  function closeEd(revert) {
    if (!edit) return;
    const e = edit; edit = null;
    if(e.state!==S()){fed.classList.add('hidden');bar.classList.add('hidden');return;}
    if(e.kind==='lane'){
      const lane=S().lanes[e.id];if(!lane)return;
      if(revert){for(const key of ['name','nameRuns','nameStyle']){if(e.original[key]===undefined)delete lane[key];else lane[key]=e.original[key];}S().style.lanePt=e.origLanePt;}
      else G.NameText.write(lane,G.NameText.edit(e.runs,clean(e.kind,fed.value)));
    }else if (revert) setVal(e.kind, e.id, e.orig);
    else setVal(e.kind, e.id, clean(e.kind, fed.value));
    fed.classList.add('hidden'); bar.classList.add('hidden');
    App.commit();
  }
  fed.addEventListener('input', () => {
    if (!edit) return;
    if(edit.state!==S()){reset();return;}
    if (edit.kind !== 'group' && fed.value.includes('\n')) fed.value = fed.value.replace(/\n/g, ' ');   // pasted text
    if(edit.kind==='lane'){edit.runs=G.NameText.edit(edit.runs,fed.value);G.NameText.write(S().lanes[edit.id],edit.runs);}
    else setVal(edit.kind, edit.id, fed.value);
    autoRows();syncBar();recordNameEdit();App.refresh();
  });
  fed.addEventListener('compositionstart',()=>{if(edit){edit.composing=true;syncBar();}});
  fed.addEventListener('compositionend',()=>{if(edit){edit.composing=false;recordNameEdit();syncBar();}});
  document.addEventListener('selectionchange',()=>{if(edit&&edit.kind==='lane'&&document.activeElement===fed)syncBar();});
  fed.addEventListener('keydown', e => {
    if(nameUndoKey(e))return;
    if (!edit || edit.composing || composing(e)) return;          // IME is choosing characters: Enter belongs to it
    if (e.key === 'Escape') { e.preventDefault(); closeEd(true); return; }
    // Shift+Enter in a group label = a line break (the textarea inserts it)
    if (e.key === 'Enter' && edit.kind === 'group' && (e.shiftKey || e.altKey)) return;
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
  // leaving the field finishes the edit — unless the tap went to the size / line-break bar
  let barPress = false;
  document.addEventListener('pointerdown',e=>{
    if(!edit||bar.contains(e.target))return;barPress=false;
    if(e.target!==fed){const current=edit;setTimeout(()=>{if(edit===current)closeEd(false);},0);}
  },true);
  const finishOnBlur=()=>setTimeout(()=>{if(edit&&!barPress&&document.activeElement!==fed&&!bar.contains(document.activeElement))closeEd(false);},0);
  fed.addEventListener('blur',finishOnBlur);bar.addEventListener('focusout',finishOnBlur);
  bar.addEventListener('pointerdown', e => {
    barPress=true;
    if(e.target.closest('button'))e.preventDefault();
    else e.target.closest('input,select,summary')?.focus({preventScroll:true}); // Safari does not focus a clicked checkbox itself
  });
  bar.addEventListener('mousedown', e => {if(e.target.closest('button'))e.preventDefault();});
  bar.addEventListener('keydown',e=>{
    if(nameUndoKey(e))return;
    if(e.key==='Tab'){barPress=false;finishOnBlur();}
    if(e.key==='Escape'&&!composing(e)&&edit){e.preventDefault();e.stopPropagation();closeEd(true);}
  });
  $('fedLaneSettings').addEventListener('toggle',()=>{if(edit)placeBar();});
  $('fedOwn').onchange=e=>{
    if(!edit||edit.kind!=='lane')return;const lane=S().lanes[edit.id];
    if(e.target.checked)lane.nameStyle={pt:curSize(),angle:String(G.UI.lastFig()?.angle||0)};else delete lane.nameStyle;
    syncBar();placeBar();recordNameEdit();App.refresh();
  };
  $('fedOwnPt').onchange=e=>{if(!edit||edit.kind!=='lane'||!S().lanes[edit.id].nameStyle)return;const v=+e.target.value;if(v>0)S().lanes[edit.id].nameStyle.pt=clamp(Math.round(v*2)/2,4,14);else delete S().lanes[edit.id].nameStyle.pt;e.target.value=curSize();syncBar();recordNameEdit();App.refresh();};
  $('fedOwnAngle').onchange=e=>{if(!edit||edit.kind!=='lane'||!S().lanes[edit.id].nameStyle)return;const v=G.Render.labelAngle(e.target.value);S().lanes[edit.id].nameStyle.angle=v;e.target.value=v==='auto'?'':v;recordNameEdit();App.refresh();};
  window.visualViewport?.addEventListener('resize',()=>{if(edit)placeBar();});
  bar.addEventListener('click', e => {
    const format=e.target.closest('button[data-format]');
    if(format&&edit?.kind==='lane'&&!edit.composing){
      const a=fed.selectionStart,z=fed.selectionEnd;edit.runs=G.NameText.format(edit.runs,a,z,format.dataset.format);G.NameText.write(S().lanes[edit.id],edit.runs);
      fed.focus({preventScroll:true});fed.setSelectionRange(a,z);syncBar();recordNameEdit();App.refresh();barPress=false;return;
    }
    const b = e.target.closest('button[data-fz]');
    if (!b || !edit) return;
    barPress = false;
    const k = b.dataset.fz;
    if (k === 'marker') { const i = edit.id; closeEd(false); G.MarkerUI.assignLane(i); return; }
    if (k === '+' || k === '-') setSize(curSize() + (k === '+' ? 0.5 : -0.5));
    else if (k === 'reset') setSize(null);
    else if (k === 'br') { fed.setRangeText('\n', fed.selectionStart, fed.selectionEnd, 'end'); fed.dispatchEvent(new Event('input')); }
    fed.focus();
  });

  /* ---------- arrow popover ---------- */
  let popK = -1, popAnno = null;
  function closePop() {
    if (popK >= 0 || popAnno) { popK = -1; popAnno = null; pop.classList.add('hidden'); App.commit(); }
  }
  function placePop(anchor) {
    const r = (anchor || prev).getBoundingClientRect();
    pop.classList.remove('hidden');
    const pw = 250, ph = pop.offsetHeight;
    pop.style.left = clamp(r.right + 10 + pw > innerWidth ? r.left - pw - 10 : r.right + 10, 6, innerWidth - pw - 6) + 'px';
    pop.style.top = clamp(r.top - 20, 58, innerHeight - ph - 8) + 'px';
  }

  // this item's own font size; empty = the figure's font size
  const ptField = (id, v) => `<div class="field inline"><label class="inline-label" for="${id}">${L('字号', 'Size')}</label>
    <input type="number" id="${id}" min="4" max="14" step="0.5" class="num" placeholder="${S().style.fontPt}" value="${v || ''}"> pt
    <span class="hint" style="margin:0">${L('留空 = 跟随全局字号', 'empty = figure font size')}</span></div>`;
  function bindPt(inp, o) {
    inp.addEventListener('input', () => {
      const v = +inp.value;
      if (inp.value !== '' && v >= 4 && v <= 14) o.pt = v; else if (inp.value === '') delete o.pt;
      App.refresh();
    });
  }

  /* ---------- box / bracket / side-text popover ---------- */
  function annoPopover(kind, k, anchor) {
    const list = { box: S().boxes, bracket: S().brackets, label: S().labels }[kind], a = list && list[k];
    if (!a) return;
    closeEd(false);
    popK = -1; popAnno = { kind, k };
    const sel = (id, opts, v) => `<select id="${id}" style="width:auto">${opts.map(([val, t]) => `<option value="${val}"${String(v) === String(val) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
    let title, body;
    if (kind === 'box') {
      title = L('区域框', 'Region box');
      body = `<div class="field"><input type="text" id="qText" placeholder="${L('标签（可空），如 a、Short exposure', 'Label (optional), e.g. a, Short exposure')}" value="${esc(a.text)}"></div>
        <div class="field inline"><label class="inline-label">${L('线型', 'Line')}</label>${sel('qDash', [['1', L('虚线', 'Dashed')], ['0', L('实线', 'Solid')]], a.dash !== false ? 1 : 0)}
          <label class="inline-label">${L('放大展示', 'Enlarge')}</label>${sel('qZoom', [['0', L('不放大', 'No')], ['2', '×2'], ['3', '×3'], ['4', '×4']], a.zoom || 0)}</div>
        <p class="hint">${L('放大后的区域放在成图右侧，与原框同一标签；拖动框的边移动，拖右下角改大小。', 'The enlarged region is placed to the right of the figure with the same label. Drag the box edge to move it, its corner to resize.')}</p>`;
    } else if (kind === 'bracket') {
      title = L('侧边括号', 'Side bracket');
      body = `<div class="field"><input type="text" id="qText" placeholder="${L('如 (Ub)n、Smear、Dimer、IgG HC', 'e.g. (Ub)n, Smear, Dimer, IgG HC')}" value="${esc(a.text)}"></div>
        <div class="field inline"><label class="inline-label">${L('位置', 'Side')}</label>${sel('qSide', [['', L('自动', 'Auto')], ['right', L('右侧', 'Right')], ['left', L('左侧', 'Left')]], a.side || '')}</div>
        <p class="hint">${L('上下两端在原图上拖青色虚线调整。', 'Drag the teal dashed lines on the image to set its top and bottom.')}</p>`;
    } else {
      title = L('侧边文字', 'Side text');
      body = `<div class="field"><input type="text" id="qText" placeholder="${L('如 Coomassie、EtBr、IB: anti-HA、30 s', 'e.g. Coomassie, EtBr, IB: anti-HA, 30 s')}" value="${esc(a.text)}"></div>
        <div class="field inline"><label class="inline-label">${L('位置', 'Position')}</label>${sel('qPos', [['left', L('左侧竖排', 'Left, vertical')], ['right', L('右侧竖排', 'Right, vertical')], ['below', L('胶图下方', 'Below the gel')]], a.pos || 'left')}</div>
        <p class="hint">${L('用于注明染色方法、抗体或曝光时间。*斜体* 写法同泳道名。', 'For the stain, antibody or exposure time. *italic* works as in lane names.')}</p>`;
    }
    pop.innerHTML = `<h4>${title}</h4>${body}${ptField('qPt', a.pt)}
      <div class="actions"><button class="btn sm danger" id="qDel">${L('删除', 'Delete')}</button><button class="btn sm primary" id="qOk">${L('完成', 'Done')}</button></div>`;
    placePop(anchor);
    const upd = () => App.refresh();
    const q = id => pop.querySelector('#' + id);
    bindPt(q('qPt'), a);
    q('qText').addEventListener('input', e => { a.text = e.target.value; upd(); G.Editor.draw(); });
    q('qText').addEventListener('keydown', e => { if (e.key === 'Enter' && !composing(e)) closePop(); });
    if (q('qDash')) q('qDash').addEventListener('change', e => { a.dash = e.target.value === '1'; upd(); G.Editor.draw(); });
    if (q('qZoom')) q('qZoom').addEventListener('change', e => { a.zoom = +e.target.value; upd(); G.Editor.draw(); });
    if (q('qSide')) q('qSide').addEventListener('change', e => { a.side = e.target.value; upd(); });
    if (q('qPos')) q('qPos').addEventListener('change', e => { a.pos = e.target.value; upd(); });
    q('qOk').onclick = closePop;
    // by identity: other items may have been deleted while the popover was open
    q('qDel').onclick = () => { const i = list.indexOf(a); if (i >= 0) list.splice(i, 1); App.selAnno = null; popAnno = null; pop.classList.add('hidden'); App.commit(); };
    // a touch keyboard would cover the options: let the user tap the text field when wanted
    if (!coarse.matches) setTimeout(() => q('qText').focus(), 0);
  }
  function arrowPopover(k, anchor) {
    const a = S().arrows[k];
    if (!a) return;
    closeEd(false);
    popK = k; popAnno = null; App.selArrow = k;
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
      <div class="field inline"><label class="inline-label">${L('标记', 'Mark')}</label>
        <select id="pSym" style="width:auto"><option value="arrow">◀ ${L('箭头', 'Arrowhead')}</option><option value="star">* ${L('非特异条带', 'Non-specific band')}</option><option value="hash"># ${L('降解产物等', 'Degradation product etc.')}</option><option value="dagger">† ${L('其他', 'Other')}</option></select></div>
      <div class="est">${estHtml}</div>
      <div class="field inline"><label class="switch"><input type="checkbox" id="pSize" ${a.size ? 'checked' : ''}><span>${L('标注大小', 'Show size')}</span></label>
        <input type="text" id="pSizeText" placeholder="${est ? App.fmtSize(est) : L('如 452 bp / 55 kDa', 'e.g. 452 bp / 55 kDa')}" value="${esc(a.sizeText || '')}" style="flex:1" title="${L('留空 = 用估算值；也可填理论大小', 'Empty = use the estimate; or type the expected size')}"></div>
      <div class="field inline"><label class="inline-label">${L('位置', 'Side')}</label>
        <select id="pSide" style="width:auto"><option value="">${L('自动', 'Auto')}</option><option value="right">${L('右侧', 'Right')}</option><option value="left">${L('左侧', 'Left')}</option></select>
        <span class="hint" style="margin:0">${L('上下位置在原图上拖品红线', 'Drag the magenta line on the image to move it')}</span></div>
      ${ptField('pPt', a.pt)}
      <div class="actions"><button class="btn sm danger" id="pDel">${L('删除', 'Delete')}</button><button class="btn sm primary" id="pOk">${L('完成', 'Done')}</button></div>`;
    pop.querySelector('#pSide').value = a.side || '';
    pop.querySelector('#pSym').value = a.sym || 'arrow';
    placePop(anchor);
    const upd = () => App.refresh();
    pop.querySelector('#pSym').addEventListener('change', e => {
      a.sym = e.target.value;
      // a symbol marks a band as "not the one": it does not carry a size unless typed in
      if (a.sym !== 'arrow' && !a.sizeText) { a.size = false; pop.querySelector('#pSize').checked = false; }
      upd();
    });
    pop.querySelector('#pName').addEventListener('input', e => { a.text = e.target.value; upd(); });
    pop.querySelector('#pName').addEventListener('keydown', e => { if (e.key === 'Enter' && !composing(e)) closePop(); });
    pop.querySelector('#pSize').addEventListener('change', e => { a.size = e.target.checked; upd(); });
    pop.querySelector('#pSizeText').addEventListener('input', e => { a.sizeText = e.target.value.trim(); if (a.sizeText) { a.size = true; pop.querySelector('#pSize').checked = true; } upd(); });
    pop.querySelector('#pSide').addEventListener('change', e => { a.side = e.target.value; upd(); });
    bindPt(pop.querySelector('#pPt'), a);
    pop.querySelector('#pOk').onclick = closePop;
    pop.querySelector('#pDel').onclick = () => { const i = S().arrows.indexOf(a); if (i >= 0) S().arrows.splice(i, 1); App.selArrow = -1; popK = -1; pop.classList.add('hidden'); App.commit(); };
    if (!coarse.matches) setTimeout(() => pop.querySelector('#pName').focus(), 0);
  }
  document.addEventListener('mousedown', e => {
    if (!e.target.closest) { if (popK >= 0 || popAnno) closePop(); return; }
    if ((popK >= 0 || popAnno) && !pop.contains(e.target) && !e.target.closest('[data-aed]') && !e.target.closest('[data-qed]')
      && !e.target.closest('g[data-edit="arrow"], g[data-edit="box"], g[data-edit="bracket"], g[data-edit="label"]') && e.target.id !== 'editor') closePop();
  });

  /* ---------- preview pointer handling ---------- */
  let press = null;
  const laneAt = (x, y) => { const el = document.elementFromPoint(x, y); const g = el && el.closest && el.closest('g[data-edit="lane"]'); return g ? +g.dataset.src : null; };
  function highlight(a, b) {
    prev.querySelectorAll('g[data-edit="lane"]').forEach(g => {
      const s = +g.dataset.src;
      g.classList.toggle('active', a != null && s >= Math.min(a, b) && s <= Math.max(a, b));
    });
  }
  prev.addEventListener('pointerdown', e => {
    if (!S()) return;
    const g = e.target.closest('[data-edit]');
    if (!g) return;
    if (App.mode === 'marker-lane' && g.dataset.edit === 'lane') { e.preventDefault(); G.MarkerUI.chooseLane(+g.dataset.src); return; }
    if (g.dataset.edit === 'lane') { press = { src: +g.dataset.src, x: e.clientX, y: e.clientY, moved: false, end: +g.dataset.src, touch: e.pointerType === 'touch' }; e.preventDefault(); }
  });
  function makeGroup(a, b) {
    S().groups.push({ from: Math.min(a, b), to: Math.max(a, b), text: '' });
    const k = S().groups.length - 1;
    setMode(null);
    App.commit();
    requestAnimationFrame(() => openEd('group', k));
  }
  window.addEventListener('pointermove', e => {
    if (!press) return;
    if (e.cancelable) e.preventDefault();
    if (Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) > 6) press.moved = true;
    if (press.moved) { const l = laneAt(e.clientX, e.clientY); if (l != null) press.end = l; highlight(press.src, press.end); }
  });
  window.addEventListener('pointerup', e => {
    if (!press) return;
    const p = press; press = null;
    if (App.mode === 'group' && p.touch && !p.moved) {
      // a finger scrolls the figure instead of dragging across names: tap the first, then the last
      if (groupStart == null) {
        groupStart = p.src; highlight(p.src, p.src);
        $('modeText').textContent = L('再点最后一个泳道名', 'Now tap the last lane name');
        return;
      }
      const a = groupStart; groupStart = null; highlight(null);
      makeGroup(a, p.src);
      return;
    }
    highlight(null);
    // drag across lane names (or a click in group mode) = new group
    if ((p.moved && p.end !== p.src) || App.mode === 'group') makeGroup(p.src, p.end);
    else if (!p.moved) openEd('lane', p.src);
  });
  // the browser took the touch for scrolling the figure
  window.addEventListener('pointercancel', () => { if (press) { press = null; if (groupStart == null) highlight(null); } });
  prev.addEventListener('click', e => {
    if (!S()) return;
    const g = e.target.closest('[data-edit]');
    if (!g) { if (App.mode === 'arrow') G.UI.toast(L('请点在凝胶图像上的条带', 'Click a band on the gel image')); return; }
    const kind = g.dataset.edit;
    if (kind === 'marker') { G.MarkerUI.labelPopover(+g.dataset.marker, +g.dataset.band, g); return; }
    if (kind === 'group') openEd('group', +g.dataset.k);
    else if (kind === 'condname') openEd('condname', +g.dataset.r);
    else if (kind === 'cond') {
      const c = S().conditions[+g.dataset.r], i = +g.dataset.src, cyc = { '': '+', '+': '−', '−': '' };
      c.values[i] = cyc[c.values[i] || ''] != null ? cyc[c.values[i] || ''] : '';
      App.commit();
    } else if (kind === 'arrow') arrowPopover(+g.dataset.k, g);
    else if (kind === 'box' || kind === 'bracket' || kind === 'label') { App.selAnno = { kind, k: +g.dataset.k }; annoPopover(kind, +g.dataset.k, g); G.Editor.draw(); }
    else if (kind === 'gel' && (App.mode === 'arrow' || App.mode === 'marker-lane')) {
      // map the click on the composed gel image back to raw-image coordinates
      const rect = g.getBoundingClientRect(), gel = App._lastGel, c = S().crop;
      const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
      const px = fx * gel.canvas.width;
      const seg = gel.segs.find(s => px >= s.off && px <= s.off + (s.px1 - s.px0)) || gel.segs[0];
      const x = c.x + seg.px0 + (px - seg.off);
      if (App.mode === 'marker-lane') G.MarkerUI.pickAt(x); else App.placeArrow(x, c.y + fy * c.h);
    }
  });

  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (popK >= 0 || popAnno) closePop();
    else if (App.mode) setMode(null);
  });

  // drop open editors without writing them back (undo, redo, a new image): they belong to the old state
  function reset() {
    if (edit) { edit = null; fed.classList.add('hidden'); bar.classList.add('hidden'); }
    if (popK >= 0 || popAnno) { popK = -1; popAnno = null; pop.classList.add('hidden'); }
  }
  App.on(w => { if (w === 'loaded') reset(); });

  G.FigEdit = {
    setMode, arrowPopover, annoPopover, openEd, closePop, reset,
    flush() { closeEd(false); closePop(); },
    afterRender() {
      if(edit){syncBar();placeBar();}
      if (edit && edit.kind === 'lane') {
        const el = prev.querySelector(`g[data-edit="lane"][data-src="${edit.id}"]`);
        if (el) el.classList.add('active');
      }
    }
  };
})(window);
