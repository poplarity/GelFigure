import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readPptx } from './pptx.mjs';

// Current dev review: regression cases found by exercising the new controls and exports.
// All images and annotations are synthetic.
export async function devAuditChecks(browser, base, root, engine) {
  const out = [], c = await browser.newContext({ viewport: { width: 1600, height: 960 } }), p = await c.newPage();
  const check = async (name, fn) => {
    try { await fn(); out.push(['ok', 'Dev review: ' + name]); }
    catch (e) { out.push(['FAIL', 'Dev review: ' + name, e.stack]); }
  };
  const ready = async () => {
    await p.goto(base + '/index.html?demo=1&lang=en');
    await p.waitForFunction(() => document.title.startsWith('READY '), null, { timeout: 120000 });
  };
  try {
    await ready();
    await check('weight selection stays legible and updates the text editor', async () => {
      await p.evaluate(async () => {
        App.S.lanes[1].name = 'Weight preview'; App.commit();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        FigEdit.openEd('lane', 1);
      });
      await p.locator('#fedWeight').selectOption('600');
      const r = await p.evaluate(() => {
        const el = document.getElementById('fedWeight'), style = getComputedStyle(el);
        return { color: style.color, bg: style.backgroundColor, arrow: style.backgroundImage, text: el.selectedOptions[0].textContent,
          editorWeight: getComputedStyle(document.getElementById('floatEd')).fontWeight, stored: App.S.lanes[1].weight };
      });
      const dir = path.join(root, 'test-results/dev-review', engine); fs.mkdirSync(dir, { recursive: true });
      await p.locator('#fedBar').screenshot({ path: path.join(dir, 'weight-toolbar.png') });
      assert.notEqual(r.color, r.bg, 'selected weight is white text on a white background');
      assert.notEqual(r.arrow, 'none', 'weight menus need the same visible dropdown arrow as other menus');
      assert.match(r.text, /Semibold.*600/, 'the selected option must name its numeric weight');
      assert.equal(r.editorWeight, '600'); assert.equal(r.stored, 600);
      await p.evaluate(() => FigEdit.flush());
      await p.evaluate(() => FigEdit.openEd('lane', 1));
      assert.equal(await p.locator('#fedWeight').inputValue(), '600');
      await p.evaluate(() => FigEdit.flush());
    });

    await check('all item weight menus offer the same visible choices', async () => {
      const r = await p.evaluate(() => {
        FigEdit.flush();
        const options = id => [...document.getElementById(id).options].map(o => [o.value, o.textContent]);
        const inline = options('fedWeight');
        const c = App.S.crop; App.S.notes = [{ kind: 'text', text: 'Weight', x: c.x + c.w / 2, y: c.y + c.h / 2, weight: 500 }];
        FigEdit.annoPopover('note', 0); const note = options('qWeight'), selected = document.getElementById('qWeight').value;
        document.getElementById('qOk').click();
        MarkerUI.labelPopover(0, 0); const marker = options('markerPopWeight');
        document.getElementById('markerPopClose').click();
        return { inline, note, marker, selected };
      });
      assert.deepEqual(r.inline, r.note); assert.deepEqual(r.inline, r.marker);
      assert.deepEqual(r.inline.map(([v]) => v), ['400', '500', '600', '700']);
      r.inline.forEach(([v, t]) => assert(t.includes(v), t)); assert.equal(r.selected, '500');
    });

    await check('templates preserve automatic side-text angles and explicit zero', async () => {
      const r = await p.evaluate(() => {
        App.S.labels = [{ text: 'left', pos: 'left', angle: null }, { text: 'right', pos: 'right' }, { text: 'flat', pos: 'left', angle: 0 }];
        const t = App.template(); App.applyTemplate(t);
        return { saved: t.labels.map(l => l.angle), loaded: App.S.labels.map(l => l.angle) };
      });
      assert.deepEqual(r.saved, [null, null, 0]); assert.deepEqual(r.loaded, [null, null, 0]);
    });
    await check('box and bracket weights reach preview, export and saved styles', async () => {
      const r = await p.evaluate(async () => {
        const s = App.S, c = s.crop, bands = s.markers[0].bands.filter(b => b.matched).sort((a, b) => a.y - b.y);
        s.boxes = [{ x: c.x + c.w * .3, y: c.y + c.h * .3, w: c.w * .12, h: c.h * .15, text: 'Weighted box', weight: 700, zoom: 2 }];
        s.brackets = [{ y1: bands[1].y, y2: bands[3].y, text: 'Weighted bracket', weight: 600, side: 'right' }];
        const preview = new DOMParser().parseFromString(App.buildFigure(true).svg, 'image/svg+xml');
        const weights = { box: [...preview.querySelectorAll('g[data-edit="box"] text')].map(t => t.getAttribute('font-weight')),
          bracket: preview.querySelector('g[data-edit="bracket"] text').getAttribute('font-weight') };
        const xml = App.buildFigure(false).svg, style = App.template(); App.applyTemplate(style);
        const restored = s.brackets[0]?.weight;
        const b = new Uint8Array(await (await PPTX.build()).arrayBuffer()); let data = '';
        for(let i=0;i<b.length;i+=32768) data += String.fromCharCode(...b.subarray(i,i+32768));
        return { weights, restored, saved: style.brackets[0]?.weight, xml, pptx: btoa(data) };
      });
      assert.deepEqual(r.weights.box, ['700', '700']); assert.equal(r.weights.bracket, '600');
      assert.equal(r.saved, 600); assert.equal(r.restored, 600);
      const xml = readPptx(Buffer.from(r.pptx, 'base64')).get('ppt/slides/slide1.xml').toString();
      const shape = [...xml.matchAll(/<p:sp>.*?<\/p:sp>/gs)].map(m => m[0]).find(s => s.includes('Weighted bracket'));
      assert.match(shape, / b="1"/);
    });

    await check('units cannot mix DNA and protein or silently scale Da incorrectly', async () => {
      const r = await p.evaluate(() => {
        const error = (s, k) => { try { Ladders.parseSizes(s, k); return ''; } catch (e) { return e.message; } };
        return { mixed: error('5000bp, 100kDa', 'protein'), wrong: error('5000bp, 3000bp', 'protein'),
          dalton: Ladders.parseSizes('100000Da, 70000Da', 'protein') };
      });
      assert.match(r.mixed, /mix|混用/i); assert.match(r.wrong, /DNA/);
      assert.deepEqual(r.dalton.sizes, [100, 70]); assert.equal(r.dalton.unit, 'kDa');
    });
    await check('whitespace-separated sizes accept spaced units', async () => {
      const r = await p.evaluate(() => ({ dna: Ladders.parseSizes('5000 bp 3000 bp 1000 bp', 'dna'),
        protein: Ladders.parseSizes('100 kDa 70 kDa', 'protein'), bare: Ladders.parseSizes('5000 3000 1000', 'dna') }));
      assert.deepEqual(r.dna.sizes, [5000, 3000, 1000]); assert.deepEqual(r.bare.sizes, r.dna.sizes);
      assert.deepEqual(r.protein.sizes, [100, 70]);
    });

    await ready();
    await check('two mirrors restore crop, names, marker bands and text boxes', async () => {
      const r = await p.evaluate(() => {
        const c = App.S.crop;
        App.S.notes = [{ kind: 'text', text: 'Mirror', x: c.x + c.w * .3, y: c.y + c.h * .4, arrow: true, arrowAngle: 35, angle: 15 }];
        App.S.lanes.forEach((l, i) => l.name = 'L' + i);
        App.commit();
        const take = () => JSON.parse(JSON.stringify({ rotation: App.S.rotation, autoRotation: App.autoRotation, crop: App.S.crop, lanes: App.S.lanes.map(l => [l.x, l.name]),
          markers: App.S.markers.map(m => [m.lane, m.bands.map(b => b.y)]), notes: App.S.notes }));
        const before = take(), w = App.src.w;
        App.setOrient({ r: 0, f: 1 }); const once = take();
        App.setOrient({ r: 0, f: 1 }); const after = take();
        App.undo(); const undoAuto = App.autoRotation; App.redo(); const redoAuto = App.autoRotation;
        return { before, once, after, undoAuto, redoAuto, w };
      });
      assert(Math.abs(r.once.notes[0].x - (r.w - 1 - r.before.notes[0].x)) < .001, 'note must follow its image');
      assert(Math.abs(r.once.notes[0].arrowAngle - 145) < .001);
      assert.equal(r.once.autoRotation, -r.before.autoRotation, 'automatic deskew must follow the mirror too');
      assert.equal(r.undoAuto, r.once.autoRotation); assert.equal(r.redoAuto, r.before.autoRotation);
      const rounded = o => JSON.parse(JSON.stringify(o, (_, v) => typeof v === 'number' ? Math.round(v * 1e7) / 1e7 : v));
      assert.deepEqual(rounded(r.after), rounded(r.before));
    });
    await check('deskew carries note anchors and arrow directions', async () => {
      const r = await p.evaluate(() => {
        const s = App.S, c = s.crop, old = s.rotation, n = { kind: 'text', text: 'Deskew', x: c.x + c.w * .25, y: c.y + c.h * .35, angle: 15, arrow: true, arrowAngle: 20 };
        s.notes = [n, { kind: 'arrow', x: n.x, y: n.y, angle: -30 }];
        const cx = (App.src.w - 1) / 2, cy = (App.src.h - 1) / 2, d = 5 * Math.PI / 180;
        const expected = { x: Math.cos(d) * (n.x - cx) - Math.sin(d) * (n.y - cy) + cx,
          y: Math.sin(d) * (n.x - cx) + Math.cos(d) * (n.y - cy) + cy };
        App.setRotation(old + 5);
        return { notes: s.notes, expected };
      });
      for (const n of r.notes) { assert(Math.abs(n.x - r.expected.x) < .001); assert(Math.abs(n.y - r.expected.y) < .001); }
      assert.equal(r.notes[0].angle, 15, 'readable text keeps its chosen angle');
      assert(Math.abs(r.notes[0].arrowAngle - 25) < .001); assert(Math.abs(r.notes[1].angle + 25) < .001);
    });
    await check('a quarter turn retains free text boxes and their arrow targets', async () => {
      const r = await p.evaluate(() => {
        App.setRotation(0);
        const w = App.src.w, h = App.src.h, n = { kind: 'text', text: 'Keep me', x: w * .3, y: h * .4, angle: 10, arrow: true, arrowAngle: 0, arrowLen: .2, weight: 600 };
        App.S.notes = [n];
        App.S.lanes[1].weight = 700;
        App.S.conditions = [{ name: 'Weight retained', values: App.S.lanes.map(() => '+'), weight: 500 }];
        const expected = Engine.orientPoint(Engine.orientCode('r90'), n.x, n.y, w, h);
        App.setOrient('r90');
        const a = App.S.rotation * Math.PI / 180, cx = (App.src.w - 1) / 2, cy = (App.src.h - 1) / 2;
        return { notes: App.S.notes, expected: { x: Math.cos(a) * (expected.x - cx) - Math.sin(a) * (expected.y - cy) + cx,
          y: Math.sin(a) * (expected.x - cx) + Math.cos(a) * (expected.y - cy) + cy }, arrowAngle: 90 + App.S.rotation,
          laneWeight: App.S.lanes[1]?.weight, conditionWeight: App.S.conditions[0]?.weight };
      });
      assert.equal(r.notes.length, 1, 'rotating the image must not delete free text');
      assert.equal(r.notes[0].text, 'Keep me'); assert.equal(r.notes[0].angle, 10); assert.equal(r.notes[0].weight, 600);
      assert(Math.abs(r.notes[0].x - r.expected.x) < .001); assert(Math.abs(r.notes[0].y - r.expected.y) < .001);
      assert(Math.abs(r.notes[0].arrowAngle - r.arrowAngle) < .001);
      assert.equal(r.laneWeight, 700); assert.equal(r.conditionWeight, 500);
    });

    await ready();
    await check('missing compression globals save plain JSON and explain gzip limits', async () => {
      const r = await p.evaluate(async () => {
        const saved = {}, gzip = await (await App.projectBlob()).arrayBuffer();
        for (const k of ['CompressionStream', 'DecompressionStream']) { saved[k] = Object.getOwnPropertyDescriptor(window, k); delete window[k]; }
        try {
          let saveError = '', loadError = '', plain = false, reopened = false;
          try { const b = await App.projectBlob(); plain = JSON.parse(await b.text()).gelfigProject === 1; await App.openProject(await b.arrayBuffer()); reopened = true; }
          catch (e) { saveError = e.message; }
          try { await App.openProject(gzip); } catch (e) { loadError = e.message; }
          return { saveError, loadError, plain, reopened };
        } finally { for (const [k, d] of Object.entries(saved)) if (d) Object.defineProperty(window, k, d); }
      });
      assert.equal(r.saveError, ''); assert(r.plain && r.reopened);
      assert.match(r.loadError, /cannot decompress|解不开/); assert.doesNotMatch(r.loadError, /not defined/);
      const error = await p.evaluate(async () => { try { await App.openProject(new Uint8Array([31, 139, 0, 0]).buffer); return ''; } catch (e) { return e.message; } });
      assert.match(error, /damaged|损坏/);
    });

    await check('white text-box backgrounds keep visible text in raster exports', async () => {
      const r = await p.evaluate(async () => {
        const c = App.S.crop; App.S.style.invert = false; App.S.displayMode = 'gray';
        App.S.notes = [{ kind: 'text', text: 'Visible ink', x: c.x + c.w / 2, y: c.y + c.h / 2, bg: 'white', pt: 12 }];
        const f = App.buildFigure(true), doc = new DOMParser().parseFromString(f.svg, 'image/svg+xml'), n = doc.querySelector('g[data-edit="note"]');
        const fill = n.querySelector('text').getAttribute('fill');
        // Isolate the actual renderer output on white; this catches invisible white-on-white glyphs.
        const isolated = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" viewBox="-100 -40 200 80"><rect x="-100" y="-40" width="200" height="80" fill="white"/>${n.querySelector('g').innerHTML}</svg>`;
        const canvas = await Export.svgToCanvas(isolated, 200, 80, 144), data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let ink = 0; for (let i = 0; i < data.length; i += 4) if (data[i] < 100 && data[i+1] < 100 && data[i+2] < 100 && data[i+3] > 200) ink++;
        App.S.notes[0].color = 'red';
        const red = new DOMParser().parseFromString(App.buildFigure(true).svg, 'image/svg+xml').querySelector('g[data-edit="note"] text').getAttribute('fill');
        return { fill, ink, red, png: canvas.toDataURL() };
      });
      const dir = path.join(root, 'test-results/dev-review', engine); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'white-textbox.png'), Buffer.from(r.png.split(',')[1], 'base64'));
      assert.equal(r.fill, '#000'); assert(r.ink > 100, `only ${r.ink} visible text pixels`); assert.equal(r.red, '#d32f2f');
    });
    await check('multiline notes remain a single editable PowerPoint text box', async () => {
      const b64 = await p.evaluate(async () => {
        App.S.notes[0].text = 'Audit first line\nAudit second line';
        const bytes = new Uint8Array(await (await PPTX.build()).arrayBuffer());
        let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(s);
      });
      const xml = readPptx(Buffer.from(b64, 'base64')).get('ppt/slides/slide1.xml').toString();
      const shapes = [...xml.matchAll(/<p:sp>.*?<\/p:sp>/gs)].map(m => m[0]).filter(s => /Audit (first|second) line/.test(s));
      assert.equal(shapes.length, 1, 'one text box must not become separate line shapes');
      assert.match(shapes[0], /Audit first line/); assert.match(shapes[0], /Audit second line/);
      assert.equal((shapes[0].match(/<a:p>/g) || []).length, 2);
    });
  } finally { await c.close(); }
  return out;
}
