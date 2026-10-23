/* Real IndexedDB regression tests. Synthetic images only; no user files are needed. */
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export async function historyChecks(browser, base, root, engine) {
  const results = [], ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const check = async (name, fn) => {
    try { await fn(); results.push(['ok', 'history: ' + name]); }
    catch (e) { results.push(['FAIL', 'history: ' + name, e.stack]); }
  };
  const ready = async () => { await page.goto(base + '/index.html?demo=1&lang=en'); await page.waitForFunction(() => document.title.startsWith('READY '), null, { timeout: 120000 }); };
  let first, second, expected, multiple, legacy;
  try {
    await ready();
    await check('switching images preserves inline edits and deduplicates original bytes', async () => {
      first = await page.evaluate(() => App.projectId);
      const li = await page.evaluate(() => UI.figLanes()[1]);
      await page.evaluate(i => FigEdit.openEd('lane', i), li);
      await page.locator('#floatEd').fill('Experiment A');
      await page.evaluate(async () => {
        const file = { name: 'experiment_B.tif', buffer: App.srcBuffer };
        await UI.load([file]); App.S.lanes[UI.figLanes()[1]].name = 'Experiment B'; App.commit(); await App.saveDraft();
      });
      second = await page.evaluate(() => App.projectId);
      assert.notEqual(first, second);
      const r = await page.evaluate(async a => {
        const db = await new Promise((resolve, reject) => { const q = indexedDB.open('gelfigure', 1); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
        const keys = await new Promise(r => { const q = db.transaction('drafts').objectStore('drafts').getAllKeys(); q.onsuccess = () => r(q.result); }); db.close();
        await App.restoreHistory(a);
        return { keys, name: App.S.lanes[UI.figLanes()[1]].name, count: (await App.listHistory()).length };
      }, first);
      assert.equal(r.name, 'Experiment A'); assert.equal(r.count, 2);
      assert.equal(r.keys.filter(k => k.startsWith('img:')).length, 1);
      expected = await page.evaluate(() => App.snapshot());
    });
    await check('history survives reload and restores without running detection', async () => {
      await page.goto(base + '/index.html?lang=en');
      await page.locator('#btnHistoryStart').click();
      await page.waitForSelector('.library-card');
      await page.evaluate(() => { App.autoAll = () => { throw Error('History must not re-detect'); }; });
      await page.locator(`[data-project="${first}"] .open-project`).click();
      await page.waitForFunction(id => App.projectId === id && document.getElementById('historyDlg').classList.contains('hidden'), first);
      assert.equal(await page.evaluate(() => App.snapshot()), expected);
      assert.equal(await page.evaluate(() => App.cacheStatus), 'saved');
    });
    await check('rename supports Chinese composition, Escape and literal markup', async () => {
      await page.locator('#cacheStatus').click();
      const card = page.locator(`[data-project="${first}"]`);
      await card.locator('.rename-project').click();
      await card.locator('input').fill('实验一');
      await card.locator('input').evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
      assert.equal(await card.locator('input').count(), 1);
      await card.locator('input').press('Enter');
      await page.waitForFunction(() => !!document.querySelector('.library-card .open-project') && !document.querySelector('.library-card input'));
      assert.equal(await card.locator('.open-project').textContent(), '实验一');
      await card.locator('.rename-project').click(); await card.locator('input').fill('discarded name'); await card.locator('input').press('Escape');
      await page.waitForFunction(() => !document.querySelector('.library-card input'));
      assert.equal(await card.locator('.open-project').textContent(), '实验一');
      await card.locator('.rename-project').click(); await card.locator('input').fill('<b>literal label</b>'); await card.locator('input').press('Enter');
      await page.waitForFunction(() => !document.querySelector('.library-card input'));
      assert.equal(await card.locator('.open-project').textContent(), '<b>literal label</b>');
      assert.equal(await card.locator('.open-project b').count(), 0);
      assert(await card.locator('.delete-project').isDisabled());
      await page.locator('#historyClose').click();
    });
    await check('queued edits and renames retain the newest state', async () => {
      const ok = await page.evaluate(async () => {
        const id = App.projectId, li = UI.figLanes()[1];
        App.S.lanes[li].name = 'Earlier'; const pending = App.saveDraft();
        App.S.lanes[li].name = 'Later'; await pending;
        const stale = App.cacheStatus === 'pending';
        const rename = App.renameHistory(id, 'Saved experiment');
        const save = App.saveDraft(); await Promise.all([rename, save]);
        const name = (await App.listHistory()).find(p => p.projectId === id).projectName;
        await App.restoreHistory(id);
        return stale && name === 'Saved experiment' && App.S.lanes[li].name === 'Later';
      });
      assert(ok);
    });
    await check('deleting a project keeps shared source bytes usable', async () => {
      await page.evaluate(async b => { await App.deleteHistory(b); }, second);
      assert.equal(await page.evaluate(async () => (await App.listHistory()).length), 1);
      await page.evaluate(a => App.restoreHistory(a), first);
      assert.equal(await page.evaluate(() => App.S.lanes[UI.figLanes()[1]].name), 'Later');
    });
    // Reload to restore the detection function that the no-redetection check deliberately blocked.
    await page.goto(base + '/index.html?lang=en'); await page.evaluate(a => App.restoreHistory(a), first);
    await check('colour sources, fonts and manual geometry restore exactly', async () => {
      const saved = await page.evaluate(async () => {
        const gel = Demo.makeProteinGel({ tilt: 0 }), c = document.createElement('canvas');
        c.width = gel.width; c.height = gel.height;
        const ctx = c.getContext('2d'), pixels = ctx.createImageData(gel.width, gel.height);
        for (let i = 0; i < gel.data.length; i++) {
          const v = Math.round(gel.data[i] * 255); pixels.data.set([v, v, Math.min(255, v + 40), 255], i * 4);
        }
        ctx.putImageData(pixels, 0, 0);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        await App.load({ name: 'synthetic_blue.png', buffer: await blob.arrayBuffer() });
        App.setDisplayMode('colour'); // history must restore an explicitly chosen colour mode
        App.S.style.fontFamily = 'Cambria'; App.S.labels.push({ text: 'Coomassie', pos: 'left', pt: 9 });
        App.S.crop.y += 3; App.S.crop.h -= 6; App.commit(); await App.saveDraft();
        return { id: App.projectId, state: App.snapshot(), bytes: await App.sha256(App.sourceRGB.buffer), source: App.S.file.sha256 };
      });
      await page.goto(base + '/index.html?lang=en');
      const restored = await page.evaluate(async s => {
        await App.restoreHistory(s.id);
        return { state: App.snapshot(), bytes: await App.sha256(App.sourceRGB.buffer), source: await App.sha256(App.srcBuffer), colour: App.isColour() };
      }, saved);
      assert.deepEqual(restored, { state: saved.state, bytes: saved.bytes, source: saved.source, colour: true });
    });
    await check('all exposures, annotations, custom ladders and reset state survive', async () => {
      multiple = await page.evaluate(async () => {
        const make = gain => { const gel = Demo.makeGel({ tilt: 0 }); gel.data = Float32Array.from(gel.data, v => v * gain); return { name: 'exposure_' + gain + '.tif', buffer: Demo.encodeTiff16(gel) }; };
        await App.load([make(0.5), make(0.9)]);
        const lad = Ladders.saveCustom('History custom ladder', [10000, 8000, 6000, 4000, 2000, 1000, 500], 'dna');
        App.S.markers[0].ladderId = lad.id;
        App.S.groups = [{ from: UI.figLanes()[1], to: UI.figLanes()[3], text: 'Group\nOne', pt: 8 }];
        App.S.conditions = [{ name: 'Drug', values: App.S.lanes.map(() => '+') }];
        App.S.style.fontFamily = 'Times New Roman'; App.commit(); await App.saveDraft();
        return { id: App.projectId, state: App.snapshot(), initial: App.initial, index: App.expIdx, hashes: App.exposures.map(r => r.sha256), custom: lad.id };
      });
      await page.goto(base + '/index.html?lang=en');
      const r = await page.evaluate(async data => {
        Ladders.removeCustom(data.custom); await App.restoreHistory(data.id);
        const restored = App.snapshot() === data.state && App.initial === data.initial && !!Ladders.get(data.custom);
        const hashes = App.exposures.map(r => r.sha256), initialIndex = App.expIdx;
        await App.switchExposure(1 - App.expIdx); await App.saveDraft();
        return { restored, hashes, initialIndex, groups: App.S.groups.length, exposures: App.exposures.length };
      }, multiple);
      assert(r.restored); assert.deepEqual(r.hashes, multiple.hashes); assert.equal(r.initialIndex, multiple.index); assert.equal(r.groups, 1); assert.equal(r.exposures, 2);
    });
    await check('undoing an exposure switch restores bytes matching the saved state', async () => {
      const r = await page.evaluate(async () => {
        App.undo(); const state = App.snapshot(), sha = App.S.file.sha256;
        await App.saveDraft(); await App.restoreHistory(App.projectId);
        return App.snapshot() === state && await App.sha256(App.srcBuffer) === sha && App.exposures[App.expIdx].sha256 === sha;
      });
      assert(r);
    });
    await check('transaction failure reports unsaved work without damaging the last cache', async () => {
      const r = await page.evaluate(async () => {
        await App.saveDraft(); const snapshot = App.snapshot(), original = IDBObjectStore.prototype.put;
        window.restoreHistoryPut = () => { IDBObjectStore.prototype.put = original; };
        IDBObjectStore.prototype.put = function (v, k) { if (String(k).startsWith('project:')) { this.transaction.abort(); throw new DOMException('Full', 'QuotaExceededError'); } return original.call(this, v, k); };
        App.S.lanes[UI.figLanes()[1]].name = 'Not cached';
        const ok = await App.saveDraft(); const meta = await App.peekDraft();
        return { ok, status: App.cacheStatus, oldIntact: meta.state === snapshot };
      });
      assert.deepEqual(r, { ok: false, status: 'error', oldIntact: true });
      await page.locator('#cacheStatus').click();
      await page.waitForFunction(() => !document.getElementById('historyError').classList.contains('hidden'));
      assert(await page.locator('#historySave').isVisible());
      await page.locator('#historyClose').click();
      let sawPrompt = false;
      page.once('dialog', async d => { sawPrompt = /could not be cached/.test(d.message()); await d.dismiss(); });
      const id = await page.evaluate(() => App.projectId);
      await page.evaluate(() => UI.load([{ name: 'should_not_open.tif', buffer: App.srcBuffer }]));
      assert(sawPrompt); assert.equal(await page.evaluate(() => App.projectId), id);
      await page.evaluate(() => window.restoreHistoryPut());
      await page.evaluate(() => App.saveDraft());
    });
    await check('legacy single draft is migrated before the next import replaces it', async () => {
      legacy = await page.evaluate(async () => {
        await App.saveDraft();
        const meta = { name: App.S.file.name, sha256: App.S.file.sha256, state: App.snapshot(), initial: App.initial, autoRotation: App.autoRotation, savedAt: 1234567890, ladders: Ladders.defsFor(App.S.markers.map(m => m.ladderId)) };
        const raw = App.srcBuffer;
        const db = await new Promise(r => { const q = indexedDB.open('gelfigure', 1); q.onsuccess = () => r(q.result); });
        await new Promise((resolve, reject) => { const tx = db.transaction('drafts', 'readwrite'), st = tx.objectStore('drafts'); st.clear(); st.put(meta, 'meta'); st.put(raw, 'src'); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }); db.close();
        App.S = null; App.srcBuffer = null;
        return meta.state;
      });
      await page.goto(base + '/index.html?lang=en');
      await page.waitForSelector('#draftBox:not(.hidden)');
      await page.locator('#btnDemo').click();
      await page.waitForFunction(() => App.S && document.getElementById('busy').classList.contains('hidden'));
      await page.evaluate(() => App.saveDraft());
      assert.equal(await page.evaluate(async () => (await App.listHistory()).length), 2);
      await page.evaluate(() => App.restoreHistory('legacy_1234567890'));
      assert.equal(await page.evaluate(() => App.snapshot()), legacy);
    });
    await check('responsive history and cache status do not overflow or steal text focus', async () => {
      await page.setViewportSize({ width: 320, height: 740 });
      await page.locator('#btnMore').click(); await page.locator('[data-m="history"]').click();
      await page.waitForSelector('.library-card');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
      const bounds = await page.locator('.history-body').boundingBox(); assert(bounds.width <= 320);
      const dir = path.join(root, 'test-results', 'history', engine); fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, 'phone.png') });
      await page.locator('#historyClose').click();
      await page.setViewportSize({ width: 1366, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1366);
      for (const width of [901, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        const right = await page.locator('.topbar-right').boundingBox(); assert(right.x + right.width <= width + 1, 'desktop header fits');
      }
      await page.setViewportSize({ width: 1366, height: 900 });
      await page.evaluate(() => FigEdit.openEd('lane', UI.figLanes()[1]));
      await page.locator('#floatEd').fill('Still typing');
      await page.waitForFunction(() => App.cacheStatus === 'saved');
      assert(await page.locator('#floatEd').isVisible()); assert(await page.locator('#floatEd').evaluate(e => e === document.activeElement));
      await page.locator('#cacheStatus').click();
      await page.screenshot({ path: path.join(dir, 'desktop.png') });
    });
    await check('deleting the last cached project clears its source and start-screen restore card', async () => {
      await page.goto(base + '/index.html?lang=en');
      const list = await page.evaluate(() => App.listHistory());
      for (const p of list.slice(1)) await page.evaluate(id => App.deleteHistory(id), p.projectId);
      await page.locator('#btnHistoryStart').click(); await page.waitForSelector('.library-card');
      page.once('dialog', d => d.accept()); await page.locator('.delete-project').click();
      await page.waitForSelector('.history-empty');
      assert.equal(await page.locator('#draftBox').isVisible(), false);
      assert.equal(await page.evaluate(() => App.peekDraft()), undefined);
      const remaining = await page.evaluate(async () => {
        const db = await new Promise(r => { const q = indexedDB.open('gelfigure', 1); q.onsuccess = () => r(q.result); });
        const keys = await new Promise(r => { const q = db.transaction('drafts').objectStore('drafts').getAllKeys(); q.onsuccess = () => r(q.result); }); db.close(); return keys;
      });
      assert.deepEqual(remaining, []);
    });
    // Transaction aborts are expected, but callback exceptions should still be handled by the library.
    await check('no unhandled errors during history operations', async () => { assert.deepEqual(errors, []); });
  } finally { await ctx.close(); }
  await check('offline single HTML restores cached work without network', async () => {
    const offline = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
      await offline.setOffline(true); const p = await offline.newPage();
      const url = pathToFileURL(path.join(root, 'dist/GelFigure.html')).href;
      await p.goto(url + '?lang=en'); await p.locator('#btnDemo').click();
      await p.waitForFunction(() => App.S && document.getElementById('busy').classList.contains('hidden'), null, { timeout: 60000 });
      const state = await p.evaluate(async () => { App.S.lanes[UI.figLanes()[1]].name = 'Offline'; App.commit(); const ok = await App.saveDraft(); return { ok, snapshot: App.snapshot() }; });
      // Some browsers isolate or deny IndexedDB on file://; editing and a clear fallback must work.
      if (!state.ok) { assert.equal(await p.evaluate(() => App.cacheStatus), 'error'); return; }
      await p.reload(); await p.locator('#btnDraftRestore').click();
      await p.waitForFunction(() => App.S && document.getElementById('busy').classList.contains('hidden'));
      assert.equal(await p.evaluate(() => App.snapshot()), state.snapshot);
    } finally { await offline.close(); }
  });
  return results;
}
