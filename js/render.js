/* Figure renderer: project state -> publication SVG (units = pt, 1 pt = 1/72 in).
 * Gel image is embedded as a raster; every label, line and tick is vector.
 */
(function (G) {
  'use strict';
  const MM = 72 / 25.4;
  // Names only: use installed system fonts, never download or embed font files. Keep this allowlist
  // shared by canvas measurement, SVG, PPTX and imported styles (which must not inject CSS/XML).
  const FONTS = Object.freeze({
    Arial: 'Arial, Helvetica, sans-serif',
    'Times New Roman': "'Times New Roman', Times, serif",
    Helvetica: 'Helvetica, Arial, sans-serif',
    Calibri: 'Calibri, Arial, sans-serif',
    Cambria: "Cambria, 'Times New Roman', serif"
  });
  const fontName = name => typeof name === 'string' && Object.prototype.hasOwnProperty.call(FONTS, name) ? name : 'Arial';
  const fontStack = name => FONTS[fontName(name)];
  // Imported colours are tokens, never arbitrary CSS/XML. Default preserves dark-gel box contrast.
  const annotationColor = (value, fallback = '#000') => value === 'red' ? '#d32f2f' : fallback;

  const mctx = document.createElement('canvas').getContext('2d');
  // label markup: *italic* segments
  function parseRuns(text) {
    const parts = String(text).split('*');
    return parts.map((t, i) => ({ t, it: i % 2 === 1 })).filter(r => r.t.length);
  }
  function measureText(text, pt, bold, family) {
    let w = 0;
    for (const r of parseRuns(text)) {
      mctx.font = `${r.it ? 'italic ' : ''}${bold ? 'bold ' : ''}${pt * 4}px ${fontStack(family)}`;
      w += mctx.measureText(r.t).width / 4;
    }
    return w;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  const PH_FILL = '#b4bcc6';   // grey placeholders in the preview (never exported)
  let usedMin = Infinity;      // smallest font size actually printed in the current build (pre-flight check)
  function textEl(text, x, y, pt, anchor, extra) {
    const runs = parseRuns(text).map(r => r.it ? `<tspan font-style="italic">${esc(r.t)}</tspan>` : esc(r.t)).join('');
    if (!(extra || '').includes(PH_FILL) && String(text).trim()) usedMin = Math.min(usedMin, pt);
    return `<text x="${f(x)}" y="${f(y)}" font-size="${f(pt)}" text-anchor="${anchor}"${extra || ''}>${runs}</text>`;
  }
  function nameMetrics(lane,pt,family,italic){
    let width=0,ascent=0,descent=0,left=0,right=0;
    const runs=G.NameText.runs(lane).map(r=>{
      const size=r.script?pt*.72:pt,shift=r.script==='sup'?-pt*.4:r.script==='sub'?pt*.22:0,it=r.italic??italic;
      mctx.font=`${it?'italic ':''}${size*4}px ${fontStack(family)}`;const m=mctx.measureText(r.text),w=m.width/4;
      left=Math.min(left,width-(m.actualBoundingBoxLeft||0)/4);right=Math.max(right,width+(m.actualBoundingBoxRight||m.width)/4);
      ascent=Math.max(ascent,(m.actualBoundingBoxAscent||size*4*.85)/4-shift);
      descent=Math.max(descent,(m.actualBoundingBoxDescent||0)/4+shift);width+=w;
      return {...r,pt:size,shift,italic:it};
    });return {runs,width,ascent,descent,left,right:Math.max(right,width)};
  }
  function nameTextEl(metrics,x,y,pt,anchor,extra){
    let prev=0;
    const text=metrics.runs.map(r=>{
      const dy=r.shift-prev;prev=r.shift;usedMin=Math.min(usedMin,r.pt);
      // dy keeps one horizontal text chunk/anchor. PPTX uses the semantic baseline offset too.
      return `<tspan font-size="${f(r.pt)}" font-style="${r.italic?'italic':'normal'}"${r.color==='red'?' fill="'+annotationColor(r.color)+'"':''} dy="${f(dy)}" data-name-baseline="${f(-r.shift)}">${esc(r.text)}</tspan>`;
    }).join('');
    return `<text data-lane-name="1" x="${f(x)}" y="${f(y)}" font-size="${f(pt)}" text-anchor="${anchor}"${extra||''}>${text}</text>`;
  }
  function f(v) { return (Math.round(v * 100) / 100).toString(); }

  // ---- multi-line labels ----
  const LEAD = 1.18;   // line spacing, × font size
  // several lines whose last baseline is y (they stack upwards from the line they label)
  function textLines(lines, x, y, pt, anchor, extra) {
    // Keep the semantic paragraph for editable exports; this group has no visual effect in SVG.
    return '<g data-pptx-lines="1">' + lines.map((t, i) => textEl(t, x, y - (lines.length - 1 - i) * pt * LEAD, pt, anchor, extra)).join('') + '</g>';
  }
  /* Break a label into lines no wider than maxW (pt). Typed line breaks (\n) are kept. Chinese /
   * Japanese characters may break anywhere, other words after a space, "-" or "/". *italic* runs are
   * closed at the end of a line and reopened on the next, so every line renders on its own. */
  const CJK = '\\u2E80-\\u9FFF\\uF900-\\uFAFF\\uFF00-\\uFFEF\\u3000-\\u303F';
  const TOKENS = new RegExp(`\\*|[${CJK}]|\\s+|[^\\s*${CJK}]+?[-/]|[^\\s*${CJK}]+`, 'g');
  function wrapText(text, pt, maxW, family) {
    const out = [];
    let it = false;
    String(text).split('\n').forEach(par => {
      let startIt = it, cur = '';
      const line = (s, endIt) => (startIt ? '*' : '') + s.replace(/\s+$/, '') + (endIt ? '*' : '');
      for (const t of par.match(TOKENS) || []) {
        if (t === '*') { cur += t; it = !it; continue; }
        if (cur.trim() && measureText(line(cur + t, it), pt, false, family) > maxW) {
          out.push(line(cur, it));
          startIt = it;
          cur = /^\s+$/.test(t) ? '' : t;
        } else cur += t;
      }
      out.push(line(cur, it));
    });
    return out.filter((l, i, a) => l.replace(/\*/g, '').trim() || a.length === 1);
  }
  // as few lines as wrapText needs, but evened out: "仕达酱 / 离开" rather than "仕达酱离 / 开"
  function balancedWrap(text, pt, maxW, family) {
    const first = wrapText(text, pt, maxW, family);
    if (first.length < 2) return first;
    let lo = maxW * 0.2, hi = maxW, best = first;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2, l = wrapText(text, pt, mid, family);
      if (l.length <= first.length) { hi = mid; best = l; } else lo = mid;
    }
    return best;
  }

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

  function autoAngle(labels, pitchPt, pt, family) {
    const maxW = Math.max(0, ...labels.map(t => typeof t==='object'?t.width:measureText(t, pt, false, family)));
    if (maxW <= pitchPt * 0.9) return 0;
    if (pitchPt >= pt * 1.6) return 45;
    return 90;
  }
  function labelAngle(value) {
    if(value==null||value==='auto'||typeof value!=='number'&&typeof value!=='string'||String(value).trim()==='')return 'auto';
    const n=Number(value);return Number.isFinite(n)?String(Math.round(Math.max(0,Math.min(90,n)))):'auto';
  }

  /* Stack group lines into tiers: a group goes to the lowest tier where neither its line nor its text
   * touches another group's (narrow groups first, so they sit nearest the gel). Using the text's real
   * width — not just the lanes spanned — is what keeps long labels from running into each other. */
  function groupTiers(items, pad) {
    const tiers = [];
    items.map((o, i) => i).sort((p, q) => (items[p].x1 - items[p].x0) - (items[q].x1 - items[q].x0)).forEach(i => {
      const o = items[i];
      let t = 0;
      while ((tiers[t] || []).some(q => !(o.ext1 + pad < q.ext0 || o.ext0 - pad > q.ext1))) t++;
      (tiers[t] = tiers[t] || []).push(o);
      o.tier = t;
    });
    return tiers;
  }

  /* Build SVG. imgHref = data URL / blob URL of composed gel raster. Returns {svg, w, h, warnings} */
  function build(S, gel, imgHref) {
    usedMin = Infinity;
    // per-item sizes: an item's own pt wins, then the row-wide size (lane names, marker labels), then the figure font
    const st = S.style, pt = st.fontPt, lw = st.lineWidthPt;
    const family = fontName(st.fontFamily), FONT = fontStack(family);
    const measure = (text, size, bold) => measureText(text, size, bold, family);
    const vertical = (text, size) => {
      let ascent = 0, descent = 0;
      for (const r of parseRuns(text)) {
        mctx.font = `${r.it ? 'italic ' : ''}${size * 4}px ${FONT}`;
        const m = mctx.measureText(r.t);
        ascent = Math.max(ascent, Number.isFinite(m.fontBoundingBoxAscent) ? m.fontBoundingBoxAscent / 4 : Math.max((m.actualBoundingBoxAscent || 0) / 4, size * 0.85));
        descent = Math.max(descent, Number.isFinite(m.fontBoundingBoxDescent) ? m.fontBoundingBoxDescent / 4 : Math.max((m.actualBoundingBoxDescent || 0) / 4, size * 0.45));
      }
      return { ascent, descent };
    };
    const lp = st.lanePt || pt, mp = st.markerPt || pt;
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

    // Units belong to the marker scale, not to the lane-name/condition table. Place them just below
    // the gel's top edge, in the side margin. This keeps the condition table close to the image
    // without spending an empty row on the heading. Crop-edge values may limit the space available.
    const markers = (S.markers || []).filter(mk => mk.bands && mk.bands.length && S.lanes[mk.lane]);
    const sides = markers.map(mk => mk.side !== 'auto' ? mk.side : (S.lanes[mk.lane].x < S.crop.w / 2 ? 'left' : 'right'));
    if (markers.length === 2 && sides[0] === sides[1]) {
      if (markers[0].side === 'auto') sides[0] = 'left';
      if (markers[1].side === 'auto') sides[1] = 'right';
    }
    const shownBands = mk => mk.bands.filter(b => b.show && b.y != null && b.y >= 0 && b.y <= Hpx);
    const unitMarkers = st.unitHeader ? markers.filter(mk => mk.unit !== 'auto' && shownBands(mk).length) : [];
    const hasUnits = unitMarkers.length > 0;
    const firstBandY = hasUnits ? Math.min(...unitMarkers.flatMap(mk => shownBands(mk).map(b => b.y * sc))) : Infinity;
    const unitRowY = Math.min(mp + 1, firstBandY - mp * 1.2);

    // ---- top stack (y grows negative) ----
    let yTop = -st.labelGapPt;
    // lane numbers
    if (st.laneNumbers && vis.length) {
      // default: the well number, so the figure matches the notebook even after lanes are cut
      let n = 0;
      vis.forEach(o => { n++; const num = st.laneNumberMode === 'seq' ? n : (o.l.src != null ? o.l.src : o.i) + 1; els.push(textEl(String(num), X(o.i), yTop, pt, 'middle')); });
      yTop -= pt * 1.25;
    }
    // condition rows (+/- matrix), bottom row closest to the gel
    // preview mode: editable elements carry data-edit, empty slots show grey placeholders
    const P = !!S.preview;
    const ed = (attrs, inner) => P ? `<g ${attrs} class="ed">${inner}</g>` : inner;
    const phStyle = ` fill="${PH_FILL}"`;
    const conds = (S.conditions || []).map((c, r) => Object.assign({ r }, c)).filter(c => P || c.name || c.values.some(v => v));
    const leftUnits = unitMarkers.filter(mk => sides[markers.indexOf(mk)] === 'left');

    /* Lane names usually sit directly above the gel and condition rows are stacked above THEM, so
     * adding a row never pushes the names (and the marker lane's label) away from the image. Journals
     * that put the condition matrix nearest the gel can switch back with laneNamesAboveConditions. */
    const namesFirst = st.laneNamesAboveConditions !== true;
    let rowNameX = -st.labelGapPt * 2;
    /* In the legacy order the condition rows sit directly on the gel, where their left-hand names can
     * collide with the marker unit header anchored in the side margin. Measure and shift only then. */
    const shiftConditionsForUnits = () => {
      if (!leftUnits.length || !conds.length) return;
      // Font substitutions have different descenders (notably Firefox/Linux). Measure them rather
      // than assuming a fixed fraction of the point size; shift only named rows that would collide.
      const headerTop = unitRowY - Math.max(...leftUnits.map(mk => vertical(`(${mk.unit === 'kDa' ? 'kDa' : mk.unit === 'kb' ? 'kb' : 'bp'})`, mp).ascent));
      let cy = yTop, shift = 0;
      for (let k = conds.length - 1; k >= 0; k--) {
        const c = conds[k], cp = c.pt || pt, name = c.name || (P ? G.L('条件', 'Condition') : '');
        // A small optical gap scales with the larger label, also covering native-scale SVG hinting.
        if (name) shift = Math.max(shift, cy + vertical(name, cp).descent + 0.5 + Math.max(mp, cp) / 8 - headerTop);
        cy -= cp * 1.3;
      }
      yTop -= shift;
    };
    // the lane-name block is emitted by a function so the two orders share one implementation
    // `angle` is the angle actually used for shared labels; the slider reads it back via fig.angle
    let angle = 0;
    const drawLaneNames = () => {
      const names = vis.map(o => o.l.name || (P ? String((o.l.src != null ? o.l.src : o.i) + 1) : ''));
      if (!names.some(t => t.trim())) return;
      const chosen = labelAngle(st.labelAngle);
      const labels = vis.map((o, k) => {
        const own = G.NameText.style(o.l.nameStyle), size = own.pt || lp;
        const metrics = nameMetrics(o.l.name ? o.l : { name: names[k] }, size, family, !!st.laneItalic);
        return { own, size, metrics };
      });
      const angle0 = chosen === 'auto' ? autoAngle(labels.map(l => l.metrics), pitch, lp, family) : +chosen;
      angle = angle0;
      const extraDescent = Math.max(0, ...labels.map(l => l.metrics.runs.some(r => r.script) ? l.metrics.descent - l.size * .2 : 0));
      const baseline = yTop - extraDescent;
      let hMax = lp, anyTilt = false, wideHorizontal = false, narrowTilt = false;
      vis.forEach((o, vi) => {
        const t = names[vi];
        if (!t.trim()) return;
        const extra = o.l.name ? '' : phStyle, src = o.l.src != null ? o.l.src : o.i;
        const { own, size, metrics } = labels[vi], tw = metrics.width, x = X(o.i);
        const tilt = own.angle == null ? angle0 : own.angle === 'auto' ? autoAngle([metrics], pitch, size, family) : +own.angle;
        if (o.l.name && tilt === 0 && tw > pitch * 1.02) wideHorizontal = true;
        if (o.l.name && tilt !== 0 && pitch < size * 1.15) narrowTilt = true;
        const rad = tilt * Math.PI / 180, sn = Math.sin(rad), cs = Math.cos(rad);
        if (tilt === 0 || !o.l.name) {
          // placeholders stay horizontal: a rotated lone digit reads like a stray glyph
          els.push(ed(`data-edit="lane" data-src="${src}"`, o.l.name ? nameTextEl(metrics, x, baseline, size, 'middle', extra) : textEl(t, x, baseline, size, 'middle', extra)));
          grow(x - tw / 2 + metrics.left, baseline - Math.max(size, metrics.ascent), x - tw / 2 + metrics.right, baseline + metrics.descent);
          hMax = Math.max(hMax, size, metrics.ascent);
        } else {
          anyTilt = true;
          // rotated text grows up-right from the lane centre; offset so the text's centre line sits on the lane
          const ox = x + size * .35 * sn, oy = baseline;
          els.push(ed(`data-edit="lane" data-src="${src}"`, `<g transform="translate(${f(ox)},${f(oy)}) rotate(${-tilt})">${nameTextEl(metrics, 0, 0, size, 'start', extra)}</g>`));
          hMax = Math.max(hMax, tw * sn + size * cs * .8, tw * sn + metrics.ascent * cs);
          for (const xx of [metrics.left, metrics.right]) for (const yy of [-Math.max(size, metrics.ascent), metrics.descent]) { const gx = ox + xx * cs + yy * sn, gy = oy - xx * sn + yy * cs; grow(gx, gy, gx, gy); }
        }
      });
      if (narrowTilt) overlap(G.L('泳道过窄：即使 90° 标签也会重叠，请减小字号或增大图宽', 'Lanes are too narrow: even 90° labels overlap; use a smaller font or a wider figure'));
      if (wideHorizontal) overlap(G.L('水平泳道标签可能重叠，请调节该泳道的角度、字号或图宽', 'Horizontal lane labels may overlap; adjust the lane angle, font size or figure width'));
      yTop = baseline - (anyTilt ? hMax + lp * .35 : Math.max(lp, ...labels.map(l => Math.max(l.size, l.metrics.ascent))) * 1.3);
    };
    const drawConditions = () => {
      for (let k = conds.length - 1; k >= 0; k--) {
        const c = conds[k], cp = c.pt || pt;
        vis.forEach(o => {
          const v = c.values[o.i], src = o.l.src != null ? o.l.src : o.i;
          // a wide invisible hit area makes each cell easy to click in the preview
          const hit = P ? `<rect x="${f(X(o.i) - Math.min(pitch, 20) * 0.45)}" y="${f(yTop - cp)}" width="${f(Math.min(pitch, 20) * 0.9)}" height="${f(cp * 1.25)}" fill="transparent"/>` : '';
          if (v) els.push(ed(`data-edit="cond" data-r="${c.r}" data-src="${src}"`, hit + textEl(v, X(o.i), yTop, cp, 'middle', ` fill="${annotationColor(c.color)}"`)));
          else if (P) els.push(ed(`data-edit="cond" data-r="${c.r}" data-src="${src}"`, hit + textEl('·', X(o.i), yTop, cp, 'middle', phStyle)));
        });
        const nm = c.name || (P ? G.L('条件', 'Condition') : '');
        if (nm) {
          els.push(ed(`data-edit="condname" data-r="${c.r}"`, textEl(nm, rowNameX, yTop, cp, 'end', c.name ? ` fill="${annotationColor(c.color)}"` : phStyle)));
          grow(rowNameX - measure(nm, cp), yTop - cp, 0, yTop);
        }
        yTop -= cp * 1.3;
      }
    };
    if (namesFirst) { drawLaneNames(); shiftConditionsForUnits(); drawConditions(); }
    else { shiftConditionsForUnits(); drawConditions(); drawLaneNames(); }
    // groups: line spanning lanes + shared text above
    const groups = (S.groups || []).filter(g => g.from != null && g.to != null && S.lanes[g.from] && S.lanes[g.to]);
    if (groups.length) {
      // a label wider than its line: wrap it to the line (default), shrink it (not below minFontPt),
      // or keep one line; whatever still sticks out is moved up a tier instead of overlapping
      const fit = st.groupFit || 'wrap', minPt = st.minFontPt || 5;
      const half = Math.min(pitch, W) * 0.42;
      const items = groups.map((g, k) => {
        const a = Math.min(g.from, g.to), b = Math.max(g.from, g.to);
        // one line piece per spliced segment: a group line must never bridge a splice gap
        const runs = [];
        gel.segs.forEach(sg => {
          const ins = (sg.lanes || []).filter(i => i >= a && i <= b && !S.lanes[i].hidden);
          if (ins.length) runs.push([X(ins[0]) - half, X(ins[ins.length - 1]) + half]);
        });
        if (!runs.length) runs.push([X(a) - half, X(b) + half]);
        const x0 = runs[0][0], x1 = runs[runs.length - 1][1], cx = (x0 + x1) / 2;
        const gp = g.pt || pt, text = g.text || (P ? G.L('点击输入', 'Click to type') : '');
        let size = gp, lines = text ? String(text).split('\n') : [];
        const widest = () => Math.max(0, ...lines.map(t => measure(t, size)));
        const room = Math.max(x1 - x0, gp * 2);
        if (g.text && widest() > room) {
          if (fit === 'wrap') lines = balancedWrap(g.text, size, room, family);
          else if (fit === 'shrink') size = Math.max(Math.min(minPt, gp), gp * room / widest());
        }
        const tw = widest();
        // from the line up to the top of the text
        const h = lines.length ? size * 0.3 + (lines.length - 1) * size * LEAD + size : pt;
        return { g, k, runs, x0, x1, cx, size, lines, tw, h, placeholder: !g.text, ext0: Math.min(x0, cx - tw / 2), ext1: Math.max(x1, cx + tw / 2) };
      });
      // neighbouring groups' lines are 0.16 pitch apart by design: a small margin keeps them on one tier
      const tiers = groupTiers(items, pt * 0.25);
      const tierH = tiers.map(ts => Math.max(pt * 1.7, ...ts.map(o => o.h + pt * 0.4)));
      const base = yTop - pt * 0.15;
      const tierY = t => base - tierH.slice(0, t).reduce((s, v) => s + v, 0);
      items.forEach(o => {
        const y = tierY(o.tier);
        const col = annotationColor(o.g.color);
        o.runs.forEach(([r0, r1]) => {
          els.push(`<line x1="${f(r0)}" y1="${f(y)}" x2="${f(r1)}" y2="${f(y)}" stroke="${col}" stroke-width="${f(lw)}"/>`);
          if (st.groupTicks) {
            els.push(`<line x1="${f(r0)}" y1="${f(y)}" x2="${f(r0)}" y2="${f(y + pt * 0.35)}" stroke="${col}" stroke-width="${f(lw)}"/>`);
            els.push(`<line x1="${f(r1)}" y1="${f(y)}" x2="${f(r1)}" y2="${f(y + pt * 0.35)}" stroke="${col}" stroke-width="${f(lw)}"/>`);
          }
        });
        if (o.lines.length) {
          els.push(ed(`data-edit="group" data-k="${o.g.k != null ? o.g.k : o.k}"`, textLines(o.lines, o.cx, y - o.size * 0.3, o.size, 'middle', o.placeholder ? phStyle : ` fill="${col}"`)));
          grow(o.cx - o.tw / 2, y - o.h, o.cx + o.tw / 2, y);
        }
        grow(o.x0, y - pt, o.x1, y);
      });
      yTop = tierY(tiers.length);
    }

    // ---- marker size labels (one column per marker; left/right of the gel) ----
    const tick = st.tickLenPt;
    const extent = { left: 0, right: 0 };   // how far labels already reach beyond the gel edge
    markers.forEach((mk, mi) => {
      const shown = shownBands(mk);
      // Hidden/out-of-crop labels still calibrate sizes, but must not reserve an invisible column.
      if(!shown.length)return;
      const side = sides[mi];
      const off = extent[side] ? extent[side] + 3 : 0;  // a second column on the same side sits further out
      let maxTw = 0;
      shown.forEach(b => {
        const col = annotationColor(b.color, annotationColor(mk.color));
        const attrs = `data-edit="marker" data-marker="${mk.src != null ? mk.src : mi}" data-band="${mk.bands.indexOf(b)}"`;
        const y = b.y * sc, label = G.Ladders.fmt(b.bp, mk.unit);
        const tw = measure(label, mp); maxTw = Math.max(maxTw, tw);
        if (side === 'left') {
          if (!off) els.push(`<line x1="${f(-tick - 1)}" y1="${f(y)}" x2="${f(-1)}" y2="${f(y)}" stroke="${col}" stroke-width="${f(lw)}"/>`);
          els.push(ed(attrs, textEl(label, -tick - 2.5 - off, y + mp * 0.35, mp, 'end', ` fill="${col}"`)));
          grow(-tick - 2.5 - off - tw, y - mp, 0, y + mp);
        } else {
          if (!off) els.push(`<line x1="${f(W + 1)}" y1="${f(y)}" x2="${f(W + 1 + tick)}" y2="${f(y)}" stroke="${col}" stroke-width="${f(lw)}"/>`);
          els.push(ed(attrs, textEl(label, W + tick + 2.5 + off, y + mp * 0.35, mp, 'start', ` fill="${col}"`)));
          grow(W, y - mp, W + tick + 2.5 + off + tw, y + mp);
        }
      });
      for (let k = 1; k < shown.length; k++) if ((shown[k].y - shown[k - 1].y) * sc < mp * 0.95) {
        overlap(G.L('部分 Marker 标签间距过小会重叠，可点"精简标签"或手动取消勾选', 'Some marker labels are too close and overlap; click "Thin labels" or untick some')); break;
      }
      // the unit header is as wide as the unit actually in use: "(kDa)" is wider than "(bp)"
      const unitText = st.unitHeader && mk.unit !== 'auto' ? `(${mk.unit === 'kb' ? 'kb' : mk.unit === 'kDa' ? 'kDa' : 'bp'})` : '';
      const unitW = unitText ? measure(unitText, mp) : 0;
      if (unitText && shown.length) {
        const ux = side === 'left' ? -tick - 2.5 - off : W + tick + 2.5 + off;
        const uy = unitRowY;
        els.push(ed(`data-edit="marker" data-marker="${mk.src != null ? mk.src : mi}" data-band="-1"`, textEl(unitText, ux, uy, mp, side === 'left' ? 'end' : 'start', ` fill="${annotationColor(mk.color)}"`)));
        grow(side === 'left' ? ux - unitW : ux, uy - mp * 1.2, side === 'left' ? 0 : ux + unitW, uy + mp * 0.3);
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
      const col = annotationColor(a.color);
      const y = a.y * sc, side = a.side || defSide, pt = a.pt || st.fontPt;   // this arrow's own size
      const s = pt * 0.75, label = a.label != null ? a.label : (a.text || '');
      const off = extent[side] ? extent[side] + 2 : 0;
      const attrs = `data-edit="arrow" data-k="${a.k != null ? a.k : k}"`;
      const glyph = SYM[a.sym];
      const gw = glyph ? measure(glyph, pt * 1.15) : s * 1.3;   // width of the mark itself
      const tw = measure(label, pt);
      // written out directly: textEl would read "*" as the start of italic markup and drop it
      const mark = (x, dir) => glyph
        ? `<text x="${f(x + dir * gw / 2)}" y="${f(y + pt * (a.sym === 'star' ? 0.62 : 0.4))}" font-size="${f(pt * 1.15)}" text-anchor="middle" fill="${col}">${esc(glyph)}</text>`
        : `<path d="M${f(x)},${f(y)} L${f(x + dir * s * 1.3)},${f(y - s * 0.6)} L${f(x + dir * s * 1.3)},${f(y + s * 0.6)} Z" fill="${col}"/>`;
      if (side === 'right') {
        const x = W + 1.5 + off;
        const hit = P ? `<rect x="${f(x - 1)}" y="${f(y - pt * 0.8)}" width="${f(gw + 4 + tw)}" height="${f(pt * 1.6)}" fill="transparent"/>` : '';
        els.push(ed(attrs, hit + mark(x, 1) + (label ? textEl(label, x + gw + 2, y + pt * 0.35, pt, 'start', ` fill="${col}"`) : '')));
        grow(W, y - pt, x + gw + 2 + tw, y + pt);
        reach.right = Math.max(reach.right, 1.5 + off + gw + 2 + tw);
        occ.right.push({ y0: y - pt * 0.7, y1: y + pt * 0.7, ext: 1.5 + off + gw + 2 + tw });
      } else {
        const x = -1.5 - off;
        const hit = P ? `<rect x="${f(x - gw - 3 - tw)}" y="${f(y - pt * 0.8)}" width="${f(gw + 4 + tw)}" height="${f(pt * 1.6)}" fill="transparent"/>` : '';
        els.push(ed(attrs, hit + mark(x, -1) + (label ? textEl(label, x - gw - 2, y + pt * 0.35, pt, 'end', ` fill="${col}"`) : '')));
        grow(x - gw - 2 - tw, y - pt, 0, y + pt);
        reach.left = Math.max(reach.left, 1.5 + off + gw + 2 + tw);
        occ.left.push({ y0: y - pt * 0.7, y1: y + pt * 0.7, ext: 1.5 + off + gw + 2 + tw });
      }
    });

    // ---- side brackets: a vertical bar spanning a size range (smear, (Ub)n, dimer …) ----
    const brackets = (S.brackets || []).filter(b => b.y2 > b.y1);
    brackets.forEach((b, k) => {
      const side = b.side || defSide, y1 = b.y1 * sc, y2 = b.y2 * sc, bp = b.pt || pt;
      const label = b.text || (P ? G.L('点击输入', 'Click to type') : '');
      const tw = label ? measure(label, bp) : 0, tk = pt * 0.45;
      // clear of whatever already sits on that side at these heights (marker labels, arrows, brackets)
      let off = 2.5;
      occ[side].filter(o => !(y2 < o.y0 - pt * 0.3 || y1 > o.y1 + pt * 0.3)).forEach(o => { off = Math.max(off, o.ext + 2.5); });
      const dir = side === 'right' ? 1 : -1, xb = (side === 'right' ? W : 0) + dir * (off + tk);
      const attrs = `data-edit="bracket" data-k="${b.k != null ? b.k : k}"`;
      const path = `M${f(xb - dir * tk)},${f(y1)} L${f(xb)},${f(y1)} L${f(xb)},${f(y2)} L${f(xb - dir * tk)},${f(y2)}`;
      const ty = (y1 + y2) / 2 + bp * 0.35, tx = xb + dir * 2;
      const hit = P ? `<rect x="${f(Math.min(xb - dir * tk, tx + dir * tw) - 1)}" y="${f(y1 - 1)}" width="${f(tk + 2 + tw + 2)}" height="${f(y2 - y1 + 2)}" fill="transparent"/>` : '';
      els.push(ed(attrs, hit + `<path d="${path}" fill="none" stroke="${annotationColor(b.color)}" stroke-width="${f(lw)}"/>` +
        (label ? textEl(label, tx, ty, bp, side === 'right' ? 'start' : 'end', b.text ? ` fill="${annotationColor(b.color)}"` : phStyle) : '')));
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
      const label = b.text || '', bp = b.pt || pt;
      // the label sits just above the box in the box colour; a box at the top edge of the gel takes
      // it inside, so it never runs into the lane names or the +/− rows above the gel
      const inside = y0 - bp * 1.3 < 0, ly = inside ? y0 + bp * 1.05 : y0 - bp * 0.3, col = annotationColor(b.color, boxCol), lcol = col;
      const lx = inside ? x0 + bp * 0.3 : x0;
      // in the preview only the frame is clickable, so clicks inside still reach the gel (arrow tool)
      const hitB = P ? `<rect x="${f(x0)}" y="${f(y0)}" width="${f(bw)}" height="${f(bh)}" fill="none" stroke="transparent" stroke-width="${f(pt * 0.9)}" pointer-events="stroke"/>` : '';
      els.push(ed(attrs, hitB + `<rect x="${f(x0)}" y="${f(y0)}" width="${f(bw)}" height="${f(bh)}" fill="none" stroke="${col}" stroke-width="${sw}"${dash}/>` +
        (label ? textEl(label, lx, ly, bp, 'start', ` fill="${lcol}"`) : '')));
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
          `<rect x="${f(ix)}" y="${f(iy)}" width="${f(iw)}" height="${f(ih)}" fill="none" stroke="${annotationColor(b.color)}" stroke-width="${sw}"${dash}/>` +
          (label ? textEl(label, ix, iy - bp * 0.3, bp, 'start', ` fill="${annotationColor(b.color)}"`) : '')));
        grow(ix, iy - (label ? bp * 1.3 : 0), ix + iw, iy + ih);
        insetY = iy + ih + pt * 1.6;
      }
    });

    /* ---- side text: stain / antibody / exposure, vertical beside the gel or a line below it ----
     * `at` (0..1) moves the text along the gel edge: vertically for left/right, horizontally for
     * below. It is eased so the whole label stays on the gel, which also makes 0/0.5/1 read as
     * top/middle/bottom. Absent (every project written before this field) means centred. */
    let belowY = Math.max(H, box.y1) + pt * 1.3;
    const alongGel = (t, len, span) => {
      const v = t.at;
      const want = v != null && v !== '' && Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : 0.5;
      const half = span > 0 ? Math.min(0.5, len / span / 2) : 0;
      return half >= 0.5 ? 0.5 : half + want * (1 - 2 * half);
    };
    (S.labels || []).forEach((t, k) => {
      const text = t.text || (P ? G.L('点击输入文字', 'Click to type') : '');
      if (!text) return;
      const pt = t.pt || st.fontPt;   // this label's own size
      const attrs = `data-edit="label" data-k="${t.k != null ? t.k : k}"`, extra = t.text ? ` fill="${annotationColor(t.color)}"` : phStyle;
      const tw = measure(text, pt);
      if (t.pos === 'below') {
        const x = W * alongGel(t, tw, W);
        els.push(ed(attrs, textEl(text, x, belowY, pt, 'middle', extra)));
        grow(x - tw / 2, belowY - pt, x + tw / 2, belowY + pt * 0.3);
        belowY += pt * 1.3;
      } else if (t.pos === 'right') {
        const x = box.x1 + pt * 0.45, y = H * alongGel(t, tw, H);
        els.push(ed(attrs, `<g transform="translate(${f(x)},${f(y)}) rotate(90)">${textEl(text, 0, 0, pt, 'middle', extra)}</g>`));
        grow(x, y - tw / 2, x + pt * 1.05, y + tw / 2);
      } else {
        const x = box.x0 - pt * 0.45, y = H * alongGel(t, tw, H);
        els.push(ed(attrs, `<g transform="translate(${f(x)},${f(y)}) rotate(-90)">${textEl(text, 0, 0, pt, 'middle', extra)}</g>`));
        grow(x - pt * 1.05, y - tw / 2, x, y + tw / 2);
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
      `font-family="${esc(FONT)}" fill="#000">` +
      `<rect x="${f(vx)}" y="${f(vy)}" width="${f(vw)}" height="${f(vh)}" fill="#fff"/>` +
      els.join('') + `</svg>`;
    return { svg, w: vw, h: vh, angle, warnings, overlaps, scale: sc, vx, vy, gelW: W, gelH: H, minPt: usedMin === Infinity ? pt : usedMin, fontFamily: family };
  }

  G.Render = { build, composeGel, measure: measureText, wrapText, MM, laneBounds, fontName, fontStack, labelAngle, annotationColor, fontNames: Object.freeze(Object.keys(FONTS)) };
})(window);
