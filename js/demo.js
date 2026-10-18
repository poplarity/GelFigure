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

  G.Demo = { makeGel, encodeTiff16 };
})(window);
