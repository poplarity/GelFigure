/* Synthetic agarose gel (16-bit, slightly tilted) for the demo button and self-tests. */
(function (G) {
  'use strict';

  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function makeGel(opts) {
    opts = Object.assign({ w: 1400, h: 1000, lanes: 12, tilt: 1.2, ladder: 'gr1kbplus', seed: 7 }, opts || {});
    const { w, h } = opts, rnd = rng(opts.seed);
    const d = new Float32Array(w * h);
    const gx0 = 140, gx1 = 1260, gy0 = 90, gy1 = 900;
    const pitch = 80, laneW = 52, x0 = 260, wellY = 150;
    // migration: y = A + B ln(bp)
    const yTop = 200, yBot = 840, B = (yBot - yTop) / (Math.log(75) - Math.log(20000)), A = yTop - B * Math.log(20000);
    const yOf = bp => A + B * Math.log(bp);
    const lad = G.Ladders.get(opts.ladder);
    const samples = [
      null, // ladder
      [[1500, 0.55]], [[1500, 0.6]], [[1500, 0.5], [60, 0.15]], [],
      [[850, 0.5]], [[850, 0.45], [3000, 0.12]], [[480, 0.65]], [[480, 0.62]],
      [[2200, 0.4], [700, 0.4]], [[60, 0.2]], []
    ];
    const bands = [];
    for (let L = 0; L < opts.lanes; L++) {
      const cx = x0 + L * pitch;
      if (L === 0) lad.sizes.forEach(bp => bands.push({ cx, y: yOf(bp), a: lad.ref.includes(bp) ? 0.75 : 0.38, s: 3.2 }));
      else (samples[L] || []).forEach(([bp, a]) => bands.push({ cx, y: yOf(bp), a, s: 4 }));
      bands.push({ cx, y: wellY, a: 0.10, s: 5, well: true });
    }
    bands.push({ cx: x0 + 7 * pitch, y: yOf(480), a: 1.4, s: 3.5 }); // saturating band
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0.035 + 0.012 * (x / w) + 0.008 * Math.sin(y / 170);
        if (x > gx0 && x < gx1 && y > gy0 && y < gy1) v += 0.03;
        d[y * w + x] = v;
      }
    }
    for (const b of bands) {
      const hw = laneW / 2, ry = Math.ceil(b.s * 4);
      for (let y = Math.max(0, Math.floor(b.y - ry - 4)); y < Math.min(h, b.y + ry + 4); y++) {
        for (let x = Math.max(0, Math.floor(b.cx - hw - 3)); x < Math.min(w, b.cx + hw + 3); x++) {
          const dx = (x - b.cx) / hw;
          const smile = 2.5 * dx * dx;
          const edge = 1 / (1 + Math.exp((Math.abs(x - b.cx) - hw) / 1.2));
          const dy = y - (b.y - smile);
          d[y * w + x] += b.a * edge * Math.exp(-dy * dy / (2 * b.s * b.s));
        }
      }
    }
    for (let i = 0; i < d.length; i++) d[i] = Math.min(1, Math.max(0, d[i] + (rnd() - 0.5) * 0.012));
    let img = { w, h, data: d };
    if (opts.tilt) img = G.Engine.rotate(img, opts.tilt);
    return { width: w, height: h, data: img.data, truth: { pitch, x0, lanes: opts.lanes, yOf, gel: [gx0, gy0, gx1, gy1] } };
  }

  /* Synthetic protein gel: broad bands, a 10–180 kDa prestained marker, a few sample lanes.
   * Used by the demo button and the self-tests to exercise protein mode and gel-type detection. */
  function makeProteinGel(opts) {
    opts = Object.assign({ w: 1300, h: 950, lanes: 10, tilt: 0.8, ladder: 'thermo_26616', seed: 11 }, opts || {});
    const { w, h } = opts, rnd = rng(opts.seed);
    const d = new Float32Array(w * h);
    const gx0 = 110, gx1 = 1190, gy0 = 80, gy1 = 870;
    const pitch = 88, laneW = 58, x0 = 300, wellY = 140;
    // protein migration: y = A + B ln(kDa), slightly compressed at the bottom (large proteins)
    const yTop = 200, yBot = 800;
    const yOf = k => { const t = (Math.log(k) - Math.log(180)) / (Math.log(10) - Math.log(180)); return yTop + (yBot - yTop) * (t + 0.10 * t * (1 - t)); };
    const lad = G.Ladders.get(opts.ladder);
    const samples = [
      null, // marker
      [[55, 0.9], [25, 0.35]], [[55, 0.95]], [[70, 0.7], [55, 0.5], [25, 0.4]], [],
      [[100, 0.6]], [[40, 0.55], [15, 0.3]], [[55, 0.8], [30, 0.25]], [[130, 0.5], [70, 0.75], [25, 0.3]], []
    ];
    // purification gel: one lysate pattern repeated over most lanes, merged into about a dozen peaks
    // per lane, so some ladder fits each of them about as well as the real marker lane on its own
    const lys = opts.purification ? Array.from({ length: 26 }, () => [Math.exp(Math.log(12) + rnd() * Math.log(160 / 12)), 0.12 + rnd() * 0.4, 6 + rnd() * 4]) : null;
    const bands = [];
    for (let L = 0; L < opts.lanes; L++) {
      const cx = x0 + L * pitch;
      if (L === 0) lad.sizes.forEach(k => bands.push({ cx, y: yOf(k), a: lad.ref.includes(k) ? 0.95 : 0.6, s: 9 }));
      else if (lys) {
        if (L < opts.lanes - 2) lys.forEach(([k, a, s]) => bands.push({ cx, y: yOf(k), a: a * (0.8 + rnd() * 0.3), s }));
        bands.push({ cx, y: yOf(28), a: L < opts.lanes - 2 ? 0.5 : 1, s: 10 });
      } else if (opts.crowded) {
        // whole-cell lysate: a couple of dozen bands across the lane, as on a real Coomassie gel.
        // Such a lane has far more bands than any ladder, which is why band count alone cannot
        // decide which lane is the marker.
        const n = 18 + Math.floor(rnd() * 8);
        for (let b = 0; b < n; b++) bands.push({ cx, y: yTop + (yBot - yTop) * (b + 0.4 + rnd() * 0.3) / n, a: 0.3 + rnd() * 0.6, s: 7 + rnd() * 4 });
      } else (samples[L] || []).forEach(([k, a]) => bands.push({ cx, y: yOf(k), a, s: 10 }));
      bands.push({ cx, y: wellY, a: 0.12, s: 6, well: true });
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0.06 + 0.01 * Math.sin(x / 210) + 0.008 * Math.cos(y / 150);
        if (x > gx0 && x < gx1 && y > gy0 && y < gy1) v += 0.04;
        d[y * w + x] = v;
      }
    }
    for (const b of bands) {
      const hw = laneW / 2, ry = Math.ceil(b.s * 4);
      for (let y = Math.max(0, Math.floor(b.y - ry - 4)); y < Math.min(h, b.y + ry + 4); y++) {
        for (let x = Math.max(0, Math.floor(b.cx - hw - 3)); x < Math.min(w, b.cx + hw + 3); x++) {
          const dx = (x - b.cx) / hw;
          const smile = 4 * dx * dx;   // protein gels smile more
          const edge = 1 / (1 + Math.exp((Math.abs(x - b.cx) - hw) / 2.2));
          const dy = y - (b.y - smile);
          d[y * w + x] += b.a * edge * Math.exp(-dy * dy / (2 * b.s * b.s));
        }
      }
    }
    for (let i = 0; i < d.length; i++) d[i] = Math.min(1, Math.max(0, d[i] + (rnd() - 0.5) * 0.014));
    let img = { w, h, data: d };
    if (opts.tilt) img = G.Engine.rotate(img, opts.tilt);
    return { width: w, height: h, data: img.data, truth: { pitch, x0, lanes: opts.lanes, yOf, gel: [gx0, gy0, gx1, gy1] } };
  }

  // Uncompressed 16-bit grayscale TIFF encoder
  function encodeTiff16(img) {
    const { width: w, height: h, data } = img;
    const nTags = 11, ifdOff = 8, ifdSize = 2 + nTags * 12 + 4, dataOff = ifdOff + ifdSize + 16;
    const buf = new ArrayBuffer(dataOff + w * h * 2), dv = new DataView(buf);
    dv.setUint16(0, 0x4949); dv.setUint16(2, 42, true); dv.setUint32(4, ifdOff, true);
    let p = ifdOff; dv.setUint16(p, nTags, true); p += 2;
    const resOff = ifdOff + ifdSize;
    const tag = (t, type, count, val) => { dv.setUint16(p, t, true); dv.setUint16(p + 2, type, true); dv.setUint32(p + 4, count, true); if (type === 3 && count === 1) dv.setUint16(p + 8, val, true); else dv.setUint32(p + 8, val, true); p += 12; };
    tag(256, 4, 1, w); tag(257, 4, 1, h); tag(258, 3, 1, 16); tag(259, 3, 1, 1); tag(262, 3, 1, 1);
    tag(273, 4, 1, dataOff); tag(277, 3, 1, 1); tag(278, 4, 1, h); tag(279, 4, 1, w * h * 2);
    tag(282, 5, 1, resOff); tag(296, 3, 1, 2);
    dv.setUint32(p, 0, true);
    dv.setUint32(resOff, 300, true); dv.setUint32(resOff + 4, 1, true);
    for (let i = 0; i < w * h; i++) dv.setUint16(dataOff + i * 2, Math.round(data[i] * 65535), true);
    return buf;
  }

  G.Demo = { makeGel, makeProteinGel, encodeTiff16 };
})(window);
