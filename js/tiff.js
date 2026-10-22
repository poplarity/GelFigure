/* Minimal TIFF decoder (no dependencies).
 * Supports: 8/16/32-bit integer and 32-bit float, 1-4 samples per pixel, 1/2/4-bit single-sample data,
 * strips or tiles, compression none / LZW / PackBits / Deflate, predictor 2,
 * PhotometricInterpretation WhiteIsZero/BlackIsZero/RGB/Palette.
 * Output: grayscale Float32Array normalized to 0..1 (1 = sensor max for integer data).
 */
(function (G) {
  'use strict';

  const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };

  function readIFDs(dv) {
    const bo = dv.getUint16(0);
    const le = bo === 0x4949;
    if (!le && bo !== 0x4d4d) throw new Error(G.L('不是有效的 TIFF 文件', 'Not a valid TIFF file'));
    const magic = dv.getUint16(2, le);
    if (magic === 43) throw new Error(G.L('暂不支持 BigTIFF', 'BigTIFF is not supported yet'));
    if (magic !== 42) throw new Error(G.L('不是有效的 TIFF 文件', 'Not a valid TIFF file'));
    const ifds = [];
    let off = dv.getUint32(4, le);
    const seen = new Set();
    while (off && off < dv.byteLength && !seen.has(off) && ifds.length < 64) {
      seen.add(off);
      const n = dv.getUint16(off, le);
      const tags = {};
      for (let i = 0; i < n; i++) {
        const e = off + 2 + i * 12;
        const tag = dv.getUint16(e, le);
        const type = dv.getUint16(e + 2, le);
        const count = dv.getUint32(e + 4, le);
        const size = (TYPE_SIZE[type] || 1) * count;
        const vo = size <= 4 ? e + 8 : dv.getUint32(e + 8, le);
        tags[tag] = readValues(dv, type, count, vo, le);
      }
      ifds.push(tags);
      off = dv.getUint32(off + 2 + n * 12, le);
    }
    return { ifds, le };
  }

  function readValues(dv, type, count, off, le) {
    const out = [];
    if (off + (TYPE_SIZE[type] || 1) * count > dv.byteLength) return out;
    for (let i = 0; i < count; i++) {
      switch (type) {
        case 1: case 2: case 7: out.push(dv.getUint8(off + i)); break;
        case 6: out.push(dv.getInt8(off + i)); break;
        case 3: out.push(dv.getUint16(off + i * 2, le)); break;
        case 8: out.push(dv.getInt16(off + i * 2, le)); break;
        case 4: out.push(dv.getUint32(off + i * 4, le)); break;
        case 9: out.push(dv.getInt32(off + i * 4, le)); break;
        case 5: out.push(dv.getUint32(off + i * 8, le) / (dv.getUint32(off + i * 8 + 4, le) || 1)); break;
        case 10: out.push(dv.getInt32(off + i * 8, le) / (dv.getInt32(off + i * 8 + 4, le) || 1)); break;
        case 11: out.push(dv.getFloat32(off + i * 4, le)); break;
        case 12: out.push(dv.getFloat64(off + i * 8, le)); break;
        default: out.push(0);
      }
    }
    return out;
  }

  function lzwDecode(src, expected) {
    const out = new Uint8Array(expected + 4096);
    const prefix = new Int32Array(4096), suffix = new Uint8Array(4096);
    const len = new Int32Array(4096), first = new Uint8Array(4096);
    for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = i; len[i] = 1; first[i] = i; }
    let next = 258, width = 9, bitPos = 0, old = -1, op = 0;
    const nbits = src.length * 8;
    const writeStr = (code) => {
      const L = len[code];
      if (op + L > out.length) return false;
      let p = op + L - 1, c = code;
      while (c !== -1) { out[p--] = suffix[c]; c = prefix[c]; }
      op += L;
      return true;
    };
    while (bitPos + width <= nbits && op < expected) {
      const b = bitPos >> 3, sh = bitPos & 7;
      const v = (((src[b] << 16) | ((src[b + 1] | 0) << 8) | (src[b + 2] | 0)) >>> (24 - sh - width)) & ((1 << width) - 1);
      bitPos += width;
      const code = v;
      if (code === 257) break;
      if (code === 256) { next = 258; width = 9; old = -1; continue; }
      if (old === -1) { out[op++] = code; old = code; continue; }
      let f;
      if (code < next) {
        if (!writeStr(code)) break;
        f = first[code];
      } else {
        if (!writeStr(old)) break;
        out[op++] = first[old];
        f = first[old];
      }
      if (next < 4096) {
        prefix[next] = old; suffix[next] = f; first[next] = first[old]; len[next] = len[old] + 1;
        next++;
      }
      if (next >= (1 << width) - 1 && width < 12) width++;
      old = code;
    }
    return out.subarray(0, Math.min(op, expected));
  }

  function packBitsDecode(src, expected) {
    const out = new Uint8Array(expected);
    let i = 0, op = 0;
    while (i < src.length && op < expected) {
      let n = src[i++];
      if (n > 127) n -= 256;
      if (n >= 0) { for (let k = 0; k <= n && op < expected; k++) out[op++] = src[i++]; }
      else if (n !== -128) { const b = src[i++]; for (let k = 0; k < 1 - n && op < expected; k++) out[op++] = b; }
    }
    return out;
  }

  async function inflate(src) {
    if (typeof DecompressionStream === 'undefined') throw new Error(G.L('浏览器不支持 Deflate 解压，请更新浏览器', 'This browser cannot decompress Deflate; please update it'));
    const stream = new Blob([src]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function decompress(comp, bytes, expected) {
    switch (comp) {
      case 1: return bytes;
      case 5: return lzwDecode(bytes, expected);
      case 8: case 32946: return inflate(bytes);
      case 32773: return packBitsDecode(bytes, expected);
      default: throw new Error(G.L('不支持的 TIFF 压缩方式: ' + comp + '（请从成像软件导出为未压缩或 LZW TIFF）', 'Unsupported TIFF compression: ' + comp + ' (export an uncompressed or LZW TIFF from the imaging software)'));
    }
  }

  // Undo horizontal differencing predictor on a decoded block (chunky layout)
  function undoPredictor(view, w, h, spp, bits, le) {
    if (bits === 8) {
      for (let y = 0; y < h; y++) {
        const r = y * w * spp;
        for (let i = spp; i < w * spp; i++) view[r + i] = (view[r + i] + view[r + i - spp]) & 0xff;
      }
    } else if (bits === 16) {
      const dv = new DataView(view.buffer, view.byteOffset, view.byteLength);
      for (let y = 0; y < h; y++) {
        const r = y * w * spp * 2;
        for (let i = spp; i < w * spp; i++) {
          const a = dv.getUint16(r + i * 2, le), p = dv.getUint16(r + (i - spp) * 2, le);
          dv.setUint16(r + i * 2, (a + p) & 0xffff, le);
        }
      }
    }
  }

  /* Palette (indexed) TIFF: pixel values are indices into a colour map (tag 320: all reds, then greens,
   * then blues, 0..65535). What the intensity is depends on the map:
   *  - grey map (R = G = B for every colour used): the map value itself;
   *  - false-colour map (a heat map: brightness rises or falls steadily with the index): the index is
   *    the measured signal, so it is used directly — taking the colour's brightness would bend it;
   *  - anything else is a real colour picture stored with a palette (a scanned Coomassie gel): its
   *    brightness, with colour statistics for telling a protein gel from a DNA gel. */
  function paletteLut(cmap, bits, vals) {
    const N = 1 << bits, R = cmap.slice(0, N), Gn = cmap.slice(N, 2 * N), B = cmap.slice(2 * N, 3 * N);
    const used = new Uint32Array(N);
    for (let i = 0; i < vals.length; i++) used[vals[i]]++;
    const ids = [];
    for (let i = 0; i < N; i++) if (used[i]) ids.push(i);
    const lut = new Float32Array(N);
    if (ids.every(i => R[i] === Gn[i] && R[i] === B[i])) {
      for (let i = 0; i < N; i++) lut[i] = R[i] / 65535;
      return { lut, colorStats: null, kind: 'grey' };
    }
    const Y = i => (0.299 * R[i] + 0.587 * Gn[i] + 0.114 * B[i]) / 65535;
    let up = 0, down = 0;
    for (let k = 1; k < ids.length; k++) { const d = Y(ids[k]) - Y(ids[k - 1]); if (d > 1e-3) up++; else if (d < -1e-3) down++; }
    const steps = up + down;
    if (ids.length >= 16 && steps && Math.min(up, down) <= steps * 0.03) {
      const rising = up >= down;
      for (let i = 0; i < N; i++) lut[i] = rising ? i / (N - 1) : 1 - i / (N - 1);
      return { lut, colorStats: null, kind: 'false-colour' };
    }
    for (let i = 0; i < N; i++) lut[i] = Y(i);
    let chroma = 0, blue = 0, cnt = 0;
    const step = Math.max(1, Math.floor(vals.length / 200000));
    for (let p = 0; p < vals.length; p += step) {
      const i = vals[p], r = R[i], g = Gn[i], b = B[i], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 0) chroma += (mx - mn) / mx;
      if (b > r * 1.15 && b > g * 1.08) blue++;
      cnt++;
    }
    return { lut, colorStats: cnt ? { chroma: chroma / cnt, blueFrac: blue / cnt } : null, kind: 'colour' };
  }

  async function decode(buffer) {
    const dv = new DataView(buffer);
    const { ifds, le } = readIFDs(dv);
    if (!ifds.length) throw new Error(G.L('TIFF 中没有图像', 'The TIFF contains no image'));
    // choose the largest page (skip thumbnails)
    let t = ifds[0], best = 0;
    for (const d of ifds) {
      const a = (d[256] ? d[256][0] : 0) * (d[257] ? d[257][0] : 0);
      if (a > best) { best = a; t = d; }
    }
    const w = t[256][0], h = t[257][0];
    const bitsArr = t[258] || [1];
    const bits = bitsArr[0];
    const spp = (t[277] || [1])[0];
    const comp = (t[259] || [1])[0];
    const photo = (t[262] || [1])[0];
    const planar = (t[284] || [1])[0];
    const predictor = (t[317] || [1])[0];
    const fmt = (t[339] || [1])[0]; // 1 uint, 2 int, 3 float
    // 1/2/4-bit data (two-colour or 16-colour palettes, mostly) is packed several samples per byte
    const packed = bits < 8;
    if (![1, 2, 4, 8, 16, 32].includes(bits) || (packed && spp !== 1)) throw new Error(G.L('不支持的位深: ', 'Unsupported bit depth: ') + bits + ' bit');
    if (photo === 3 && (spp !== 1 || bits > 16 || !t[320] || t[320].length < 3 * (1 << bits)))
      throw new Error(G.L('这个调色板 TIFF 缺少颜色表，或格式不受支持；请从成像软件导出灰度 TIFF', 'This palette TIFF has no colour map or an unsupported layout; export a grey-scale TIFF from the imaging software'));
    const bps = bits / 8;
    const rowB = Math.ceil(w * bits / 8);   // bytes per image row of packed data
    const tiled = !!t[322];
    const total = new Uint8Array(packed ? rowB * h : w * h * spp * bps);
    const planes = planar === 2 ? spp : 1;
    const sppBlock = planar === 2 ? 1 : spp;

    if (!tiled) {
      const offs = t[273], counts = t[279];
      const rps = Math.min((t[278] || [h])[0], h);
      const stripsPerPlane = Math.ceil(h / rps);
      for (let s = 0; s < offs.length; s++) {
        const plane = Math.floor(s / stripsPerPlane);
        if (plane >= planes) break;
        const sy = (s % stripsPerPlane) * rps;
        const rows = Math.min(rps, h - sy);
        const expected = packed ? rows * rowB : rows * w * sppBlock * bps;
        const cnt = counts ? counts[s] : expected;
        let block = await decompress(comp, new Uint8Array(buffer, offs[s], Math.min(cnt, buffer.byteLength - offs[s])), expected);
        if (block === undefined) continue;
        block = new Uint8Array(block.buffer.slice(block.byteOffset, block.byteOffset + Math.min(block.byteLength, expected)));
        if (predictor === 2 && !packed) undoPredictor(block, w, rows, sppBlock, bits, le);
        const dst = packed ? sy * rowB : plane * w * h * bps + sy * w * sppBlock * bps;
        total.set(block.subarray(0, Math.min(block.length, total.length - dst)), dst);
      }
    } else {
      const tw = t[322][0], th = t[323][0];
      const offs = t[324], counts = t[325];
      const across = Math.ceil(w / tw), down = Math.ceil(h / th);
      const perPlane = across * down;
      for (let k = 0; k < offs.length; k++) {
        const plane = Math.floor(k / perPlane);
        if (plane >= planes) break;
        const idx = k % perPlane;
        const tx = (idx % across) * tw, ty = Math.floor(idx / across) * th;
        const rowBytes = packed ? Math.ceil(tw * bits / 8) : tw * sppBlock * bps;
        const expected = th * rowBytes;
        let block = await decompress(comp, new Uint8Array(buffer, offs[k], counts[k]), expected);
        block = new Uint8Array(block.buffer.slice(block.byteOffset, block.byteOffset + Math.min(block.byteLength, expected)));
        if (predictor === 2 && !packed) undoPredictor(block, tw, th, sppBlock, bits, le);
        // tile widths are multiples of 16, so a packed tile starts on a byte boundary
        const copyW = packed ? Math.ceil(Math.min(tw, w - tx) * bits / 8) : Math.min(tw, w - tx) * sppBlock * bps;
        for (let r = 0; r < th && ty + r < h; r++) {
          const dst = packed ? (ty + r) * rowB + tx * bits / 8 : plane * w * h * bps + ((ty + r) * w + tx) * sppBlock * bps;
          total.set(block.subarray(r * rowBytes, r * rowBytes + copyW), dst);
        }
      }
    }

    // Convert to grayscale float
    const n = w * h;
    const gray = new Float32Array(n);
    const tdv = new DataView(total.buffer);
    const xres = t[282] ? t[282][0] : 0;
    const unit = (t[296] || [2])[0];
    const dpi = unit === 3 ? xres * 2.54 : xres;

    // palette indices and packed 1/2/4-bit grey levels: integer sample values first, then intensities
    if (photo === 3 || packed) {
      const vals = new Uint16Array(n);
      if (packed) {
        const mask = (1 << bits) - 1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const bit = x * bits;
          vals[y * w + x] = (total[y * rowB + (bit >> 3)] >> (8 - bits - (bit & 7))) & mask;
        }
      } else if (bits === 8) vals.set(total.subarray(0, n));
      else for (let i = 0; i < n; i++) vals[i] = tdv.getUint16(i * 2, le);
      const warnings = [];
      let colorStats = null;
      if (photo === 3) {
        const pal = paletteLut(t[320], bits, vals);
        for (let i = 0; i < n; i++) gray[i] = pal.lut[vals[i]];
        colorStats = pal.colorStats;
        warnings.push(pal.kind === 'false-colour'
          ? G.L('这是伪彩色调色板 TIFF：已按颜色表的序号还原为灰度信号。如有成像仪导出的原始灰度 TIFF，建议用原图。', 'This is a false-colour palette TIFF: the signal was recovered from the palette index. Use the original grey-scale TIFF from the imager if you have it.')
          : G.L(`这是调色板 TIFF（${bits} 位）：已按颜色表转为灰度。如有原始 16 位 TIFF，动态范围更大。`, `This is a palette TIFF (${bits}-bit), converted to grey through its colour map. The raw 16-bit TIFF, if you have it, has more dynamic range.`));
      } else {
        const mx = (1 << bits) - 1;
        for (let i = 0; i < n; i++) gray[i] = photo === 0 ? 1 - vals[i] / mx : vals[i] / mx;
      }
      let actualMax = 0;
      for (let i = 0; i < n; i++) if (gray[i] > actualMax) actualMax = gray[i];
      return { width: w, height: h, data: gray, bits: photo === 3 ? Math.max(8, bits) : bits, spp, compression: comp, actualMax, colorStats, dpi, warnings };
    }
    const get = (byteIdx) => {
      if (bits === 8) return fmt === 2 ? tdv.getInt8(byteIdx) : total[byteIdx];
      if (bits === 16) return fmt === 2 ? tdv.getInt16(byteIdx, le) : tdv.getUint16(byteIdx, le);
      return fmt === 3 ? tdv.getFloat32(byteIdx, le) : (fmt === 2 ? tdv.getInt32(byteIdx, le) : tdv.getUint32(byteIdx, le));
    };
    const color = spp >= 3 && photo === 2;
    // Colour statistics, for telling a Coomassie gel from a DNA gel: mean saturation and the share of
    // pixels whose blue channel dominates. Kept only for colour images; grey images report null.
    let chromaSum = 0, blueDom = 0, colorSamples = 0;
    const stepC = Math.max(1, Math.floor(n / 200000));
    for (let i = 0; i < n; i++) {
      let v;
      if (color) {
        const a = planar === 2 ? [i * bps, (n + i) * bps, (2 * n + i) * bps]
          : [(i * spp) * bps, (i * spp + 1) * bps, (i * spp + 2) * bps];
        const r = get(a[0]), g = get(a[1]), b = get(a[2]);
        v = 0.299 * r + 0.587 * g + 0.114 * b;
        if (i % stepC === 0) {
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mx > 0) chromaSum += (mx - mn) / mx;
          if (b > r * 1.15 && b > g * 1.08) blueDom++;
          colorSamples++;
        }
      } else {
        v = get((planar === 2 ? i : i * spp) * bps);
      }
      gray[i] = v;
    }
    const colorStats = color && colorSamples ? { chroma: chromaSum / colorSamples, blueFrac: blueDom / colorSamples } : null;
    let maxVal;
    if (fmt === 3) {
      maxVal = 0; for (let i = 0; i < n; i++) if (gray[i] > maxVal) maxVal = gray[i];
      maxVal = maxVal || 1;
    } else {
      maxVal = Math.pow(2, bits) - 1;
      // Some imagers store 12/14-bit data in 16-bit containers: honour MaxSampleValue if given
      if (t[281] && t[281][0] > 0 && t[281][0] < maxVal) maxVal = t[281][0];
    }
    let actualMax = 0;
    for (let i = 0; i < n; i++) {
      let v = gray[i] / maxVal;
      if (photo === 0) v = 1 - v;
      gray[i] = v;
      if (v > actualMax) actualMax = v;
    }
    return { width: w, height: h, data: gray, bits, spp, compression: comp, actualMax, colorStats, dpi };
  }

  // Decode PNG/JPG etc. via the browser
  function decodeBrowserImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const n = c.width * c.height;
        const gray = new Float32Array(n);
        let mx = 0, chromaSum = 0, blueDom = 0, colorSamples = 0;
        const stepC = Math.max(1, Math.floor(n / 200000));
        for (let i = 0; i < n; i++) {
          const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
          const v = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          gray[i] = v; if (v > mx) mx = v;
          if (i % stepC === 0) {
            const mxc = Math.max(r, g, b), mnc = Math.min(r, g, b);
            if (mxc > 0) chromaSum += (mxc - mnc) / mxc;
            if (b > r * 1.15 && b > g * 1.08) blueDom++;
            colorSamples++;
          }
        }
        URL.revokeObjectURL(url);
        resolve({ width: c.width, height: c.height, data: gray, bits: 8, spp: 3, compression: 0, actualMax: mx, dpi: 0,
          colorStats: colorSamples ? { chroma: chromaSum / colorSamples, blueFrac: blueDom / colorSamples } : null });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(G.L('无法读取该图片', 'Cannot read this image'))); };
      img.src = url;
    });
  }

  async function loadFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.tif') || name.endsWith('.tiff')) {
      return decode(await file.arrayBuffer());
    }
    return decodeBrowserImage(file);
  }

  // decode raw file bytes, whatever the format; notes lossy conversions in .warnings
  async function decodeBuffer(buffer, name) {
    const b = new Uint8Array(buffer, 0, Math.min(32, buffer.byteLength));
    const isTiff = (b[0] === 0x49 && b[1] === 0x49 && b[2] === 42) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 42);
    if (isTiff) { const r = await decode(buffer); r.warnings = r.warnings || []; return r; }
    const r = await decodeBrowserImage(new File([buffer], name || 'image'));
    r.warnings = [];
    const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    if (isPng && b[24] === 16) r.warnings.push(G.L('这是 16 位 PNG，浏览器只能按 8 位读取，动态范围已降低。建议改用 16 位 TIFF。', 'This is a 16-bit PNG; browsers read it as 8-bit, so dynamic range is reduced. A 16-bit TIFF is better.'));
    else if (!isPng || b[24] < 16) r.warnings.push(G.L('非 TIFF 图像按 8 位处理；如有原始 16 位 TIFF，建议用 TIFF。', 'Non-TIFF images are handled as 8-bit; use the raw 16-bit TIFF if you have it.'));
    return r;
  }

  G.TIFF = { decode, loadFile, decodeBuffer, _lzwDecode: lzwDecode };
})(window);
