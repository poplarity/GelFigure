/* Interactive raw-image editor: crop box, lane lines, marker bands, arrows. Zoom / pan. */
(function (G) {
  'use strict';
  const App = G.App;
  const cv = document.getElementById('editor');
  const box = document.getElementById('editorBox');
  const ctx = cv.getContext('2d');
  const view = { s: 1, ox: 0, oy: 0 };
  let dpr = 1, drag = null, hover = null, spaceDown = false, gridOn = false;
  const HIT = 7, HIT_TOUCH = 16;   // screen px; a fingertip needs the larger one
  const coarse = matchMedia('(pointer: coarse)');
  // fingers on the canvas (two = pinch-zoom), the last tap (two taps = add a lane), last pointer kind
  const touches = new Map();
  let pinch = null, lastTap = null, lastPtr = 'mouse';

  const toImg = (sx, sy) => ({ x: (sx - view.ox) / view.s, y: (sy - view.oy) / view.s });
  const toScr = (x, y) => ({ x: x * view.s + view.ox, y: y * view.s + view.oy });

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = box.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    draw();
  }

  function fit(rect) {
    const r = box.getBoundingClientRect(), pad = 34;
    if (r.width < 10 || r.height < 10) return;
    view.s = Math.min((r.width - 2 * pad) / rect.w, (r.height - 2 * pad) / rect.h);
    view.ox = (r.width - rect.w * view.s) / 2 - rect.x * view.s;
    view.oy = (r.height - rect.h * view.s) / 2 - rect.y * view.s;
    draw();
  }
  function fitFull() { if (App.src) { const r = App.ensureRot(); fit({ x: 0, y: 0, w: r.w, h: r.h }); } }
  function fitCrop() { if (App.S) { const c = App.S.crop, m = Math.max(c.w, c.h) * 0.08; fit({ x: c.x - m, y: c.y - m * 2, w: c.w + 2 * m, h: c.h + 3 * m }); } }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function draw() {
    const w = cv.width / dpr, h = cv.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!App.S) return;
    App.renderFull();
    const S = App.S, rot = App.rot;
    ctx.imageSmoothingEnabled = view.s < 2;
    ctx.save();
    ctx.translate(view.ox, view.oy); ctx.scale(view.s, view.s);
    ctx.drawImage(App.fullCanvas, 0, 0);
    if (document.getElementById('showSat').checked && !App.isColour()) ctx.drawImage(App.getSatCanvas(), 0, 0);
    ctx.restore();

    const c = S.crop, a = toScr(c.x, c.y), b = toScr(c.x + c.w, c.y + c.h);
    // dim outside the crop
    const ia = toScr(0, 0), ib = toScr(rot.w, rot.h);
    ctx.fillStyle = 'rgba(18,24,32,0.5)';
    ctx.beginPath(); ctx.rect(ia.x, ia.y, ib.x - ia.x, ib.y - ia.y); ctx.rect(a.x, b.y, b.x - a.x, a.y - b.y); ctx.fill('evenodd');

    // straightening grid: horizontal/vertical reference lines to judge wells and bands by eye
    if (gridOn) {
      const step = Math.max(24, Math.min(80, (ib.x - ia.x) / 16));
      ctx.save();
      ctx.beginPath(); ctx.rect(ia.x, ia.y, ib.x - ia.x, ib.y - ia.y); ctx.clip();
      ctx.strokeStyle = 'rgba(0,200,255,.45)'; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath();
      for (let y = a.y % step; y < h; y += step) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
      for (let x = a.x % step; x < w; x += step) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
      ctx.stroke(); ctx.restore();
    }

    // crop rect + handles
    ctx.strokeStyle = '#ff4d4f'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ff4d4f';
    const hs = coarse.matches ? 7 : 5;
    for (const [hx, hy] of handles()) {
      const p = toScr(hx, hy);
      roundRect(ctx, p.x - hs, p.y - hs, 2 * hs, 2 * hs, 2.5); ctx.fill(); ctx.stroke();
    }

    const half = S.laneHalfW;
    ctx.font = '600 11px -apple-system, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    const mkLanes = new Set(S.markers.map(m => m.lane));
    S.lanes.forEach((l, i) => {
      const p = toScr(l.x, c.y), sel = i === App.selLane, hov = hover && hover.type === 'lane' && hover.i === i;
      const isM = mkLanes.has(i), out = l.x < c.x || l.x > c.x + c.w;
      ctx.globalAlpha = out ? 0.45 : 1;
      if (sel) { ctx.fillStyle = 'rgba(47,111,235,.10)'; ctx.fillRect(p.x - half * view.s, a.y, 2 * half * view.s, b.y - a.y); }
      ctx.strokeStyle = l.hidden ? 'rgba(255,90,90,.85)' : sel ? '#2f6feb' : isM ? 'rgba(236,178,0,.9)' : 'rgba(47,111,235,.55)';
      ctx.lineWidth = sel || hov ? 2.2 : 1.2;
      ctx.setLineDash(l.hidden ? [5, 4] : isM ? [] : [6, 4]);
      ctx.beginPath(); ctx.moveTo(p.x, a.y); ctx.lineTo(p.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      // name chip above the crop
      const nb = S.lanes.length > 1 ? Math.abs((S.lanes[i + 1] || S.lanes[i - 1]).x - l.x) * view.s : 999;
      let lab = String(i + 1);
      if (l.name) {
        const full = lab + ' ' + trunc(l.name.replace(/\*/g, ''), 12);
        if (sel || ctx.measureText(full).width + 12 < nb) lab = full;
      }
      const tw = ctx.measureText(lab).width + 12;
      const cy = Math.max(12, a.y - 14);
      ctx.fillStyle = l.hidden ? 'rgba(190,30,45,.9)' : sel ? '#2f6feb' : 'rgba(24,32,44,.72)';
      roundRect(ctx, p.x - tw / 2, cy - 9, tw, 18, 6); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(l.hidden ? lab + ' ✕' : lab, p.x, cy + 3.8);
      ctx.globalAlpha = 1;
    });
    if (App.mode === 'arrow' && hover && hover.snapY != null) {
      const y = toScr(0, hover.snapY).y;
      ctx.strokeStyle = '#c026d3'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(a.x, y); ctx.lineTo(b.x, y); ctx.stroke(); ctx.setLineDash([]);
    }

    // marker bands
    S.markers.forEach((mk, mi) => {
      if (!S.lanes[mk.lane]) return;
      const mx = S.lanes[mk.lane].x;
      const x0 = toScr(mx - half * 1.4, 0).x, x1 = toScr(mx + half * 1.4, 0).x;
      const right = mx > S.crop.x + S.crop.w / 2;
      ctx.textAlign = right ? 'left' : 'right';
      ctx.font = '11px -apple-system, Segoe UI, Arial, sans-serif';
      mk.bands.forEach((bd, k) => {
        const y = toScr(0, bd.y).y;
        if (y < -20 || y > h + 20) return;
        const hov = hover && hover.type === 'band' && hover.m === mi && hover.i === k;
        ctx.strokeStyle = bd.show ? '#e0a800' : 'rgba(224,168,0,.42)';
        ctx.lineWidth = hov ? 2.6 : 1.6;
        ctx.setLineDash(bd.matched || bd.manual ? [] : [3, 3]);
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.setLineDash([]);
        if (bd.show || hov) {
          const txt = App.fmtSize(bd.bp);
          const tx = right ? x1 + 5 : x0 - 5, ty = y + 3.8;
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(255,255,255,.85)';
          ctx.textAlign = right ? 'left' : 'right';
          ctx.strokeText(txt, tx, ty);
          ctx.fillStyle = bd.show ? '#8a6100' : 'rgba(138,97,0,.62)';
          ctx.fillText(txt, tx, ty);
          ctx.lineWidth = bd.matched || bd.manual ? 1.6 : 1.6;
        }
      });
    });

    // region boxes and side brackets (teal)
    const TEAL = '#0d9488';
    ctx.font = '600 11px -apple-system, Segoe UI, Arial, sans-serif'; ctx.textAlign = 'left';
    (S.boxes || []).forEach((bx, k) => {
      const p0 = toScr(bx.x, bx.y), p1 = toScr(bx.x + bx.w, bx.y + bx.h);
      const sel = App.selAnno && App.selAnno.kind === 'box' && App.selAnno.k === k;
      ctx.strokeStyle = TEAL; ctx.lineWidth = sel ? 2.4 : 1.5; ctx.setLineDash(bx.dash !== false ? [6, 4] : []);
      ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = TEAL; ctx.lineWidth = 1.5;
      roundRect(ctx, p1.x - 4, p1.y - 4, 8, 8, 2); ctx.fill(); ctx.stroke();   // resize handle
      const t = (bx.text || G.L('区域框', 'Box')) + (bx.zoom >= 2 ? `  ×${bx.zoom}` : '');
      ctx.fillStyle = TEAL; ctx.fillText(t, p0.x + 2, p0.y - 5);
    });
    (S.brackets || []).forEach((br, k) => {
      const ya = toScr(0, br.y1).y, yb = toScr(0, br.y2).y, sel = App.selAnno && App.selAnno.kind === 'bracket' && App.selAnno.k === k;
      ctx.strokeStyle = TEAL; ctx.lineWidth = sel ? 2.4 : 1.4; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(a.x, ya); ctx.lineTo(b.x, ya); ctx.moveTo(a.x, yb); ctx.lineTo(b.x, yb); ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b.x + 6, ya); ctx.lineTo(b.x + 12, ya); ctx.lineTo(b.x + 12, yb); ctx.lineTo(b.x + 6, yb); ctx.stroke();
      ctx.fillStyle = TEAL; ctx.fillText(br.text || G.L('括号', 'Bracket'), b.x + 16, (ya + yb) / 2 + 4);
    });
    // rubber band while drawing a new box / bracket
    if (drag && drag.h.type === 'draw' && drag.cur) {
      const r0 = toScr(Math.min(drag.p0.x, drag.cur.x), Math.min(drag.p0.y, drag.cur.y)), r1 = toScr(Math.max(drag.p0.x, drag.cur.x), Math.max(drag.p0.y, drag.cur.y));
      ctx.strokeStyle = TEAL; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      if (App.mode === 'box') ctx.strokeRect(r0.x, r0.y, r1.x - r0.x, r1.y - r0.y);
      else { ctx.beginPath(); ctx.moveTo(a.x, r0.y); ctx.lineTo(b.x, r0.y); ctx.moveTo(a.x, r1.y); ctx.lineTo(b.x, r1.y); ctx.stroke(); }
      ctx.setLineDash([]);
    }

    // arrows
    ctx.textAlign = 'left'; ctx.font = '600 11px -apple-system, Segoe UI, Arial, sans-serif';
    S.arrows.forEach((ar, k) => {
      const y = toScr(0, ar.y).y, sel = k === App.selArrow;
      ctx.strokeStyle = '#c026d3'; ctx.lineWidth = sel ? 2.4 : 1.4; ctx.setLineDash([7, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, y); ctx.lineTo(b.x, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#c026d3';
      ctx.beginPath(); ctx.moveTo(b.x + 2, y); ctx.lineTo(b.x + 13, y - 5.5); ctx.lineTo(b.x + 13, y + 5.5); ctx.fill();
      const est = App.estimateBp(ar.y);
      const t = (ar.text || G.L('箭头', 'Arrow')) + (est ? `  ≈${App.fmtSize(est)}` : '');
      const tw = ctx.measureText(t).width;
      ctx.fillStyle = 'rgba(192,38,211,.12)';
      roundRect(ctx, b.x + 17, y - 9, tw + 12, 18, 6); ctx.fill();
      ctx.fillStyle = '#86198f';
      ctx.fillText(t, b.x + 23, y + 3.8);
    });
  }
  function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function handles() {
    const c = App.S.crop, mx = c.x + c.w / 2, my = c.y + c.h / 2;
    return [[c.x, c.y, 'nw'], [mx, c.y, 'n'], [c.x + c.w, c.y, 'ne'], [c.x + c.w, my, 'e'], [c.x + c.w, c.y + c.h, 'se'], [mx, c.y + c.h, 's'], [c.x, c.y + c.h, 'sw'], [c.x, my, 'w']];
  }

  function hitTest(sx, sy, shift, hit) {
    const S = App.S; if (!S) return null;
    const c = S.crop, p = toImg(sx, sy), tol = (hit || HIT) / view.s;
    if (spaceDown) return { type: 'pan' };
    for (const [hx, hy, k] of handles()) if (Math.abs(p.x - hx) <= tol * 1.3 && Math.abs(p.y - hy) <= tol * 1.3) return { type: 'crop', k };
    // the lane number chips above the crop pick (and drag) their lane: easier to hit than a 1 px line
    const chipY = Math.max(12, toScr(c.x, c.y).y - 14);
    if (S.lanes.length && Math.abs(sy - chipY) <= 9 + ((hit || HIT) - HIT) / 2) {
      const i = nearestLane(p.x);
      const pitch = S.lanes.length > 1 ? Math.abs((S.lanes[i + 1] || S.lanes[i - 1]).x - S.lanes[i].x) * view.s : 40;
      if (Math.abs(sx - toScr(S.lanes[i].x, 0).x) <= Math.max(12, Math.min(pitch / 2, 30))) return { type: 'lane', i };
    }
    const inX = p.x >= c.x - tol && p.x <= c.x + c.w + tol, inY = p.y >= c.y - tol && p.y <= c.y + c.h + tol;
    for (let k = 0; k < S.arrows.length; k++) if (Math.abs(p.y - S.arrows[k].y) <= tol && inX) return { type: 'arrow', i: k };
    const bxs = S.boxes || [];
    for (let k = bxs.length - 1; k >= 0; k--) {
      const q = bxs[k], x1 = q.x + q.w, y1 = q.y + q.h;
      if (Math.abs(p.x - x1) <= tol * 1.3 && Math.abs(p.y - y1) <= tol * 1.3) return { type: 'boxsize', i: k };
      const nearX = p.x >= q.x - tol && p.x <= x1 + tol, nearY = p.y >= q.y - tol && p.y <= y1 + tol;
      if ((nearY && (Math.abs(p.x - q.x) <= tol || Math.abs(p.x - x1) <= tol)) || (nearX && (Math.abs(p.y - q.y) <= tol || Math.abs(p.y - y1) <= tol))) return { type: 'boxmove', i: k };
    }
    const brs = S.brackets || [];
    for (let k = 0; k < brs.length; k++) {
      for (const end of ['y1', 'y2']) if (Math.abs(p.y - brs[k][end]) <= tol && inX) return { type: 'brend', i: k, end };
      const lo = Math.min(brs[k].y1, brs[k].y2), hi = Math.max(brs[k].y1, brs[k].y2);
      if (p.y >= lo && p.y <= hi && p.x > c.x + c.w && p.x < c.x + c.w + 18 / view.s) return { type: 'brmove', i: k };
    }
    for (let mi = 0; mi < S.markers.length; mi++) {
      const mk = S.markers[mi];
      if (!S.lanes[mk.lane] || Math.abs(p.x - S.lanes[mk.lane].x) > S.laneHalfW * 1.5) continue;
      let best = -1, bd = tol;
      mk.bands.forEach((b, k) => { const d = Math.abs(p.y - b.y); if (d <= bd) { bd = d; best = k; } });
      if (best >= 0) return { type: 'band', m: mi, i: best };
    }
    if (inY && S.lanes.length) { const i = nearestLane(p.x); if (Math.abs(p.x - S.lanes[i].x) <= tol) return { type: 'lane', i }; }
    if (inY && Math.abs(p.x - c.x) <= tol) return { type: 'crop', k: 'w' };
    if (inY && Math.abs(p.x - c.x - c.w) <= tol) return { type: 'crop', k: 'e' };
    if (inX && Math.abs(p.y - c.y) <= tol) return { type: 'crop', k: 'n' };
    if (inX && Math.abs(p.y - c.y - c.h) <= tol) return { type: 'crop', k: 's' };
    if (shift && inX && inY) return { type: 'cropmove' };
    if (inX && inY) return { type: 'inside' };
    return { type: 'pan' };
  }
  function nearestLane(x) {
    let best = 0, bd = Infinity;
    App.S.lanes.forEach((l, i) => { const d = Math.abs(l.x - x); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
  function cursorFor(h) {
    if (!h) return 'default';
    if (h.type === 'crop') return CURSORS[h.k];
    if (h.type === 'lane') return 'ew-resize';
    if (h.type === 'band' || h.type === 'arrow' || h.type === 'brend') return 'ns-resize';
    if (h.type === 'boxsize') return 'nwse-resize';
    if (h.type === 'cropmove' || h.type === 'boxmove' || h.type === 'brmove') return 'move';
    return 'grab';
  }

  // a second finger turned a one-finger edit into a pinch: put back whatever the first finger moved
  function cancelDrag() {
    const d = drag; drag = null;
    if (!d || !d.moved || !App.S) return;
    const S = App.S, h = d.h;
    if (h.type === 'crop' || h.type === 'cropmove') S.crop = d.crop0;
    else if (h.type === 'lane' && S.lanes[h.i]) S.lanes[h.i].x = d.x0;
    else if (h.type === 'band' && d.band0) Object.assign(S.markers[h.m].bands[h.i], d.band0);
    else if (h.type === 'arrow' && S.arrows[h.i]) S.arrows[h.i].y = d.y0;
    else if ((h.type === 'boxmove' || h.type === 'boxsize') && S.boxes[h.i]) Object.assign(S.boxes[h.i], d.orig);
    else if ((h.type === 'brend' || h.type === 'brmove') && S.brackets[h.i]) Object.assign(S.brackets[h.i], d.orig);
    App.refresh();
  }
  const pinchDist = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const pinchMid = () => { const [a, b] = [...touches.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };

  // one-tap tools: place a target-band arrow / add a lane where the image was tapped
  function tapAction(mode, p) {
    const c = App.S.crop;
    if (p.y < c.y || p.y > c.y + c.h) return;
    if (mode === 'arrow') { if (App.placeArrow) App.placeArrow(p.x, p.y); return; }
    if (p.x < c.x || p.x > c.x + c.w) return;
    App.selLane = App.addLane(p.x); App.selArrow = -1;
    if (G.FigEdit) G.FigEdit.setMode(null);
    App.commit();
  }

  cv.addEventListener('pointerdown', (e) => {
    if (!App.S) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    lastPtr = e.pointerType;
    box.focus({ preventScroll: true });
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const touch = e.pointerType === 'touch';
    if (touch) {
      touches.set(e.pointerId, { x: sx, y: sy });
      if (touches.size >= 2) {
        // second finger: pinch-zoom and two-finger pan instead of whatever the first one started
        cancelDrag();
        if (touches.size === 2) pinch = { d0: pinchDist(), m0: pinchMid(), view0: Object.assign({}, view) };
        e.preventDefault(); draw();
        return;
      }
    }
    if (pinch) return;
    const p = toImg(sx, sy);
    if (App.mode === 'arrow' || App.mode === 'lane') {
      // a mouse click acts at once; a finger may still pan or pinch first, so it acts on a clean tap
      if (touch) drag = { h: { type: 'pan' }, tap: App.mode, sx, sy, p0: p, moved: false, view0: Object.assign({}, view), touch };
      else tapAction(App.mode, p);
      e.preventDefault();
      return;
    }
    // drawing a region box / bracket: rubber band from here to the mouse-up point
    if (App.mode === 'box' || App.mode === 'bracket') {
      const c = App.S.crop;
      if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) {
        drag = { h: { type: 'draw' }, kind: App.mode, sx, sy, p0: p, cur: p, moved: false, view0: Object.assign({}, view), touch };
        cv.style.cursor = 'crosshair';
      }
      e.preventDefault();
      return;
    }
    const h = hitTest(sx, sy, e.shiftKey, touch ? HIT_TOUCH : HIT);
    drag = { h, sx, sy, p0: p, crop0: Object.assign({}, App.S.crop), moved: false, view0: Object.assign({}, view), touch };
    App.selAnno = null;
    if (h.type === 'lane') { App.selLane = h.i; App.selArrow = -1; drag.x0 = App.S.lanes[h.i].x; App.emit('select'); }
    else if (h.type === 'arrow') { App.selArrow = h.i; App.selLane = -1; drag.y0 = App.S.arrows[h.i].y; App.emit('select'); }
    else if (h.type === 'boxmove' || h.type === 'boxsize') { App.selAnno = { kind: 'box', k: h.i }; App.selLane = App.selArrow = -1; drag.orig = Object.assign({}, App.S.boxes[h.i]); }
    else if (h.type === 'brend' || h.type === 'brmove') { App.selAnno = { kind: 'bracket', k: h.i }; App.selLane = App.selArrow = -1; drag.orig = Object.assign({}, App.S.brackets[h.i]); }
    else if (h.type === 'band') { const b = App.S.markers[h.m].bands[h.i]; drag.y0 = b.y; drag.band0 = Object.assign({}, b); }
    else if (h.type === 'inside') {
      let best = -1, bd = Infinity;
      App.S.lanes.forEach((l, i) => { const d = Math.abs(l.x - p.x); if (d < bd) { bd = d; best = i; } });
      drag.pickLane = bd <= App.S.laneHalfW * 1.6 ? best : -1;
    }
    cv.style.cursor = (h.type === 'pan' || h.type === 'inside') ? 'grabbing' : cursorFor(h);
    e.preventDefault();
  });

  window.addEventListener('pointermove', (e) => {
    if (!App.S) return;
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      const r = cv.getBoundingClientRect();
      touches.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      if (pinch && touches.size >= 2) {
        if (e.cancelable) e.preventDefault();
        // the image point that was under the fingers stays under them while they spread and move
        const v0 = pinch.view0, m = pinchMid(), ns = Math.max(0.02, Math.min(40, v0.s * pinchDist() / pinch.d0));
        const ix = (pinch.m0.x - v0.ox) / v0.s, iy = (pinch.m0.y - v0.oy) / v0.s;
        view.s = ns; view.ox = m.x - ix * ns; view.oy = m.y - iy * ns;
        draw(); refreshZoom();
        return;
      }
      if (pinch) return;   // one finger still down after a pinch: nothing until it lifts
    }
    if (drag) {
      if (e.cancelable) e.preventDefault();   /* take the finger from the browser's scroll/zoom */
    } else if (e.pointerType !== 'mouse' || e.target !== cv) return;
    const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (!drag) {
      if (App.mode === 'arrow') {
        const p = toImg(sx, sy), c = App.S.crop;
        const inC = p.y >= c.y && p.y <= c.y + c.h && p.x >= c.x && p.x <= c.x + c.w;
        hover = { type: 'arm', snapY: inC ? (App.snapBandY(p.x, p.y) ?? p.y) : null };
        cv.style.cursor = 'crosshair'; draw();
        return;
      }
      if (App.mode === 'box' || App.mode === 'bracket' || App.mode === 'lane') { cv.style.cursor = 'crosshair'; return; }
      const h = hitTest(sx, sy, e.shiftKey);
      const changed = JSON.stringify(h) !== JSON.stringify(hover);
      hover = h; cv.style.cursor = cursorFor(h);
      if (changed) draw();
      return;
    }
    const p = toImg(sx, sy), dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
    // a fingertip wobbles a few pixels during a tap
    if (Math.abs(sx - drag.sx) + Math.abs(sy - drag.sy) > (drag.touch ? 8 : 2)) drag.moved = true;
    if (!drag.moved) return;
    const S = App.S, h = drag.h, rot = App.rot;
    if (h.type === 'pan' || h.type === 'inside') { view.ox = drag.view0.ox + (sx - drag.sx); view.oy = drag.view0.oy + (sy - drag.sy); draw(); return; }
    if (h.type === 'draw') { const c = S.crop; drag.cur = { x: E_clamp(p.x, c.x, c.x + c.w), y: E_clamp(p.y, c.y, c.y + c.h) }; draw(); return; }
    if (h.type === 'boxmove') { const o = drag.orig, q = S.boxes[h.i]; q.x = E_clamp(o.x + dx, 0, rot.w - o.w); q.y = E_clamp(o.y + dy, 0, rot.h - o.h); draw(); App.refresh(); return; }
    if (h.type === 'boxsize') { const o = drag.orig, q = S.boxes[h.i]; q.w = Math.max(4, Math.min(rot.w - o.x, o.w + dx)); q.h = Math.max(4, Math.min(rot.h - o.y, o.h + dy)); draw(); App.refresh(); return; }
    if (h.type === 'brend') { S.brackets[h.i][h.end] = E_clamp(drag.orig[h.end] + dy, 0, rot.h); draw(); App.refresh(); return; }
    if (h.type === 'brmove') { const o = drag.orig, q = S.brackets[h.i]; q.y1 = E_clamp(o.y1 + dy, 0, rot.h); q.y2 = E_clamp(o.y2 + dy, 0, rot.h); draw(); App.refresh(); return; }
    if (h.type === 'crop' || h.type === 'cropmove') {
      const c0 = drag.crop0;
      let x0 = c0.x, y0 = c0.y, x1 = c0.x + c0.w, y1 = c0.y + c0.h;
      if (h.type === 'cropmove') {
        const mdx = E_clamp(dx, -x0, rot.w - x1), mdy = E_clamp(dy, -y0, rot.h - y1);
        x0 += mdx; x1 += mdx; y0 += mdy; y1 += mdy;
      } else {
        // left/right edges snap to the gap between lanes (Alt = free)
        const sn = v => (e.altKey ? v : App.snapCropX(v));
        if (h.k.includes('w')) x0 = Math.min(x1 - 10, Math.max(0, sn(c0.x + dx)));
        if (h.k.includes('e')) x1 = Math.max(x0 + 10, Math.min(rot.w, sn(c0.x + c0.w + dx)));
        if (h.k.includes('n')) y0 = Math.min(y1 - 10, Math.max(0, c0.y + dy));
        if (h.k.includes('s')) y1 = Math.max(y0 + 10, Math.min(rot.h, c0.y + c0.h + dy));
      }
      S.crop = { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
    } else if (h.type === 'lane') {
      S.lanes[h.i].x = Math.max(0, Math.min(rot.w, drag.x0 + dx));
    } else if (h.type === 'band') {
      const b = S.markers[h.m].bands[h.i];
      b.y = Math.max(0, Math.min(rot.h, drag.y0 + dy)); b.manual = true; b.matched = false;
    } else if (h.type === 'arrow') {
      S.arrows[h.i].y = Math.max(0, Math.min(rot.h, drag.y0 + dy));
    }
    draw(); App.refresh();
  });
  function E_clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function endPointer(e, cancelled) {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.delete(e.pointerId);
      if (pinch) { if (!touches.size) pinch = null; return; }
    }
    if (!drag) return;
    if (cancelled) { cancelDrag(); draw(); return; }   // the browser took the gesture over
    const d = drag; drag = null;
    const S = App.S;
    if (d.h.type === 'draw') {
      const q = d.cur || d.p0, x0 = Math.min(d.p0.x, q.x), x1 = Math.max(d.p0.x, q.x), y0 = Math.min(d.p0.y, q.y), y1 = Math.max(d.p0.y, q.y);
      // Esc during the drag cancelled the tool: draw nothing
      if (App.mode === d.kind && App.createAnno) App.createAnno(d.kind, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      else draw();
      return;
    }
    if (!d.moved) {
      if (d.tap) { if (App.mode === d.tap) tapAction(d.tap, d.p0); return; }
      if ((d.h.type === 'boxmove' || d.h.type === 'boxsize' || d.h.type === 'brend' || d.h.type === 'brmove') && App.openAnno) {
        App.openAnno(d.h.type.startsWith('box') ? 'box' : 'bracket', d.h.i);
        draw(); return;
      }
      // a finger has no double-click: two quick taps in the same spot add a lane there (at phone zoom
      // the finger-sized lane hit zones cover most of the gap between lanes, so a lane counts too)
      if (d.touch && (d.h.type === 'inside' || d.h.type === 'lane')) {
        const now = performance.now();
        if (lastTap && now - lastTap.t < 400 && Math.hypot(d.sx - lastTap.sx, d.sy - lastTap.sy) < 30) {
          lastTap = null;
          tapAction('lane', d.p0);
          return;
        }
        lastTap = { t: now, sx: d.sx, sy: d.sy };
      }
      if (d.h.type === 'inside') { App.selLane = d.pickLane; App.selArrow = -1; App.emit('select'); draw(); }
      if (d.h.type === 'pan') { App.selLane = -1; App.selArrow = -1; App.emit('select'); draw(); }
      cv.style.cursor = cursorFor(hover);
      return;
    }
    if (d.h.type === 'crop' || d.h.type === 'cropmove') { App.updateSaturation(); if (App.afterRangeChange) App.afterRangeChange(); }
    if (d.h.type === 'lane') { const moved = S.lanes[d.h.i]; App.sortLanesIfNeeded(); App.selLane = S.lanes.indexOf(moved); }
    if (d.h.type === 'band') App.matchMarkers(false);
    if (d.h.type !== 'pan' && d.h.type !== 'inside') App.commit();
    cv.style.cursor = cursorFor(hover);
  }
  window.addEventListener('pointerup', e => endPointer(e, false));
  window.addEventListener('pointercancel', e => endPointer(e, true));

  cv.addEventListener('dblclick', (e) => {
    // touch double taps are handled above; some browsers also synthesise a dblclick from them
    if (!App.S || lastPtr === 'touch') return;
    const r = cv.getBoundingClientRect(), p = toImg(e.clientX - r.left, e.clientY - r.top), c = App.S.crop;
    if (p.x < c.x || p.x > c.x + c.w || p.y < c.y || p.y > c.y + c.h) return;
    App.selLane = App.addLane(p.x);
    App.commit();
  });

  cv.addEventListener('wheel', (e) => {
    if (!App.S) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    const ns = Math.max(0.02, Math.min(40, view.s * k));
    view.ox = sx - (sx - view.ox) * ns / view.s; view.oy = sy - (sy - view.oy) * ns / view.s; view.s = ns;
    draw(); refreshZoom();
  }, { passive: false });

  // space = temporary pan mode (not on form fields and buttons, where Space types or presses)
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !spaceDown && !/^(input|textarea|select|button|summary|a)$/i.test((e.target.tagName || ''))) {
      spaceDown = true; cv.style.cursor = 'grab'; e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space') { spaceDown = false; cv.style.cursor = cursorFor(hover); }
  });

  // deleting / nudging only when the image area itself has focus — never while typing anywhere.
  // Backspace counts too: it is the key labelled "delete" on a Mac keyboard.
  box.addEventListener('keydown', (e) => {
    if (!App.S || e.target !== box) return;
    // a selection can point past the end after undo or a reload
    if (!App.S.lanes[App.selLane]) App.selLane = -1;
    if (!App.S.arrows[App.selArrow]) App.selArrow = -1;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // an open popover may belong to what is deleted: finish it first
      if (G.FigEdit) G.FigEdit.closePop();
      if (App.selLane >= 0) {
        App.removeLane(App.selLane); App.selLane = -1; App.commit(); e.preventDefault();
        if (G.UI) G.UI.toast(G.L('已删除泳道（Ctrl/⌘+Z 可撤销）', 'Lane deleted (Ctrl/⌘+Z to undo)'));
      } else if (App.selArrow >= 0) { App.S.arrows.splice(App.selArrow, 1); App.selArrow = -1; App.commit(); e.preventDefault(); }
      else if (App.selAnno) { App.removeAnno(App.selAnno); App.selAnno = null; App.commit(); e.preventDefault(); }
    }
    // H: cut the selected lane from the figure / bring it back (splice gap added automatically)
    if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && App.selLane >= 0 && App.toggleLaneHidden) {
      const l = App.S.lanes[App.selLane];
      if (App.toggleLaneHidden(App.selLane, !l.hidden)) App.commit();
      e.preventDefault();
    }
    if (App.selLane >= 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      App.S.lanes[App.selLane].x += (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1);
      App.commit(); e.preventDefault();
    }
  });

  ['dragenter', 'dragover'].forEach(ev => box.addEventListener(ev, e => { e.preventDefault(); box.classList.add('drag'); }));
  // the drop itself bubbles to the window-level handler (ui.js), which loads every dropped file
  ['dragleave', 'drop'].forEach(ev => box.addEventListener(ev, e => { e.preventDefault(); box.classList.remove('drag'); }));

  function refreshZoom() { const el = document.getElementById('zoomLabel'); if (el) el.textContent = Math.round(view.s * 100) + '%'; }

  new ResizeObserver(resize).observe(box);
  App.on(w => {
    if (w === 'loaded') { document.getElementById('dropHint').classList.add('hidden'); resize(); fitCrop(); }
    else draw();
  });

  function setGrid(on) { if (gridOn !== !!on) { gridOn = !!on; draw(); } }
  // x/y are canvas-image pixels; screen/browser coords are toScr / toImg
  G.Editor = { draw, resize, fitFull, fitCrop, zoom: () => view.s, refreshZoom, setGrid, toScr, toImg };
})(window);
