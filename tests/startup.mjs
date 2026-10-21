/* Startup checks must not supply ?lang=en: that used to mask a failing
 * localStorage read. Check both web and file:// entry points in real browsers. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function startupChecks(browser, base, root) {
  const results = [];
  for (const [label, url, mode] of [
    ['startup and editing with storage blocked', `${base}/index.html`, 'blocked'],
    ['editing when storage quota is full', `${base}/index.html`, 'quota'],
    ['offline folder startup and demo', pathToFileURL(path.join(root, 'index.html')).href, 'file'],
    ['single-file startup and demo without network', pathToFileURL(path.join(root, 'dist/GelFigure.html')).href, 'bundle'],
  ]) {
    const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
    try {
      if (mode === 'blocked') await ctx.addInitScript(() => {
        for (const key of ['localStorage', 'indexedDB']) Object.defineProperty(window, key, {
          get() { throw new DOMException('Storage is blocked', 'SecurityError'); }
        });
      });
      if (mode === 'quota') await ctx.addInitScript(() => {
        localStorage.setItem('gelfig.lang', 'en');
        Storage.prototype.setItem = () => { throw new DOMException('Storage is full', 'QuotaExceededError'); };
      });
      const page = await ctx.newPage(), errors = [], requests = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('dialog', async d => { errors.push(d.message()); await d.dismiss(); });
      if (mode === 'bundle') {
        page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
        await ctx.setOffline(true);
      }
      await page.goto(url);
      assert.equal(await page.evaluate(() => !!(window.UI && window.Editor && window.FigEdit && window.I18N)), true, 'all UI modules start');
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).display), 'flex', 'stylesheet applies');
      await page.locator('#btnLang').click();
      assert.equal(await page.evaluate(() => I18N.lang), 'zh');
      await page.locator('#btnLang').click();
      assert.equal(await page.evaluate(() => I18N.lang), 'en');
      await page.locator('#btnDemo').click();
      await page.waitForFunction(() => window.App?.S && document.querySelector('#preview svg') && document.getElementById('busy').classList.contains('hidden'), null, { timeout: 60000 });
      assert.equal(await page.locator('#sections').isVisible(), true);
      assert.equal(await page.evaluate(() => App.S.lanes.length), 11);
      if (mode === 'blocked' || mode === 'quota') {
        assert.equal(await page.locator('#sections .storage-note').isVisible(), true);
        const r = await page.evaluate(async () => {
          App.setPref('preflight', false);
          const m = App.S.markers[0], base = Ladders.get(m.ladderId);
          const lad = Ladders.saveCustom('Startup test ladder', base.sizes, base.kind);
          Ladders.toggleFavorite(lad.id);
          m.ladderId = lad.id;
          const li = UI.figLanes()[1];
          App.S.lanes[li].name = 'Edited offline';
          App.commit();
          const prefsWork = App.prefs().preflight === false;
          const favoritesWork = Ladders.isFavorite(lad.id);
          const saved = await (await App.projectBlob()).arrayBuffer();
          Ladders.removeCustom(lad.id);
          await App.openProject(saved);
          const projectWorks = App.S.lanes[li].name === 'Edited offline' && !!Ladders.get(App.S.markers[0].ladderId);
          const f = App.buildFigure(false);
          const canvas = await Export.svgToCanvas(f.svg, f.w, f.h, 300);
          const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
          return { prefsWork, favoritesWork, projectWorks, pngWorks: png.size > 1000, persistent: PrefStorage.persistent };
        });
        assert.deepEqual(r, { prefsWork: true, favoritesWork: true, projectWorks: true, pngWorks: true, persistent: false });
      }
      assert.deepEqual(errors, [], 'no startup/editing errors');
      assert.deepEqual(requests, [], 'single-file app makes no HTTP requests');
      results.push(['ok', label]);
    } catch (e) {
      results.push(['FAIL', label, e.message]);
    } finally { await ctx.close(); }
  }
  return results;
}
