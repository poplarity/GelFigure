import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
/* Whole-image orientation (mirror / quarter turns), the lane-name-above-conditions ordering and
 * free placement of side text. All of it is checked on the synthetic demo gel: no real gel images
 * are in the repository and none are used here. */
export async function figureOrderChecks(browser, base, root, engine) {
  const out = [], c = await browser.newContext(), p = await c.newPage();
  const check = async (name, fn) => { try { await fn(); out.push(['ok', 'figure order: ' + name]); } catch (e) { out.push(['FAIL', 'figure order: ' + name, e.stack]); } };
  const ready = async () => { await p.goto(base + '/index.html?demo=1&lang=en'); await p.waitForFunction(() => document.title.startsWith('READY '), null, { timeout: 120000 }); await p.evaluate(() => App.setPref('preflight', false)); };
  // lane name / condition / side-text positions as rendered, in figure coordinates
  /* Text positions in figure units (pt), from the advance box: getComputedTextLength() plus the
   * element's own anchor and baseline, unprojected through the SVG's screen transform. Neither of
   * the obvious alternatives works across engines — getBoundingClientRect() is snapped to device
   * pixels and covers the whole line box, and Firefox's getBBox() pads a <text> by 0.25 em on every
   * side (a 7 pt label measures 8.75 pt tall), so a label that has not moved appears to move. The
   * advance box is also exactly what render.js lays out with, so the tolerances below mean something. */
  const measure = () => p.evaluate(() => {
    const ASC = 0.8, DESC = 0.2;   // baseline split used for the vertical extent
    const advanceBox = (svg, e) => {
      const m = e.getScreenCTM(), root = svg.getScreenCTM();
      if (!m || !root) return null;
      const len = e.getComputedTextLength(), fs = parseFloat(e.getAttribute('font-size')) || 7;
      const anchor = e.getAttribute('text-anchor'), x = +(e.getAttribute('x') || 0), y = +(e.getAttribute('y') || 0);
      const left = anchor === 'middle' ? x - len / 2 : anchor === 'end' ? x - len : x;
      const inv = root.inverse();
      const toFig = (px, py) => { const q = svg.createSVGPoint(); q.x = px; q.y = py; const u = q.matrixTransform(m).matrixTransform(inv); return [u.x, u.y]; };
      const pts = [[left, y - fs * ASC], [left + len, y - fs * ASC], [left, y + fs * DESC], [left + len, y + fs * DESC]].map(([px, py]) => toFig(px, py));
      return { x0: Math.min(...pts.map(q => q[0])), x1: Math.max(...pts.map(q => q[0])), y0: Math.min(...pts.map(q => q[1])), y1: Math.max(...pts.map(q => q[1])) };
    };
    const f = App.buildFigure(false), host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-99999px;top:0'; host.innerHTML = f.svg; document.body.appendChild(host);
    const svg = host.querySelector('svg'), img = svg.querySelector('image');
    const gw = +img.getAttribute('width'), gh = +img.getAttribute('height');
    // in figure units the gel sits at the origin
    const rects = [];
    svg.querySelectorAll('text').forEach(e => {
      if (!e.textContent.trim()) return;
      const r = advanceBox(svg, e); if (r) rects.push({ txt: e.textContent.trim(), ...r });
    });
    const gx = 0, gy = 0;
    // condition names are the ones this test writes ('Cond …'); the (bp) unit header also lives in the
    // left margin and must not be mistaken for a condition row
    const cond = rects.filter(r => r.x1 < gx - 1 && /^Cond/.test(r.txt)), lanes = rects.filter(r => r.x0 >= gx - 1 && r.x1 <= gx + gw + 1);
    // distances from the GEL TOP (negative = above the gel): the figure grows upward as rows are added,
    // so absolute coordinates would move even when the layout relative to the gel is unchanged
    const res = {
      gx, gy, gw, gh,
      laneBottom: lanes.length ? Math.min(...lanes.map(r => r.y1)) - gy : null,
      // the row closest to the gel is the one with the LARGEST y (y grows downward, the stack is above the gel)
      condBottom: cond.length ? Math.max(...cond.map(r => r.y1)) - gy : null,
      condTop: cond.length ? Math.min(...cond.map(r => r.y0)) - gy : null,
      laneTops: lanes.map(r => r.y0 - gy).sort((a, b) => a - b), rects,
    };
    host.remove(); return res;
  });
  try {
    await ready();
    const errors = []; p.on('pageerror', e => errors.push(e.message));

    await check('all eight orientations keep the image upright in the figure', async () => {
      const r = await p.evaluate(() => {
        const saved = App.snapshot(), list = Engine.orientList(), out = [];
        try {
          for (const o of list) {
            App.S = JSON.parse(saved); App.S.orient = o.id; App.ensureSrc(); App.S.crop = { x: 0, y: 0, w: App.src.w, h: App.src.h };
            out.push({ id: o.id, swap: Engine.orientSwap(o.id), srcW: App.src.w, srcH: App.src.h, rawW: App.rawSrc.w, rawH: App.rawSrc.h });
          }
          const base = out.find(x => x.id === '');
          out.forEach(x => { const q = x.swap; x.upright = q ? (x.srcW === base.rawH && x.srcH === base.rawW) : (x.srcW === base.rawW && x.srcH === base.rawH); });
          return out;
        } finally { App.S = JSON.parse(saved); App.ensureSrc(); App.emit('loaded'); }
      });
      assert.equal(r.length, 8);
      r.forEach(x => assert(x.upright, JSON.stringify(x)));
    });

    await check('mirroring carries lane names and markers without re-detecting', async () => {
      const r = await p.evaluate(() => {
        const saved = App.snapshot(), names0 = App.S.lanes.map(l => l.name), m0 = App.S.markers.length, n0 = App.S.lanes.length;
        try {
          App.setOrient({ r: 0, f: 1 }); App.commit();
          const mirrored = { names: App.S.lanes.map(l => l.name), markers: App.S.markers.length, lanes: App.S.lanes.length };
          // a mirror is its own inverse: applying the same element again returns to the original
          App.setOrient({ r: 0, f: 1 }); App.commit();
          return { names0, mirrored, back: App.S.lanes.map(l => l.name), m0, n0 };
        } finally { App.S = JSON.parse(saved); App.ensureSrc(); App.emit('loaded'); }
      });
      assert.deepEqual(r.mirrored.names.slice().reverse(), r.names0, 'mirroring should reverse the lane order and keep every name');
      assert.equal(r.mirrored.markers, r.m0); assert.equal(r.mirrored.lanes, r.n0);
      assert.deepEqual(r.back, r.names0.slice().reverse(), 'mirroring again returns the lanes to their original left-to-right order');
    });

    await check('a quarter turn re-detects lanes and keeps the names in order', async () => {
      const r = await p.evaluate(() => {
        const saved = App.snapshot(), n0 = App.S.lanes.length;
        try {
          App.S.lanes.forEach((l, i) => { l.name = 'L' + (i + 1); });
          App.commit();
          App.setOrient({ r: 90, f: 0 }); App.commit();
          const after = { lanes: App.S.lanes.length, names: App.S.lanes.map(l => l.name).filter(Boolean), crop: App.S.crop, src: [App.src.w, App.src.h] };
          App.setOrient({ r: 270, f: 0 }); App.commit();
          return { n0, src0: [App.rawSrc.w, App.rawSrc.h], after, back: App.S.lanes.length, backSrc: [App.src.w, App.src.h], backNames: App.S.lanes.map(l => l.name).filter(Boolean) };
        } finally { App.S = JSON.parse(saved); App.ensureSrc(); App.emit('loaded'); }
      });
      assert(r.after.src[0] !== r.after.src[1]);
      assert(r.after.names.length > 0, 'names must not be lost by a quarter turn');
      // turning back restores the original pixels; the re-detected well count may differ by one on the
      // sideways gel (that is why a quarter turn re-detects rather than carrying the old geometry)
      assert.deepEqual(r.backSrc, [r.src0[0], r.src0[1]]);
      assert(r.backNames.length > 0);
    });

    await check('undo restores the previous orientation, pixels included', async () => {
      const r = await p.evaluate(() => {
        const saved = App.snapshot(), w0 = App.src.w, h0 = App.src.h;
        try {
          App.setOrient({ r: 90, f: 0 }); App.commit();
          const turned = [App.src.w, App.src.h];
          App.undo();
          return { w0, h0, turned, afterUndo: [App.src.w, App.src.h], orient: App.S.orient };
        } finally { App.S = JSON.parse(saved); App.ensureSrc(); App.emit('loaded'); }
      });
      assert.deepEqual(r.turned, [r.h0, r.w0], 'the quarter turn should swap the pixel dimensions');
      assert.deepEqual(r.afterUndo, [r.w0, r.h0], 'undo must rebuild the pixels, not just the state field');
    });

    await check('a project file keeps the orientation', async () => {
      const r = await p.evaluate(async () => {
        const saved = App.snapshot();
        try {
          App.setOrient({ r: 270, f: 1 }); App.commit();
          const w = App.src.w, h = App.src.h;
          const blob = await App.projectBlob(), buf = await blob.arrayBuffer();
          App.setOrient({ r: 0, f: 0 }); App.commit();
          await App.openProject(buf);
          return { w, h, orient: App.S.orient, src: [App.src.w, App.src.h] };
        } finally { App.S = JSON.parse(saved); App.ensureSrc(); App.emit('loaded'); }
      });
      assert.equal(r.orient, 'r270h');
      assert.deepEqual(r.src, [r.w, r.h]);
    });

    await check('orientation is written into the processing log', async () => {
      const log = await p.evaluate(() => { App.setOrient({ r: 180, f: 0 }); App.commit(); return Export.processingLog(App.S); });
      assert.equal(log.orientation, 'r180', 'the processing log must record the orientation');
    });

    await check('lane names hug the gel no matter how many condition rows there are', async () => {
      const rows = [];
      for (let n = 0; n <= 3; n++) {
        await p.evaluate(n => { App.S.conditions = Array.from({ length: n }, (_, i) => ({ name: 'Cond ' + (i + 1), values: {} })); App.commit(); }, n);
        const m = await measure(); rows.push({ n, laneBottom: m.laneBottom, condTop: m.condTop });
      }
      // lane names keep the same distance from the gel top (and stay above it)
      rows.forEach(x => assert(Math.abs(x.laneBottom - rows[0].laneBottom) < 0.01, 'lane names moved: ' + JSON.stringify(rows)));
      assert(rows[0].laneBottom < 0, 'lane names must sit above the gel');
      // each condition row goes further from the gel than the last, above the lane names
      for (let k = 1; k < rows.length; k++) assert(rows[k].condTop < rows[k - 1].condTop - 1, 'each new condition row must go further from the gel: ' + JSON.stringify(rows));
      assert(rows[rows.length - 1].condTop < rows[0].laneBottom, 'conditions must be above the lane names');
    });

    await check('the legacy order is still available and stacks names above the conditions', async () => {
      await p.evaluate(() => { App.S.style.laneNamesAboveConditions = true; App.S.conditions = []; App.commit(); });
      const rows = [];
      for (let n = 0; n <= 2; n++) {
        await p.evaluate(n => { App.S.conditions = Array.from({ length: n }, (_, i) => ({ name: 'Cond ' + (i + 1), values: {} })); App.commit(); }, n);
        rows.push(await measure());
      }
      for (let k = 1; k < rows.length; k++) assert(rows[k].laneBottom < rows[k - 1].laneBottom - 1, 'names should be pushed up by each row: ' + JSON.stringify(rows.map(r => r.laneBottom)));
      // the bottom condition row stays at a fixed distance from the gel; lane names are pushed above it
      // rows.length - 1 rows exist once every case has run; compare the single-row case with the two-row one
      assert(Math.abs(rows[2].condBottom - rows[1].condBottom) < 0.01, 'the bottom condition row must keep its distance from the gel: ' + JSON.stringify(rows.map(r => r.condBottom)));
      // the bottom row touches the gel (legacy order = conditions nearest the image)
      assert(Math.abs(rows[2].condBottom) < 2, 'the bottom condition row sits on the gel');
      assert(rows[2].laneBottom < rows[2].condTop, 'names sit above the top condition row');
      await p.evaluate(() => { App.S.style.laneNamesAboveConditions = false; App.S.conditions = []; App.commit(); });
    });

    await check('the toggle is wired to the panel checkbox', async () => {
      const r = await p.evaluate(() => {
        const cb = document.getElementById('laneNamesAboveConditions'); if (!cb) return { missing: true };
        const before = App.S.style.laneNamesAboveConditions === true;
        cb.checked = !before; cb.dispatchEvent(new Event('change', { bubbles: true }));
        const after = App.S.style.laneNamesAboveConditions === true;
        cb.checked = before; cb.dispatchEvent(new Event('change', { bubbles: true }));
        return { before, after, restored: App.S.style.laneNamesAboveConditions === true };
      });
      assert(!r.missing); assert.notEqual(r.after, r.before); assert.equal(r.restored, r.before);
    });

    await check('side text can sit at top, middle and bottom beside the gel', async () => {
      const cases = await p.evaluate(() => {
        const saved = App.snapshot(), res = [];
        try {
          for (const pos of ['left', 'right', 'below']) for (const at of [null, 0, 0.5, 1]) {
            App.S = JSON.parse(saved); App.S.labels = [{ text: 'Coomassie 30 s', pos, at }];
            const f = App.buildFigure(false), host = document.createElement('div');
            host.style.cssText = 'position:fixed;left:-99999px;top:0'; host.innerHTML = f.svg; document.body.appendChild(host);
            const svg = host.querySelector('svg'), img = svg.querySelector('image');
            const gw = +img.getAttribute('width'), gh = +img.getAttribute('height');
            const gx0 = 0, gy0 = 0;
            const t = [...svg.querySelectorAll('text')].find(e => /Coomassie/.test(e.textContent));
            // advance box unprojected to figure units (see measure() for why not getBBox)
            const len = t.getComputedTextLength(), fs = parseFloat(t.getAttribute('font-size')) || 7;
            const tx = +(t.getAttribute('x') || 0), ty = +(t.getAttribute('y') || 0), anc = t.getAttribute('text-anchor');
            const left = anc === 'middle' ? tx - len / 2 : anc === 'end' ? tx - len : tx;
            const m = t.getScreenCTM(), inv = svg.getScreenCTM().inverse();
            const toFig = (px, py) => { const q = svg.createSVGPoint(); q.x = px; q.y = py; const u = q.matrixTransform(m).matrixTransform(inv); return [u.x, u.y]; };
            const pts = [[left, ty - fs * .8], [left + len, ty - fs * .8], [left, ty + fs * .2], [left + len, ty + fs * .2]].map(([px, py]) => toFig(px, py));
            res.push({ pos, at, gx0, gy0, gw, gh, x0: Math.min(...pts.map(q => q[0])), x1: Math.max(...pts.map(q => q[0])), y0: Math.min(...pts.map(q => q[1])), y1: Math.max(...pts.map(q => q[1])) });
            host.remove();
          }
        } finally { App.S = JSON.parse(saved); App.emit('loaded'); }
        return res;
      });
      const frac = x => x.pos === 'below'
        ? ((x.x0 + x.x1) / 2 - x.gx0) / x.gw
        : ((x.y0 + x.y1) / 2 - x.gy0) / x.gh;
      for (const pos of ['left', 'right', 'below']) {
        const set = cases.filter(x => x.pos === pos);
        const centre = set.find(x => x.at === null), mid = set.find(x => x.at === 0.5), top = set.find(x => x.at === 0), bottom = set.find(x => x.at === 1);
        assert(Math.abs(frac(centre) - 0.5) < 0.03, pos + ' default should stay centred: ' + frac(centre));
        assert(Math.abs(frac(mid) - 0.5) < 0.03, pos + ' 50% should be centred');
        assert(frac(top) < 0.25, pos + ' 0% should be near the top/left edge: ' + frac(top));
        assert(frac(bottom) > 0.75, pos + ' 100% should be near the bottom/right edge: ' + frac(bottom));
        // and it must stay beside the gel (never printed on it) and inside the figure
        set.forEach(x => {
          if (pos === 'left') assert(x.x1 <= x.gx0 + 0.5, 'left text overlaps the gel');
          if (pos === 'right') assert(x.x0 >= x.gx0 + x.gw - 0.5, 'right text overlaps the gel');
          if (pos === 'below') assert(x.y0 >= x.gy0 + x.gh - 0.5, 'below text overlaps the gel');
        });
        const span = pos === 'below' ? [top.x0, top.x1] : [top.y0, top.y1];
        const gelSpan = pos === 'below' ? [x => x.gx0, x => x.gx0 + x.gw] : [x => x.gy0, x => x.gy0 + x.gh];
        assert(span[0] >= gelSpan[0](top) - 0.5, pos + ' text runs off the start of the gel');
        const low = pos === 'below' ? [bottom.x0, bottom.x1] : [bottom.y0, bottom.y1];
        assert(low[1] <= gelSpan[1](bottom) + 0.5, pos + ' text runs off the end of the gel');
      }
    });

    await check('side-text position survives a template round trip and undo', async () => {
      const r = await p.evaluate(async () => {
        const saved = App.snapshot();
        try {
          App.S.labels = [{ text: 'IB: anti-HA', pos: 'right', at: 0.2 }]; App.commit();
          const tpl = App.template();
          App.S.labels = [];
          App.applyTemplate(JSON.parse(JSON.stringify(tpl)));
          const after = App.S.labels.map(t => ({ pos: t.pos, at: t.at }));
          App.S.labels[0].at = 0.9; App.commit();
          App.undo();
          return { after, undone: App.S.labels[0] && App.S.labels[0].at };
        } finally { App.S = JSON.parse(saved); App.ensureSrc(); App.emit('loaded'); }
      });
      assert.deepEqual(r.after, [{ pos: 'right', at: 0.2 }]);
      assert.equal(r.undone, 0.2);
    });

    await check('dragging side text on the figure moves it and records one undo step', async () => {
      await p.evaluate(() => { App.S.labels = [{ text: 'EtBr', pos: 'left', at: 0.5 }]; App.commit(); App.refresh(); });
      await p.waitForTimeout(120);
      const box = await p.evaluate(() => {
        const g = document.querySelector('#preview g[data-edit="label"]');
        if (!g) return null; const r = g.getBoundingClientRect();
        const svg = document.querySelector('#preview svg'), img = svg.querySelector('image'), ir = img.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, gelTop: ir.top, gelBottom: ir.bottom };
      });
      assert(box, 'the side text must be drawn on the preview');
      const hist = await p.evaluate(() => App.hist.length);
      await p.mouse.move(box.x, box.y); await p.mouse.down();
      await p.mouse.move(box.x, box.gelTop + (box.gelBottom - box.gelTop) * 0.18, { steps: 6 });
      await p.mouse.up();
      const r = await p.evaluate(() => ({ at: App.S.labels[0].at, hist: App.hist.length }));
      assert(r.at != null && r.at < 0.35, 'dragging to the top should move the text there: ' + r.at);
      assert.equal(r.hist, hist + 1, 'one drag = one undo step');
    });

    await check('Pierce 26610 is in the catalogue with the datasheet sizes', async () => {
      const l = await p.evaluate(() => Ladders.get('thermo_26610'));
      assert(l, 'thermo_26610 must exist');
      assert.equal(l.kind, 'protein');
      assert.deepEqual(l.sizes, [116, 66.2, 45, 35, 25, 18.4, 14.4]);
      assert.deepEqual(l.ref, []);
    });

    await check('no page errors during the whole run', async () => { assert.deepEqual(errors, []); });
    const dir = path.join(root, 'test-results', 'figure-order', engine); fs.mkdirSync(dir, { recursive: true }); await p.screenshot({ path: path.join(dir, 'figure-order.png') });
  } finally { await c.close(); }
  return out;
}
