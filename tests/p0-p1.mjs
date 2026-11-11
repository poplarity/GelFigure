import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readPptx } from './pptx.mjs';

/* P0/P1 feedback round: clipboard paste, sizes typed with units, inline/no-unit labels,
 * per-item font weight, free side-text rotation and free text boxes (with optional arrow).
 * Demo gel only: real gel images are unpublished data and never enter the repository. */
export async function p0p1Checks(browser, base, root, engine) {
  const out = [], c = await browser.newContext({ viewport: { width: 1600, height: 960 } }), p = await c.newPage();
  const check = async (name, fn) => {
    try { await fn(); out.push(['ok', 'P0/P1: ' + name]); }
    catch (e) { out.push(['FAIL', 'P0/P1: ' + name, e.stack]); }
  };
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  try {
    await p.goto(base + '/index.html?demo=1&lang=en');
    await p.waitForFunction(() => document.title.startsWith('READY '), null, { timeout: 120000 });

    await check('band sizes can be typed with units', async () => {
      const r = await p.evaluate(() => {
        const err = t => { try { Ladders.parseSizes(t, 'dna'); return ''; } catch (e) { return e.message; } };
        return {
          plain: Ladders.parseSizes('5000bp, 3000bp, 2000bp', 'dna'),
          spaced: Ladders.parseSizes('5 kb, 1.5 kb', 'dna'),
          slashed: Ladders.parseSizes('5 kb / 1.5 kb', 'dna'),
          bare: Ladders.parseSizes('5000, 3000', 'dna'),
          protein: Ladders.parseSizes('100 kDa, 70 kDa', 'protein'),
          mixed: err('5000bp, 100kDa'),
          wrongKind: err('100 kDa, 70 kDa'),
          bad: err('5000bp, abc')
        };
      });
      assert.deepEqual(r.plain.sizes, [5000, 3000, 2000]);
      assert.equal(r.plain.unit, 'bp');
      assert.equal(r.plain.kind, 'dna');
      assert.deepEqual(r.spaced.sizes, [5000, 1500]);
      assert.equal(r.spaced.unit, 'kb');
      assert.deepEqual(r.slashed.sizes, [5000, 1500]);
      assert.deepEqual(r.bare.sizes, [5000, 3000]);
      assert.equal(r.protein.kind, 'protein');
      assert.equal(r.protein.unit, 'kDa');
      assert(/mix|混用/i.test(r.mixed));
      assert(/DNA|kDa/i.test(r.wrongKind));
      assert(/abc/.test(r.bad));
    });

    await check('the size field previews the parsed bands', async () => {
      const r = await p.evaluate(() => {
        const el = document.getElementById('customSizes'), hint = document.getElementById('customParse');
        el.value = '5000bp, 3000bp';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        const dna = { text: hint.textContent, warn: hint.classList.contains('warn-text') };
        el.value = '100kDa, 70kDa';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        const wrong = { text: hint.textContent, warn: hint.classList.contains('warn-text') };
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return { dna, wrong, cleared: hint.textContent };
      });
      assert.match(r.dna.text, /2/);
      assert.match(r.dna.text, /5000 bp/);
      assert.equal(r.dna.warn, false);
      assert.equal(r.wrong.warn, true);
      assert.match(r.wrong.text, /DNA|kDa/i);
      assert.equal(r.cleared, '');
    });

    await check('inline units label every band; "no unit" drops both labels and header', async () => {
      const r = await p.evaluate(() => {
        const m = App.S.markers[0];
        const read = () => {
          const f = App.buildFigure(true), doc = new DOMParser().parseFromString(f.svg, 'image/svg+xml');
          return [...doc.querySelectorAll('text')].map(t => t.textContent);
        };
        m.unit = 'bp'; const plain = read();
        m.unit = 'bp-inline'; const inline = read();
        m.unit = 'none'; const none = read();
        const noneFmt = Ladders.fmt(5000, 'none');
        const inlineFmt = Ladders.fmt(5000, 'bp-inline');
        m.unit = 'bp';
        return { plain, inline, none, noneFmt, inlineFmt };
      });
      assert(r.plain.includes('(bp)'), 'plain bp should keep the unit header');
      assert(!r.inline.includes('(bp)'), 'inline bp must not repeat a header');
      assert(r.inline.some(t => /^\d+ bp$/.test(t)), 'inline labels carry the unit: ' + r.inline.join(' | '));
      assert(!r.inline.some(t => /^\d+$/.test(t) && +t > 100), 'inline labels must not fall back to bare numbers');
      assert.equal(r.noneFmt, '5000');
      assert.equal(r.inlineFmt, '5000 bp');
      assert(!r.none.includes('(bp)'), 'no-unit mode must not show a header');
      assert(r.none.includes('20000'), 'no-unit mode keeps the bare numbers');
      assert(!r.none.some(t => /^\d+ bp$/.test(t)), 'no-unit mode must not append a unit');
    });

    await check('per-item font weight reaches SVG and editable PPTX', async () => {
      const r = await p.evaluate(async () => {
        const S = App.S;
        const asB64 = async blob => {
          const u = new Uint8Array(await blob.arrayBuffer()); let s = '';
          for (let i = 0; i < u.length; i += 16384) s += String.fromCharCode(...u.subarray(i, i + 16384));
          return btoa(s);
        };
        S.lanes[1].name = 'HA'; S.lanes[1].weight = 700;
        S.markers[0].bands.forEach(b => { b.show = true; });
        S.markers[0].weight = 600;
        S.groups = [{ from: 1, to: 2, text: 'Group', weight: 600 }];
        S.conditions = [{ name: 'IP', values: S.lanes.map((_, i) => i === 1 ? '+' : ''), weight: 700 }];
        S.labels = [{ text: 'side', pos: 'left', weight: 700 }];
        S.notes = [{ x: S.crop.x + 40, y: S.crop.y + 40, kind: 'text', text: 'note', angle: 0, arrow: false,
          arrowAngle: -90, arrowLen: 0.18, bg: 'none', border: false, align: 'center', weight: 700 }];
        App.commit();
        const f = App.buildFigure(true), doc = new DOMParser().parseFromString(f.svg, 'image/svg+xml');
        const weightOf = (test) => {
          const el = [...doc.querySelectorAll('text')].find(t => test(t.textContent));
          return el && el.getAttribute('font-weight');
        };
        const svg = {
          lane: weightOf(t => t === 'HA'),
          marker: weightOf(t => /^20000( bp)?$/.test(t)),
          group: weightOf(t => t === 'Group'),
          condition: weightOf(t => t === 'IP'),
          row: weightOf(t => t === '+'),
          side: weightOf(t => t === 'side'),
          note: weightOf(t => t === 'note')
        };
        const bold = await asB64(await PPTX.build());
        for (const l of S.lanes) delete l.weight;
        S.markers.forEach(m => { delete m.weight; });
        S.groups.forEach(g => delete g.weight);
        S.conditions.forEach(c => { delete c.weight; });
        S.labels.forEach(l => { delete l.weight; });
        S.notes.forEach(n => { delete n.weight; });
        App.commit();
        const regular = await asB64(await PPTX.build());
        return { svg, bold, regular };
      });
      assert.deepEqual(r.svg, { lane: '700', marker: '600', group: '600', condition: '700', row: '700', side: '700', note: '700' });
      const boldXml = readPptx(Buffer.from(r.bold, 'base64')).get('ppt/slides/slide1.xml').toString('utf8');
      const regularXml = readPptx(Buffer.from(r.regular, 'base64')).get('ppt/slides/slide1.xml').toString('utf8');
      assert((boldXml.match(/ b="1"/g) || []).length > 3, 'weighted items must be native bold PPTX runs');
      assert.equal((regularXml.match(/ b="1"/g) || []).length, 0, 'regular text must not export bold');
    });

    await check('weight lives in each item panel, not a global control', async () => {
      const absent = await p.evaluate(() => !document.getElementById('fontWeight') && !document.getElementById('unitHeader'));
      assert(absent, 'global font-weight and unit-header controls must be gone');
      await p.evaluate(() => {
        App.S.groups = [{ from: 1, to: 2, text: 'Group' }];
        App.S.conditions = [{ name: 'IP', values: App.S.lanes.map(() => '') }];
        App.commit();
        FigEdit.openEd('lane', 1);
      });
      await p.waitForSelector('#floatEd:not(.hidden)');
      assert.equal(await p.locator('#fedWeight').count(), 1, 'lane panel owns a weight control');
      await p.selectOption('#fedWeight', '700');
      await p.evaluate(() => FigEdit.openEd('group', 0));
      await p.selectOption('#fedWeight', '600');
      await p.evaluate(() => FigEdit.openEd('condname', 0));
      await p.selectOption('#fedWeight', '700');
      await p.evaluate(() => FigEdit.flush());
      const ui = await p.evaluate(() => ({
        lane: App.S.lanes[1].weight, group: App.S.groups[0].weight, condition: App.S.conditions[0].weight
      }));
      assert.deepEqual(ui, { lane: 700, group: 600, condition: 700 });
      const marker = await p.evaluate(() => {
        MarkerUI.labelPopover(0, 0);
        const select = document.getElementById('markerPopWeight');
        const present = !!select;
        if (select) { select.value = '600'; select.dispatchEvent(new Event('change', { bubbles: true })); }
        const weight = App.S.markers[0].weight;
        document.getElementById('markerPopClose').click();
        return { present, weight };
      });
      assert.deepEqual(marker, { present: true, weight: 600 });
    });

    await check('marker library lives in its own dialog', async () => {
      const r = await p.evaluate(() => {
        const dlg = document.getElementById('markerLibDlg');
        const backup = document.getElementById('btnBackupLadders');
        const importBtn = document.getElementById('btnImportLadders');
        const initiallyHidden = dlg.classList.contains('hidden');
        document.getElementById('btnMarkerLib').click();
        const opened = !dlg.classList.contains('hidden');
        const inDialog = !!(backup && backup.closest('#markerLibDlg')) && !!(importBtn && importBtn.closest('#markerLibDlg'));
        document.getElementById('btnMarkerLibDone').click();
        return { initiallyHidden, opened, inDialog, closed: dlg.classList.contains('hidden') };
      });
      assert.deepEqual(r, { initiallyHidden: true, opened: true, inDialog: true, closed: true });
    });

    await check('side text accepts a free rotation angle', async () => {
      const r = await p.evaluate(async () => {
        App.S.labels = [
          { text: 'Probe A', pos: 'left', angle: -35 },
          { text: 'Probe B', pos: 'left' },
          { text: 'Probe C', pos: 'below', angle: 8, weight: 600 }
        ];
        App.commit();
        const f = App.buildFigure(true), doc = new DOMParser().parseFromString(f.svg, 'image/svg+xml');
        const groups = [...doc.querySelectorAll('g[data-edit="label"]')];
        const inner = groups.map(g => g.querySelector('g'));
        const transforms = inner.map(g => g && g.getAttribute('transform'));
        const weights = inner.map(g => g && g.querySelector('text').getAttribute('font-weight'));
        App.openAnno('label', 0);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const angle = document.querySelector('#popover #qAngle');
        const popover = { angle: !!angle, value: angle && angle.value };
        if (angle) {
          angle.value = '30';
          angle.dispatchEvent(new Event('input', { bubbles: true }));
          popover.after = App.S.labels[0].angle;
          angle.dispatchEvent(new Event('change', { bubbles: true }));
        }
        App.S.labels = [];
        App.commit();
        return { transforms, weights, popover, w: f.w, h: f.h };
      });
      assert.match(r.transforms[0], /rotate\(-35\)/);
      assert.match(r.transforms[1], /rotate\(-90\)/, 'left side text still defaults to -90°');
      assert.match(r.transforms[2], /rotate\(8\)/);
      assert.equal(r.weights[2], '600');
      assert.equal(r.popover.angle, true);
      assert.equal(+r.popover.value, -35);
      assert.equal(r.popover.after, 30);
      assert(r.w > 0 && r.h > 0);
    });

    await check('one free-text-box tool replaces separate text and arrow buttons', async () => {
      const r = await p.evaluate(async () => {
        const S = App.S, c = S.crop;
        const old = !!document.getElementById('btnAddNoteArrow');
        const button = document.getElementById('btnAddNote');
        S.notes = []; App.commit();
        App.placeNote('note', c.x + c.w * 0.32, c.y + c.h * 0.42);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const pop = document.getElementById('popover');
        const fields = {
          visible: !pop.classList.contains('hidden'),
          textarea: !!pop.querySelector('textarea#qText'),
          align: !!pop.querySelector('#qAlign'),
          bg: !!pop.querySelector('#qBg'),
          border: !!pop.querySelector('#qBorder'),
          arrow: !!pop.querySelector('#qArrow'),
          arrowAngle: !!pop.querySelector('#qArrowAngle'),
          arrowLen: !!pop.querySelector('#qArrowLen')
        };
        const n = S.notes[S.notes.length - 1];
        const created = { kind: n.kind, text: n.text, arrow: n.arrow, bg: n.bg, border: n.border, align: n.align };
        const q = id => pop.querySelector('#' + id);
        const fire = (id, ev) => q(id).dispatchEvent(new Event(ev, { bubbles: true }));
        q('qText').value = '5% input\nIgG HC'; fire('qText', 'input');
        q('qAngle').value = '15'; fire('qAngle', 'input'); fire('qAngle', 'change');
        q('qAlign').value = 'left'; fire('qAlign', 'change');
        q('qBg').value = 'white'; fire('qBg', 'change');
        q('qBorder').checked = true; fire('qBorder', 'change');
        q('qArrow').checked = true; fire('qArrow', 'change');
        q('qArrowAngle').value = '0'; fire('qArrowAngle', 'input'); fire('qArrowAngle', 'change');
        q('qArrowLen').value = '30'; fire('qArrowLen', 'input'); fire('qArrowLen', 'change');
        q('qOk').click();
        const state = { text: n.text, angle: n.angle, align: n.align, bg: n.bg, border: n.border, arrow: n.arrow, arrowAngle: n.arrowAngle, arrowLen: n.arrowLen };
        const preview = App.buildFigure(true), pd = new DOMParser().parseFromString(preview.svg, 'image/svg+xml');
        const noteGroups = [...pd.querySelectorAll('g[data-edit="note"]')];
        const g = noteGroups.find(x => x.querySelector('text')) || noteGroups[0];
        const arrowGroup = noteGroups.find(x => x.querySelector('line'));
        const texts = [...g.querySelectorAll('text')].map(t => t.textContent);
        const rect = g.querySelector('rect');
        const line = arrowGroup && arrowGroup.querySelector('line');
        const exported = App.buildFigure(false).svg;
        const template = App.template();
        S.notes = []; App.applyTemplate(template);
        const restored = S.notes.map(n => ({ text: n.text, kind: n.kind, angle: n.angle, align: n.align, bg: n.bg, border: n.border, arrow: n.arrow, arrowAngle: n.arrowAngle, arrowLen: n.arrowLen }));
        return {
          old, label: button.textContent.replace(/\s+/g, ' ').trim(), fields, created, state, texts,
          transform: g.querySelector('g').getAttribute('transform'),
          rect: rect && { fill: rect.getAttribute('fill'), stroke: rect.getAttribute('stroke') },
          arrowLine: !!line,
          exportedText: /5% input/.test(exported) && /IgG HC/.test(exported),
          exportedEditable: /data-edit="note"/.test(exported),
          templateNote: template.notes[0], restored
        };
      });
      assert.equal(r.old, false, 'the old arrow-only button must be gone');
      assert.match(r.label, /text box|文本框/i);
      assert.deepEqual(r.fields, { visible: true, textarea: true, align: true, bg: true, border: true, arrow: true, arrowAngle: true, arrowLen: true });
      assert.deepEqual(r.created, { kind: 'text', text: '', arrow: false, bg: 'none', border: false, align: 'center' });
      assert.deepEqual(r.state, { text: '5% input\nIgG HC', angle: 15, align: 'left', bg: 'white', border: true, arrow: true, arrowAngle: 0, arrowLen: 0.3 });
      assert.deepEqual(r.texts, ['5% input', 'IgG HC']);
      assert.match(r.transform, /rotate\(15\)/);
      assert.equal(r.rect.fill, '#fff');
      assert(r.rect.stroke, 'border must draw a stroke');
      assert(r.arrowLine, 'optional leader arrow must render');
      assert(r.exportedText, 'notes belong to the exported figure, not only the preview');
      assert.equal(r.exportedEditable, false, 'editor attributes must not reach the export');
      for (const [k, v] of Object.entries({ text: '5% input\nIgG HC', kind: 'text', angle: 15, len: null, arrow: true, arrowAngle: 0, arrowLen: 0.3, bg: 'white', border: true, align: 'left' })) {
        assert.equal(r.templateNote[k], v, 'template note.' + k);
      }
      assert.deepEqual(r.restored, [{ text: '5% input\nIgG HC', kind: 'text', angle: 15, align: 'left', bg: 'white', border: true, arrow: true, arrowAngle: 0, arrowLen: 0.3 }]);
      assert(r.templateNote.fx >= 0 && r.templateNote.fx <= 1 && r.templateNote.fy >= 0 && r.templateNote.fy <= 1);
    });

    await check('free text boxes drag on the gel and undo in one step', async () => {
      const setup = await p.evaluate(() => {
        App.S.notes = [];
        const c = App.S.crop;
        App.placeNote('note', c.x + c.w * 0.5, c.y + c.h * 0.5);
        App.S.notes[0].text = 'drag me';
        App.commit();
        FigEdit.closePop();
        const n = App.S.notes[0], cv = document.getElementById('editor'), box = cv.getBoundingClientRect();
        const q = Editor.toScr(n.x, n.y);
        return { x: n.x, y: n.y, sx: box.left + q.x, sy: box.top + q.y, zoom: Editor.zoom() };
      });
      await p.mouse.move(setup.sx, setup.sy);
      await p.mouse.down();
      await p.mouse.move(setup.sx + 50, setup.sy + 35, { steps: 6 });
      await p.mouse.up();
      const moved = await p.evaluate(() => ({ x: App.S.notes[0].x, y: App.S.notes[0].y }));
      assert(Math.abs(moved.x - (setup.x + 50 / setup.zoom)) < 4, `x should follow the pointer: ${setup.x} → ${moved.x}`);
      assert(Math.abs(moved.y - (setup.y + 35 / setup.zoom)) < 4, `y should follow the pointer: ${setup.y} → ${moved.y}`);
      const undone = await p.evaluate(() => { App.undo(); const n = App.S.notes[0]; return { x: n.x, y: n.y }; });
      assert(Math.abs(undone.x - setup.x) < 0.01 && Math.abs(undone.y - setup.y) < 0.01, 'one undo must put the box back');
      assert.equal(await p.evaluate(() => App.S.notes.length), 1, 'undo must not remove the box');
      const pv = await p.evaluate(() => {
        const g = document.querySelector('#preview g[data-edit="note"]');
        const r = g.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await p.mouse.move(pv.x, pv.y);
      await p.mouse.down();
      await p.mouse.move(pv.x + 30, pv.y + 20, { steps: 6 });
      await p.mouse.up();
      const figMoved = await p.evaluate(() => ({ x: App.S.notes[0].x, y: App.S.notes[0].y }));
      assert(Math.abs(figMoved.x - setup.x) > 0.5 && Math.abs(figMoved.y - setup.y) > 0.5, 'the box must also drag on the finished figure');
      const figUndone = await p.evaluate(() => { App.undo(); const n = App.S.notes[0]; return { x: n.x, y: n.y }; });
      assert(Math.abs(figUndone.x - setup.x) < 0.01 && Math.abs(figUndone.y - setup.y) < 0.01, 'figure drag is one undo step');
      await p.mouse.click(pv.x, pv.y);
      await p.waitForTimeout(60);
      assert(await p.evaluate(() => !document.getElementById('popover').classList.contains('hidden')), 'a plain click still opens the text-box panel');
      await p.evaluate(() => FigEdit.closePop());
    });

    await check('notes can be removed and legacy arrow notes still load', async () => {
      const r = await p.evaluate(async () => {
        const c = App.S.crop;
        App.S.notes = [{ x: c.x + c.w * 0.25, y: c.y + c.h * 0.25, kind: 'arrow', angle: -90, len: 0.2 }];
        App.commit();
        const preview = App.buildFigure(true), doc = new DOMParser().parseFromString(preview.svg, 'image/svg+xml');
        const g = doc.querySelector('g[data-edit="note"]');
        const legacyLine = !!(g && g.querySelector('line'));
        App.openAnno('note', 0);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const pop = document.getElementById('popover');
        const legacyPopover = { angle: !!pop.querySelector('#qAngle'), len: !!pop.querySelector('#qLen'), textarea: !!pop.querySelector('textarea') };
        const template = App.template();
        App.S.notes = []; App.applyTemplate(template);
        const restored = App.S.notes.map(n => ({ kind: n.kind, angle: n.angle, len: n.len }));
        const n = App.S.notes.length;
        App.removeAnno({ kind: 'note', k: 0 });
        const afterRemove = App.S.notes.length;
        App.undo();
        return { legacyLine, legacyPopover, restored, n, afterRemove, afterUndo: App.S.notes.length };
      });
      assert(r.legacyLine, 'legacy arrow notes keep rendering');
      assert.deepEqual(r.legacyPopover, { angle: true, len: true, textarea: false });
      assert.deepEqual(r.restored, [{ kind: 'arrow', angle: -90, len: 0.2 }]);
      assert.equal(r.afterRemove, r.n - 1);
      assert.equal(r.afterUndo, r.n);
    });

    await check('a pasted image loads into the figure', async () => {
      const before = await p.evaluate(() => App.S && App.S.file && App.S.file.name);
      await p.evaluate(async () => {
        const g = Demo.makeGel({ lanes: 6, tilt: 0.4 });
        const cv = document.createElement('canvas'); cv.width = g.width; cv.height = g.height;
        const ctx = cv.getContext('2d'), im = ctx.createImageData(g.width, g.height);
        for (let i = 0; i < g.data.length; i++) {
          const v = Math.max(0, Math.min(255, Math.round(g.data[i] * 255)));
          im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(im, 0, 0);
        const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
        const file = new File([blob], '', { type: 'image/png' });
        const ev = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'clipboardData', {
          value: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }], files: [file] }
        });
        document.body.dispatchEvent(ev);
      });
      await p.waitForFunction(() => App.S && App.S.file && /^pasted_gel_/.test(App.S.file.name || ''), null, { timeout: 60000 });
      const r = await p.evaluate(() => ({ name: App.S.file.name, lanes: App.S.lanes.length, w: App.S.crop.w, h: App.S.crop.h }));
      assert.notEqual(r.name, before);
      assert.match(r.name, /^pasted_gel_.*\.png$/);
      assert(r.lanes > 0 && r.w > 0 && r.h > 0);
    });

    await check('no runtime errors', async () => assert.deepEqual(errs, []));

    const dir = path.join(root, 'test-results', 'p0-p1', engine);
    fs.mkdirSync(dir, { recursive: true });
    await p.screenshot({ path: path.join(dir, 'pasted.png') });
  } finally { await c.close(); }
  return out;
}
