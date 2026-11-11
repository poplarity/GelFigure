/* SDS-PAGE feedback regressions. All signals/images are synthetic. */
import assert from 'node:assert/strict';
import { readPptx } from './pptx.mjs';

export async function proteinFeedbackChecks(browser, base) {
  const results = [], ctx = await browser.newContext(), p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  const check = async (name, fn) => {
    try { await fn(); results.push(['ok', 'protein feedback: ' + name]); }
    catch (e) { results.push(['FAIL', 'protein feedback: ' + name, e.stack]); }
  };
  try {
    await p.goto(base + '/index.html?demo=protein&lang=en');
    await p.waitForFunction(() => document.title.startsWith('READY '), null, { timeout: 120000 });
    await p.evaluate(() => {
      const S = App.S;
      S.lanes.forEach(l => l.name = ''); S.markers = []; S.conditions = []; S.groups = [];
      S.style.laneNumbers = true; S.style.panelLetter = '';
      S.lanes[App.figureLanes()[2]].hidden = true;
    });
    await check('unnamed lane numbers fit the exported SVG, including cut lanes and both numbering modes', async () => {
      const failures = await p.evaluate(() => {
        const bad = [], host = document.createElement('div'); document.body.appendChild(host);
        host.style.cssText = 'position:fixed;left:-20000px;top:0';
        try {
          for (const family of Render.fontNames) for (const pt of [7, 14]) for (const mode of ['well', 'seq']) {
            Object.assign(App.S.style, { fontFamily: family, fontPt: pt, laneNumberMode: mode });
            const f = App.buildFigure(false); host.innerHTML = f.svg;
            const svg = host.querySelector('svg'), v = svg.viewBox.baseVal;
            const texts = [...svg.querySelectorAll('text')], lanes = App.figureLanes().filter(i => !App.S.lanes[i].hidden);
            const expected = lanes.map((i, k) => String(mode === 'seq' ? k + 1 : i + 1));
            if (JSON.stringify(texts.map(t => t.textContent)) !== JSON.stringify(expected)) bad.push('wrong numbers: ' + mode);
            for (const t of texts) {
              const b = t.getBBox();
              if (b.x < v.x - .1 || b.y < v.y - .1 || b.x + b.width > v.x + v.width + .1 || b.y + b.height > v.y + v.height + .1)
                bad.push(`${family}/${pt}/${mode}: lane ${t.textContent} clipped`);
            }
          }
        } finally { host.remove(); }
        return bad;
      });
      assert.deepEqual(failures, []);
    });
    await check('PNG and TIFF contain every lane number; editable PPTX numbers stay inside the slide', async () => {
      const r = await p.evaluate(async () => {
        Object.assign(App.S.style, { fontFamily: 'Arial', fontPt: 10, laneNumberMode: 'well' });
        const f = App.buildFigure(false), blobs = [], old = Export.deliver;
        Export.deliver = (blob, name) => { blobs.push([name, blob]); return true; };
        try {
          await Export.exportPNG(f.svg, f.w, f.h, 144, 'numbers.png', App.S);
          await Export.exportTIFF(f.svg, f.w, f.h, 144, 'numbers.tif', App.S);
        } finally { Export.deliver = old; }
        const xs = App.renderState(false).lanes.filter(l => !l.hidden).map(l => App._lastGel.map(l.x) * f.scale);
        const images = [];
        for (const [name, blob] of blobs) {
          let width, height, sample;
          if (name.endsWith('.tif')) {
            const d = await TIFF.decodeBuffer(await blob.arrayBuffer(), name); width = d.width; height = d.height;
            sample = (x, y) => d.data[y * width + x] < .5;
          } else {
            const url = URL.createObjectURL(blob), img = new Image();
            try { await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; }); }
            finally { URL.revokeObjectURL(url); }
            const c = document.createElement('canvas'); c.width = width = img.width; c.height = height = img.height;
            const gc = c.getContext('2d'); gc.drawImage(img, 0, 0); const data = gc.getImageData(0, 0, width, height).data;
            sample = (x, y) => data[(y * width + x) * 4] < 128;
          }
          const sx = width / f.w, sy = height / f.h;
          const ink = xs.map(x => {
            let n = 0;
            for (let yy = 0; yy < Math.min(height, Math.floor(-f.vy * sy)); yy++)
              for (let xx = Math.max(0, Math.floor((x - f.vx - 4) * sx)); xx < Math.min(width, (x - f.vx + 4) * sx); xx++)
                if (sample(xx, yy)) n++;
            return n;
          });
          images.push({ name, ink });
        }
        const blob = await PPTX.build(), bytes = new Uint8Array(await blob.arrayBuffer());
        let data = ''; for (let i = 0; i < bytes.length; i += 16384) data += String.fromCharCode(...bytes.subarray(i, i + 16384));
        return { images, pptx: btoa(data), expected: App.figureLanes().filter(i => !App.S.lanes[i].hidden).map(i => String(i + 1)) };
      });
      for (const image of r.images) assert(image.ink.every(n => n > 3), `${image.name}: missing number ink ${image.ink}`);
      const zip = readPptx(Buffer.from(r.pptx, 'base64'));
      const ppt = await p.evaluate(({ slide, presentation }) => {
        const doc = s => new DOMParser().parseFromString(s, 'application/xml');
        const size = doc(presentation).getElementsByTagName('p:sldSz')[0];
        return [...doc(slide).getElementsByTagName('p:sp')].map(s => {
          const off = s.getElementsByTagName('a:off')[0], ext = s.getElementsByTagName('a:ext')[0];
          return { text: [...s.getElementsByTagName('a:t')].map(t => t.textContent).join(''),
            inside: +off.getAttribute('y') >= 0 && +off.getAttribute('y') + +ext.getAttribute('cy') <= +size.getAttribute('cy') };
        }).filter(s => s.text);
      }, { slide: zip.get('ppt/slides/slide1.xml').toString(), presentation: zip.get('ppt/presentation.xml').toString() });
      assert.deepEqual(ppt.map(s => s.text), r.expected); assert(ppt.every(s => s.inside), 'number outside slide');
    });
    await p.evaluate(() => {
      window.proteinCase = ({ top = .08, extra = [], anchors = [] } = {}) => {
        const sizes = Ladders.get('thermo_26616').sizes, h = 800;
        const yOf = k => 80 + 600 * Math.log(180 / k) / Math.log(18);
        const prof = Float32Array.from({ length: h }, (_, y) => .1 + sizes.reduce((v, k, i) =>
          v + (i ? .95 : top) * Math.exp(-.5 * ((y - yOf(k)) / 8) ** 2), 0));
        const peaks = Engine.detectBands(prof, 'protein').concat(extra);
        const res = Engine.matchLadder(peaks, sizes, h, anchors, 'protein');
        return { res: Array.from(res), count: res.matchedCount, score: res.score, peaks, y: yOf(180) };
      };
    });
    await check('a real faint 180 kDa peak survives final matching without shifting stronger bands', async () => {
      const r = await p.evaluate(() => ({ faint: proteinCase(), normal: proteinCase({ top: .6 }) }));
      assert(r.faint.peaks.some(p => Math.abs(p.y - r.faint.y) < 2), 'peak detection must find the faint band first');
      assert(r.faint.res[0].matched, 'faint 180 kDa peak discarded during ladder matching');
      assert(Math.abs(r.faint.res[0].y - r.faint.y) < 2);
      assert.deepEqual(r.faint.res.slice(1), r.normal.res.slice(1));
      assert.equal(r.faint.count, 10);
    });
    await check('absent, off-curve, ambiguous and sub-threshold peaks never create a 180 kDa match', async () => {
      const r = await p.evaluate(() => [
        proteinCase({ top: 0 }), proteinCase({ top: 0, extra: [{ y: 40, v: .08 }] }),
        proteinCase({ top: 0, extra: [{ y: 76, v: .08 }, { y: 86, v: .075 }] }),
        proteinCase({ top: 0, extra: [{ y: 80, v: .02 }] })
      ]);
      for (const c of r) assert.equal(c.res[0].matched, false);
    });
    await check('weak-peak recovery preserves manual anchors and leaves DNA matching unchanged', async () => {
      const r = await p.evaluate(() => {
        const manual = proteinCase({ anchors: [{ k: 0, y: 65 }] });
        const c = proteinCase(), sizes = Ladders.get('thermo_26616').sizes;
        return { manual: manual.res[0], dna: Engine.matchLadder(c.peaks, sizes, 800, [], 'dna')[0],
          sparse: Engine.matchLadder(c.peaks.slice(0, 4), sizes, 800, [], 'protein')[0] };
      });
      assert(r.manual.anchored); assert.equal(r.manual.y, 65); assert(!r.dna.matched); assert(!r.sparse.matched);
    });
    await check('faint 180 kDa is matched and shown through image import; explicit hide/delete choices survive', async () => {
      const r = await p.evaluate(async () => {
        const g = Demo.makeProteinGel({ tilt: 0 }), t = g.truth;
        for (let y = 158; y < 238; y++) for (let x = t.x0 - 40; x <= t.x0 + 40; x++) {
          const bg = .10 + .01 * Math.sin(x / 210) + .008 * Math.cos(y / 150), i = y * g.width + x;
          g.data[i] = bg + (g.data[i] - bg) * .13;
        }
        await App.load({ name: 'synthetic-faint-180.tif', buffer: Demo.encodeTiff16(g) });
        const S = App.S;
        const lane = S.lanes.reduce((best, l, i) => Math.abs(l.x - t.x0) < Math.abs(S.lanes[best].x - t.x0) ? i : best, 0);
        S.markers = [App.newMarker(lane, 'thermo_26616')]; App.matchMarkers(true);
        const band = () => S.markers[0].bands.find(b => b.bp === 180);
        const found = { ...band() };
        band().show = false; App.matchMarkers(false); const keptHidden = !band().show;
        App.removeMarkerBand(0, 180); App.matchMarkers(false); const deleted = { ...band() };
        return { found, keptHidden, deleted, targetY: t.yOf(180) };
      });
      assert(r.found.matched && r.found.show, 'faint 180 kDa must be shown without manually assigning its y');
      assert(Math.abs(r.found.y - r.targetY) < 6);
      assert(r.keptHidden); assert(r.deleted.excluded && !r.deleted.show && !r.deleted.matched);
    });
    await check('no runtime errors', async () => assert.deepEqual(errors, []));
  } finally { await ctx.close(); }
  return results;
}
