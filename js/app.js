/* Application state, processing pipeline, undo history and preview refresh.
 * Coordinates: lane x / band y / arrow y are stored in ROTATED-IMAGE pixels (absolute),
 * so moving the crop never shifts annotations relative to the gel.
 */
(function (G) {
  'use strict';
  const E = G.Engine, L = G.L;
  const SAT = 0.998;
  const PREF_KEY = 'gelfig.prefs';

  const defaultStyle = () => ({
    gelWidthMm: 45, autoWidth: true, mmPerLane: 5.5, fontPt: 7, lineWidthPt: 0.5, labelAngle: 'auto', laneNumbers: false, frame: false,
    panelLetter: '', panelPt: 8, spliceStyle: 'gap', spliceGapPt: 1.5, tickLenPt: 2.5, labelGapPt: 2.5,
    unitHeader: true, groupTicks: false, dpi: 600, laneNumberMode: 'well'
  });

  const App = {
    S: null,            // serialisable state
    src: null, rot: null, rotFor: null,
    fullCanvas: document.createElement('canvas'),
    satCanvas: null,
    listeners: [],
    hist: [], future: [],
    selLane: -1, selArrow: -1,
  };

  function prefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch (e) { return {}; } }
  function savePrefs() {
    const S = App.S; if (!S) return;
    const m0 = S.markers[0] || {};
    const unit = m0.unit || (App.gelKind() === 'protein' ? 'kDa' : App.prefUnit);
    localStorage.setItem(PREF_KEY, JSON.stringify(Object.assign(prefs(), { style: S.style, ladderId: m0.ladderId || App.prefLadder, unit, invert: S.levels.invert })));
  }

  function busy(on, text) {
    document.getElementById('busy').classList.toggle('hidden', !on);
    const t = document.getElementById('busyText'); if (t && on) t.textContent = text || L('处理中…', 'Working…');
  }
  App.busy = busy;
  App.defaultStyle = defaultStyle;
  App.onDropFile = null;   // set by the UI layer

  App.VERSION = '0.6.0-dev';
  App.prefs = prefs;
  App.setPref = function (k, v) { const p = prefs(); p[k] = v; localStorage.setItem(PREF_KEY, JSON.stringify(p)); };

  // ---------- hashing ----------
  App.sha256 = async function (buffer) {
    // forceJsHash: headless test runs (off-thread WebCrypto does not hold their virtual clock)
    if (window.crypto && crypto.subtle && !App.forceJsHash) {
      try { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(b => b.toString(16).padStart(2, '0')).join(''); } catch (e) { /* fall through */ }
    }
    return sha256js(new Uint8Array(buffer));
  };
  // small pure-JS fallback (file:// in some browsers has no crypto.subtle)
  function sha256js(m) {
    const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const l = m.length, nb = ((l + 9 + 63) >> 6) << 6, p = new Uint8Array(nb);
    p.set(m); p[l] = 0x80;
    const dv = new DataView(p.buffer);
    dv.setUint32(nb - 8, Math.floor(l / 0x20000000)); dv.setUint32(nb - 4, (l << 3) >>> 0);
    const w = new Uint32Array(64), r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    return [...H].map(x => x.toString(16).padStart(8, '0')).join('');
  }

  // ---------- loading ----------
  // read + decode one input (File or {name, buffer})
  App.readInput = async function (file) {
    const buffer = file.buffer || await file.arrayBuffer();
    const img = await G.TIFF.decodeBuffer(buffer, file.name);
    return { name: file.name, buffer, img, sha256: await App.sha256(buffer) };
  };

  // install a decoded image as the current source and run the automatic pipeline
  function startFrom(input) {
    const img = input.img;
    App.src = { w: img.width, h: img.height, data: img.data };
    App.srcBuffer = input.buffer;
    App.rot = null; App.satCanvas = null; App._display = null; App._clipKey = null;
    const p = prefs();
    App.S = {
      file: { name: input.name, bits: img.bits, dpi: img.dpi, actualMax: img.actualMax, sha256: input.sha256, size: input.buffer.byteLength },
      bright: E.detectBright(App.src),
      rotation: 0,
      levels: { black: 0, white: 1, gamma: 1, invert: p.invert != null ? p.invert : false },
      crop: { x: 0, y: 0, w: img.width, h: img.height },
      lanes: [], laneHalfW: 10,
      gelType: null,          // 'dna' | 'protein'; decided from the image below, the user can override
      markers: [],
      groups: [], conditions: [], arrows: [],
      style: Object.assign(defaultStyle(), p.style || {}),
      saturatedInCrop: 0
    };
    App.invertInherited = p.invert != null;
    App.prefLadder = G.Ladders.get(p.ladderId) ? p.ladderId : 'gr1kbplus';
    App.prefUnit = p.unit || 'bp';
    App.loadWarnings = img.warnings || [];
    App._colorStats = img.colorStats || null;
    App.gelDetection = null;
    App.hist = []; App.future = [];
    App.autoAll(true);
    // the state right after automatic processing: target of "reset everything"
    App.initial = App.snapshot();
    App.autoRotation = App.S.rotation;
  }

  // file: File or {name, buffer}; or an array of them (several exposures of one gel)
  App.load = async function (file) {
    if (Array.isArray(file) && file.length > 1) return App.loadMany(file);
    if (Array.isArray(file)) file = file[0];
    busy(true, L('正在读取并自动识别…', 'Reading and detecting…'));
    await new Promise(r => setTimeout(r, 30));
    try {
      const input = await App.readInput(file);
      App.exposures = null;
      startFrom(input);
      App.emit('loaded');
    } catch (e) {
      console.error(e);
      alert(L('读取失败：', 'Could not read the file: ') + e.message);
    } finally { busy(false); }
  };

  /* Several exposures of one gel: score each on a downsampled copy, open the best. Only the chosen
   * image is kept decoded; the others keep their file bytes and are decoded again when picked. */
  App.loadMany = async function (files) {
    busy(true, L(`正在评估 ${files.length} 张曝光…`, `Scoring ${files.length} exposures…`));
    await new Promise(r => setTimeout(r, 30));
    try {
      const list = [];
      let bestInput = null;
      for (let k = 0; k < files.length; k++) {
        busy(true, L(`正在评估第 ${k + 1} / ${files.length} 张…`, `Scoring exposure ${k + 1} / ${files.length}…`));
        await new Promise(r => setTimeout(r, 0));
        const input = await App.readInput(files[k]);
        const img = { w: input.img.width, h: input.img.height, data: input.img.data };
        const q = E.exposureScore(img);
        list.push({ name: input.name, buffer: input.buffer, sha256: input.sha256, w: img.w, h: img.h, bits: input.img.bits,
          score: q.score, clipFrac: q.clipFrac, snr: q.snr, rangeUse: q.rangeUse, thumb: thumbnail(img, q.bright) });
        // keep decoded pixels only for the current best; the rest live on as file bytes
        if (!bestInput || q.score > bestInput.score) { if (bestInput) bestInput.img = null; bestInput = Object.assign(input, { score: q.score, k }); }
        else input.img = null;
      }
      const order = list.map((e, i) => i).sort((a, b) => list[b].score - list[a].score);
      list.forEach((e, i) => { e.rank = order.indexOf(i) + 1; });
      App.exposures = list;
      App.expIdx = bestInput.k;
      startFrom(bestInput);
      App.emit('loaded');
    } catch (e) {
      console.error(e);
      alert(L('读取失败：', 'Could not read the file: ') + e.message);
    } finally { busy(false); }
  };

  function thumbnail(img, bright) {
    const sm = E.downsample(img, 140), lv = E.autoLevels(sm);
    const c = document.createElement('canvas'); c.width = sm.w; c.height = sm.h;
    c.getContext('2d').putImageData(E.toImageData(sm, { black: lv.black, white: lv.white, gamma: 1, invert: !bright ? false : true }), 0, 0);
    return c.toDataURL('image/jpeg', 0.8);
  }

  /* Switch to another exposure of the same gel. Same pixel size = same framing: everything typed is
   * kept, only the pixels and contrast change. Different size: re-detect, names carried in order. */
  App.switchExposure = async function (k) {
    const ex = App.exposures && App.exposures[k];
    if (!ex || k === App.expIdx) return { ok: true };
    busy(true, L('正在切换曝光…', 'Switching exposure…'));
    await new Promise(r => setTimeout(r, 20));
    try {
      const img = await G.TIFF.decodeBuffer(ex.buffer, ex.name);
      const S = App.S;
      App.expIdx = k;
      if (img.width === App.src.w && img.height === App.src.h) {
        App.src = { w: img.width, h: img.height, data: img.data };
        App.srcBuffer = ex.buffer;
        App.rot = null; App.satCanvas = null; App._display = null; App._clipKey = null;
        S.file = { name: ex.name, bits: img.bits, dpi: img.dpi, actualMax: img.actualMax, sha256: ex.sha256, size: ex.buffer.byteLength };
        App.autoLevels();
        App.updateSaturation();
        App.refineMarkers();   // same geometry: keep band assignments
        App.commit();
        return { ok: true, kept: true };
      }
      const names = App.figureLanes().map(i => S.lanes[i].name);
      startFrom({ name: ex.name, buffer: ex.buffer, img, sha256: ex.sha256 });
      const fl = App.figureLanes();
      const same = fl.length === names.length;
      if (same) { fl.forEach((i, j) => { App.S.lanes[i].name = names[j]; }); App.commit(); }
      App.emit('loaded');
      return { ok: true, kept: false, namesCarried: same };
    } finally { busy(false); }
  };

  // lanes that appear in the figure, left to right
  App.figureLanes = function () {
    const r = App.laneRange(); if (!r) return [];
    const out = []; for (let i = r[0]; i <= r[1]; i++) if (!App.S.lanes[i].hidden) out.push(i);
    return out;
  };

  // ---------- pipeline ----------
  App.ensureRot = function () {
    if (!App.rot || App.rotFor !== App.S.rotation) {
      App.rot = E.rotate(App.src, App.S.rotation);
      App.rotFor = App.S.rotation;
      App.satCanvas = null;
      App._display = null;
    }
    return App.rot;
  };

  App.renderFull = function () {
    const rot = App.ensureRot(), lv = App.S.levels;
    const key = [App.S.rotation, lv.black, lv.white, lv.gamma, lv.invert].join('|');
    if (App._display === key) return;
    App._display = key;
    const c = App.fullCanvas;
    c.width = rot.w; c.height = rot.h;
    c.getContext('2d').putImageData(E.toImageData(rot, lv), 0, 0);
    App._gelKey = null;
  };

  App.getSatCanvas = function () {
    if (App.satCanvas) return App.satCanvas;
    const rot = App.ensureRot();
    const c = document.createElement('canvas'); c.width = rot.w; c.height = rot.h;
    const id = new ImageData(rot.w, rot.h);
    for (let i = 0; i < rot.data.length; i++) if (rot.data[i] >= SAT) { id.data[i * 4] = 255; id.data[i * 4 + 3] = 255; }
    c.getContext('2d').putImageData(id, 0, 0);
    return (App.satCanvas = c);
  };

  App.cropImg = function () { return E.cropImg(App.ensureRot(), App.S.crop); };

  App.updateSaturation = function () {
    const c = App.cropImg();
    App.S.saturatedInCrop = E.saturation(c, SAT);
  };

  App.AUTO_ROT_LIMIT = 15;
  App.MAX_ROT = 45;
  // returns the detected angle; on a non-fresh image every annotation is carried along
  App.autoDeskew = function () {
    const a = E.deskew(App.src, App.S.bright);
    App.setRotation(a);
    return a;
  };

  /* Change the rotation and move everything with the gel. All coordinates live in the rotated frame;
   * going from angle d1 to d2 maps a point p to R(d2-d1)(p - centre) + centre (same canvas size).
   * Lanes are vertical lines, so they are mapped at the crop's vertical centre; marker bands at
   * their lane; arrows at the crop's horizontal centre. Nothing is re-detected, nothing is lost. */
  App.setRotation = function (deg) {
    const S = App.S;
    deg = Math.max(-App.MAX_ROT, Math.min(App.MAX_ROT, Math.round((+deg || 0) * 10) / 10));
    const d = deg - S.rotation;
    if (!d) return;
    const W = App.src.w, H = App.src.h, cx = (W - 1) / 2, cy = (H - 1) / 2;
    const t = d * Math.PI / 180, co = Math.cos(t), si = Math.sin(t);
    const T = (x, y) => { const dx = x - cx, dy = y - cy; return { x: co * dx - si * dy + cx, y: si * dx + co * dy + cy }; };
    const c = S.crop, ccx = c.x + c.w / 2, ccy = c.y + c.h / 2;
    const laneX0 = S.lanes.map(l => l.x);
    S.markers.forEach(m => { const lx = laneX0[m.lane]; if (lx == null) return; m.bands.forEach(b => { b.y = T(lx, b.y).y; }); });
    S.arrows.forEach(a => { a.y = T(ccx, a.y).y; });
    S.lanes.forEach(l => { l.x = T(l.x, ccy).x; });
    const nc = T(ccx, ccy);
    const w = Math.min(c.w, W), h = Math.min(c.h, H);
    S.crop = { x: Math.round(Math.max(0, Math.min(W - w, nc.x - w / 2))), y: Math.round(Math.max(0, Math.min(H - h, nc.y - h / 2))), w: Math.round(w), h: Math.round(h) };
    S.rotation = deg;
    App.sortLanesIfNeeded();
    App.ensureRot();
  };
  // after a rotation is committed: refresh things that depend on pixels
  App.afterRotation = function () {
    App.updateSaturation();
    App.refineMarkers();
  };
  /* Carried band positions are already close; re-matching from scratch could re-assign a band to a
   * different peak on a hard gel. Only snap each band to a detected peak nearby, keep assignments. */
  App.refineMarkers = function () {
    const S = App.S;
    if (!S.markers.some(m => m.bands.length)) { App.matchMarkers(false); return; }
    App._peakCrop = App.bandStrip();
    try {
      S.markers.forEach(m => {
        if (!S.lanes[m.lane] || !m.bands.length) return;
        const peaks = App.lanePeaks(m.lane).map(p => p.y + S.crop.y);
        const ys = m.bands.map(b => b.y).sort((a, b) => a - b);
        m.bands.forEach(b => {
          if (!(b.matched || b.manual)) return;
          // never further than a third of the way to the neighbouring band
          let gap = Infinity; ys.forEach(y => { if (y !== b.y) gap = Math.min(gap, Math.abs(y - b.y)); });
          const tol = Math.max(2, Math.min(8, gap / 3));
          let best = null; peaks.forEach(y => { if (Math.abs(y - b.y) <= tol && (best == null || Math.abs(y - b.y) < Math.abs(best - b.y))) best = y; });
          if (best != null) b.y = best;
        });
      });
    } finally { App._peakCrop = null; }
  };

  // ---------- resets ----------
  App.initialState = function () { return App.initial ? JSON.parse(App.initial) : null; };
  // contrast back to what the import produced (automatic linear levels, gamma 1); polarity untouched
  App.resetLevels = function () {
    const I = App.initialState(), lv = App.S.levels;
    if (I) { lv.black = I.levels.black; lv.white = I.levels.white; } else { lv.black = 0; lv.white = 1; }
    lv.gamma = 1;
  };
  App.resetLayout = function () { App.S.style = Object.assign(defaultStyle(), { dpi: App.S.style.dpi }); };
  App.resetRotation = function () { App.setRotation(App.autoRotation || 0); App.afterRotation(); };
  // everything back to the moment after import; the undo chain starts again from there
  App.resetAll = function () {
    if (!App.initial) return;
    App.S = JSON.parse(App.initial);
    App.rot = null; App.ensureRot();
    App.hist = [App.initial]; App.future = [];
    savePrefs();
    App.emit('change');
  };

  /* Clipping in the crop, as two different things:
   *  - sensor: the camera itself saturated (raw ≥ 0.998)
   *  - levels: pixels pushed past the black / white point by the contrast setting (display only,
   *    but a band core flattened this way is just as lost in the figure) */
  App.clipStats = function () {
    const S = App.S, lv = S.levels;
    const key = [S.rotation, S.crop.x, S.crop.y, S.crop.w, S.crop.h, lv.black, lv.white].join('|');
    if (App._clipKey === key) return App._clip;
    const c = App.cropImg(), d = c.data, n = d.length;
    let sensor = 0, high = 0, low = 0;
    for (let i = 0; i < n; i++) { const v = d[i]; if (v >= SAT) sensor++; if (v > lv.white) high++; else if (v < lv.black) low++; }
    App._clipKey = key;
    // "high" is what turns pure white on screen when not inverted, pure black when inverted
    return (App._clip = { n, sensor, high, low, highFrac: high / n, lowFrac: low / n, sensorFrac: sensor / n });
  };
  // the band side of the levels: bright bands are clipped at the white point, dark bands at black
  App.bandClipFrac = function () { const k = App.clipStats(); return App.S.bright ? k.highFrac : k.lowFrac; };

  // ---------- resolution ----------
  // pixels of the gel actually placed per inch of the printed figure (no upsampling)
  App.effectiveDpi = function () { return App.visibleWidthPx() / (App.gelWidthMm() / 25.4); };
  App.maxSafeWidthMm = function (dpi) { return Math.floor(App.visibleWidthPx() / (dpi || 300) * 25.4); };
  App.autoCrop = function () {
    App.S.crop = E.autoCrop(App.ensureRot(), App.S.bright);
    App.cropMeta = E.autoCrop.meta || null;
    App.updateSaturation();
  };
  App.autoLevels = function () {
    const lv = E.autoLevels(App.cropImg());
    App.S.levels.black = lv.black; App.S.levels.white = lv.white;
  };

  /* Lanes are global: one per well across the whole gel, numbered like the notebook. The crop only
   * chooses which of them appear in the figure, so cropping never adds/removes lanes. */
  App.autoLanes = function () {
    const S = App.S, rot = App.ensureRot();
    let lat = E.detectLaneLattice(rot, S.bright, S.crop, App.cropMeta);
    /* On a crowded gel neighbouring lanes merge in the band region and the measured pitch comes out
     * a whole multiple of the real one. The top of the gel still separates them, so it is used only
     * to catch that one case — never to override an otherwise plausible pitch. */
    App.laneNotice = null;
    let topPitch = 0;
    if (lat && lat.centers.length > 1) {
      topPitch = E.measurePitch(rot, S.bright, S.crop);
      const halved = E.dividedPitch(lat.pitch, topPitch);
      if (halved) {
        const lat2 = E.detectLaneLattice(rot, S.bright, S.crop, App.cropMeta, halved);
        if (lat2 && lat2.centers.length > lat.centers.length) {
          lat = lat2;
          App.laneNotice = L('相邻泳道挨得很近，已按胶顶部的间距重新排泳道；请核对泳道线是否对齐',
            'Neighbouring lanes run together; lanes were re-spaced using the top of the gel — please check that the lane lines line up');
        }
      }
    }
    let xs, half, pitch;
    if (lat && lat.centers.length) { xs = lat.centers; half = lat.halfW; pitch = lat.pitch; }
    else {
      const c = App.cropImg(), r = E.detectLanes(c, S.bright, topPitch);
      xs = (r.centers.length >= 2 ? r.centers : E.evenLanes(Math.max(S.lanes.length, 10), c.w)).map(x => x + S.crop.x);
      pitch = r.pitch || c.w / 10; half = pitch * 0.3;
    }
    App.replaceLanes(xs);
    S.laneHalfW = Math.max(2, half);
    S.lanePitch = pitch;
  };

  // swap in new lane positions, carrying names / markers / groups / conditions over by position
  App.replaceLanes = function (xs) {
    const S = App.S, old = S.lanes, tol = (S.lanePitch || 40) * 0.45;
    const near = x => { let bi = -1, bd = tol; old.forEach((l, i) => { const d = Math.abs(l.x - x); if (d < bd) { bd = d; bi = i; } }); return bi; };
    const fromOld = xs.map(near);                 // new index -> old index (or -1)
    const toNew = new Map(); fromOld.forEach((o, n) => { if (o >= 0 && !toNew.has(o)) toNew.set(o, n); });
    const nearestNew = o => { if (toNew.has(o)) return toNew.get(o); let bi = 0, bd = Infinity; xs.forEach((x, n) => { const d = Math.abs(x - (old[o] ? old[o].x : 0)); if (d < bd) { bd = d; bi = n; } }); return bi; };
    S.lanes = xs.map((x, n) => { const o = fromOld[n] >= 0 ? old[fromOld[n]] : null; return { x, name: o ? o.name : '', hidden: o ? !!o.hidden : false }; });
    S.markers = S.markers.filter(m => toNew.has(m.lane)).map(m => Object.assign(m, { lane: toNew.get(m.lane) }));
    S.groups.forEach(g => { g.from = nearestNew(g.from); g.to = nearestNew(g.to); });
    S.conditions.forEach(c => { const v = c.values.slice(); c.values = xs.map((x, n) => (fromOld[n] >= 0 ? v[fromOld[n]] || '' : '')); });
    App.fixIndices();
  };

  /* Re-do the lanes using ONLY the pixels inside the crop: lanes outside stay untouched, lanes
   * inside are replaced. Names typed for the in-crop lanes are kept in left-to-right order, so a
   * wrong first detection never has to be corrected lane by lane. */
  function replaceInCrop(insideXs, pitch) {
    const S = App.S, c = S.crop, inC = l => l.x >= c.x && l.x <= c.x + c.w;
    const oldNames = S.lanes.filter(inC).map(l => l.name);
    const oldHidden = S.lanes.filter(inC).map(l => !!l.hidden);
    const outside = S.lanes.filter(l => !inC(l)).map(l => l.x);
    App.replaceLanes(outside.concat(insideXs).sort((a, b) => a - b));
    S.lanes.filter(inC).forEach((l, k) => { l.name = oldNames[k] || ''; l.hidden = oldHidden[k] || false; });
    S.lanePitch = pitch;
    S.laneHalfW = Math.max(2, pitch * 0.3);
  }
  App.redetectLanesInCrop = function () {
    const S = App.S, c = App.cropImg();
    const r = E.detectLanes(c, S.bright);
    if (!r.centers.length) return 0;
    // the crop is the user's statement of where the lanes are: keep edge lanes it deliberately includes
    replaceInCrop(r.centers.map(x => x + S.crop.x), r.pitch);
    return r.centers.length;
  };
  // n lanes spread evenly across the crop width (default: keep the current in-crop count)
  App.evenLanesInCrop = function (n) {
    const S = App.S, c = S.crop;
    n = Math.max(1, Math.min(60, Math.round(n || S.lanes.filter(l => l.x >= c.x && l.x <= c.x + c.w).length || 1)));
    const p = c.w / n;
    replaceInCrop(Array.from({ length: n }, (_, k) => c.x + (k + 0.5) * p), p);
    return n;
  };

  // indices of lanes whose centre lies inside the crop
  App.laneRange = function () {
    const S = App.S, c = S.crop, idx = [];
    S.lanes.forEach((l, i) => { if (l.x >= c.x && l.x <= c.x + c.w) idx.push(i); });
    return idx.length ? [idx[0], idx[idx.length - 1]] : null;
  };
  // horizontal crop boundary half-way between lane a and its neighbour on side `dir` (-1 left, +1 right)
  App.laneEdge = function (a, dir) {
    const S = App.S, l = S.lanes, p = S.lanePitch || (S.laneHalfW / 0.3);
    const nb = l[a + dir];
    const x = nb ? (l[a].x + nb.x) / 2 : l[a].x + dir * p * 0.5;
    return Math.max(0, Math.min(App.ensureRot().w, x));
  };
  // show lanes a..b: crop x follows the lane boundaries, y untouched
  App.setLaneRange = function (a, b) {
    const S = App.S, n = S.lanes.length;
    if (!n) return;
    a = Math.max(0, Math.min(n - 1, a)); b = Math.max(0, Math.min(n - 1, b));
    if (a > b) [a, b] = [b, a];
    const x0 = Math.round(App.laneEdge(a, -1)), x1 = Math.round(App.laneEdge(b, 1));
    S.crop = { x: x0, y: S.crop.y, w: Math.max(10, x1 - x0), h: S.crop.h };
    App.updateSaturation();
  };
  // snap a crop x edge to the nearest lane boundary
  App.snapCropX = function (x) {
    const S = App.S, l = S.lanes;
    if (l.length < 2) return x;
    const edges = [App.laneEdge(0, -1)];
    for (let i = 0; i < l.length - 1; i++) edges.push((l[i].x + l[i + 1].x) / 2);
    edges.push(App.laneEdge(l.length - 1, 1));
    // gentle snap: if the lanes themselves are wrong, the user must still be able to frame freely
    let best = x, bd = (S.lanePitch || 40) * 0.2;
    edges.forEach(e => { const d = Math.abs(e - x); if (d < bd) { bd = d; best = e; } });
    return best;
  };

  // full-width image strip over the crop rows: band profiles for any lane, inside the crop or not
  App.bandStrip = function () {
    const S = App.S, rot = App.ensureRot();
    return E.cropImg(rot, { x: 0, y: S.crop.y, w: rot.w, h: S.crop.h });
  };
  // snap a row to the nearest detected band in the lane closest to x (null if nothing near)
  App.snapBandY = function (xAbs, yAbs, tolPx) {
    const S = App.S;
    if (!S.lanes.length) return null;
    let li = 0, bd = Infinity;
    S.lanes.forEach((l, i) => { const d = Math.abs(l.x - xAbs); if (d < bd) { bd = d; li = i; } });
    const strip = App.bandStrip();
    const pk = E.detectBands(E.laneProfile(strip, S.bright, S.lanes[li].x, S.laneHalfW));
    const vmax = Math.max(0, ...pk.map(p => p.v));
    let best = null, d0 = tolPx || Math.max(8, S.crop.h * 0.025);
    pk.filter(p => p.v >= vmax * 0.08).forEach(p => { const d = Math.abs(p.y + S.crop.y - yAbs); if (d < d0) { d0 = d; best = p.y + S.crop.y; } });
    return best;
  };

  App.evenLanes = function () {
    const S = App.S, xs = S.lanes.map(l => l.x).sort((a, b) => a - b);
    if (xs.length < 2) return;
    const pos = E.evenLanes(xs.length, 0, xs[0], xs[xs.length - 1]);
    S.lanes.sort((a, b) => a.x - b.x).forEach((l, i) => { l.x = pos[i]; });
  };

  App.addLane = function (x) {
    const S = App.S;
    S.lanes.push({ x, name: '', hidden: false });
    const order = S.lanes.map((l, i) => i).sort((a, b) => S.lanes[a].x - S.lanes[b].x);
    App.reorderLanes(order);
    return S.lanes.findIndex(l => l.x === x);
  };

  App.removeLane = function (i) {
    const S = App.S;
    if (i < 0 || i >= S.lanes.length) return;
    S.lanes.splice(i, 1);
    const shift = k => (k > i ? k - 1 : k);
    S.groups = S.groups.filter(g => !(g.from === i && g.to === i)).map(g => ({ ...g, from: Math.min(shift(g.from), S.lanes.length - 1), to: Math.min(shift(g.to), S.lanes.length - 1) }));
    S.conditions.forEach(c => c.values.splice(i, 1));
    S.markers = S.markers.filter(m => m.lane !== i);
    S.markers.forEach(m => { m.lane = shift(m.lane); });
    App.fixIndices();
  };

  // apply permutation (order[newIdx] = oldIdx) to lanes and every index that references lanes
  App.reorderLanes = function (order) {
    const S = App.S, inv = [];
    order.forEach((o, n) => { inv[o] = n; });
    S.lanes = order.map(o => S.lanes[o]);
    S.groups.forEach(g => { g.from = inv[g.from] ?? g.from; g.to = inv[g.to] ?? g.to; });
    S.conditions.forEach(c => { const v = c.values.slice(); c.values = order.map(o => v[o] || ''); });
    S.markers.forEach(m => { m.lane = inv[m.lane] ?? m.lane; });
  };

  App.fixIndices = function () {
    const S = App.S, n = S.lanes.length;
    S.groups.forEach(g => { g.from = Math.min(g.from, n - 1); g.to = Math.min(g.to, n - 1); });
    S.conditions.forEach(c => { c.values.length = n; for (let i = 0; i < n; i++) c.values[i] = c.values[i] || ''; });
    S.markers = S.markers.filter(m => m.lane != null && m.lane < n);
  };

  App.sortLanesIfNeeded = function () {
    const S = App.S;
    const order = S.lanes.map((l, i) => i).sort((a, b) => S.lanes[a].x - S.lanes[b].x);
    if (order.some((o, i) => o !== i)) App.reorderLanes(order);
  };

  // ---------- markers (one or more ladder lanes, matched jointly: same gel = same migration curve) ----------
  // fallback ladder when nothing is remembered or favourited: the most widely used of each kind
  App.defaultLadder = kind => (kind === 'protein' ? 'biorad_dual' : 'gr1kbplus');

  App.newMarker = function (lane, ladderId) {
    const kind = App.gelKind();
    const fav = (G.Ladders.favoritesOf(kind)[0] || {}).id;
    const prefOk = G.Ladders.get(App.prefLadder) && G.Ladders.kindOf(G.Ladders.get(App.prefLadder)) === kind ? App.prefLadder : null;
    const def = App.defaultLadder(kind);
    const id = ladderId && G.Ladders.get(ladderId) && G.Ladders.kindOf(G.Ladders.get(ladderId)) === kind ? ladderId : fav || prefOk || def;
    // the remembered unit belongs to whichever gel type was open last; never carry kDa into a DNA gel
    const prefUnit = App.prefUnit === 'kDa' || App.prefUnit === 'kb' || App.prefUnit === 'auto' ? App.prefUnit : 'bp';
    return { lane, ladderId: id, unit: kind === 'protein' ? 'kDa' : (prefUnit === 'kDa' ? 'bp' : prefUnit), side: 'auto', bands: [] };
  };

  App.lanePeaks = function (i) {
    const S = App.S, c = App._peakCrop || App.bandStrip();
    return E.detectBands(E.laneProfile(c, S.bright, S.lanes[i].x, S.laneHalfW), App.gelKind());
  };
  App.gelKind = function () { return App.S && App.S.gelType === 'protein' ? 'protein' : 'dna'; };
  App.sizeUnit = function () { return App.gelKind() === 'protein' ? 'kDa' : 'bp'; };

  /* Which kind of gel is this? Called once after the automatic pipeline has found lanes and before the
   * markers are matched, so every later step (band detection, tolerances, ladder library, units) runs in
   * the right mode. The vote itself lives in the engine; here we pick the most ladder-like lane and the
   * ladder that fits it best as evidence. A weak guess never overrides the user's favourites. */
  App.guessGelType = function () {
    const S = App.S;
    if (!S || !S.lanes.length) return null;
    const c = App.bandStrip(), h = c.h, rg = App.laneRange() || [0, S.lanes.length - 1];
    let best = null, richLanes = 0, laneCount = 0;
    for (let i = rg[0]; i <= rg[1]; i++) {
      const prof = E.laneProfile(c, S.bright, S.lanes[i].x, S.laneHalfW);
      const a = E.detectBands(prof, 'dna'), b = E.detectBands(prof, 'protein');
      const pk = E.sharpBandCount(a) >= E.sharpBandCount(b) ? a : b;
      const n = E.sharpBandCount(pk);
      laneCount++;
      if (n >= 8) richLanes++;
      if (!best || n > best.n) best = { i, prof, pk, n };
    }
    if (!best) return null;
    // a ladder that fits well is decisive evidence for the shape of the migration curve; only accept a
    // strong fit so a spurious alignment cannot sway the vote
    const rD = E.rankLadders(best.pk, G.Ladders.all('dna'), h, 'dna')[0];
    const rP = E.rankLadders(best.pk, G.Ladders.all('protein'), h, 'protein')[0];
    let ladder = null;
    if (rP && rP.matched >= 3 && rP.score >= 0.55 && (!rD || rP.score >= rD.score - 0.05)) ladder = G.Ladders.get(rP.id);
    else if (rD && rD.matched >= 3 && rD.score >= 0.6) ladder = G.Ladders.get(rD.id);
    const det = E.detectGelType({ colorStats: App._colorStats, peaks: best.pk, profile: best.prof, pitch: S.lanePitch, h, ladder, richLanes, laneCount });
    // an ambiguous image with favourites of only one kind follows the favourites (they say what this lab runs)
    if (det.confidence < 0.35) {
      const kinds = new Set(G.Ladders.favorites().map(id => G.Ladders.kindOf(G.Ladders.get(id))));
      if (kinds.size === 1) det.kind = kinds.has('protein') ? 'protein' : 'dna';
      det.prior = true;
    }
    det.lane = best.i; det.ladderId = ladder ? ladder.id : null;
    S.gelType = det.kind;
    App.gelDetection = det;
    return det;
  };

  // one detection reason in words (the engine reports codes so the UI can translate them)
  App.gelReasonText = function (r) {
    const v = r.v || {};
    switch (r.code) {
      case 'colour': return L(`彩色图像，蓝色像素占 ${v.blue}%`, `Colour image, ${v.blue}% blue-dominant pixels`);
      case 'grey': return L('灰度图像', 'Grey image');
      case 'broad': return L(`条带较宽（占泳道间距 ${v.pct}%）`, `Bands are broad (${v.pct}% of the lane pitch)`);
      case 'thin': return L(`条带很细（占泳道间距 ${v.pct}%）`, `Bands are thin (${v.pct}% of the lane pitch)`);
      case 'manyBands': return L(`一条泳道里 ${v.n} 条清晰条带`, `${v.n} crisp bands in one lane`);
      case 'fewBands': return L(`一条泳道里 ${v.n} 条条带`, `${v.n} bands in one lane`);
      case 'richLanes': return L(`${v.n} 条泳道都满是条带`, `${v.n} lanes are full of bands`);
      case 'fewRichLanes': return L('只有少数泳道条带多', 'Only a few lanes have many bands');
      case 'curve': return L(`迁移曲线弯曲（偏离直线 ${v.pct}%）`, `Migration curve bends (${v.pct}% off a straight line)`);
      case 'linear': return L('迁移接近 log 线性', 'Migration is close to log-linear');
      default: return '';
    }
  };

  /* Manual switch of the gel type (detection can be wrong). Keeps lane names, groups, conditions,
   * arrows and which lanes are markers; only the ladder library, units and matching change. */
  App.setGelType = function (kind) {
    const S = App.S;
    if (!S) return false;
    kind = kind === 'protein' ? 'protein' : 'dna';
    if (kind === App.gelKind()) return false;
    S.gelType = kind;
    App.gelDetection = { kind, confidence: 1, reasons: [], manual: true };
    const def = App.defaultLadder(kind);
    const fav = (G.Ladders.favoritesOf(kind)[0] || {}).id;
    S.markers.forEach(m => {
      const l = G.Ladders.get(m.ladderId);
      if (!l || G.Ladders.kindOf(l) !== kind) m.ladderId = fav || def;
      m.unit = G.Ladders.unitOfKind(kind);
      m.bands = [];
    });
    App.matchMarkers(true);
    S.markers.forEach(m => { if (m.bands.length) App.thinMarkerLabels(m, true); });
    App.commit();
    return true;
  };

  // find ladder lanes (many sharp bands) and pick ladders for them
  App.autoMarkers = function () {
    const S = App.S;
    App._peakCrop = App.bandStrip();
    try {
      const peaks = S.lanes.map((l, i) => App.lanePeaks(i));
      const counts = peaks.map(p => E.sharpBandCount(p));
      const rg = App.laneRange() || [0, S.lanes.length - 1];
      // only lanes that will be in the figure
      const kind = App.gelKind(), mode = kind;
      // prestained protein markers have fewer bands than DNA ladders, so the ladder-lane bar is lower
      const minBands = kind === 'protein' ? 4 : 6;
      const all = G.Ladders.all(kind), favs = G.Ladders.favoritesOf(kind).map(l => l.id);
      const h = App._peakCrop.h;
      /* Which lanes are marker lanes? Not simply "the ones with the most bands": on a protein gel a
       * whole-cell lysate lane has more bands than any ladder and some ladder fits a subset of them.
       * Rank by how completely a ladder explains the lane, and keep only lanes close to the best. */
      const cand = [];
      for (let i = rg[0]; i <= rg[1]; i++) {
        if (counts[i] < minBands) continue;
        const q = E.markerQuality(peaks[i], all, h, mode);
        if (q) cand.push({ i, quality: q.quality, fit: q.score, explained: q.explained });
      }
      cand.sort((a, b) => b.quality - a.quality);
      const top = cand.length ? cand[0].quality : 0;
      const picked = [];
      cand.filter(c => c.quality >= Math.max(0.42, top - 0.15)).forEach(c => {
        // nobody loads two ladders side by side: neighbouring hits are one lane found twice
        if (picked.length < 3 && !picked.some(p => Math.abs(p.i - c.i) <= 1)) picked.push(c);
      });
      let lanes = picked.map(c => c.i).sort((a, b) => a - b);
      App.markerCandidates = cand;
      // "my ladders" get a bonus; without favourites the last used ladder plays that role
      const prefOk = App.prefLadder && G.Ladders.get(App.prefLadder) && G.Ladders.kindOf(G.Ladders.get(App.prefLadder)) === kind;
      const prefer = favs.length ? favs : [prefOk ? App.prefLadder : App.defaultLadder(kind)];
      const pk = lanes.map(i => peaks[i]);
      let picks = null;
      App.ladderNotice = null;
      if (lanes.length) {
        if (favs.length && prefs().onlyFavLadders) {
          picks = E.jointLadders(pk, favs.map(G.Ladders.get), h, favs, mode);
          // never lock in a clearly wrong favourite: a partial fit (e.g. a 100 bp ladder matching the
          // lower half of a 1 kb ladder) still scores fairly, so compare with the whole library
          const full = E.jointLadders(pk, all, h, favs, mode);
          if (full && (!picks || picks.score < 0.55 || full.score > picks.score + 0.08)) {
            picks = full; App.ladderNotice = L(`常用型号都不吻合，已改用：${full.map(p => G.Ladders.get(p.id).name).join('、')}`, `None of your favourite ladders fits; using ${full.map(p => G.Ladders.get(p.id).name).join(', ')}`);
          }
        } else picks = E.jointLadders(pk, all, h, prefer, mode);
      }
      if (picks && lanes.length === 1) {
        // a single lane cannot tell ladders apart well: stay with a preferred ladder unless it clearly misfits
        let bestPref = null;
        prefer.forEach(id => { const l = G.Ladders.get(id); if (!l) return; const s = E.matchLadder(peaks[lanes[0]], l.sizes, h, null, mode).score; if (!bestPref || s > bestPref.score) bestPref = { id, score: s }; });
        if (bestPref && bestPref.score >= picks[0].score - 0.12) picks = [bestPref];
      }
      if (picks && favs.length && picks.some(p => !favs.includes(p.id)) && !App.ladderNotice)
        App.ladderNotice = L(`识别到的型号不在"常用"里：${picks.filter(p => !favs.includes(p.id)).map(p => G.Ladders.get(p.id).name).join('、')}，请核对`, `Detected ladder is not among your favourites: ${picks.filter(p => !favs.includes(p.id)).map(p => G.Ladders.get(p.id).name).join(', ')} — please check`);
      S.markers = lanes.map((ln, k) => App.newMarker(ln, picks ? picks[k].id : prefer[0]));
      S.markers.forEach(m => { if (!S.lanes[m.lane].name) S.lanes[m.lane].name = 'M'; });
      App.matchMarkers(true);
    } finally { App._peakCrop = null; }
  };

  // match all markers jointly; manually placed bands are kept as anchors
  App.matchMarkers = function (fresh) {
    const S = App.S, c = App._peakCrop || App.bandStrip();
    const ms = S.markers.filter(m => G.Ladders.get(m.ladderId) && S.lanes[m.lane]);
    S.markers.forEach(m => { if (!ms.includes(m)) m.bands = []; });
    if (!ms.length) return;
    App._peakCrop = c;
    try {
      const input = ms.map(m => {
        const lad = G.Ladders.get(m.ladderId);
        const anchors = fresh ? [] : m.bands.filter(b => b.manual && lad.sizes.includes(b.bp)).map(b => ({ k: lad.sizes.indexOf(b.bp), y: b.y - S.crop.y }));
        return { peaks: App.lanePeaks(m.lane), sizes: lad.sizes, anchors };
      });
      const res = E.matchMulti(input, c.h, App.gelKind());
      ms.forEach((m, i) => {
        const lad = G.Ladders.get(m.ladderId), r = res[i];
        const prev = new Map(m.bands.map(b => [b.bp, b]));
        m.bands = lad.sizes.map((bp, k) => {
          const p = prev.get(bp);
          return {
            bp, y: r[k].y + S.crop.y, matched: r[k].matched, manual: !!r[k].anchored,
            show: p && !fresh ? p.show : true, ref: lad.ref.includes(bp)
          };
        });
        m.score = r.score;
        // bands predicted outside the crop are not shown by default
        m.bands.forEach(b => { if (b.y < S.crop.y - 2 || b.y > S.crop.y + S.crop.h + 2) b.show = false; });
        if (fresh || !prev.size) App.thinMarkerLabels(m, true);
      });
    } finally { App._peakCrop = null; }
  };

  // hide labels that would collide in the final figure; keep reference bands first
  App.thinMarkerLabels = function (m, keepHidden) {
    const S = App.S, st = S.style;
    const scale = (App.gelWidthMm() * G.Render.MM) / Math.max(1, App.visibleWidthPx());
    const minGap = st.fontPt * 1.05 / scale; // in image px
    const B = m.bands.filter(b => b.y >= S.crop.y && b.y <= S.crop.y + S.crop.h && (!keepHidden || b.show));
    const order = B.slice().sort((a, b) => (b.ref - a.ref) || ((b.matched || b.manual) - (a.matched || a.manual)) || (b.bp % 1000 === 0) - (a.bp % 1000 === 0));
    const kept = [];
    order.forEach(b => { if (kept.every(k => Math.abs(k.y - b.y) >= minGap)) kept.push(b); });
    m.bands.forEach(b => { b.show = kept.includes(b); });
  };

  // gel image width: fixed by the user, or ~5 mm per visible lane
  App.gelWidthMm = function () {
    const S = App.S, st = S.style;
    if (!st.autoWidth) return st.gelWidthMm;
    const n = S.lanes.filter(l => !l.hidden && l.x >= S.crop.x && l.x <= S.crop.x + S.crop.w).length || 8;
    return Math.max(22, Math.min(160, Math.round(n * st.mmPerLane)));
  };

  App.visibleWidthPx = function () {
    const S = App.S;
    if (!S.lanes.some(l => l.hidden)) return S.crop.w;
    const R = App.renderState();
    const b = G.Render.laneBounds(R.lanes, S.crop.w);
    let hidden = 0;
    R.lanes.forEach((l, i) => { if (l.hidden) hidden += b[i][1] - b[i][0]; });
    return Math.max(1, S.crop.w - hidden);
  };

  App.autoAll = function (fresh) {
    const S = App.S;
    const T = (s) => { if (App.debug) document.title = 'STAGE ' + s; };
    T('deskew');
    if (fresh) App.autoDeskew();
    T('crop');
    App.autoCrop();
    T('levels');
    App.autoLevels();
    T('lanes');
    App.autoLanes();
    // frame the crop on the lanes that carry bands, edges half-way between lanes
    const loaded = App.loadedLaneRange();
    if (loaded) App.setLaneRange(loaded[0], loaded[1]);
    T('marker');
    App.guessGelType();
    App.autoMarkers();
    T('fix');
    App.fixIndices();
    App.updateSaturation();
    App.commit();
  };

  // first..last lane with visible bands (over the crop rows)
  App.loadedLaneRange = function () {
    const S = App.S;
    if (!S.lanes.length) return null;
    App._peakCrop = App.bandStrip();
    try {
      const strength = S.lanes.map((l, i) => { const p = App.lanePeaks(i); return p.length ? Math.max(...p.map(q => q.v)) : 0; });
      const mx = Math.max(...strength);
      if (mx <= 0) return null;
      const idx = strength.map((v, i) => (v > mx * 0.15 ? i : -1)).filter(i => i >= 0);
      // a lane whose only "band" is a weak smear still counts if its neighbours are loaded; gaps of
      // empty lanes inside the run are kept (they are part of the experiment)
      return idx.length ? [idx[0], idx[idx.length - 1]] : null;
    } finally { App._peakCrop = null; }
  };

  // short label for a size in the gel's own unit: 1.5 kb / 480 bp / 55 kDa
  App.fmtSize = function (v) {
    if (!v) return '';
    if (App.gelKind() === 'protein') return (v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100) + ' kDa';
    if (v >= 995) { const kb = Math.round(v / 100) / 10; return (kb % 1 ? kb.toFixed(1) : kb.toFixed(0)) + ' kb'; }
    return (v >= 200 ? Math.round(v / 10) * 10 : Math.round(v)) + ' bp';
  };
  App.arrowLabel = function (a) {
    let sz = '';
    if (a.size) {
      if (a.sizeText) sz = a.sizeText;
      else {
        const info = App.estimateInfo(a.y);
        // outside the marker range the number is an extrapolation: say so on the figure
        if (info) sz = (info.extrap || info.disagree ? '≈' : '') + App.fmtSize(info.bp);
      }
    }
    if (a.text && sz) return `${a.text} (${sz})`;
    return a.text || sz;
  };

  /* Size at a row from every marker that can see it. Markers inside their band range are preferred
   * over extrapolating ones; the result is the geometric mean of those used. */
  App.estimateInfo = function (yAbs) {
    const S = App.S;
    const per = S.markers.map(m => {
      const r = E.estimateSizeInfo(yAbs, m.bands.filter(b => b.matched || b.manual).map(b => ({ bp: b.bp, y: b.y })));
      return r && { lane: m.lane, ladderId: m.ladderId, bp: r.bp, extrap: r.extrap, range: r.range };
    }).filter(Boolean);
    if (!per.length) return null;
    const inside = per.filter(p => !p.extrap), used = inside.length ? inside : per;
    const bp = Math.exp(used.reduce((s, p) => s + Math.log(p.bp), 0) / used.length);
    const lo = Math.min(...used.map(p => p.bp)), hi = Math.max(...used.map(p => p.bp));
    return { bp, extrap: !inside.length, disagree: used.length > 1 && hi / lo > 1.1, perMarker: per, used: used.map(p => p.lane) };
  };
  App.estimateBp = function (yAbs) { const r = App.estimateInfo(yAbs); return r ? r.bp : null; };

  /* Lanes in the figure range with no real band signal (excluding markers and lanes already cut).
   * Only a suggestion: empty wells are usually part of the experiment (NTC, blank). */
  App.emptyLanes = function () {
    const S = App.S, r = App.laneRange();
    if (!r) return [];
    const key = [S.file.sha256, S.rotation, S.crop.y, S.crop.h, S.lanes.map(l => Math.round(l.x)).join()].join('|');
    if (App._emptyKey !== key) {
      App._peakCrop = App.bandStrip();
      try { App._laneStrength = S.lanes.map((l, i) => { const p = App.lanePeaks(i); return p.length ? Math.max(...p.map(q => q.v)) : 0; }); }
      finally { App._peakCrop = null; }
      App._emptyKey = key;
    }
    const st = App._laneStrength, mk = new Set(S.markers.map(m => m.lane));
    const mx = Math.max(0, ...st.slice(r[0], r[1] + 1));
    const out = [];
    for (let i = r[0]; i <= r[1]; i++) if (!mk.has(i) && !S.lanes[i].hidden && st[i] < mx * 0.15) out.push(i);
    return out;
  };
  // cut / restore one lane; refuses silently losing a marker (caller confirms)
  App.setLaneHidden = function (i, hidden, reason) {
    const l = App.S.lanes[i]; if (!l) return;
    l.hidden = !!hidden;
    if (hidden) l.hiddenReason = reason || 'manual'; else delete l.hiddenReason;
  };

  // ---------- derived state for rendering (crop-relative, lanes outside crop dropped) ----------
  App.renderState = function (preview) {
    const S = App.S, cx = S.crop.x, cy = S.crop.y;
    const keep = [];
    S.lanes.forEach((l, i) => { if (l.x >= cx && l.x <= cx + S.crop.w) keep.push(i); });
    const remap = new Map(keep.map((o, n) => [o, n]));
    const groups = S.groups.map((g, k) => {
      const a = Math.min(g.from, g.to), b = Math.max(g.from, g.to);
      const ins = keep.filter(i => i >= a && i <= b);
      return ins.length ? { from: remap.get(ins[0]), to: remap.get(ins[ins.length - 1]), text: g.text, k } : null;
    }).filter(Boolean);
    return {
      preview: !!preview,
      crop: S.crop, levels: S.levels, style: Object.assign({}, S.style, { gelWidthMm: App.gelWidthMm() }), file: S.file,
      lanes: keep.map(i => ({ x: S.lanes[i].x - cx, name: S.lanes[i].name, hidden: S.lanes[i].hidden, src: i })),
      conditions: S.conditions.map(c => ({ name: c.name, values: keep.map(i => c.values[i] || '') })),
      groups,
      markers: S.markers.filter(m => remap.has(m.lane) && !S.lanes[m.lane].hidden).map(m => Object.assign({}, m, {
        lane: remap.get(m.lane),
        bands: m.bands.map(b => Object.assign({}, b, { y: b.y - cy }))
      })),
      arrows: S.arrows.map((a, k) => Object.assign({}, a, { y: a.y - cy, k, label: App.arrowLabel(a) })).filter(a => a.y >= 0 && a.y <= S.crop.h)
    };
  };

  // ---------- figure ----------
  App.buildFigure = function (preview) {
    App.renderFull();
    const S = App.S, R = App.renderState(preview);
    const cc = document.createElement('canvas');
    const r = S.crop;
    cc.width = Math.max(1, Math.round(r.w)); cc.height = Math.max(1, Math.round(r.h));
    cc.getContext('2d').drawImage(App.fullCanvas, Math.round(r.x), Math.round(r.y), cc.width, cc.height, 0, 0, cc.width, cc.height);
    const approxScale = App.gelWidthMm() * G.Render.MM / App.visibleWidthPx();
    const gel = G.Render.composeGel(R, cc, approxScale);
    const key = [App._display, r.x, r.y, r.w, r.h, gel.canvas.width, R.lanes.map(l => l.hidden ? 'h' + l.x : '').join()].join('|');
    if (App._gelKey !== key) { App._gelKey = key; App._gelHref = gel.canvas.toDataURL('image/png'); }
    App._lastGel = gel;
    const out = G.Render.build(R, gel, App._gelHref);
    if (S.saturatedInCrop > 0) out.warnings.push(App.saturationText());
    const bc = App.bandClipFrac();
    const pctBc = (bc * 100).toFixed(2), toWhite = S.bright !== !!S.levels.invert;
    if (bc > 0.001) out.warnings.push(L(
      `对比度设置把裁切区 ${pctBc}% 的像素压到了纯${toWhite ? '白' : '黑'}（色阶削顶），条带核心可能被压平；把${S.bright ? '亮部' : '暗部'}滑块往回拉，或点"重置对比度"`,
      `The contrast setting clips ${pctBc}% of the pixels in the crop to pure ${toWhite ? 'white' : 'black'}, which can flatten band cores; pull the ${S.bright ? 'white' : 'black'} point back or click "Reset contrast"`));
    const eff = App.effectiveDpi();
    if (eff < 300) out.warnings.push(L(
      `胶图有效分辨率只有 ${Math.round(eff)} dpi（低于 300），导出时会被放大；不放大的最大凝胶宽度为 ${App.maxSafeWidthMm(300)} mm`,
      `The gel is only ${Math.round(eff)} dpi at this size (below 300) and will be upscaled; the largest gel width without upscaling is ${App.maxSafeWidthMm(300)} mm`));
    if (S.markers.some(m => S.lanes[m.lane] && S.lanes[m.lane].hidden)) out.warnings.push(L('有 Marker 泳道已被剪除，其标注不会显示', 'A marker lane has been removed; its size labels are not shown'));
    S.arrows.forEach(a => {
      if (!a.size || a.sizeText) return;
      const info = App.estimateInfo(a.y);
      if (info && info.extrap) out.warnings.push(L(`箭头${a.text ? '“' + a.text + '”' : ''}在 Marker 范围之外，大小是外推估算值（已标 ≈）`,
        `Arrow${a.text ? ' “' + a.text + '”' : ''} lies outside the marker range; its size is extrapolated (marked ≈)`));
    });
    return out;
  };

  /* Pre-flight before export: problems a reviewer or a journal check would catch.
   * level 'block' items are asked about before exporting; 'warn' items are listed. */
  App.preflight = function () {
    const S = App.S, st = S.style, out = [];
    const add = (level, text, fix) => out.push({ level, text, fix });
    const eff = App.effectiveDpi();
    const safe = App.maxSafeWidthMm(300);
    if (eff < 300) add('block', L(`胶图有效分辨率 ${Math.round(eff)} dpi（< 300）。选的 ${st.dpi} dpi 只会放大像素。`, `The gel is ${Math.round(eff)} dpi at this size (< 300). Exporting at ${st.dpi} dpi only enlarges the pixels.`),
      { label: L(`把凝胶宽度改为 ${safe} mm`, `Set gel width to ${safe} mm`), run: () => { st.autoWidth = false; st.gelWidthMm = safe; } });
    const k = App.clipStats(), bc = App.bandClipFrac();
    const sp = (k.sensorFrac * 100).toFixed(2), bp = (bc * 100).toFixed(2);
    if (k.sensorFrac > 0.0005) add('warn', L(`相机过曝：裁切区 ${sp}% 像素饱和。建议换一张较短曝光。`, `Camera saturation: ${sp}% of the pixels in the crop are saturated. Consider a shorter exposure.`));
    if (bc > 0.001) add('block', L(`色阶削顶：${bp}% 像素被对比度压平。`, `Contrast clipping: ${bp}% of the pixels are flattened by the contrast setting.`), { label: L('重置对比度', 'Reset contrast'), run: () => App.resetLevels() });
    if (st.fontPt < 5) add('warn', L(`字号 ${st.fontPt} pt 偏小（多数期刊要求 ≥ 5–6 pt）。`, `Font size ${st.fontPt} pt is small (most journals ask for ≥ 5–6 pt).`), { label: L('改为 6 pt', 'Use 6 pt'), run: () => { st.fontPt = 6; } });
    if (st.lineWidthPt < 0.25) add('warn', L(`线宽 ${st.lineWidthPt} pt 太细。`, `Line width ${st.lineWidthPt} pt is too thin.`), { label: L('改为 0.5 pt', 'Use 0.5 pt'), run: () => { st.lineWidthPt = 0.5; } });
    const fig = App.buildFigure(false), wmm = fig.w / G.Render.MM;
    if (wmm > 183) add('warn', L(`成图宽 ${wmm.toFixed(0)} mm，超过双栏宽度（约 180 mm）。`, `The figure is ${wmm.toFixed(0)} mm wide, wider than a double column (about 180 mm).`));
    (fig.overlaps || []).forEach(w => add('warn', w));
    if (S.levels.gamma !== 1) add('warn', L(`Gamma = ${S.levels.gamma}：非线性调整，图注中必须说明。`, `Gamma = ${S.levels.gamma}: a non-linear adjustment that must be stated in the legend.`));
    if (S.lanes.some(l => l.hidden)) add('info', L('有剪除的泳道：成图已加拼接间隙，图注中需说明（见"图注可参考"）。', 'Lanes were removed: splice gaps are added; state this in the legend (see "Legend notes").'));
    if (S.arrows.some(a => a.size && !a.sizeText && (App.estimateInfo(a.y) || {}).extrap)) add('info', L('有箭头大小为外推估算值（已标 ≈）。', 'Some arrow sizes are extrapolated (marked ≈).'));
    if (!S.markers.length) add('warn', L('成图中没有 Marker。', 'The figure has no marker lane.'));
    // prestained protein sizes are apparent molecular weights, not the true mass
    if (App.gelKind() === 'protein') add('info', L('蛋白胶：预染 Marker 标注的是表观分子量（Tris-glycine 体系），不同胶浓度/缓冲体系下会偏移；图注中建议写 "apparent molecular weight"。',
      'Protein gel: prestained marker sizes are apparent molecular weights (Tris-glycine system) that shift with gel percentage and buffer; state "apparent molecular weight" in the legend.'));
    return out;
  };

  App.saturationText = function () {
    const S = App.S, n = S.saturatedInCrop;
    const where = L(`裁切区内有 ${n} 个饱和像素（过曝），条带亮度失真，审稿时可能被质疑。`, `${n} saturated pixels in the crop: band intensities are distorted and reviewers may question them. `);
    return S.file.bits <= 8
      ? where + L('这是 8 位图像：建议从成像仪以 16 位原始 TIFF 导出（动态范围更大），或缩短曝光重拍', 'This is an 8-bit image: export the 16-bit raw TIFF from the imager (more dynamic range) or re-image with a shorter exposure')
      : where + L('建议缩短曝光重拍', 'Consider re-imaging with a shorter exposure');
  };

  // ---------- change notifications / undo ----------
  App.on = function (fn) { App.listeners.push(fn); };
  App.emit = function (what) { App.listeners.forEach(fn => fn(what)); };

  let raf = 0;
  App.refresh = function () {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; App.emit('refresh'); });
  };

  App.snapshot = function () { return JSON.stringify(App.S); };
  App.commit = function () {
    if (!App.S) return;
    const snap = App.snapshot();
    if (App.hist[App.hist.length - 1] !== snap) {
      App.hist.push(snap);
      if (App.hist.length > 100) App.hist.shift();
      App.future = [];
    }
    savePrefs();
    App.saveDraftSoon();
    App.emit('change');
  };
  App.undo = function () {
    if (App.hist.length < 2) return;
    App.future.push(App.hist.pop());
    App.S = JSON.parse(App.hist[App.hist.length - 1]);
    App.saveDraftSoon();
    App.emit('change');
  };
  App.redo = function () {
    if (!App.future.length) return;
    const s = App.future.pop();
    App.hist.push(s);
    App.S = JSON.parse(s);
    App.saveDraftSoon();
    App.emit('change');
  };

  // ---------- templates ----------
  // templates are relative to the first lane of the figure, so they fit the next gel wherever it was loaded
  App.template = function () {
    const S = App.S, r = App.laneRange() || [0, S.lanes.length - 1], rel = i => i - r[0];
    const lanes = [];
    for (let i = r[0]; i <= r[1]; i++) {
      const m = S.markers.find(x => x.lane === i);
      lanes.push({ name: S.lanes[i].name, hidden: !!S.lanes[i].hidden, marker: m ? { ladderId: m.ladderId, unit: m.unit, side: m.side } : null });
    }
    return { gelfigTemplate: 3, app: 'GelFigure ' + App.VERSION, gelType: App.gelKind(), lanes,
      // custom ladders travel with the template, so another computer gets the same Markers
      ladders: G.Ladders.defsFor(S.markers.map(m => m.ladderId)),
      groups: S.groups.map(g => ({ from: rel(g.from), to: rel(g.to), text: g.text })),
      conditions: S.conditions.map(c => ({ name: c.name, values: lanes.map((l, k) => c.values[r[0] + k] || '') })),
      arrows: S.arrows.map(a => ({ text: a.text, side: a.side, size: !!a.size, sizeText: a.sizeText || '', bp: App.estimateBp(a.y) })),
      // recorded for reference only: each gel is straightened on its own
      rotation: S.rotation,
      style: S.style };
  };
  // facts the UI needs before applying (lane-count mismatch, ladders that cannot be resolved)
  App.checkTemplate = function (t) {
    if (!t || !t.gelfigTemplate) throw new Error(L('不是 GelFigure 样式文件', 'Not a GelFigure style file'));
    const tl = t.lanes || t.laneNames || [];
    const fig = App.figureLanes().length + App.S.lanes.filter((l, i) => { const r = App.laneRange(); return r && i >= r[0] && i <= r[1] && l.hidden; }).length;
    const defs = new Map((t.ladders || []).map(d => [d.id, d]));
    const missing = (t.lanes || []).filter(l => l.marker && !G.Ladders.get(l.marker.ladderId) && !defs.has(l.marker.ladderId)).map(l => l.marker.ladderId);
    return { templateLanes: tl.length, figureLanes: fig, missingLadders: [...new Set(missing)] };
  };
  App.applyTemplate = function (t) {
    const S = App.S;
    if (!t || !t.gelfigTemplate) throw new Error(L('不是 GelFigure 样式文件', 'Not a GelFigure style file'));
    const imported = (t.ladders || []).filter(d => G.Ladders.importDef(d)).map(d => d.name);
    const chk = App.checkTemplate(t);
    if (chk.missingLadders.length) throw new Error(L(`样式里的 Ladder 在本机不存在，且文件中没有它的定义：${chk.missingLadders.join(', ')}。请先在"自定义 Ladder"里添加同名型号。`, `The style uses ladders that are not on this computer and carries no definition for them: ${chk.missingLadders.join(', ')}. Add them under "Custom ladder" first.`));
    // v1 files stored absolute lanes: treat them as starting at the figure's first lane
    const tl = t.lanes || (t.laneNames || []).map((name, i) => ({ name, hidden: !!(t.hidden || [])[i], marker: null }));
    // a style saved on a protein gel carries kDa markers: switch the gel type before the markers are built
    if (t.gelType === 'protein' || t.gelType === 'dna') {
      const want = t.gelType;
      if (want !== App.gelKind()) {
        App.S.gelType = want;
        App.gelDetection = { kind: want, confidence: 1, reasons: [], manual: true };
      }
    }
    let r = App.laneRange() || [0, S.lanes.length - 1];
    if (tl.length && r[0] + tl.length - 1 !== r[1]) { App.setLaneRange(r[0], Math.min(S.lanes.length - 1, r[0] + tl.length - 1)); r = App.laneRange(); }
    const abs = k => Math.min(S.lanes.length - 1, r[0] + k);
    tl.forEach((l, k) => { const i = abs(k); S.lanes[i].name = l.name || ''; S.lanes[i].hidden = !!l.hidden; });
    const mk = tl.map((l, k) => (l.marker ? Object.assign(App.newMarker(abs(k), l.marker.ladderId), { unit: l.marker.unit || App.sizeUnit(), side: l.marker.side || 'auto' }) : null)).filter(Boolean);
    if (mk.length) S.markers = mk;
    S.groups = (t.groups || []).map(g => ({ from: abs(g.from), to: abs(g.to), text: g.text || '' }));
    S.conditions = (t.conditions || []).map(c => ({ name: c.name, values: S.lanes.map((l, i) => (i >= r[0] && i - r[0] < (c.values || []).length ? c.values[i - r[0]] : '')) }));
    S.style = Object.assign(defaultStyle(), t.style || {});
    App.fixIndices();
    App.matchMarkers(true);
    S.arrows = (t.arrows || []).map(a => {
      let y = S.crop.y + S.crop.h / 2;
      const b = (S.markers[0] || { bands: [] }).bands.filter(k => k.matched);
      if (a.bp && b.length >= 2) { const pred = predictY(a.bp, b); if (pred != null) y = pred; }
      return { text: a.text, side: a.side, size: a.size !== false, sizeText: a.sizeText || '', y };
    });
    App.commit();
    return { importedLadders: imported };
  };

  // ---------- project files (.gelfig: gzip JSON with the source bytes inside) ----------
  function b64(buf) {
    const u = new Uint8Array(buf); let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  async function gz(text, inflate) {
    if (typeof CompressionStream === 'undefined') return null;
    const stream = new Blob([text]).stream().pipeThrough(inflate ? new DecompressionStream('gzip') : new CompressionStream('gzip'));
    return new Response(stream)[inflate ? 'text' : 'blob']();
  }
  App.projectData = function () {
    const S = App.S;
    return {
      gelfigProject: 1, app: 'GelFigure ' + App.VERSION, savedAt: new Date().toISOString(),
      source: { name: S.file.name, sha256: S.file.sha256, bytes: b64(App.srcBuffer) },
      ladders: G.Ladders.defsFor(S.markers.map(m => m.ladderId)),
      initial: App.initial, autoRotation: App.autoRotation,
      state: S
    };
  };
  App.projectBlob = async function () {
    const json = JSON.stringify(App.projectData());
    return (await gz(json)) || new Blob([json], { type: 'application/json' });
  };
  App.openProject = async function (buffer) {
    const u = new Uint8Array(buffer, 0, 2);
    const text = u[0] === 0x1f && u[1] === 0x8b ? await gz(new Blob([buffer]), true) : new TextDecoder().decode(buffer);
    const P = JSON.parse(text);
    if (!P.gelfigProject) throw new Error(L('不是 GelFigure 项目文件', 'Not a GelFigure project file'));
    (P.ladders || []).forEach(d => G.Ladders.importDef(d));
    const raw = unb64(P.source.bytes);
    const input = { name: P.source.name, buffer: raw, img: await G.TIFF.decodeBuffer(raw, P.source.name), sha256: await App.sha256(raw) };
    if (P.source.sha256 && input.sha256 !== P.source.sha256) throw new Error(L('项目里的原始图像校验失败（SHA-256 不一致），文件可能已损坏', 'The original image inside the project fails its SHA-256 check; the file may be damaged'));
    restore(input, P.state, P.initial, P.autoRotation);
  };
  function restore(input, state, initial, autoRotation) {
    App.src = { w: input.img.width, h: input.img.height, data: input.img.data };
    App.srcBuffer = input.buffer;
    App.rot = null; App.satCanvas = null; App._display = null; App._clipKey = null; App._emptyKey = null;
    App.exposures = null;
    App.S = state;
    App.S.style = Object.assign(defaultStyle(), App.S.style || {});
    // projects made before protein mode existed carry no gelType: take it from the marker ladder
    if (App.S.gelType !== 'dna' && App.S.gelType !== 'protein') {
      const l = (App.S.markers[0] || {}).ladderId && G.Ladders.get(App.S.markers[0].ladderId);
      App.S.gelType = l && G.Ladders.kindOf(l) === 'protein' ? 'protein' : 'dna';
    }
    App.gelDetection = { kind: App.S.gelType, confidence: 1, reasons: [], manual: true };
    App._colorStats = input.img.colorStats || null;
    if (App.S.markers.some(m => m.unit === 'bp' || m.unit === 'kb' || m.unit === 'auto') && G.Ladders.kindOf(G.Ladders.get(App.S.markers[0].ladderId)) === 'protein')
      App.S.markers.forEach(m => { m.unit = 'kDa'; });
    App.loadWarnings = input.img.warnings || [];
    App.initial = initial || App.snapshot();
    App.autoRotation = autoRotation != null ? autoRotation : state.rotation;
    App.hist = [App.snapshot()]; App.future = [];
    App.ensureRot();
    App.emit('loaded');
    App.emit('change');
  }

  // ---------- autosave draft (IndexedDB): survives refresh / crash ----------
  const DB = 'gelfigure', STORE = 'drafts';
  // some browsers never answer indexedDB.open for file:// pages; give up instead of hanging
  let dbP = null;
  function idb() {
    if (!dbP) dbP = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no indexedDB'));
      const t = setTimeout(() => rej(new Error('indexedDB timeout')), 3000);
      let rq;
      try { rq = indexedDB.open(DB, 1); } catch (e) { clearTimeout(t); return rej(e); }
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
      rq.onsuccess = () => { clearTimeout(t); res(rq.result); };
      rq.onerror = () => { clearTimeout(t); rej(rq.error); };
      rq.onblocked = () => { clearTimeout(t); rej(new Error('indexedDB blocked')); };
    });
    dbP.catch(() => { dbP = null; });
    return dbP;
  }
  async function idbDo(mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => { const tx = db.transaction(STORE, mode), st = tx.objectStore(STORE), r = fn(st); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); });
  }
  let draftTimer = 0, draftSha = null;
  App.saveDraftSoon = function () {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(App.saveDraft, 800);
  };
  App.saveDraft = async function () {
    if (!App.S || !App.srcBuffer) return;
    try {
      await idbDo('readwrite', st => {
        // the source bytes are written once per image, the state on every change
        if (draftSha !== App.S.file.sha256) { st.put(App.srcBuffer, 'src'); draftSha = App.S.file.sha256; }
        st.put({ state: App.snapshot(), initial: App.initial, autoRotation: App.autoRotation, name: App.S.file.name, sha256: App.S.file.sha256, savedAt: Date.now(), ladders: G.Ladders.defsFor(App.S.markers.map(m => m.ladderId)) }, 'meta');
      });
    } catch (e) { /* private mode etc.: drafts are best-effort */ }
  };
  App.peekDraft = async function () { try { return await idbDo('readonly', st => st.get('meta')); } catch (e) { return null; } };
  App.dropDraft = async function () { draftSha = null; try { await idbDo('readwrite', st => { st.delete('meta'); st.delete('src'); }); } catch (e) { /* ignore */ } };
  App.restoreDraft = async function () {
    const meta = await App.peekDraft(), buf = await idbDo('readonly', st => st.get('src'));
    if (!meta || !buf) throw new Error(L('没有可恢复的草稿', 'No draft to restore'));
    (meta.ladders || []).forEach(d => G.Ladders.importDef(d));
    const input = { name: meta.name, buffer: buf, img: await G.TIFF.decodeBuffer(buf, meta.name), sha256: meta.sha256 };
    draftSha = meta.sha256;
    restore(input, JSON.parse(meta.state), meta.initial, meta.autoRotation);
  };
  function predictY(bp, bands) {
    const B = bands.slice().sort((a, b) => b.bp - a.bp);
    for (let i = 0; i < B.length - 1; i++) if (bp <= B[i].bp && bp >= B[i + 1].bp) {
      const t = (Math.log(bp) - Math.log(B[i].bp)) / (Math.log(B[i + 1].bp) - Math.log(B[i].bp));
      return B[i].y + t * (B[i + 1].y - B[i].y);
    }
    return null;
  }

  G.App = App;
})(window);
