/* Figure renderer: project state -> publication SVG (units = pt, 1 pt = 1/72 in).
 * Gel image is embedded as a raster; every label, line and tick is vector.
 */
(function (G) {
  'use strict';
  const MM = 72 / 25.4;
  const FONT = 'Arial, Helvetica, sans-serif';

  const mctx = document.createElement('canvas').getContext('2d');
  // label markup: *italic* segments
  function parseRuns(text) {
    const parts = String(text).split('*');
    return parts.map((t, i) => ({ t, it: i % 2 === 1 })).filter(r => r.t.length);
  }
  function measure(text, pt, bold) {
    let w = 0;
    for (const r of parseRuns(text)) {
      mctx.font = `${r.it ? 'italic ' : ''}${bold ? 'bold ' : ''}${pt * 4}px Arial`;
      w += mctx.measureText(r.t).width / 4;
    }
    return w;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function textEl(text, x, y, pt, anchor, extra) {
    const runs = parseRuns(text).map(r => r.it ? `<tspan font-style="italic">${esc(r.t)}</tspan>` : esc(r.t)).join('');
    return `<text x="${f(x)}" y="${f(y)}" font-size="${f(pt)}" text-anchor="${anchor}"${extra || ''}>${runs}</text>`;
  }
  function f(v) { return (Math.round(v * 100) / 100).toString(); }

  // Lane column boundaries in crop pixels
  function laneBounds(lanes, cropW) {
    const xs = lanes.map(l => l.x);
    return xs.map((x, i) => [
      i === 0 ? Math.max(0, x - (xs.length > 1 ? (xs[1] - x) / 2 : cropW)) : (xs[i - 1] + x) / 2,
      i === xs.length - 1 ? Math.min(cropW, x + (xs.length > 1 ? (x - xs[i - 1]) / 2 : cropW)) : (x + xs[i + 1]) / 2
    ]);
  }

  // Segments of consecutive visible lanes (hidden lanes are cut out, splice marked with a gap/line)
  function segments(S, cropW) {
    const lanes = S.lanes;
    if (!lanes.length || !lanes.some(l => l.hidden)) return [{ x0: 0, x1: cropW, lanes: lanes.map((_, i) => i) }];
    const b = laneBounds(lanes, cropW);
    const segs = [];
    let cur = null;
    lanes.forEach((l, i) => {
      if (l.hidden) { cur = null; return; }
      if (!cur) { cur = { x0: b[i][0], x1: b[i][1], lanes: [i] }; segs.push(cur); }
      else { cur.x1 = b[i][1]; cur.lanes.push(i); }
    });
    if (segs.length) {
      if (segs[0].lanes[0] === 0) segs[0].x0 = 0;
      const last = segs[segs.length - 1];
      if (last.lanes[last.lanes.length - 1] === lanes.length - 1) last.x1 = cropW;
    }
    return segs;
  }

  // Compose processed gel (canvas of the crop) into final panel raster, cutting hidden lanes.
  // Returns {canvas, map(xCropPx) -> x in panel px, segs, gapPx}
  function composeGel(S, cropCanvas, scalePtPerPx) {
    const W = cropCanvas.width, H = cropCanvas.height;
    const segs = segments(S, W);
    const st = S.style;
    const gapPx = segs.length > 1 ? Math.max(1, Math.round((st.spliceStyle === 'line' ? 0 : st.spliceGapPt) / scalePtPerPx)) : 0;
    let total = 0;
    segs.forEach(s => { s.px0 = Math.round(s.x0); s.px1 = Math.round(s.x1); s.off = total; total += s.px1 - s.px0 + gapPx; });
    total -= gapPx;
    const c = document.createElement('canvas');
    c.width = Math.max(1, total); c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, H);
    segs.forEach(s => ctx.drawImage(cropCanvas, s.px0, 0, s.px1 - s.px0, H, s.off, 0, s.px1 - s.px0, H));
    // a position inside a cut-out stretch moves to the next kept segment's start, or with
    // prefer = 'end' to the previous one's end (the right edge of a box that ends in a cut lane)
    const map = (x, prefer) => {
      for (const s of segs) if (x >= s.px0 - 0.5 && x <= s.px1 + 0.5) return s.off + (x - s.px0);
      const next = segs.find(s => s.px0 > x), last = segs.filter(s => s.px1 < x).pop();
      const endOf = s => s.off + s.px1 - s.px0;
      if (prefer === 'end') return last ? endOf(last) : next ? next.off : x;
      return next ? next.off : last ? endOf(last) : x;
    };
    return { canvas: c, map, segs, gapPx };
  }

  function autoAngle(labels, pitchPt, pt) {
    const maxW = Math.max(0, ...labels.map(t => measure(t, pt)));
    if (maxW <= pitchPt * 0.9) return 0;
    if (pitchPt >= pt * 1.6) return 45;
    return 90;
  }

  // Assign tiers so overlapping groups stack
  function groupTiers(groups) {
    const tiers = [];
    const sorted = groups.map((g, i) => ({ g, i, a: Math.min(g.from, g.to), b: Math.max(g.from, g.to) }))
      .sort((p, q) => (p.b - p.a) - (q.b - q.a));
    const out = new Array(groups.length).fill(0);
    for (const s of sorted) {
      let t = 0;
      while ((tiers[t] || []).some(o => !(s.b < o.a || s.a > o.b))) t++;
      (tiers[t] = tiers[t] || []).push(s);
      out[s.i] = t;
    }
    return out;
  }

  /* Build SVG. imgHref = data URL / blob URL of composed gel raster. Returns {svg, w, h, warnings} */
  function build(S, gel, imgHref) {
    const st = S.style, pt = st.fontPt, lw = st.lineWidthPt;
    const warnings = [], overlaps = [];
    const overlap = msg => { warnings.push(msg); overlaps.push(msg); };
    const Wpx = gel.canvas.width, Hpx = gel.canvas.height;
    const W = st.gelWidthMm * MM, sc = W / Wpx, H = Hpx * sc;
    const els = [];
    const box = { x0: 0, y0: 0, x1: W, y1: H };
    const grow = (x0, y0, x1, y1) => { box.x0 = Math.min(box.x0, x0); box.y0 = Math.min(box.y0, y0); box.x1 = Math.max(box.x1, x1); box.y1 = Math.max(box.y1, y1); };

    els.push(`<image ${S.preview ? 'data-edit="gel" ' : ''}x="0" y="0" width="${f(W)}" height="${f(H)}" preserveAspectRatio="none" href="${imgHref}" xlink:href="${imgHref}"/>`);
    // splice marker lines: they must contrast with the gel background, which is dark when the source
    // is bright-bands-on-dark and not inverted (or the other way round) — not simply when inverted
    if (gel.segs.length > 1 && st.spliceStyle === 'line') {
      const darkBg = !!S.bright !== !!S.levels.invert;
      gel.segs.slice(1).forEach(s => {
        const x = s.off * sc;
        els.push(`<line x1="${f(x)}" y1="0" x2="${f(x)}" y2="${f(H)}" stroke="${darkBg ? '#fff' : '#000'}" stroke-width="${f(Math.max(lw, 0.5))}"/>`);
      });
    }
    if (st.frame) els.push(`<rect x="0" y="0" width="${f(W)}" height="${f(H)}" fill="none" stroke="#000" stroke-width="${f(lw)}"/>`);

    const vis = S.lanes.map((l, i) => ({ l, i })).filter(o => !o.l.hidden);
    const X = (i) => gel.map(S.lanes[i].x) * sc;
    let pitch = Infinity;
    for (let k = 1; k < vis.length; k++) pitch = Math.min(pitch, X(vis[k].i) - X(vis[k - 1].i));
    if (!isFinite(pitch)) pitch = W;

    // ---- top stack (y grows negative) ----
    let yTop = -st.labelGapPt;
    // lane numbers
    if (st.laneNumbers && vis.length) {
      // default: the well number, so the figure matches the notebook even after lanes are cut
      let n = 0;
      vis.forEach(o => { n++; const num = st.laneNumberMode === 'seq' ? n : (o.l.src != null ? o.l.src : o.i) + 1; els.push(textEl(String(num), X(o.i), yTop, pt, 'middle')); });
      yTop -= pt * 1.25;
    }
    // condition rows (+/- matrix), bottom row closest to gel
    // preview mode: editable elements carry data-edit, empty slots show grey placeholders
    const P = !!S.preview;
    const ed = (attrs, inner) => P ? `<g ${attrs} class="ed">${inner}</g>` : inner;
    const phStyle = ' fill="#b4bcc6"';
    const conds = (S.conditions || []).map((c, r) => Object.assign({ r }, c)).filter(c => P || c.name || c.values.some(v => v));
    const rowNameX = -st.labelGapPt * 2;
    for (let k = conds.length - 1; k >= 0; k--) {
      const c = conds[k];
      vis.forEach(o => {
        const v = c.values[o.i], src = o.l.src != null ? o.l.src : o.i;
        // a wide invisible hit area makes each cell easy to click in the preview
        const hit = P ? `<rect x="${f(X(o.i) - Math.min(pitch, 20) * 0.45)}" y="${f(yTop - pt)}" width="${f(Math.min(pitch, 20) * 0.9)}" height="${f(pt * 1.25)}" fill="transparent"/>` : '';
        if (v) els.push(ed(`data-edit="cond" data-r="${c.r}" data-src="${src}"`, hit + textEl(v, X(o.i), yTop, pt, 'middle')));
        else if (P) els.push(ed(`data-edit="cond" data-r="${c.r}" data-src="${src}"`, hit + textEl('·', X(o.i), yTop, pt, 'middle', phStyle)));
      });
      const nm = c.name || (P ? G.L('条件', 'Condition') : '');
      if (nm) {
        els.push(ed(`data-edit="condname" data-r="${c.r}"`, textEl(nm, rowNameX, yTop, pt, 'end', c.name ? '' : phStyle)));
        grow(rowNameX - measure(nm, pt), yTop - pt, 0, yTop);
      }
      yTop -= pt * 1.3;
    }
    // lane names (placeholders in preview: the well number)
    const names = vis.map(o => o.l.name || (P ? String((o.l.src != null ? o.l.src : o.i) + 1) : ''));
    const hasNames = names.some(t => t.trim());
    let angle = 0;
    // baseline of the lane-name row: the (bp) unit header is aligned to this, not to the marker labels
    const unitRowY = yTop;
    if (hasNames) {
      angle = st.labelAngle === 'auto' ? autoAngle(names, pitch, pt) : +st.labelAngle;
      const rad = angle * Math.PI / 180, sn = Math.sin(rad), cs = Math.cos(rad);
      let hMax = pt;
      vis.forEach((o, vi) => {
        const t = names[vi];
        if (!t.trim()) return;
        const extra = o.l.name ? '' : phStyle, src = o.l.src != null ? o.l.src : o.i;
        const tw = measure(t, pt), x = X(o.i);
        if (angle === 0 || !o.l.name) {
          // placeholders stay horizontal: a rotated lone digit reads like a stray glyph
          els.push(ed(`data-edit="lane" data-src="${src}"`, textEl(t, x, yTop, pt, 'middle', extra)));
          grow(x - tw / 2, yTop - pt, x + tw / 2, yTop);
        } else {
          // rotated text grows up-right from the lane centre; offset so the text's centre line sits on the lane
          const ox = x + pt * 0.35 * sn, oy = yTop;
          els.push(ed(`data-edit="lane" data-src="${src}"`, `<g transform="translate(${f(ox)},${f(oy)}) rotate(${-angle})">${textEl(t, 0, 0, pt, 'start', extra)}</g>`));
          hMax = Math.max(hMax, tw * sn + pt * cs * 0.8);
          grow(ox - pt * sn, oy - tw * sn - pt * cs, ox + tw * cs + pt * sn * 0.2, oy);
        }
      });
      if (angle !== 0 && pitch < pt * 1.15) overlap(G.L('泳道过窄：即使 90° 标签也会重叠，请减小字号或增大图宽', 'Lanes are too narrow: even 90° labels overlap; use a smaller font or a wider figure'));
      if (angle === 0 && st.labelAngle !== 'auto' && Math.max(...names.map(t => measure(t, pt))) > pitch * 1.02) overlap(G.L('水平泳道标签发生重叠，建议改用"自动"或倾斜角度', 'Horizontal lane labels overlap; use "Auto" or a tilted angle'));
      yTop -= (angle === 0 ? pt * 1.3 : hMax + pt * 0.35);
    }
    // groups: line spanning lanes + shared text above
    const groups = (S.groups || []).filter(g => g.from != null && g.to != null && S.lanes[g.from] && S.lanes[g.to]);
    if (groups.length) {
      const tiers = groupTiers(groups);
      const tierH = pt * 1.7;
      const base = yTop - pt * 0.15;
      groups.forEach((g, k) => {
        const a = Math.min(g.from, g.to), b = Math.max(g.from, g.to);
        const half = Math.min(pitch, W) * 0.42;
        const y = base - tiers[k] * tierH;
        // one line piece per spliced segment: a group line must never bridge a splice gap
        const runs = [];
        gel.segs.forEach(sg => {
          const ins = (sg.lanes || []).filter(i => i >= a && i <= b && !S.lanes[i].hidden);
          if (ins.length) runs.push([X(ins[0]) - half, X(ins[ins.length - 1]) + half]);
        });
        if (!runs.length) runs.push([X(a) - half, X(b) + half]);
        const x0 = runs[0][0], x1 = runs[runs.length - 1][1];
        runs.forEach(([r0, r1]) => {
          els.push(`<line x1="${f(r0)}" y1="${f(y)}" x2="${f(r1)}" y2="${f(y)}" stroke="#000" stroke-width="${f(lw)}"/>`);
          if (st.groupTicks) {
            els.push(`<line x1="${f(r0)}" y1="${f(y)}" x2="${f(r0)}" y2="${f(y + pt * 0.35)}" stroke="#000" stroke-width="${f(lw)}"/>`);
            els.push(`<line x1="${f(r1)}" y1="${f(y)}" x2="${f(r1)}" y2="${f(y + pt * 0.35)}" stroke="#000" stroke-width="${f(lw)}"/>`);
          }
        });
        const gt = g.text || (P ? G.L('点击输入', 'Click to type') : '');
        if (gt) {
          const tw = measure(gt, pt);
          els.push(ed(`data-edit="group" data-k="${g.k != null ? g.k : k}"`, textEl(gt, (x0 + x1) / 2, y - pt * 0.3, pt, 'middle', g.text ? '' : phStyle)));
          grow((x0 + x1) / 2 - tw / 2, y - pt * 1.3, (x0 + x1) / 2 + tw / 2, y);
        }
        grow(x0, y - pt, x1, y);
      });
      yTop = base - (Math.max(...tiers) + 1) * tierH;
    }

    // ---- marker size labels (one column per marker; left/right of the gel) ----
    const tick = st.tickLenPt;
    const markers = (S.markers || []).filter(mk => mk.bands && mk.bands.length && S.lanes[mk.lane]);
    const sides = markers.map(mk => mk.side !== 'auto' ? mk.side : (S.lanes[mk.lane].x < S.crop.w / 2 ? 'left' : 'right'));
    // two auto markers on the same side: send the outer one to the other side
    if (markers.length === 2 && sides[0] === sides[1]) {
      if (markers[0].side === 'auto') sides[0] = 'left';
      if (markers[1].side === 'auto') sides[1] = 'right';
    }
    const extent = { left: 0, right: 0 };   // how far labels already reach beyond the gel edge
    markers.forEach((mk, mi) => {
      const side = sides[mi];
      const off = extent[side] ? extent[side] + 3 : 0;  // a second column on the same side sits further out
      const shown = mk.bands.filter(b => b.show && b.y != null && b.y >= 0 && b.y <= Hpx);
      let maxTw = 0;
      shown.forEach(b => {
        const y = b.y * sc, label = G.Ladders.fmt(b.bp, mk.unit);
        const tw = measure(label, pt); maxTw = Math.max(maxTw, tw);
        if (side === 'left') {
          if (!off) els.push(`<line x1="${f(-tick - 1)}" y1="${f(y)}" x2="${f(-1)}" y2="${f(y)}" stroke="#000" stroke-width="${f(lw)}"/>`);
          els.push(textEl(label, -tick - 2.5 - off, y + pt * 0.35, pt, 'end'));
          grow(-tick - 2.5 - off - tw, y - pt, 0, y + pt);
        } else {
          if (!off) els.push(`<line x1="${f(W + 1)}" y1="${f(y)}" x2="${f(W + 1 + tick)}" y2="${f(y)}" stroke="#000" stroke-width="${f(lw)}"/>`);
          els.push(textEl(label, W + tick + 2.5 + off, y + pt * 0.35, pt, 'start'));
          grow(W, y - pt, W + tick + 2.5 + off + tw, y + pt);
        }
      });
      for (let k = 1; k < shown.length; k++) if ((shown[k].y - shown[k - 1].y) * sc < pt * 0.95) {
        overlap(G.L('部分 Marker 标签间距过小会重叠，可点"精简标签"或手动取消勾选', 'Some marker labels are too close and overlap; click "Thin labels" or untick some')); break;
      }
      // the unit header is as wide as the unit actually in use: "(kDa)" is wider than "(bp)"
      const unitText = st.unitHeader && mk.unit !== 'auto' ? `(${mk.unit === 'kb' ? 'kb' : mk.unit === 'kDa' ? 'kDa' : 'bp'})` : '';
      const unitW = unitText ? measure(unitText, pt) : 0;
      if (unitText && shown.length) {
        const ux = side === 'left' ? -tick - 2.5 - off : W + tick + 2.5 + off;
        const uy = unitRowY;
        els.push(textEl(unitText, ux, uy, pt, side === 'left' ? 'end' : 'start'));
        grow(side === 'left' ? ux - unitW : ux, uy - pt * 1.2, side === 'left' ? 0 : ux + unitW, uy + pt * 0.3);
      }
      extent[side] = tick + 2.5 + off + Math.max(maxTw, unitW);
    });

    // ---- arrows (expected product): free side preferred, otherwise outside the marker labels ----
    const arrows = (S.arrows || []).filter(a => a.y != null);
    const defSide = !extent.right ? 'right' : !extent.left ? 'left' : 'right';
    const reach = { left: extent.left, right: extent.right };   // outermost edge reached so far, per side
    // what occupies each side at which heights, so a bracket only steps past things it would hit
    const occ = { left: [], right: [] };
    ['left', 'right'].forEach(sd => { if (extent[sd]) occ[sd].push({ y0: -Infinity, y1: Infinity, ext: extent[sd] }); });
    // band marks: an arrowhead, or a text symbol (* for a non-specific band, # for a degradation product)
    const SYM = { star: '*', hash: '#', dagger: '†' };
    arrows.forEach((a, k) => {
      const y = a.y * sc, side = a.side || defSide;
      const s = pt * 0.75, label = a.label != null ? a.label : (a.text || '');
      const off = extent[side] ? extent[side] + 2 : 0;
      const attrs = `data-edit="arrow" data-k="${a.k != null ? a.k : k}"`;
      const glyph = SYM[a.sym];
      const gw = glyph ? measure(glyph, pt * 1.15) : s * 1.3;   // width of the mark itself
      const tw = measure(label, pt);
      // written out directly: textEl would read "*" as the start of italic markup and drop it
      const mark = (x, dir) => glyph
        ? `<text x="${f(x + dir * gw / 2)}" y="${f(y + pt * (a.sym === 'star' ? 0.62 : 0.4))}" font-size="${f(pt * 1.15)}" text-anchor="middle">${esc(glyph)}</text>`
        : `<path d="M${f(x)},${f(y)} L${f(x + dir * s * 1.3)},${f(y - s * 0.6)} L${f(x + dir * s * 1.3)},${f(y + s * 0.6)} Z" fill="#000"/>`;
      if (side === 'right') {
        const x = W + 1.5 + off;
        const hit = P ? `<rect x="${f(x - 1)}" y="${f(y - pt * 0.8)}" width="${f(gw + 4 + tw)}" height="${f(pt * 1.6)}" fill="transparent"/>` : '';
        els.push(ed(attrs, hit + mark(x, 1) + (label ? textEl(label, x + gw + 2, y + pt * 0.35, pt, 'start') : '')));
        grow(W, y - pt, x + gw + 2 + tw, y + pt);
        reach.right = Math.max(reach.right, 1.5 + off + gw + 2 + tw);
        occ.right.push({ y0: y - pt * 0.7, y1: y + pt * 0.7, ext: 1.5 + off + gw + 2 + tw });
      } else {
        const x = -1.5 - off;
        const hit = P ? `<rect x="${f(x - gw - 3 - tw)}" y="${f(y - pt * 0.8)}" width="${f(gw + 4 + tw)}" height="${f(pt * 1.6)}" fill="transparent"/>` : '';
        els.push(ed(attrs, hit + mark(x, -1) + (label ? textEl(label, x - gw - 2, y + pt * 0.35, pt, 'end') : '')));
        grow(x - gw - 2 - tw, y - pt, 0, y + pt);
        reach.left = Math.max(reach.left, 1.5 + off + gw + 2 + tw);
        occ.left.push({ y0: y - pt * 0.7, y1: y + pt * 0.7, ext: 1.5 + off + gw + 2 + tw });
      }
    });

    // ---- side brackets: a vertical bar spanning a size range (smear, (Ub)n, dimer …) ----
    const brackets = (S.brackets || []).filter(b => b.y2 > b.y1);
    brackets.forEach((b, k) => {
      const side = b.side || defSide, y1 = b.y1 * sc, y2 = b.y2 * sc;
      const label = b.text || (P ? G.L('点击输入', 'Click to type') : '');
      const tw = label ? measure(label, pt) : 0, tk = pt * 0.45;
      // clear of whatever already sits on that side at these heights (marker labels, arrows, brackets)
      let off = 2.5;
      occ[side].filter(o => !(y2 < o.y0 - pt * 0.3 || y1 > o.y1 + pt * 0.3)).forEach(o => { off = Math.max(off, o.ext + 2.5); });
      const dir = side === 'right' ? 1 : -1, xb = (side === 'right' ? W : 0) + dir * (off + tk);
      const attrs = `data-edit="bracket" data-k="${b.k != null ? b.k : k}"`;
      const path = `M${f(xb - dir * tk)},${f(y1)} L${f(xb)},${f(y1)} L${f(xb)},${f(y2)} L${f(xb - dir * tk)},${f(y2)}`;
      const ty = (y1 + y2) / 2 + pt * 0.35, tx = xb + dir * 2;
      const hit = P ? `<rect x="${f(Math.min(xb - dir * tk, tx + dir * tw) - 1)}" y="${f(y1 - 1)}" width="${f(tk + 2 + tw + 2)}" height="${f(y2 - y1 + 2)}" fill="transparent"/>` : '';
      els.push(ed(attrs, hit + `<path d="${path}" fill="none" stroke="#000" stroke-width="${f(lw)}"/>` +
        (label ? textEl(label, tx, ty, pt, side === 'right' ? 'start' : 'end', b.text ? '' : phStyle) : '')));
      const end = off + tk + 2 + tw;
      occ[side].push({ y0: y1, y1: y2, ext: end });
      if (side === 'right') { grow(W, y1, W + end, y2); reach.right = Math.max(reach.right, end); }
      else { grow(-end, y1, 0, y2); reach.left = Math.max(reach.left, end); }
    });

    // ---- region boxes on the gel, optionally enlarged beside the figure ----
    const darkBg = !!S.bright !== !!S.levels.invert;
    const boxCol = darkBg ? '#fff' : '#000';
    const boxes = (S.boxes || []);
    let insetY = 0;
    boxes.forEach((b, k) => {
      const x0 = gel.map(b.x) * sc, x1 = gel.map(b.x + b.w, 'end') * sc, y0 = b.y * sc, y1 = (b.y + b.h) * sc;
      const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
      const dash = b.dash !== false ? ` stroke-dasharray="${f(pt * 0.45)} ${f(pt * 0.3)}"` : '';
      const sw = f(Math.max(lw, 0.5));
      const attrs = `data-edit="box" data-k="${b.k != null ? b.k : k}"`;
      const label = b.text || '';
      // the label sits just above the box in the box colour; a box at the top edge of the gel takes
      // it inside, so it never runs into the lane names or the +/− rows above the gel
      const inside = y0 - pt * 1.3 < 0, ly = inside ? y0 + pt * 1.05 : y0 - pt * 0.3, lcol = boxCol;
      const lx = inside ? x0 + pt * 0.3 : x0;
      // in the preview only the frame is clickable, so clicks inside still reach the gel (arrow tool)
      const hitB = P ? `<rect x="${f(x0)}" y="${f(y0)}" width="${f(bw)}" height="${f(bh)}" fill="none" stroke="transparent" stroke-width="${f(pt * 0.9)}" pointer-events="stroke"/>` : '';
      els.push(ed(attrs, hitB + `<rect x="${f(x0)}" y="${f(y0)}" width="${f(bw)}" height="${f(bh)}" fill="none" stroke="${boxCol}" stroke-width="${sw}"${dash}/>` +
        (label ? textEl(label, lx, ly, pt, 'start', ` fill="${lcol}"`) : '')));
      const z = +b.zoom || 0;
      if (z >= 2) {
        // enlarged copy of the boxed region, right of everything, from the same raster (no resampling
        // in the file: the viewer scales it), framed the same way and carrying the same label
        let iw = bw * z, ih = bh * z;
        const maxH = Math.max(H, pt * 6);
        if (ih > maxH) { iw *= maxH / ih; ih = maxH; }
        const iy = Math.max(insetY, Math.min(y0, Math.max(0, H - ih)));
        // beside the gel, past only what occupies the right side at the inset's own heights
        let clear = 0;
        occ.right.filter(o => !(iy + ih < o.y0 - pt || iy - pt * 1.4 > o.y1 + pt)).forEach(o => { clear = Math.max(clear, o.ext); });
        const ix = W + clear + pt * 1.2;
        els.push(ed(attrs, `<svg x="${f(ix)}" y="${f(iy)}" width="${f(iw)}" height="${f(ih)}" viewBox="${f(x0)} ${f(y0)} ${f(bw)} ${f(bh)}" preserveAspectRatio="none" overflow="hidden">` +
          `<image x="0" y="0" width="${f(W)}" height="${f(H)}" preserveAspectRatio="none" href="${imgHref}" xlink:href="${imgHref}"/></svg>` +
          `<rect x="${f(ix)}" y="${f(iy)}" width="${f(iw)}" height="${f(ih)}" fill="none" stroke="#000" stroke-width="${sw}"${dash}/>` +
          (label ? textEl(label, ix, iy - pt * 0.3, pt, 'start') : '')));
        grow(ix, iy - (label ? pt * 1.3 : 0), ix + iw, iy + ih);
        insetY = iy + ih + pt * 1.6;
      }
    });

    // ---- side text: stain / antibody / exposure, vertical beside the gel or a line below it ----
    let belowY = Math.max(H, box.y1) + pt * 1.3;
    (S.labels || []).forEach((t, k) => {
      const text = t.text || (P ? G.L('点击输入文字', 'Click to type') : '');
      if (!text) return;
      const attrs = `data-edit="label" data-k="${t.k != null ? t.k : k}"`, extra = t.text ? '' : phStyle;
      const tw = measure(text, pt);
      if (t.pos === 'below') {
        els.push(ed(attrs, textEl(text, W / 2, belowY, pt, 'middle', extra)));
        grow(W / 2 - tw / 2, belowY - pt, W / 2 + tw / 2, belowY + pt * 0.3);
        belowY += pt * 1.3;
      } else if (t.pos === 'right') {
        const x = box.x1 + pt * 0.45;
        els.push(ed(attrs, `<g transform="translate(${f(x)},${f(H / 2)}) rotate(90)">${textEl(text, 0, 0, pt, 'middle', extra)}</g>`));
        grow(x, H / 2 - tw / 2, x + pt * 1.05, H / 2 + tw / 2);
      } else {
        const x = box.x0 - pt * 0.45;
        els.push(ed(attrs, `<g transform="translate(${f(x)},${f(H / 2)}) rotate(-90)">${textEl(text, 0, 0, pt, 'middle', extra)}</g>`));
        grow(x - pt * 1.05, H / 2 - tw / 2, x, H / 2 + tw / 2);
      }
    });

    // panel letter
    if (st.panelLetter) {
      const px = box.x0 - 2, py = box.y0 - 1;
      els.push(textEl(st.panelLetter, px, py + st.panelPt, st.panelPt, 'end', ' font-weight="bold"'));
      grow(px - measure(st.panelLetter, st.panelPt, true), py, px, py + st.panelPt);
    }

    const m = 2;
    const vx = box.x0 - m, vy = box.y0 - m, vw = box.x1 - box.x0 + 2 * m, vh = box.y1 - box.y0 + 2 * m;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${f(vw / MM)}mm" height="${f(vh / MM)}mm" viewBox="${f(vx)} ${f(vy)} ${f(vw)} ${f(vh)}" ` +
      `font-family="${FONT}" fill="#000">` +
      `<rect x="${f(vx)}" y="${f(vy)}" width="${f(vw)}" height="${f(vh)}" fill="#fff"/>` +
      els.join('') + `</svg>`;
    return { svg, w: vw, h: vh, angle, warnings, overlaps, scale: sc, vx, vy, gelW: W, gelH: H };
  }

  G.Render = { build, composeGel, measure, MM, laneBounds };
})(window);
