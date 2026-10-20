/* Image processing engine. Pure functions on {w, h, data: Float32Array} images.
 * All adjustments are non-destructive: the source image is never modified.
 */
(function (G) {
  'use strict';

  // ---------- basic helpers ----------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function percentiles(data, ps, step) {
    // histogram based, data assumed ~0..1
    const BINS = 65536;
    const hist = new Uint32Array(BINS);
    step = step || 1;
    let n = 0;
    for (let i = 0; i < data.length; i += step) {
      hist[clamp((data[i] * (BINS - 1)) | 0, 0, BINS - 1)]++; n++;
    }
    return ps.map(p => {
      const target = p / 100 * n;
      let acc = 0;
      for (let b = 0; b < BINS; b++) { acc += hist[b]; if (acc >= target) return b / (BINS - 1); }
      return 1;
    });
  }

  function gaussSmooth(arr, sigma) {
    if (sigma < 0.5) return Float32Array.from(arr);
    const r = Math.ceil(sigma * 3), k = new Float32Array(2 * r + 1);
    let s = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= s;
    const n = arr.length, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let j = -r; j <= r; j++) v += arr[clamp(i + j, 0, n - 1)] * k[j + r];
      out[i] = v;
    }
    return out;
  }

  // sliding window min (or max) over 1D array, window = 2r+1, O(n)
  function slide(arr, r, isMax) {
    const n = arr.length, out = new Float32Array(n), dq = new Int32Array(n);
    let h = 0, t = 0, j = 0;
    for (let i = 0; i < n; i++) {
      const hi = Math.min(n - 1, i + r);
      while (j <= hi) {
        while (t > h && (isMax ? arr[dq[t - 1]] <= arr[j] : arr[dq[t - 1]] >= arr[j])) t--;
        dq[t++] = j++;
      }
      while (dq[h] < i - r) h++;
      out[i] = arr[dq[h]];
    }
    return out;
  }

  // 1D baseline: rolling min followed by rolling max (morphological opening) then smoothing
  function baseline(arr, r) {
    return gaussSmooth(slide(slide(arr, r, false), r, true), Math.max(1, r / 3));
  }

  function downsample(img, maxDim) {
    const f = Math.max(1, Math.ceil(Math.max(img.w, img.h) / maxDim));
    if (f === 1) return { w: img.w, h: img.h, data: img.data, f: 1 };
    const w = Math.floor(img.w / f), h = Math.floor(img.h / f), d = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = 0; dy < f; dy++) {
        const row = (y * f + dy) * img.w + x * f;
        for (let dx = 0; dx < f; dx++) s += img.data[row + dx];
      }
      d[y * w + x] = s / (f * f);
    }
    return { w, h, data: d, f };
  }

  // ---------- geometry ----------
  // Rotate around image centre, same canvas size, edges clamped. Bilinear.
  function rotate(img, deg) {
    if (!deg) return img;
    const { w, h, data } = img, out = new Float32Array(w * h);
    const a = -deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    for (let y = 0; y < h; y++) {
      const dy = y - cy;
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        let sx = c * dx - s * dy + cx, sy = s * dx + c * dy + cy;
        sx = clamp(sx, 0, w - 1.001); sy = clamp(sy, 0, h - 1.001);
        const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, i = y0 * w + x0;
        out[y * w + x] = (data[i] * (1 - fx) + data[i + 1] * fx) * (1 - fy) + (data[i + w] * (1 - fx) + data[i + w + 1] * fx) * fy;
      }
    }
    return { w, h, data: out };
  }

  function cropImg(img, r) {
    const x0 = clamp(Math.round(r.x), 0, img.w - 1), y0 = clamp(Math.round(r.y), 0, img.h - 1);
    const w = clamp(Math.round(r.w), 1, img.w - x0), h = clamp(Math.round(r.h), 1, img.h - y0);
    const d = new Float32Array(w * h);
    for (let y = 0; y < h; y++) d.set(img.data.subarray((y0 + y) * img.w + x0, (y0 + y) * img.w + x0 + w), y * w);
    return { w, h, data: d, x0, y0 };
  }

  // ---------- intensity ----------
  // Bands bright on dark background (EtBr/SYBR, iBright default) or dark on light?
  function detectBright(img) {
    const [p05, p50, p995] = percentiles(img.data, [0.5, 50, 99.5], Math.max(1, (img.data.length / 400000) | 0));
    return (p995 - p50) >= (p50 - p05);
  }

  function autoLevels(img) {
    const [lo, hi] = percentiles(img.data, [0.05, 99.95], Math.max(1, (img.data.length / 1000000) | 0));
    return { black: lo, white: Math.max(hi, lo + 0.005) };
  }

  function saturation(img, satLevel) {
    let n = 0;
    for (let i = 0; i < img.data.length; i++) if (img.data[i] >= satLevel) n++;
    return n;
  }

  // Map to 8-bit grayscale RGBA. levels in raw domain; gamma applied after linear stretch.
  function toImageData(img, lv, out) {
    const n = img.w * img.h;
    const id = out || new ImageData(img.w, img.h);
    const px = id.data, lut = new Uint8ClampedArray(4096);
    for (let i = 0; i < 4096; i++) {
      let t = i / 4095;
      if (lv.gamma && lv.gamma !== 1) t = Math.pow(t, 1 / lv.gamma);
      if (lv.invert) t = 1 - t;
      lut[i] = Math.round(t * 255);
    }
    const lo = lv.black, sc = 4095 / Math.max(1e-6, lv.white - lv.black);
    for (let i = 0; i < n; i++) {
      let k = ((img.data[i] - lo) * sc) | 0;
      k = k < 0 ? 0 : k > 4095 ? 4095 : k;
      const v = lut[k], j = i * 4;
      px[j] = px[j + 1] = px[j + 2] = v; px[j + 3] = 255;
    }
    return id;
  }

  function signal(img, bright) {
    if (bright) return img;
    const d = new Float32Array(img.data.length);
    for (let i = 0; i < d.length; i++) d[i] = 1 - img.data[i];
    return { w: img.w, h: img.h, data: d };
  }

  // ---------- auto deskew ----------
  function deskew(img, bright) {
    const sm = signal(downsample(img, 800), bright);
    const { w, h, data } = sm, cx = (w - 1) / 2, cy = (h - 1) / 2;
    const med = percentiles(data, [50])[0];
    const sig = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) sig[i] = Math.max(0, data[i] - med);
    // sharpness of row/column projections after rotating by deg (bilinear sampling)
    const score = (deg) => {
      const a = -deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const col = new Float32Array(w), row = new Float32Array(h);
      for (let y = 0; y < h; y++) {
        const dy = y - cy;
        for (let x = 0; x < w; x++) {
          const dx = x - cx;
          const sx = c * dx - s * dy + cx, sy = s * dx + c * dy + cy;
          if (sx < 0 || sy < 0 || sx >= w - 1 || sy >= h - 1) continue;
          const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, i = y0 * w + x0;
          const v = (sig[i] * (1 - fx) + sig[i + 1] * fx) * (1 - fy) + (sig[i + w] * (1 - fx) + sig[i + w + 1] * fx) * fy;
          col[x] += v; row[y] += v;
        }
      }
      let e = 0;
      for (let i = 1; i < w; i++) e += (col[i] - col[i - 1]) ** 2 / h;
      for (let i = 1; i < h; i++) e += (row[i] - row[i - 1]) ** 2 / w;
      return e;
    };
    const search = (lo, hi, step) => {
      let best = lo, bestS = -1;
      const S = new Map();
      for (let d = lo; d <= hi + 1e-6; d += step) { const v = score(d); S.set(Math.round(d * 1000), v); if (v > bestS) { bestS = v; best = d; } }
      return { best, S };
    };
    // the correction that maximises projection sharpness is what rotate() needs
    let r = search(-15, 15, 1);
    r = search(r.best - 1, r.best + 1, 0.1);
    // parabolic sub-step refinement
    const b = r.best, s0 = r.S.get(Math.round((b - 0.1) * 1000)), s1 = r.S.get(Math.round(b * 1000)), s2 = r.S.get(Math.round((b + 0.1) * 1000));
    let best = b;
    if (s0 != null && s2 != null) { const den = s0 - 2 * s1 + s2; if (den < 0) best = b + 0.1 * 0.5 * (s0 - s2) / den; }
    return Math.round(best * 10) / 10;
  }

  // ---------- auto crop: find region containing bands / wells ----------
  function autoCrop(img, bright) {
    const sm = signal(downsample(img, 700), bright);
    const { w, h, data, f } = Object.assign({ f: 1 }, sm, { f: Math.max(1, Math.ceil(Math.max(img.w, img.h) / 700)) });
    // morphological top-hat (rows then columns) to remove gel/background gradient
    const r = Math.max(4, Math.round(Math.min(w, h) / 25));
    const open = new Float32Array(w * h);
    const tmp = new Float32Array(w * h);
    const line = new Float32Array(Math.max(w, h));
    for (let y = 0; y < h; y++) {
      const a = data.subarray(y * w, y * w + w);
      tmp.set(slide(a, r, false), y * w);
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) line[y] = tmp[y * w + x];
      const m = slide(slide(line.subarray(0, h), r, false), r, true);
      for (let y = 0; y < h; y++) open[y * w + x] = m[y];
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) line[x] = open[y * w + x];
      const m = slide(line.subarray(0, w), r, true);
      for (let x = 0; x < w; x++) tmp[y * w + x] = Math.max(0, data[y * w + x] - m[x]);
    }
    // ignore a thin frame at the image border (tray edges, vignetting artefacts)
    const bx = Math.round(w * 0.01), by = Math.round(h * 0.01);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < bx || y < by || x >= w - bx || y >= h - by) tmp[y * w + x] = 0;
    // remove long continuous horizontal structures (gel/tray edges, glare lines): bands never are,
    // because neighbouring lanes are separated by dark gaps
    const r2 = Math.max(4, Math.round(w / 25));
    for (let y = 0; y < h; y++) {
      const rowT = tmp.subarray(y * w, y * w + w);
      const o = slide(slide(rowT, r2, false), r2, true);
      for (let x = 0; x < w; x++) rowT[x] = Math.max(0, rowT[x] - o[x]);
    }
    // likewise long vertical structures (gel side edges) that run most of the image height
    const r3 = Math.max(8, Math.round(h * 0.3)), colT = new Float32Array(h);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) colT[y] = tmp[y * w + x];
      const o = slide(slide(colT, r3, false), r3, true);
      for (let y = 0; y < h; y++) tmp[y * w + x] = Math.max(0, colT[y] - o[y]);
    }
    // soft maximum (mean of the top fraction) along a line; a lane with one bright band scores high,
    // faint wells, gel edges and isolated dust specks score low
    const topMean = (vals, frac) => {
      const k = Math.max(3, Math.round(vals.length * frac));
      const s = Float32Array.from(vals).sort();
      let t = 0; for (let i = s.length - k; i < s.length; i++) t += s[i];
      return t / k;
    };
    const colP = new Float32Array(w), colBuf = new Float32Array(h);
    for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) colBuf[y] = tmp[y * w + x]; colP[x] = topMean(colBuf, 0.01); }
    // runs above threshold; returns [{s,e,mass}]
    const runs = (prof, t, gap) => {
      const out = []; let cur = null, last = -1e9;
      for (let i = 0; i < prof.length; i++) if (prof[i] > t) {
        if (cur && i - last <= gap) { cur.e = i; cur.mass += prof[i]; } else { cur = { s: i, e: i, mass: prof[i] }; out.push(cur); }
        last = i;
      }
      return out;
    };
    // heaviest run, then absorb neighbours carrying real signal that are not too far away
    const grow = (segs, n, gapFrac, spanFrac, minMassFrac) => {
      if (!segs.length) return null;
      const total = segs.reduce((a, s) => a + s.mass, 0);
      let lo = segs.reduce((bi, s, i) => (s.mass > segs[bi].mass ? i : bi), 0), hi = lo;
      for (let changed = true; changed;) {
        changed = false;
        const span = segs[hi].e - segs[lo].s + 1, lim = Math.max(n * gapFrac, span * spanFrac);
        const L = segs[lo - 1], R = segs[hi + 1];
        if (L && L.mass > total * minMassFrac && segs[lo].s - L.e <= lim) { lo--; changed = true; }
        if (R && R.mass > total * minMassFrac && R.s - segs[hi].e <= lim) { hi++; changed = true; }
      }
      return { s: segs[lo].s, e: segs[hi].e, segs: segs.slice(lo, hi + 1) };
    };
    const FULL = { x: 0, y: 0, w: img.w, h: img.h };
    // 5x5 box blur: dust specks (1-2 px) drop ~10x, bands and lanes keep their level
    {
      const rb = 2, t2 = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        let s = 0;
        for (let x = -rb; x <= rb; x++) s += tmp[y * w + clamp(x, 0, w - 1)];
        for (let x = 0; x < w; x++) {
          t2[y * w + x] = s / (2 * rb + 1);
          s += tmp[y * w + clamp(x + rb + 1, 0, w - 1)] - tmp[y * w + clamp(x - rb, 0, w - 1)];
        }
      }
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let y = -rb; y <= rb; y++) s += t2[clamp(y, 0, h - 1) * w + x];
        for (let y = 0; y < h; y++) {
          tmp[y * w + x] = s / (2 * rb + 1);
          s += t2[clamp(y + rb + 1, 0, h - 1) * w + x] - t2[clamp(y - rb, 0, h - 1) * w + x];
        }
      }
    }
    if (autoCrop.keepDebugImage) autoCrop.debugImg = { w, h, data: Float32Array.from(tmp) };
    const xRange = (prof, thrFrac) => {
      const cp = gaussSmooth(prof, 1), m = Math.max(...cp);
      if (m <= 0) return null;
      return grow(runs(cp, m * thrFrac, 1).filter(r => r.e - r.s >= 2), w, 0.12, 0.6, 0.01);
    };
    // pass 1: columns over the whole height (strong signal only)
    const xr1 = xRange(colP, 0.35);
    if (!xr1) return FULL;
    // rows: soft max across those columns
    const rowP = new Float32Array(h), rowBuf = new Float32Array(xr1.e - xr1.s + 1);
    for (let y = 0; y < h; y++) { for (let x = xr1.s; x <= xr1.e; x++) rowBuf[x - xr1.s] = tmp[y * w + x]; rowP[y] = topMean(rowBuf, 0.03); }
    const rp = gaussSmooth(rowP, 1), rmx = Math.max(...rp);
    const yr = grow(runs(rp, rmx * 0.08, 2), h, 0.05, 0.25, 0.004);
    if (!yr) return FULL;
    let y0 = yr.s;
    const y1 = yr.e, span = y1 - y0 + 1;
    // pass 2: columns restricted to the band rows (wells excluded) with a lower threshold, so lanes
    // holding a single faint band are kept
    const colP2 = new Float32Array(w), cb2 = new Float32Array(span);
    for (let x = 0; x < w; x++) { for (let y = y0; y <= y1; y++) cb2[y - y0] = tmp[y * w + x]; colP2[x] = topMean(cb2, 0.015); }
    const xr = xRange(colP2, 0.1) || xr1;
    const laneW = xr.segs.map(r => r.e - r.s + 1).sort((a, b) => a - b)[xr.segs.length >> 1];
    // pad by roughly the inter-lane gap, so neighbouring empty wells are not pulled in
    const gaps = [];
    for (let i = 1; i < xr.segs.length; i++) gaps.push(xr.segs[i].s - xr.segs[i - 1].e);
    const gapW = gaps.length ? gaps.sort((a, b) => a - b)[gaps.length >> 1] : laneW * 0.4;
    const padX = Math.round(Math.min(laneW * 0.5, Math.max(2, gapW * 0.8))) + 2;
    const X0 = clamp(xr.s - padX, 0, w - 1), X1 = clamp(xr.e + padX, 0, w - 1);
    // include the well row: nearest clear row-peak above the bands (never the gel edge beyond it)
    let padTop = Math.round(span * 0.04) + 2, well = null;
    const a = Math.max(0, Math.round(y0 - span * 0.6));
    if (y0 - a > 4) {
      const win = rp.slice(a, y0);
      const pk = findPeaks(win, 3, rmx * 0.015);
      if (pk.length) {
        const best = Math.max(...pk.map(p => p.prom));
        // the well row is the clear peak closest to the bands (the gel's top edge, further up, is often stronger)
        const cand = pk.filter(p => p.prom >= best * 0.15);
        const p = cand[cand.length - 1];
        // walk up to the half-prominence edge of the well peak
        let s = p.i; const half = p.v - p.prom / 2;
        while (s > 0 && win[s - 1] > half) s--;
        well = a + p.i;
        y0 = a + s;
        padTop = Math.max(2, Math.round(span * 0.02));
      }
    }
    const Y0 = clamp(y0 - padTop, 0, h - 1), Y1 = clamp(y1 + Math.round(span * 0.05) + 3, 0, h - 1);
    autoCrop.debug = { f, w, h, xsegs1: xr1.segs.map(r => [r.s, r.e]), xsegs: xr.segs.map(r => [r.s, r.e]), laneW, yr: [yr.s, yr.e], well };
    const rect = { x: X0 * f, y: Y0 * f, w: (X1 - X0 + 1) * f, h: (Y1 - Y0 + 1) * f };
    rect.w = Math.min(rect.w, img.w - rect.x); rect.h = Math.min(rect.h, img.h - rect.y);
    if (rect.w < img.w * 0.03 || rect.h < img.h * 0.05) return { x: 0, y: 0, w: img.w, h: img.h };
    // where things are, for the lane lattice (full-resolution pixels)
    autoCrop.meta = { wellY: well != null ? well * f : null, bandTop: yr.s * f, bandBottom: yr.e * f, contentX0: xr.s * f, contentX1: xr.e * f };
    return rect;
  }

  // ---------- lanes ----------
  function findPeaks(p, minDist, minProm) {
    const n = p.length, cand = [];
    for (let i = 1; i < n - 1; i++) if (p[i] > p[i - 1] && p[i] >= p[i + 1]) cand.push(i);
    // prominence
    const out = [];
    for (const i of cand) {
      let l = p[i], r = p[i];
      for (let j = i - 1; j >= 0 && p[j] <= p[i]; j--) l = Math.min(l, p[j]);
      for (let j = i + 1; j < n && p[j] <= p[i]; j++) r = Math.min(r, p[j]);
      const prom = p[i] - Math.max(l, r);
      if (prom >= minProm) out.push({ i, v: p[i], prom });
    }
    out.sort((a, b) => b.prom - a.prom);
    const kept = [];
    for (const c of out) if (kept.every(k => Math.abs(k.i - c.i) >= minDist)) kept.push(c);
    return kept.sort((a, b) => a.i - b.i);
  }

  // returns lane centres (crop coordinates)
  // Column profile of band "presence": per-row top-hat, compressed with sqrt so faint lanes and wells count
  // (mean of the top ~3% of each column) so a lane with a single band counts as much as a full ladder
  function presenceProfile(sig) {
    const { w, h, data } = sig;
    const r = Math.max(3, Math.round(w / 12));
    const step = Math.max(1, (h / 500) | 0);
    const nr = Math.ceil(h / step);
    const th = new Float32Array(w * nr), row = new Float32Array(w);
    for (let y = 0, j = 0; y < h; y += step, j++) {
      for (let x = 0; x < w; x++) row[x] = data[y * w + x];
      const b = slide(slide(row, r, false), r, true);
      for (let x = 0; x < w; x++) th[x * nr + j] = Math.sqrt(Math.max(0, row[x] - b[x]));
    }
    const k = Math.max(2, Math.round(nr * 0.03)), p = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const col = th.subarray(x * nr, x * nr + nr).sort();
      let s = 0;
      for (let i = nr - k; i < nr; i++) s += col[i];
      p[x] = s / k;
    }
    return p;
  }

  /* Returns lane centres (crop coordinates).
   * pitchHint overrides the pitch vote. The vote reads the spacing of peaks in the column profile,
   * which is reliable when lanes are separated but not on a crowded gel — whole-cell lysate lanes on
   * an SDS-PAGE gel touch, so the profile is one plateau with a few accidental peaks and the vote can
   * land on a multiple of the real pitch. A caller that has a trustworthy pitch (measured inside the
   * crop the user framed) passes it here so only the positions are taken from this profile. */
  function detectLanes(cropped, bright, pitchHint) {
    const sig = signal(cropped, bright);
    const w = sig.w;
    const raw = presenceProfile(sig);
    const q0 = gaussSmooth(raw, Math.max(1, w / 250));
    const bl = baseline(q0, Math.round(w / 8));
    const q = new Float32Array(w);
    let mx = 0;
    for (let i = 0; i < w; i++) { q[i] = Math.max(0, q0[i] - bl[i]); mx = Math.max(mx, q[i]); }
    if (mx <= 0) return { centers: [], pitch: w / 10 };
    const peaks = findPeaks(q, Math.max(3, w / 70), mx * 0.12);
    let xs = peaks.map(k => k.i);
    if (xs.length < 2) return { centers: xs, pitch: w / 10 };

    // pitch: candidate from every consecutive gap (and its halves/thirds); pick the one explaining
    // the gaps as integer multiples with the fewest implied empty lanes
    const gaps = [];
    for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
    const cands = new Set();
    gaps.forEach(g => [1, 2, 3].forEach(k => { const p = g / k; if (p >= w / 60 && p <= w / 1.5) cands.add(Math.round(p)); }));
    let pitch = 0, bestS = -Infinity;
    for (const p of cands) {
      let s = 0;
      for (const g of gaps) {
        const k = Math.max(1, Math.round(g / p)), err = Math.abs(g - k * p) / p;
        s += Math.exp(-((err / 0.22) ** 2)) - 0.5 * (k - 1);
        if (g < 0.6 * p) s -= 1;
      }
      if (s > bestS + 1e-9 || (Math.abs(s - bestS) < 1e-9 && p > pitch)) { bestS = s; pitch = p; }
    }
    const voted = pitch;
    if (pitchHint > 0 && pitchHint >= w / 60 && pitchHint <= w / 1.5) pitch = pitchHint;
    detectLanes.debug = { peaks: peaks.map(k => [k.i, +(k.prom / mx).toFixed(2)]), pitch, voted };
    // drop peaks that are spurious (too close to a stronger neighbour on the lattice)
    const strength = new Map(peaks.map(k => [k.i, k.prom]));
    const kept = [];
    for (const x of xs) {
      const prev = kept[kept.length - 1];
      if (prev != null && x - prev < 0.6 * pitch) { if (strength.get(x) > strength.get(prev)) kept[kept.length - 1] = x; }
      else kept.push(x);
    }
    xs = kept;
    // least-squares lattice x = o + p*k
    const idx = xs.map(x => Math.round((x - xs[0]) / pitch));
    let n = xs.length, sk = 0, sx = 0, skk = 0, skx = 0;
    xs.forEach((x, i) => { sk += idx[i]; sx += x; skk += idx[i] * idx[i]; skx += idx[i] * x; });
    const den = n * skk - sk * sk;
    let P = pitch, O = xs[0];
    // with a trusted pitch only the offset is fitted; otherwise pitch and offset together
    if (pitch === pitchHint) O = (sx - P * sk) / n;
    else if (den > 0) { P = (n * skx - sk * sx) / den; O = (sx - P * sk) / n; }
    const K = idx[idx.length - 1];
    // centroid refinement for lanes with signal, lattice position for empty ones
    const centers = [];
    for (let k = 0; k <= K; k++) {
      const c = O + P * k;
      const a = clamp(Math.round(c - P * 0.45), 0, w - 1), b = clamp(Math.round(c + P * 0.45), 0, w - 1);
      let lo = Infinity, sw = 0, sxw = 0;
      for (let x = a; x <= b; x++) lo = Math.min(lo, q[x]);
      for (let x = a; x <= b; x++) { const v = q[x] - lo; sw += v; sxw += v * x; }
      const has = sw > 0 && (sw / (b - a + 1)) > mx * 0.08;
      let cx = has ? sxw / sw : c;
      if (Math.abs(cx - c) > P * 0.25) cx = c;
      centers.push(Math.round(cx * 10) / 10);
    }
    // lanes cut by the crop edge (only a sliver of a neighbouring empty well) are not real lanes
    while (centers.length > 1 && centers[0] < P * 0.3) centers.shift();
    while (centers.length > 1 && centers[centers.length - 1] > w - P * 0.3) centers.pop();
    // votedPitch is the robust estimate from peak spacing; pitch also went through a least-squares
    // fit over the peaks, which is sharper when they are regular and can drift when they are not
    return { centers, pitch: P, votedPitch: pitch, profile: q, profileMax: mx };
  }

  /* Score a candidate pitch by how much brighter the lane windows are than the gaps between them,
   * integrated over every column of the span so that long and short pitches are compared on equal
   * footing. Only used to refine an estimate that is already close: over a wide range this prefers a
   * multiple of the true pitch on a gel where neighbouring lanes merge into one plateau. */
  function refinePitch(q, mx, pitch, x0, x1) {
    if (!(pitch > 0) || x1 - x0 < pitch * 2) return 0;
    const score = (p, o) => {
      let st = 0, nt = 0, sg = 0, ng = 0;
      for (let x = x0; x <= x1; x++) {
        let ph = ((x - x0 - o) % p) / p;
        if (ph < 0) ph += 1;
        const d = Math.min(ph, 1 - ph);
        if (d <= 0.22) { st += q[x]; nt++; } else if (d >= 0.34) { sg += q[x]; ng++; }
      }
      return nt && ng ? st / nt - sg / ng : -Infinity;
    };
    let best = { p: 0, s: -Infinity };
    for (let p = Math.max(6, Math.round(pitch * 0.8)); p <= Math.round(pitch * 1.25); p++) {
      let s = -Infinity;
      const step = Math.max(1, Math.round(p / 24));
      for (let o = 0; o < p; o += step) s = Math.max(s, score(p, o));
      if (s > best.s) best = { p, s };
    }
    return best.s > mx * 0.02 ? best.p : 0;
  }

  /* The lane pitch is most reliable near the top of the gel: the samples have not spread yet, so
   * lanes are still separated there even on a crowded gel (whole-cell lysates on SDS-PAGE) whose
   * band region reads as one continuous plateau, and the row of wells often falls inside this slab.
   * Returns a pitch in image pixels, or 0 when there is no usable lane structure. */
  function measurePitch(img, bright, crop) {
    const bx = Math.round(img.w * 0.01);
    const h = Math.max(24, Math.round(crop.h * 0.28));
    const y = clamp(Math.round(crop.y), 0, Math.max(0, img.h - h));
    if (h < 24 || img.w - 2 * bx < 32) return 0;
    const top = cropImg(img, { x: bx, y, w: img.w - 2 * bx, h });
    const r = detectLanes(top, bright);
    if (r.centers.length < 2 || !(r.votedPitch > 0)) return 0;
    const q = r.profile, mx = r.profileMax;
    let x0 = 0, x1 = q.length - 1;
    while (x0 < q.length - 1 && q[x0] < mx * 0.15) x0++;
    while (x1 > x0 && q[x1] < mx * 0.15) x1--;
    return refinePitch(q, mx, r.votedPitch, x0, x1) || r.votedPitch;
  }

  /* Was the lane pitch read off the band region a whole multiple of the real one? That happens when
   * neighbouring lanes merge, and it is the one lane-detection failure that can be recognised from
   * the image alone: the top of the gel, where samples have not spread, still resolves single lanes.
   * Returns the corrected pitch, or 0 to keep the one already measured. */
  function dividedPitch(pitch, topPitch) {
    if (!(pitch > 0) || !(topPitch > 0)) return 0;
    for (const k of [2, 3]) {
      const part = pitch / k;
      if (Math.abs(topPitch - part) <= part * 0.15) return part;
    }
    return 0;
  }

  /* Lane lattice over the WHOLE gel: every well gets a lane, numbered left to right like the
   * lab notebook. The crop then only chooses which lanes appear in the figure.
   * Evidence per lattice position = well signal (row of wells) or band signal; positions without
   * either (gel edges, glare) are trimmed, real wells beyond the detected range are added. */
  function detectLaneLattice(img, bright, crop, meta, pitchHint) {
    const bx = Math.round(img.w * 0.01);
    const strip = cropImg(img, { x: bx, y: crop.y, w: img.w - 2 * bx, h: crop.h });
    // the pitch is measured inside the crop (where the user framed the gel); across the whole width
    // the profile also carries background and stray marks, which can skew a pitch vote
    const L = detectLanes(strip, bright, pitchHint);
    if (L.centers.length < 2) return null;
    const P = L.pitch, q = L.profile, W = strip.w;
    // width (at half prominence) of the feature nearest c in a profile; lanes and wells are wide,
    // gel edges / glare lines are thin
    const featureWidth = (pr, c) => {
      const n = pr.length, a = clamp(Math.round(c - P * 0.3), 0, n - 1), b = clamp(Math.round(c + P * 0.3), 0, n - 1);
      let pk = a; for (let x = a; x <= b; x++) if (pr[x] > pr[pk]) pk = x;
      let lo = Infinity;
      for (let x = clamp(Math.round(c - P * 0.65), 0, n - 1); x <= clamp(Math.round(c + P * 0.65), 0, n - 1); x++) lo = Math.min(lo, pr[x]);
      const half = lo + (pr[pk] - lo) / 2;
      let l = pk, r = pk;
      while (l > 0 && pr[l - 1] > half && pk - l < P) l--;
      while (r < n - 1 && pr[r + 1] > half && r - pk < P) r++;
      return r - l;
    };
    const wide = (pr, c) => featureWidth(pr, c) >= P * 0.28;
    // band evidence: mean presence within the lane core (0 for thin line-like features)
    const bandAt = (c) => {
      const a = clamp(Math.round(c - P * 0.25), 0, W - 1), b = clamp(Math.round(c + P * 0.25), 0, W - 1);
      let s = 0; for (let x = a; x <= b; x++) s += q[x];
      return wide(q, c) ? s / (b - a + 1) : 0;
    };
    const sig = signal(img, bright);
    // gel slab: left/right boundary = strongest opposite-signed steps of the column median over band rows
    let slabL = 0, slabR = img.w - 1;
    {
      const ys0 = clamp(Math.round(crop.y), 0, img.h - 1), ys1 = clamp(Math.round(crop.y + crop.h), 0, img.h - 1);
      const stepY = Math.max(1, ((ys1 - ys0) / 120) | 0), col = [];
      const m = new Float32Array(img.w);
      for (let x = 0; x < img.w; x++) {
        col.length = 0;
        for (let y = ys0; y <= ys1; y += stepY) col.push(sig.data[y * img.w + x]);
        col.sort((a, b) => a - b); m[x] = col[col.length >> 1];
      }
      const ms = gaussSmooth(m, Math.max(2, P / 6)), g = new Float32Array(img.w);
      for (let x = 1; x < img.w - 1; x++) g[x] = (ms[x + 1] - ms[x - 1]) / 2;
      const absg = Array.from(g, Math.abs).sort((a, b) => a - b), med = absg[absg.length >> 1] || 1e-9;
      const cL = L.centers[0] + bx, cR = L.centers[L.centers.length - 1] + bx;
      let bL = -1, vL = 0, bR = -1, vR = 0;
      // A loaded lane column is itself a strong step (its bands lift the column median). Skip the
      // detected lane columns when looking for the slab edge, otherwise an outer marker lane would
      // be mistaken for the edge and then trimmed away by the margin below.
      const onLane = x => L.centers.some(c => Math.abs(c + bx - x) < P * 0.45);
      // left edge: rising step left of the lanes; right edge: falling step right of them
      for (let x = 1; x < cL + P * 0.6 && x < img.w - 1; x++) if (!onLane(x) && g[x] > vL) { vL = g[x]; bL = x; }
      for (let x = Math.max(1, Math.round(cR - P * 0.6)); x < img.w - 1; x++) if (!onLane(x) && -g[x] > vR) { vR = -g[x]; bR = x; }
      if (bL >= 0 && vL > med * 6) slabL = bL;
      if (bR >= 0 && vR > med * 6) slabR = bR;
    }
    // well template: average well-row profile around loaded lanes; NCC against it at each position
    let wellNcc = () => 0;
    const bandRefAll = Math.max(1e-9, ...L.centers.map(c => bandAt(c)));
    if (meta && meta.wellY != null) {
      const hw = Math.max(3, Math.round(P * 0.18));
      const y0 = clamp(Math.round(meta.wellY - hw), 0, img.h - 1), y1 = clamp(Math.round(meta.wellY + hw), 0, img.h - 1);
      const wp = new Float32Array(img.w);
      for (let y = y0; y <= y1; y++) for (let x = 0; x < img.w; x++) wp[x] += sig.data[y * img.w + x];
      const R = Math.round(P * 0.6), seg = (c) => {
        const out = new Float32Array(2 * R + 1);
        for (let k = -R; k <= R; k++) out[k + R] = wp[clamp(Math.round(c) + k, 0, img.w - 1)];
        return out;
      };
      const loadedAbs = L.centers.filter(c => bandAt(c) > bandRefAll * 0.3).map(c => c + bx)
        .filter(c => c > slabL + P * 0.45 && c < slabR - P * 0.45);
      if (loadedAbs.length) {
        const tpl = new Float32Array(2 * R + 1);
        loadedAbs.forEach(c => seg(c).forEach((v, i) => { tpl[i] += v / loadedAbs.length; }));
        const ncc = (a, b) => {
          let ma = 0, mb = 0; for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
          ma /= a.length; mb /= b.length;
          let sab = 0, saa = 0, sbb = 0;
          for (let i = 0; i < a.length; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
          return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
        };
        // allow a small shift so slightly irregular combs still match
        wellNcc = (cAbs) => { let best = -1; for (let d = -Math.round(P * 0.12); d <= Math.round(P * 0.12); d += 2) best = Math.max(best, ncc(seg(cAbs + d), tpl)); return best; };
      }
    }
    const inSlab = c => c > slabL + P * 0.45 && c < slabR - P * 0.45;
    // lattice positions extended across the slab, then kept outward from the loaded lanes while
    // each step still has a well (or bands)
    const O = L.centers[0] + bx;
    const all = [];
    for (let k = -40; k <= 80; k++) { const c = O + k * P; if (c > P * 0.4 && c < img.w - P * 0.4 && inSlab(c)) all.push(c); }
    const snap = c => { const j = L.centers.findIndex(x => Math.abs(x + bx - c) < P * 0.3); return j >= 0 ? L.centers[j] + bx : c; };
    const pos = all.map(snap);
    const loadedIdx = pos.map((c, i) => (bandAt(c - bx) > bandRefAll * 0.3 ? i : -1)).filter(i => i >= 0);
    let cs;
    if (!loadedIdx.length) cs = L.centers.map(c => c + bx).filter(inSlab);
    else {
      let lo = loadedIdx[0], hi = loadedIdx[loadedIdx.length - 1];
      // empty wells look a bit different from loaded ones, so the bar is low; a flat gel gives ~0
      const ok = i => bandAt(pos[i] - bx) > bandRefAll * 0.3 || wellNcc(pos[i]) >= 0.25;
      while (lo - 1 >= 0 && ok(lo - 1)) lo--;
      while (hi + 1 < pos.length && ok(hi + 1)) hi++;
      cs = pos.slice(lo, hi + 1);
    }
    detectLaneLattice.debug = { slabL, slabR, pos: pos.map(c => `${Math.round(c)}:b${(bandAt(c - bx) / bandRefAll).toFixed(2)}/w${wellNcc(c).toFixed(2)}`) };
    if (!cs.length) return null;
    const bandRef = bandRefAll;
    const withBand = cs.filter(c => bandAt(c - bx) > bandRef * 0.3);
    // lane half-width from the band profile of loaded lanes (width at half height)
    const halves = [];
    withBand.forEach(cAbs => {
      const c = Math.round(cAbs - bx), v = q[c] || 0;
      if (v <= 0) return;
      let l = c, r2 = c;
      while (l > 0 && q[l - 1] > v / 2 && c - l < P) l--;
      while (r2 < W - 1 && q[r2 + 1] > v / 2 && r2 - c < P) r2++;
      halves.push((r2 - l) / 2);
    });
    halves.sort((a, b) => a - b);
    const halfW = halves.length ? clamp(halves[halves.length >> 1] * 0.8, P * 0.15, P * 0.4) : P * 0.3;
    return { centers: cs.map(c => Math.round(c * 10) / 10), pitch: P, halfW, loaded: withBand };
  }

  function evenLanes(n, w, first, last) {
    if (n <= 0) return [];
    if (first === undefined) { const step = w / n; return Array.from({ length: n }, (_, i) => (i + 0.5) * step); }
    if (n === 1) return [(first + last) / 2];
    return Array.from({ length: n }, (_, i) => first + (last - first) * i / (n - 1));
  }

  // ---------- bands in a lane ----------
  function laneProfile(cropped, bright, cx, halfW) {
    const sig = signal(cropped, bright);
    const { w, h, data } = sig;
    const x0 = clamp(Math.round(cx - halfW), 0, w - 1), x1 = clamp(Math.round(cx + halfW), 0, w - 1);
    const p = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = x0; x <= x1; x++) s += data[y * w + x];
      p[y] = s / (x1 - x0 + 1);
    }
    return p;
  }

  function detectBands(profile, mode) {
    const h = profile.length;
    // protein bands are broad: merge ripples closer than a band width, and ignore very faint ones
    const broad = mode === 'protein';
    const sm = gaussSmooth(profile, Math.max(0.8, h / (broad ? 260 : 400)));
    const b = baseline(sm, Math.round(h / 12));
    const q = new Float32Array(h);
    let mx = 0;
    for (let i = 0; i < h; i++) { q[i] = Math.max(0, sm[i] - b[i]); mx = Math.max(mx, q[i]); }
    return findPeaks(q, Math.max(2, h / (broad ? 100 : 150)), mx * (broad ? 0.05 : 0.03)).map(k => ({ y: k.i, v: k.prom }));
  }

  // ---------- ladder matching ----------
  // All marker lanes of one gel share a migration curve y = a + b·x + c·x², x = ln(bp).
  // Lane input: {peaks:[{y,v}], sizes:[bp, descending], anchors:[{k, y}] (user-placed bands)}
  function prepLane(L) {
    const vmax = Math.max(0, ...L.peaks.map(p => p.v));
    // weak peaks (well edges, dust, smear ripples) are not ladder bands
    const P = L.peaks.filter(p => p.v >= vmax * 0.12).sort((a, b) => b.v - a.v).slice(0, 32).sort((a, b) => a.y - b.y);
    // band thickness: width at half height of each peak on the lane profile. Protein bands are broad
    // (often most of the lane), DNA bands are thin lines — the main signal for telling the two apart.
    const pr = L.profile;
    const ws = P.map(p => {
      if (!pr || pr.length < 8) return null;
      const v = pr[Math.round(p.y)] || 0, half = v / 2;
      let l = Math.round(p.y), r = Math.round(p.y), lim = Math.max(8, pr.length / 6);
      while (l > 0 && pr[l - 1] > half && Math.round(p.y) - l < lim) l--;
      while (r < pr.length - 1 && pr[r + 1] > half && r - Math.round(p.y) < lim) r++;
      return r - l;
    }).filter(w => w != null && w > 0);
    ws.sort((a, b) => a - b);
    return {
      ys: P.map(p => p.y), vs: P.map(p => p.v), X: L.sizes.map(s => Math.log(s)), n: L.sizes.length,
      anchors: L.anchors || [], bandW: ws.length ? ws[ws.length >> 1] : null, pitch: L.pitch || null
    };
  }
  const predict = (m, x) => m.a + m.b * x + m.c * x * x + (m.d || 0) * x * x * x;
  const slopeAt = (m, x) => m.b + 2 * m.c * x + 3 * (m.d || 0) * x * x;

  /* Protein gels: bands are broad, a quadratic in log(kDa) is a rougher fit over 10–250 kDa than it is
   * for DNA, and prestained markers often have only 6–10 visible bands with uneven spacing. Everything
   * below therefore widens the tolerances and allows more missing bands when mode === 'protein'. */
  function modeTol(mode) { return mode === 'protein' ? { assTol: 0.6, window: 1.6, skipSize: 1.6, priorW: 0.35 } : { assTol: 0.45, window: 1, skipSize: 1, priorW: 1 }; }

  // Order-preserving alignment of ladder sizes to peaks (dynamic programming): sizes run top->bottom
  // like the peaks, so a size can never take a peak below a smaller size's peak.
  function assign(m, D, h, tolFrac, mode) {
    const MT = modeTol(mode);
    const { X, n, ys } = D, np = ys.length, tolBase = h * 0.04;
    const anch = new Map(D.anchors.map(a => [a.k, a.y]));
    const yp = X.map(x => predict(m, x)), tol = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const nb = [k - 1, k + 1].filter(j => j >= 0 && j < n).map(j => Math.abs(yp[j] - yp[k]));
      tol[k] = Math.max(1, Math.min(tolBase, Math.min(...nb) * tolFrac));
    }
    const SKIP_SIZE = MT.skipSize, SKIP_PEAK = 0.35, W = np + 1;
    const cost = new Float32Array((n + 1) * W), from = new Uint8Array((n + 1) * W);
    for (let i = 1; i <= np; i++) { cost[i] = i * SKIP_PEAK; from[i] = 2; }
    for (let k = 1; k <= n; k++) {
      const fixed = anch.has(k - 1);
      cost[k * W] = cost[(k - 1) * W] + (fixed ? 0 : SKIP_SIZE); from[k * W] = 1;
      for (let i = 1; i <= np; i++) {
        let best = cost[(k - 1) * W + i] + (fixed ? 0 : SKIP_SIZE), how = 1;
        const c2 = cost[k * W + i - 1] + SKIP_PEAK;
        if (c2 < best) { best = c2; how = 2; }
        if (!fixed) {
          const d = Math.abs(yp[k - 1] - ys[i - 1]) / tol[k - 1];
          if (d <= 2.5) { const c3 = cost[(k - 1) * W + i - 1] + 0.5 * d * d; if (c3 < best) { best = c3; how = 3; } }
        }
        cost[k * W + i] = best; from[k * W + i] = how;
      }
    }
    const match = new Int32Array(n).fill(-1);
    for (let k = n, i = np; k > 0 || i > 0;) {
      const how = from[k * W + i];
      if (how === 3) { match[k - 1] = i - 1; k--; i--; } else if (how === 2) i--; else k--;
    }
    const res = [], pairs = [];
    let inl = 0, err = 0;
    for (let k = 0; k < n; k++) {
      if (anch.has(k)) { const y = anch.get(k); res.push({ y, matched: false, anchored: true }); pairs.push([X[k], y, 3]); continue; }
      const i = match[k];
      if (i >= 0) {
        const d = Math.abs(yp[k] - ys[i]) / tol[k];
        res.push({ y: ys[i], matched: true, tin: d });
        pairs.push([X[k], ys[i], d <= 1 ? 1 : 0.3]);
        inl += d <= 1 ? 1 : 0.6; err += Math.min(d, 2.5);
      } else res.push({ y: yp[k], matched: false, tin: 9 });
    }
    return { res, pairs, inl, err };
  }

  // candidate linear models from one lane (RANSAC over peak/size pairs), best first
  function ransacModels(D, h, keep, mode) {
    const { ys, X, n, anchors } = D;
    const cands = [];
    const tryModel = (y1, x1, y2, x2) => {
      if (x1 === x2) return;
      const b = (y1 - y2) / (x1 - x2);
      if (b >= 0) return;
      const m = { a: y1 - b * x1, b, c: 0 };
      const r = assign(m, D, h, 0.4, mode);
      cands.push({ m, s: r.inl - 0.3 * r.err });
    };
    if (anchors.length >= 2) tryModel(anchors[0].y, X[anchors[0].k], anchors[1].y, X[anchors[1].k]);
    if (anchors.length) {
      for (const an of anchors) for (let i = 0; i < ys.length; i++) for (let q = 0; q < n; q++) if (q !== an.k) tryModel(an.y, X[an.k], ys[i], X[q]);
    } else {
      for (let i = 0; i < ys.length; i++) for (let j = i + 1; j < ys.length; j++)
        for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) tryModel(ys[i], X[p], ys[j], X[q]);
    }
    cands.sort((a, b) => b.s - a.s);
    const out = [];
    for (const c of cands) {
      if (out.length >= (keep || 20)) break;
      if (out.every(o => Math.abs(o.a - c.m.a) > 2 || Math.abs(o.b - c.m.b) > 0.5)) out.push(c.m);
    }
    return out;
  }

  // weighted polynomial least squares in x (centred for conditioning), degree 1..3
  function fitWeighted(pts, deg) {
    const d = deg + 1, x0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const A = Array.from({ length: d }, () => new Array(d + 1).fill(0));
    for (const [x, y, w] of pts) {
      const u = x - x0, v = [1, u, u * u, u * u * u];
      for (let i = 0; i < d; i++) { A[i][d] += w * v[i] * y; for (let j = 0; j < d; j++) A[i][j] += w * v[i] * v[j]; }
    }
    const s = solveN(A, d);
    if (!s) return null;
    const [p0, p1, p2 = 0, p3 = 0] = s;
    // expand back from (x - x0) to x
    return {
      a: p0 - p1 * x0 + p2 * x0 * x0 - p3 * x0 * x0 * x0,
      b: p1 - 2 * p2 * x0 + 3 * p3 * x0 * x0,
      c: p2 - 3 * p3 * x0,
      d: p3
    };
  }
  function solveN(M, n) {
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      if (Math.abs(M[p][i]) < 1e-12) return null;
      [M[i], M[p]] = [M[p], M[i]];
      for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
    }
    return Array.from({ length: n }, (_, i) => M[i][n] / M[i][i]);
  }

  // migration must stay monotonic (bigger fragments higher) over the fitted range
  function monotone(m, pts) {
    const xs = pts.map(p => p[0]), lo = Math.min(...xs) - 0.3, hi = Math.max(...xs) + 0.3;
    for (let k = 0; k <= 10; k++) if (slopeAt(m, lo + (hi - lo) * k / 10) >= 0) return false;
    return true;
  }

  function refine(m, Ds, h, mode) {
    for (let it = 0; it < 4; it++) {
      const pts = [];
      Ds.forEach(D => assign(m, D, h, modeTol(mode).assTol, mode).pairs.forEach(p => pts.push(p)));
      if (pts.length < 2) break;
      const span = Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0]));
      // more flexible curves only when there are enough bands over a wide enough size range
      const degs = pts.length >= 9 && span > 2.2 ? [3, 2, 1] : pts.length >= 5 ? [2, 1] : [1];
      let next = null;
      for (const dg of degs) { const q = fitWeighted(pts, dg); if (q && monotone(q, pts)) { next = q; break; } }
      if (!next) break;
      m = next;
    }
    return m;
  }

  /* Final assignment as a smooth chain: pick increasing (size, peak) pairs so that the local
   * migration slope (px per ln bp) changes gradually between neighbouring bands. The shared curve
   * m only restricts the search window and acts as a weak prior, so compressed regions (top of the
   * gel, small fragments) follow the data rather than the global fit. */
  function chainAssign(m, D, h, ref, mode) {
    const MT = modeTol(mode);
    const { X, n } = D;
    const anch = new Map(D.anchors.map(a => [a.k, a.y]));
    // peaks (+ anchors as forced pseudo-peaks)
    const pk = D.ys.map((y, j) => ({ y, v: D.vs ? D.vs[j] : 1, anchorOf: -1 }));
    anch.forEach((y, k) => pk.push({ y, v: 1, anchorOf: k }));
    pk.sort((a, b) => a.y - b.y);
    const np = pk.length, vmax = Math.max(1e-9, ...pk.map(p => p.v));
    const yp = X.map(x => predict(m, x));
    const win = Math.max(h * 0.12, 12) * MT.window;
    const pairs = [];
    for (let k = 0; k < n; k++) for (let i = 0; i < np; i++) {
      if (anch.has(k) ? pk[i].anchorOf !== k : pk[i].anchorOf >= 0) continue;
      if (!anch.has(k) && Math.abs(pk[i].y - yp[k]) > win) continue;
      pairs.push({ k, i });
    }
    const NP = pairs.length;
    if (!NP) return null;
    const inGel = k => yp[k] >= 0 && yp[k] <= h;
    const skipSize = k => (anch.has(k) ? 100 : MT.skipSize);
    const endSize = k => (anch.has(k) ? 100 : inGel(k) ? 0.8 : 0.15);
    const skipPeak = i => (pk[i].anchorOf >= 0 ? 100 : 0.25 + 0.75 * pk[i].v / vmax);
    const sumSize = (a, b, f) => { let s = 0; for (let k = a; k < b; k++) s += f(k); return s; };
    const sumPeak = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += skipPeak(i); return s; };
    const slope = (p, q) => (pk[q.i].y - pk[p.i].y) / (X[p.k] - X[q.k]);
    const prior = (p, q) => {
      const sm = -slopeAt(m, (X[p.k] + X[q.k]) / 2), s = slope(p, q);
      return sm > 0 && s > 0 ? 0.6 * MT.priorW * Math.log(s / sm) ** 2 : 2;
    };
    const SMOOTH = 4;
    // optional reference from another lane of the same gel: the same size should run to the same height
    const sig = Math.max(6, h * 0.02);
    const pc = pairs.map(p => {
      const ry = ref ? ref(X[p.k]) : null;
      return ry == null ? 0 : 0.5 * ((pk[p.i].y - ry) / sig) ** 2;
    });
    const start = pairs.map((p, c) => sumSize(0, p.k, endSize) + sumPeak(0, p.i) + pc[c]);
    const dp = new Float64Array(NP * NP).fill(Infinity), back = new Int32Array(NP * NP).fill(-1);
    for (let c = 0; c < NP; c++) {
      const C = pairs[c];
      for (let b = 0; b < c; b++) {
        const B = pairs[b];
        if (B.k >= C.k || B.i >= C.i) continue;
        const sBC = slope(B, C);
        if (!(sBC > 0)) continue;
        const local = sumSize(B.k + 1, C.k, skipSize) + sumPeak(B.i + 1, C.i) + prior(B, C) + pc[c];
        let best = start[b], arg = -1;
        for (let a = 0; a < b; a++) {
          const v = dp[a * NP + b];
          if (v === Infinity) continue;
          const t = v + SMOOTH * Math.log(sBC / slope(pairs[a], B)) ** 2;
          if (t < best) { best = t; arg = a; }
        }
        dp[b * NP + c] = best + local; back[b * NP + c] = arg;
      }
    }
    // best chain end (single-pair chains allowed)
    const tail = p => sumSize(p.k + 1, n, endSize) + sumPeak(p.i + 1, np);
    let bestV = Infinity, bb = -1, bc = -1;
    pairs.forEach((p, c) => { const v = start[c] + tail(p); if (v < bestV) { bestV = v; bb = -1; bc = c; } });
    for (let b = 0; b < NP; b++) for (let c = b + 1; c < NP; c++) {
      const v = dp[b * NP + c];
      if (v === Infinity) continue;
      const t = v + tail(pairs[c]);
      if (t < bestV) { bestV = t; bb = b; bc = c; }
    }
    const chain = [pairs[bc]];
    for (let b = bb, c = bc; b >= 0;) { chain.unshift(pairs[b]); const a = back[b * NP + c]; c = b; b = a; }
    // positions: matched / anchored from the chain, the rest interpolated in ln(bp) or extrapolated
    const res = new Array(n).fill(null);
    chain.forEach(p => { res[p.k] = pk[p.i].anchorOf >= 0 ? { y: pk[p.i].y, matched: false, anchored: true } : { y: pk[p.i].y, matched: true }; });
    const ks = chain.map(p => p.k);
    for (let k = 0; k < n; k++) {
      if (res[k]) continue;
      const lo = ks.filter(q => q < k).pop(), hi = ks.find(q => q > k);
      let y;
      if (lo != null && hi != null) y = res[lo].y + (X[lo] - X[k]) / (X[lo] - X[hi]) * (res[hi].y - res[lo].y);
      else {
        // extrapolate with the slope of the nearest two chain points, falling back to the curve
        const two = lo != null ? ks.filter(q => q < k).slice(-2) : ks.filter(q => q > k).slice(0, 2);
        if (two.length === 2) {
          const s = (res[two[1]].y - res[two[0]].y) / (X[two[0]] - X[two[1]]), ref = lo != null ? two[1] : two[0];
          y = res[ref].y + s * (X[ref] - X[k]);
        } else y = yp[k] + (two.length ? res[two[0]].y - yp[two[0]] : 0);
      }
      res[k] = { y, matched: false };
    }
    return res;
  }

  // piecewise-linear y(ln bp) through a lane's matched bands; null outside their range
  function refCurve(res, X) {
    const pts = res.map((r, k) => [X[k], r.y, r.matched || r.anchored]).filter(p => p[2]).sort((a, b) => a[0] - b[0]);
    if (pts.length < 3) return null;
    return x => {
      if (x < pts[0][0] || x > pts[pts.length - 1][0]) return null;
      for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return y0 + (x - x0) / (x1 - x0 || 1) * (y1 - y0);
      }
      return null;
    };
  }

  function finalize(m, D, h, chain, ref, mode) {
    const res = (chain && chainAssign(m, D, h, ref, mode)) || assign(m, D, h, modeTol(mode).assTol, mode).res;
    const inRange = res.filter(r => r.y >= -2 && r.y <= h + 2).length;
    const nm = res.filter(r => r.matched).length;
    let mono = true;
    for (let k = 1; k < res.length; k++) if (res[k].y <= res[k - 1].y) mono = false;
    res.score = mono ? (nm + res.filter(r => r.anchored).length) / Math.max(D.ys.length, inRange, 1) : 0;
    res.matchedCount = nm;
    return res;
  }

  /* Match several marker lanes against one shared curve. lanes: [{peaks, sizes, anchors?, models?}]
   * Returns per-lane arrays [{y, matched, anchored}] with .score / .matchedCount, plus .model. */
  function matchMulti(lanes, h, mode) {
    const Ds = lanes.map(prepLane);
    const fallback = () => lanes.map(L => {
      const n = L.sizes.length, r = L.sizes.map((s, i) => ({ y: h * (0.1 + 0.8 * i / Math.max(1, n - 1)), matched: false }));
      r.score = 0; r.matchedCount = 0; return r;
    });
    let cands = [];
    Ds.forEach((D, i) => {
      if (D.ys.length + D.anchors.length < 2 || D.n < 2) return;
      cands = cands.concat(lanes[i].models || ransacModels(D, h, undefined, mode));
    });
    if (!cands.length) return fallback();
    let best = null, bestS = -Infinity;
    for (const c of cands) {
      const m = refine(c, Ds, h, mode);
      const rs = Ds.map(D => finalize(m, D, h, false, null, mode));
      const s = rs.reduce((a, r) => a + r.score, 0) / rs.length;
      if (s > bestS) { bestS = s; best = rs; best.model = m; best.score = s; }
    }
    // the shared curve fixes the window; the final per-lane assignment is the smooth chain
    if (!matchMulti.fast) {
      const model = best.model;
      Ds.forEach((D, i) => { best[i] = finalize(model, D, h, true, null, mode); });
      if (Ds.length > 1) {
        // the most confident lane becomes the reference for the others
        const r0 = best.reduce((bi, r, i) => (r.score > best[bi].score ? i : bi), 0);
        const ref = refCurve(best[r0], Ds[r0].X);
        if (ref) Ds.forEach((D, i) => { if (i !== r0) best[i] = finalize(model, D, h, true, ref, mode); });
      }
      best.model = model;
      best.score = best.reduce((a, r) => a + r.score, 0) / best.length;
    }
    return best;
  }

  function matchLadder(peaks, sizes, h, anchors, mode) {
    const r = matchMulti([{ peaks, sizes, anchors }], h, mode);
    const out = r[0];
    out.model = r.model;
    return out;
  }

  // Count of distinct sharp bands: used to recognise ladder lanes
  function sharpBandCount(peaks) {
    const vmax = Math.max(0, ...peaks.map(p => p.v));
    return peaks.filter(p => p.v >= vmax * 0.2).length;
  }

  /* Pick ladders for the marker lanes of one gel jointly (they must agree on one migration curve).
   * Returns [{id, score}] per lane, with .score for the combination. */
  // favourite ladders get a bonus per lane: enough to win near-ties, not enough to override a clear misfit
  const FAV_BONUS = 0.05;
  function jointLadders(peaksList, ladders, h, preferIds, mode) {
    matchMulti.fast = true;
    try { return jointLaddersFast(peaksList, ladders, h, preferIds, mode); } finally { matchMulti.fast = false; }
  }
  function jointLaddersFast(peaksList, ladders, h, preferIds, mode) {
    const fav = new Set(Array.isArray(preferIds) ? preferIds : preferIds ? [preferIds] : []);
    const bonus = id => (fav.has(id) ? FAV_BONUS : 0);
    const per = peaksList.map(pk => ladders.map(l => {
      const D = prepLane({ peaks: pk, sizes: l.sizes });
      const models = D.ys.length >= 2 ? ransacModels(D, h, 12, mode) : [];
      const r = models.length ? matchMulti([{ peaks: pk, sizes: l.sizes, models }], h, mode) : null;
      return { id: l.id, sizes: l.sizes, models, score: r ? r.score : 0 };
    }).filter(c => c.score >= (mode === 'protein' ? 0.3 : 0.4)).sort((a, b) => (b.score + bonus(b.id)) - (a.score + bonus(a.id))).slice(0, 7));
    if (per.some(c => !c.length)) return null;
    const combos = per.reduce((acc, cands) => {
      const out = [];
      acc.forEach(a => cands.forEach(c => out.push(a.concat([c]))));
      return out;
    }, [[]]);
    let best = null, bestObj = -Infinity;
    for (const combo of combos) {
      const r = combo.length === 1 ? null : matchMulti(combo.map((c, i) => ({ peaks: peaksList[i], sizes: c.sizes, models: c.models })), h, mode);
      const s = r ? r.score : combo[0].score;
      const obj = s + combo.reduce((a, c) => a + bonus(c.id), 0) / combo.length;
      if (jointLadders.trace) jointLadders.trace.push([combo.map(c => c.id).join('+'), +s.toFixed(3)]);
      if (obj > bestObj) { bestObj = obj; best = combo.map((c, i) => ({ id: c.id, score: r ? r[i].score : c.score })); best.score = s; }
    }
    return best;
  }

  /* How much of a lane does its best-fitting ladder explain?
   * Band count alone cannot tell a marker lane from a sample lane on a crowded gel: a whole-cell
   * lysate lane has more bands than any ladder, and some ladder always fits a subset of them. What
   * separates them is coverage — a real marker lane is almost nothing but ladder bands, while a
   * lysate lane leaves most of its peaks unexplained. Returns null when nothing fits. */
  // products with the same size list (Bio-Rad's four 10–250 standards, for example) fit identically:
  // match one representative per list, in library order
  function distinctSizes(ladders) {
    const seen = new Set();
    return ladders.filter(l => { const k = l.sizes.join(','); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  /* quality = fit × explained, with explained = matched bands / peaks in the lane ≤ bands in the
   * ladder / peaks. That bound lets ladders (largest first) be skipped once they can no longer beat
   * the best fit found, and the caller skip lanes that cannot reach its threshold at all. */
  function markerQuality(peaks, ladders, h, mode, minQuality) {
    if (!peaks.length || !ladders.length) return null;
    const np = Math.max(1, peaks.length);
    const cand = distinctSizes(ladders).map(l => ({ l, ub: Math.min(1, l.sizes.length / np) })).sort((a, b) => b.ub - a.ub);
    if (!cand.length || cand[0].ub < (minQuality || 0)) return null;
    matchMulti.fast = true;
    try {
      let best = null;
      for (const { l, ub } of cand) {
        if (best && ub <= best.quality) break;
        const m = matchLadder(peaks, l.sizes, h, null, mode);
        const explained = m.matchedCount / np, quality = m.score * explained;
        if (!best || quality > best.quality) best = { id: l.id, score: m.score, matched: m.matchedCount, explained, quality };
      }
      return best;
    } finally { matchMulti.fast = false; }
  }
  markerQuality.bound = (peaks, ladders) => Math.min(1, Math.max(0, ...ladders.map(l => l.sizes.length)) / Math.max(1, peaks.length));

  // Rank ladder presets by fit to the detected peaks of one lane
  function rankLadders(peaks, ladders, h, mode) {
    matchMulti.fast = true;
    try {
      return distinctSizes(ladders).map(l => {
        const m = matchLadder(peaks, l.sizes, h, null, mode);
        return { id: l.id, score: m.score, matched: m.matchedCount };
      }).sort((a, b) => (b.score - a.score) || (b.matched - a.matched));
    } finally { matchMulti.fast = false; }
  }

  function fitQuad(pairs) {
    // normal equations for y = a + b x + c x^2
    let S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], T = [0, 0, 0];
    for (const [x, y] of pairs) {
      const v = [1, x, x * x];
      for (let i = 0; i < 3; i++) { T[i] += v[i] * y; for (let j = 0; j < 3; j++) S[i][j] += v[i] * v[j]; }
    }
    const sol = solve3(S, T);
    if (!sol) return null;
    return { a: sol[0], b: sol[1], c: sol[2] };
  }
  function solve3(A, b) {
    const M = A.map((r, i) => r.concat([b[i]]));
    for (let i = 0; i < 3; i++) {
      let p = i;
      for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      if (Math.abs(M[p][i]) < 1e-12) return null;
      [M[i], M[p]] = [M[p], M[i]];
      for (let r = 0; r < 3; r++) if (r !== i) {
        const f = M[r][i] / M[i][i];
        for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c];
      }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  }

  // Estimate size (bp) at row y from marker bands [{bp, y}] by piecewise log-linear interpolation.
  // Outside the band range it extrapolates from the end segment and says so.
  function estimateSizeInfo(y, bands) {
    const B = bands.filter(b => b.y != null).slice().sort((a, b) => a.y - b.y);
    if (B.length < 2) return null;
    let i = 0;
    while (i < B.length - 2 && y > B[i + 1].y) i++;
    const a = B[i], b = B[i + 1];
    if (b.y === a.y) return null;
    const t = (y - a.y) / (b.y - a.y);
    const tol = 2;   // px: a band sitting right on the outermost marker band is not extrapolated
    return {
      bp: Math.exp(Math.log(a.bp) + t * (Math.log(b.bp) - Math.log(a.bp))),
      extrap: y < B[0].y - tol || y > B[B.length - 1].y + tol,
      range: [B[B.length - 1].bp, B[0].bp]
    };
  }
  function estimateSize(y, bands) { const r = estimateSizeInfo(y, bands); return r ? r.bp : null; }

  /* Exposure quality of one capture of a gel (for picking the best of several exposures).
   * Works on a downsampled copy inside the auto-detected band region. Not "darker is better":
   * clipping is punished hardest, but a short exposure loses on dynamic range use and SNR. */
  const EXPO_W = { clip: 0.45, range: 0.25, snr: 0.30 };
  function exposureScore(img) {
    const sm = downsample(img, 600);
    const s = { w: sm.w, h: sm.h, data: sm.data };
    const bright = detectBright(s);
    const r = autoCrop(s, bright);
    const c = cropImg(s, r), sig = signal(c, bright).data, n = c.data.length;
    let clipped = 0;
    for (let i = 0; i < n; i++) if (c.data[i] >= 0.998) clipped++;
    const clipFrac = clipped / n;
    const [p50, p999] = percentiles(sig, [50, 99.9]);
    // noise: robust spread of horizontal neighbour differences (bands are smooth along x)
    const diffs = new Float32Array(Math.max(1, n - c.h));
    let k = 0;
    for (let y = 0; y < c.h; y++) for (let x = 1; x < c.w; x++) diffs[k++] = Math.abs(sig[y * c.w + x] - sig[y * c.w + x - 1]);
    const mad = percentiles(diffs.subarray(0, k), [50])[0];
    const noise = Math.max(1e-5, 1.4826 * mad / Math.SQRT2);
    const snr = (p999 - p50) / noise;
    const rangeUse = Math.min(1, Math.max(0, p999 - p50) / 0.75);
    const snrScore = Math.min(1, Math.max(0, Math.log10(Math.max(1, snr)) / 2.5));
    const clipScore = Math.max(0, 1 - clipFrac / 0.005);   // 0.5 % clipped pixels = 0
    const score = EXPO_W.clip * clipScore + EXPO_W.range * rangeUse + EXPO_W.snr * snrScore;
    return { score, clipFrac, rangeUse, snr, bright };
  }

  /* Which kind of gel is this? Explainable votes, no model:
   *   chroma    – Coomassie gels are colour images (blue bands on a pale background); EtBr on black is grey
   *   bandWidth – protein bands span much of the lane; DNA bands are thin lines
   *   ladder    – DNA ladders have 10–21 evenly spaced bands, protein markers 6–11 uneven ones
   *   curve     – a straight line in log(size) fits a DNA ladder tightly; prestained markers spread
   * Returns {kind, confidence 0..1, reasons[], score(-1..1)} where score > 0 favours protein. */
  function detectGelType(input) {
    const reasons = [];
    let score = 0, voted = 0;
    // codes, not sentences: the UI translates them; v is the measured value behind the vote
    const add = (w, code, v) => { score += w; voted += Math.abs(w); reasons.push({ w: Math.round(w * 100) / 100, code, v }); };

    // colour (only colour images can be Coomassie; a grey image says nothing)
    if (input.colorStats) {
      const { chroma, blueFrac } = input.colorStats;
      if (chroma > 0.12 && blueFrac > 0.05) add(1.2, 'colour', { chroma: Math.round(chroma * 100), blue: Math.round(blueFrac * 100) });
      else if (chroma < 0.06) add(-0.5, 'grey', { chroma: Math.round(chroma * 100) });
    }

    // band geometry of the lane that looks most like a ladder
    let D = null;
    if (input.peaks) {
      D = prepLane({ peaks: input.peaks, sizes: [], profile: input.profile, pitch: input.pitch });
      if (D.bandW != null && D.pitch) {
        const r = D.bandW / D.pitch;   // band thickness as a fraction of the lane pitch
        // measured on synthetic gels: DNA ladder bands ~0.10 of the pitch, protein marker bands ~0.26.
        // No band is taller than the lane spacing: above that, neighbouring bands merged in the
        // measurement and it says nothing
        if (r > 0.9) { /* unreliable */ }
        else if (r > 0.20) add(1.4, 'broad', { pct: Math.round(r * 100) });
        else if (r < 0.16) add(-1.1, 'thin', { pct: Math.round(r * 100) });
      }
      const cnt = sharpBandCount(input.peaks);
      if (cnt >= 12) add(-0.8, 'manyBands', { n: cnt });
      else if (cnt > 0 && cnt <= 11) add(0.4, 'fewBands', { n: cnt });
    }

    /* How many lanes are full of bands. A DNA gel has one or two ladder lanes and samples with a
     * handful of products; a protein gel of lysates has band-rich lanes all the way across. This
     * does not depend on the lane pitch being right, so it still holds on a crowded gel. */
    if (input.richLanes != null && input.laneCount >= 3) {
      if (input.richLanes >= 3) add(1.1, 'richLanes', { n: input.richLanes });
      else if (input.richLanes <= 1) add(-0.3, 'fewRichLanes', { n: input.richLanes });
    }

    // curvature: how far the best straight line in log(size) misses the matched bands. The caller
    // passes bands already matched to a ladder (curvePts: [ln size, y]); matching here is the fallback
    if ((input.curvePts && input.curvePts.length >= 5) || (input.ladder && input.peaks && input.peaks.length >= 5)) {
      let pts = input.curvePts ? input.curvePts.map(p => [p[0], p[1], true]) : null;
      if (!pts) {
        const md = input.ladder.kind === 'dna' ? 'dna' : 'protein';
        const r = matchLadder(input.peaks, input.ladder.sizes, input.h || 1000, null, md);
        pts = r.map((b, k) => [Math.log(input.ladder.sizes[k]), b.y, b.matched]).filter(p => p[2]);
      }
      if (pts.length >= 5) {
        const n = pts.length, sx = pts.reduce((a, p) => a + p[0], 0) / n, sy = pts.reduce((a, p) => a + p[1], 0) / n;
        let sxy = 0, sxx = 0;
        pts.forEach(p => { sxy += (p[0] - sx) * (p[1] - sy); sxx += (p[0] - sx) ** 2; });
        const k = sxx ? sxy / sxx : 0;
        const resid = pts.reduce((a, p) => a + Math.abs(p[1] - (sy + k * (p[0] - sx))), 0) / n;
        const rel = resid / (input.h || 1000);
        if (rel > 0.018) add(0.9, 'curve', { pct: Math.round(rel * 1000) / 10 });
        else if (rel < 0.01) add(-0.7, 'linear', { pct: Math.round(rel * 1000) / 10 });
      }
    }

    const conf = voted ? Math.min(1, Math.abs(score) / Math.max(1.2, voted * 0.8)) : 0;
    return { kind: score > 0.35 ? 'protein' : 'dna', score, confidence: conf, reasons };
  }

  G.Engine = {
    clamp, percentiles, gaussSmooth, downsample, rotate, cropImg, detectBright, autoLevels, saturation,
    toImageData, deskew, autoCrop, detectLanes, measurePitch, dividedPitch, evenLanes, laneProfile, detectBands, matchLadder, estimateSize, estimateSizeInfo, exposureScore,sharpBandCount, rankLadders, markerQuality, jointLadders, matchMulti, detectLaneLattice, detectGelType
  };
})(window);
