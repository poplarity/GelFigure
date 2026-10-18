/* Export: PNG (DPI + sRGB + embedded processing summary), TIFF (LZW), SVG, uncropped figure-matched
 * image, untouched original data, JSON processing log. */
(function (G) {
  'use strict';

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---- PNG chunks ----
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function chunk(type, data) {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }
  const latin1 = s => Uint8Array.from(String(s), ch => { const c = ch.charCodeAt(0); return c < 256 ? c : 63; });
  // iTXt keeps UTF-8 (Chinese lane names survive)
  function itxt(key, text) {
    const k = latin1(key), t = new TextEncoder().encode(text);
    const d = new Uint8Array(k.length + 5 + t.length);
    d.set(k, 0); d.set(t, k.length + 5);   // keyword\0, compression flag 0, method 0, empty lang\0, empty translated\0
    return chunk('iTXt', d);
  }
  /* Insert pHYs (dpi), sRGB and text metadata right after IHDR. dpi is the pixel density of THIS
   * raster (text and lines really are rendered at it); the gel's own effective dpi is written as
   * text and checked before export, never passed off as the raster density. */
  async function pngDecorate(blob, dpi, texts) {
    const src = new Uint8Array(await blob.arrayBuffer());
    const ppm = Math.round(dpi / 0.0254), ph = new Uint8Array(9), dv = new DataView(ph.buffer);
    dv.setUint32(0, ppm); dv.setUint32(4, ppm); ph[8] = 1;
    const parts = [chunk('pHYs', ph), chunk('sRGB', Uint8Array.of(0))];
    Object.entries(texts || {}).forEach(([k, v]) => parts.push(itxt(k, v)));
    // copy the encoder's chunks, dropping the ones we replace (each may appear only once; iCCP and
    // sRGB are mutually exclusive) and inserting ours right after IHDR
    const keep = [src.subarray(0, 33)];
    for (let p = 33; p + 8 <= src.length;) {
      const len = ((src[p] << 24) | (src[p + 1] << 16) | (src[p + 2] << 8) | src[p + 3]) >>> 0;
      const type = String.fromCharCode(src[p + 4], src[p + 5], src[p + 6], src[p + 7]);
      if (!['pHYs', 'sRGB', 'iCCP', 'gAMA', 'cHRM'].includes(type)) keep.push(src.subarray(p, p + 12 + len));
      p += 12 + len;
    }
    return new Blob([keep[0], ...parts, ...keep.slice(1)], { type: 'image/png' });
  }

  function svgToCanvas(svg, wPt, hPt, dpi) {
    return new Promise((resolve, reject) => {
      const scale = dpi / 72;
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = Math.round(wPt * scale); c.height = Math.round(hPt * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(G.L('SVG 栅格化失败', 'Could not rasterise the SVG'))); };
      img.src = url;
    });
  }

  // minimal summary embedded in exported rasters: the figure carries its own audit trail
  function summaryText(S) {
    const A = G.App, k = A.clipStats();
    return JSON.stringify({
      tool: 'GelFigure ' + A.VERSION, source: S.file.name, sha256: S.file.sha256,
      rotationDeg: S.rotation, levels: S.levels, effectiveGelDpi: Math.round(A.effectiveDpi()),
      sensorSaturatedFrac: +k.sensorFrac.toFixed(5), levelClippedFrac: +A.bandClipFrac().toFixed(5),
      splicedLanes: S.lanes.map((l, i) => (l.hidden ? i + 1 : null)).filter(v => v != null),
      disclosure: legendHints(S).join(' ')
    });
  }

  async function exportPNG(svg, wPt, hPt, dpi, name, S) {
    const c = await svgToCanvas(svg, wPt, hPt, dpi);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    download(await pngDecorate(blob, dpi, S ? { Software: 'GelFigure ' + G.App.VERSION, Description: summaryText(S) } : {}), name);
  }

  // ---- TIFF (8-bit grayscale, LZW, with resolution) ----
  function lzwEncode(bytes) {
    const out = []; let acc = 0, nacc = 0, width = 9;
    const emit = c => { acc = (acc << width) | c; nacc += width; while (nacc >= 8) { out.push((acc >>> (nacc - 8)) & 255); nacc -= 8; } acc &= (1 << nacc) - 1; };
    let dict = new Map(), next = 258;
    emit(256);
    let w = bytes[0];
    for (let i = 1; i < bytes.length; i++) {
      const c = bytes[i], key = w * 256 + c;
      const hit = dict.get(key);
      if (hit !== undefined) { w = hit; continue; }
      emit(w);
      dict.set(key, next++);
      if (next > (1 << width) - 1 && width < 12) width++;
      if (next >= 4094) { emit(256); dict = new Map(); next = 258; width = 9; }
      w = c;
    }
    emit(w); emit(257);
    if (nacc) out.push((acc << (8 - nacc)) & 255);
    return Uint8Array.from(out);
  }
  // one strip per ~64 KB of pixels keeps every LZW stream small and readers happy
  function encodeTiffGray(gray, w, h, dpi, desc) {
    const rps = Math.max(1, Math.floor(65536 / w)), nStrips = Math.ceil(h / rps);
    const strips = [];
    for (let s = 0; s < nStrips; s++) strips.push(lzwEncode(gray.subarray(s * rps * w, Math.min(h, (s + 1) * rps) * w)));
    const d = latin1(desc || ''), sw = latin1('GelFigure ' + G.App.VERSION);
    const tags = 14;
    let off = 8 + 2 + tags * 12 + 4;
    const resOff = off; off += 16;
    const soOff = off; off += 4 * nStrips;
    const sbOff = off; off += 4 * nStrips;
    const descOff = off; off += d.length + 1;
    const swOff = off; off += sw.length + 1;
    const dataOff = off;
    const total = dataOff + strips.reduce((n, s) => n + s.length, 0);
    const buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf);
    dv.setUint16(0, 0x4949); dv.setUint16(2, 42, true); dv.setUint32(4, 8, true);
    let p = 8; dv.setUint16(p, tags, true); p += 2;
    const tag = (t, type, count, val) => { dv.setUint16(p, t, true); dv.setUint16(p + 2, type, true); dv.setUint32(p + 4, count, true); if (type === 3 && count === 1) dv.setUint16(p + 8, val, true); else dv.setUint32(p + 8, val, true); p += 12; };
    tag(256, 4, 1, w); tag(257, 4, 1, h); tag(258, 3, 1, 8); tag(259, 3, 1, 5); tag(262, 3, 1, 1);
    tag(270, 2, d.length + 1, descOff);
    tag(273, 4, nStrips, nStrips === 1 ? dataOff : soOff);
    tag(277, 3, 1, 1); tag(278, 4, 1, rps);
    tag(279, 4, nStrips, nStrips === 1 ? strips[0].length : sbOff);
    tag(282, 5, 1, resOff); tag(283, 5, 1, resOff + 8); tag(296, 3, 1, 2);
    tag(305, 2, sw.length + 1, swOff);
    dv.setUint32(p, 0, true);
    dv.setUint32(resOff, dpi, true); dv.setUint32(resOff + 4, 1, true); dv.setUint32(resOff + 8, dpi, true); dv.setUint32(resOff + 12, 1, true);
    u8.set(d, descOff); u8.set(sw, swOff);
    let q = dataOff;
    strips.forEach((s, i) => { if (nStrips > 1) { dv.setUint32(soOff + 4 * i, q, true); dv.setUint32(sbOff + 4 * i, s.length, true); } u8.set(s, q); q += s.length; });
    return buf;
  }
  async function exportTIFF(svg, wPt, hPt, dpi, name, S) {
    const c = await svgToCanvas(svg, wPt, hPt, dpi);
    const id = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, n = c.width * c.height;
    const g = new Uint8Array(n);
    for (let i = 0; i < n; i++) g[i] = Math.round(0.299 * id[i * 4] + 0.587 * id[i * 4 + 1] + 0.114 * id[i * 4 + 2]);
    download(new Blob([encodeTiffGray(g, c.width, c.height, dpi, summaryText(S))], { type: 'image/tiff' }), name);
  }

  function exportSVG(svg, name) {
    download(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svg], { type: 'image/svg+xml' }), name);
  }

  /* Uncropped image for the supplement, processed exactly like the figure (Nature asks for the
   * same contrast and orientation), with the crop box and well numbers; cut lanes are marked X. */
  function exportUncropped(S, fullCanvas, name) {
    const W = fullCanvas.width, H = fullCanvas.height;
    const fs = Math.max(14, Math.round(W / 70));
    const top = fs * 4, bottom = fs * 3.2;
    const c = document.createElement('canvas');
    c.width = W; c.height = H + top + bottom;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(fullCanvas, 0, top);
    const r = S.crop;
    ctx.strokeStyle = '#e53935'; ctx.lineWidth = Math.max(2, W / 600);
    ctx.setLineDash([fs * 0.6, fs * 0.4]);
    ctx.strokeRect(r.x, r.y + top, r.w, r.h);
    ctx.setLineDash([]);
    ctx.font = `${fs}px Arial`; ctx.textAlign = 'center';
    S.lanes.forEach((l, i) => {
      ctx.fillStyle = l.hidden ? '#e53935' : '#000';
      ctx.fillText(l.hidden ? 'X' : String(i + 1), l.x, top - fs * 0.5);   // lane x is already absolute
    });
    ctx.fillStyle = '#000'; ctx.textAlign = 'left';
    ctx.font = `bold ${fs}px Arial`;
    ctx.fillText('Uncropped image (same processing as figure)', fs * 0.5, fs * 1.3);
    ctx.font = `${fs * 0.8}px Arial`;
    const lv = S.levels;
    const info = `${S.file.name} · SHA-256 ${String(S.file.sha256 || '').slice(0, 16)}… · ${S.file.bits}-bit · rotation ${S.rotation}° · levels ${(lv.black * 100).toFixed(2)}–${(lv.white * 100).toFixed(2)}% (linear${lv.gamma !== 1 ? ', gamma ' + lv.gamma : ''})${lv.invert ? ' · inverted' : ''}`;
    ctx.fillText(info, fs * 0.5, H + top + fs * 1.2, W - fs);
    const key = S.lanes.map((l, i) => `${l.hidden ? 'X' : i + 1}: ${l.name || '—'}`).join('   ');
    ctx.fillText(key, fs * 0.5, H + top + fs * 2.4, W - fs);
    const dpi = Math.round(S.file.dpi) || 300;
    c.toBlob(async b => download(await pngDecorate(b, dpi, { Software: 'GelFigure ' + G.App.VERSION, Description: summaryText(S) }), name), 'image/png');
  }

  // the untouched bytes of the source file (byte-identical to what the imager wrote)
  function exportOriginal(S, buffer) {
    const ext = (S.file.name.match(/\.[^.]+$/) || ['.tif'])[0];
    download(new Blob([buffer]), S.file.name.replace(/\.[^.]+$/, '') + `_original_sha256-${String(S.file.sha256).slice(0, 12)}${ext}`);
  }

  function processingLog(S) {
    const A = G.App, k = A.clipStats(), r = A.laneRange();
    const bounds = G.Render.laneBounds(S.lanes, A.src.w);
    return {
      tool: 'GelFigure', version: A.VERSION, exportedAt: new Date().toISOString(),
      environment: { userAgent: navigator.userAgent, figureFont: 'Arial, Helvetica, sans-serif (vector text)' },
      source: { file: S.file.name, sha256: S.file.sha256, bytes: S.file.size, width: A.src.w, height: A.src.h, bitDepth: S.file.bits, dpi: S.file.dpi || null },
      rotationDeg: S.rotation, autoRotationDeg: A.autoRotation,
      crop: S.crop, figureWells: r ? [r[0] + 1, r[1] + 1] : null,
      levels: Object.assign({ note: 'linear whole-image stretch; values are fractions of full scale' }, S.levels),
      clipping: {
        sensorSaturatedPixels: k.sensor, sensorSaturatedFrac: k.sensorFrac,
        levelClippedHighPixels: k.high, levelClippedLowPixels: k.low,
        levelClippedOnBandSideFrac: A.bandClipFrac(), pixelsInCrop: k.n
      },
      resolution: { gelWidthMm: A.gelWidthMm(), gelPixelsAcross: A.visibleWidthPx(), effectiveGelDpi: Math.round(A.effectiveDpi()), exportDpi: S.style.dpi },
      lanes: S.lanes.map((l, i) => ({ well: i + 1, x: Math.round(l.x * 10) / 10, name: l.name, removedFromFigure: !!l.hidden,
        removal: l.hidden ? { reason: l.hiddenReason || 'manual', xFrom: Math.round(bounds[i][0]), xTo: Math.round(bounds[i][1]) } : undefined })),
      markers: S.markers.map(m => ({ well: m.lane + 1, ladder: (G.Ladders.get(m.ladderId) || {}).name, fitScore: m.score, bands: m.bands.map(b => ({ bp: b.bp, y: Math.round(b.y * 10) / 10, autoMatched: b.matched, manual: b.manual, labelled: b.show })) })),
      arrows: S.arrows.map(a => {
        const e = A.estimateInfo(a.y);
        return { text: a.text, y: Math.round(a.y * 10) / 10, label: A.arrowLabel(a), userSize: a.sizeText || null,
          estimatedBp: e ? Math.round(e.bp) : null, extrapolated: e ? e.extrap : null, markersUsed: e ? e.used.map(i => i + 1) : [],
          perMarker: e ? e.perMarker.map(p => ({ well: p.lane + 1, bp: Math.round(p.bp), extrapolated: p.extrap })) : [] };
      }),
      groups: S.groups.map(g => ({ fromWell: Math.min(g.from, g.to) + 1, toWell: Math.max(g.from, g.to) + 1, text: g.text })),
      conditions: S.conditions, style: S.style,
      legendHints: legendHints(S)
    };
  }

  function legendHints(S) {
    const h = [];
    const cut = S.lanes.map((l, i) => (l.hidden ? i + 1 : null)).filter(v => v != null);
    if (cut.length) h.push(`Lane${cut.length > 1 ? 's' : ''} ${cut.join(', ')} ${cut.length > 1 ? 'were' : 'was'} removed from the same gel; splice sites are indicated by ` + (S.style.spliceStyle === 'line' ? 'lines.' : 'white gaps.'));
    if (S.levels.invert) h.push('Image colours were inverted for display.');
    if (S.levels.gamma !== 1) h.push(`A non-linear gamma adjustment (γ = ${S.levels.gamma}) was applied to the whole image.`);
    const names = [...new Set(S.markers.map(m => G.Ladders.get(m.ladderId)).filter(Boolean).map(l => l.name.replace(/\s*\(.*\)/, '')))];
    if (names.length === 1) h.push(`M, ${names[0]}.`);
    else if (names.length > 1) h.push(`M, DNA ladders (${S.markers.map(m => `lane ${m.lane + 1}: ${G.Ladders.get(m.ladderId).name.replace(/\s*\(.*\)/, '')}`).join('; ')}).`);
    if (S.arrows.some(a => a.size && !a.sizeText && (G.App.estimateInfo(a.y) || {}).extrap)) h.push('Sizes marked ≈ were extrapolated beyond the ladder range.');
    return h;
  }

  G.Export = { download, exportPNG, exportTIFF, exportSVG, exportUncropped, exportOriginal, processingLog, legendHints, svgToCanvas, encodeTiffGray, pngDecorate };
})(window);
