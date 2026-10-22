/* Phone layout and touch: bottom bar, export sheet, exported files in a sheet (not a download),
 * pinch zoom, double tap, the selection bar, one-tap tools, two-tap group lines — plus a check that
 * the desktop layout still downloads directly. Touch gestures beyond a tap are synthetic
 * PointerEvents, which is what the editor listens to. */
import { devices } from 'playwright';

const PHONE = { chromium: 'Pixel 5', webkit: 'iPhone 13', firefox: 'iPhone 13' };

export async function mobileChecks(browser, base, engine) {
  const results = [];
  const check = async (label, fn) => {
    try { const r = await fn(); results.push(r === true ? ['ok', label] : ['FAIL', label, JSON.stringify(r)]); }
    catch (e) { results.push(['FAIL', label, e.message.split('\n')[0]]); }
  };
  const phone = opts => {
    const d = { ...devices[PHONE[engine]] };
    if (engine === 'firefox') delete d.isMobile;   // not supported by Firefox; width and touch are enough
    return { ...d, locale: 'en-US', ...opts };
  };
  const ready = p => p.waitForFunction(() => document.title.startsWith('READY '), null, { timeout: 180000 });

  // ---------- phone ----------
  const ctx = await browser.newContext(phone());
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  try {
    await p.goto(`${base}/index.html?demo=1&lang=en`);
    await ready(p);
    await p.evaluate(() => App.setPref('preflight', false));
    const touch = (type, id, x, y) => p.evaluate(([type, id, x, y]) => {
      (type === 'pointerdown' ? document.getElementById('editor') : window).dispatchEvent(new PointerEvent(type,
        { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 1 }));
    }, [type, id, x, y]);
    const tapTwice = async (x, y, id) => { for (let k = 0; k < 2; k++) { await touch('pointerdown', id + k, x, y); await touch('pointerup', id + k, x, y); await p.waitForTimeout(100); } };
    const lanes = () => p.evaluate(() => App.S.lanes.length);
    // a point between lanes 3 and 4, inside the crop
    const gapPoint = () => p.evaluate(() => {
      const S = App.S, b = document.getElementById('editor').getBoundingClientRect();
      const q = Editor.toScr((S.lanes[2].x + S.lanes[3].x) / 2, S.crop.y + S.crop.h * 0.6);
      return { x: b.left + q.x, y: b.top + q.y };
    });

    await check('phone: bottom bar, lands on the figure', async () => {
      const r = await p.evaluate(() => ({ phone: UI.isPhone(), fig: document.body.classList.contains('view-fig') }));
      return r.phone && r.fig && await p.isVisible('#mNav') && await p.isVisible('#mCoach') && !(await p.isVisible('#btnPNG')) ? true : r;
    });
    await check('phone: export sheet offers every format and the resolution', async () => {
      await p.locator('#mExport').tap();
      const n = await p.locator('#exportSheet [data-x]').count();
      await p.locator('#mDpiSeg [data-dpi="300"]').tap();
      const dpi = await p.evaluate(() => App.S.style.dpi);
      await p.locator('#exportSheet .sheet-x').tap();
      return n === 8 && dpi === 300 ? true : { n, dpi };
    });
    await check('phone: an exported PNG opens as a picture to long-press, not a download', async () => {
      let downloaded = false;
      p.once('download', () => { downloaded = true; });
      await p.locator('#mExport').tap();
      await p.locator('#exportSheet [data-x="png"]').tap();
      await p.waitForSelector('#resultSheet:not(.hidden)', { timeout: 60000 });
      await p.waitForFunction(() => (document.getElementById('rsImg').src || '').startsWith('data:image/png'), null, { timeout: 20000 });
      const name = await p.textContent('#rsName');
      await p.locator('#resultSheet .rs-done').tap();
      return !downloaded && /_300dpi\.png$/.test(name) ? true : { downloaded, name };
    });
    await p.locator('#mNav button[data-view="raw"]').tap();
    await p.waitForTimeout(300);
    await check('phone: pinch zooms the image without editing it', async () => {
      const r = await p.evaluate(() => { const b = document.getElementById('editor').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      const z0 = await p.evaluate(() => Editor.zoom()), crop0 = await p.evaluate(() => JSON.stringify(App.S.crop));
      await touch('pointerdown', 1, r.x - 40, r.y); await touch('pointerdown', 2, r.x + 40, r.y);
      for (let k = 1; k <= 6; k++) { await touch('pointermove', 1, r.x - 40 - 10 * k, r.y); await touch('pointermove', 2, r.x + 40 + 10 * k, r.y); }
      await touch('pointerup', 2, r.x + 100, r.y); await touch('pointerup', 1, r.x - 100, r.y);
      const k = (await p.evaluate(() => Editor.zoom())) / z0, same = crop0 === await p.evaluate(() => JSON.stringify(App.S.crop));
      await p.evaluate(() => Editor.fitCrop());
      return Math.abs(k - 2.5) < 0.05 && same ? true : { k, same };
    });
    await check('phone: double tap adds a lane; the selection bar deletes it; ↺ undoes', async () => {
      const n0 = await lanes(), g = await gapPoint();
      await tapTwice(g.x, g.y, 10);
      const added = (await lanes()) - n0, bar = await p.isVisible('#selBar');
      await p.locator('#selBtns [data-s="del"]').tap();
      const deleted = (await lanes()) === n0;
      await p.locator('#btnUndo').tap();
      const undone = (await lanes()) === n0 + 1;
      await p.locator('#btnUndo').tap();
      return added === 1 && bar && deleted && undone && (await lanes()) === n0 ? true : { added, bar, deleted, undone };
    });
    await check('phone: "+ Lane" adds one lane per tap, then switches off', async () => {
      const n0 = await lanes(), g = await gapPoint();
      await p.locator('#btnAddLaneM').tap();
      const banner = await p.isVisible('#modeBanner');
      await touch('pointerdown', 20, g.x, g.y); await touch('pointerup', 20, g.x, g.y);
      const added = (await lanes()) - n0, off = await p.evaluate(() => App.mode == null);
      await p.locator('#btnUndo').tap();
      return banner && added === 1 && off ? true : { banner, added, off };
    });
    await check('phone: lane number chip selects; hold ▶ nudges; cut and restore', async () => {
      const c = await p.evaluate(() => { const S = App.S, b = document.getElementById('editor').getBoundingClientRect(), q = Editor.toScr(S.lanes[2].x, S.crop.y); return { x: b.left + q.x, y: b.top + Math.max(12, q.y - 14) }; });
      await p.touchscreen.tap(c.x, c.y);
      const sel = await p.evaluate(() => App.selLane), x0 = await p.evaluate(() => App.S.lanes[2].x);
      const r = await p.locator('#selBtns [data-s="right"]').boundingBox();
      await p.evaluate(([x, y]) => document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerdown', { pointerId: 30, pointerType: 'touch', bubbles: true, cancelable: true, clientX: x, clientY: y })), [r.x + r.width / 2, r.y + r.height / 2]);
      await p.waitForTimeout(650);
      await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 30, pointerType: 'touch', bubbles: true })));
      const moved = (await p.evaluate(() => App.S.lanes[App.selLane].x)) - x0;
      await p.locator('#selBtns [data-s="hide"]').tap();
      const cut = await p.evaluate(() => App.S.lanes[App.selLane].hidden);
      await p.locator('#selBtns [data-s="hide"]').tap();
      const back = await p.evaluate(() => !App.S.lanes[App.selLane].hidden);
      await p.locator('#selBtns [data-s="none"]').tap();
      const gone = !(await p.isVisible('#selBar'));
      return sel === 2 && moved > 1 && cut && back && gone ? true : { sel, moved, cut, back, gone };
    });
    await check('phone: target-band tool goes to the image; a tap places the arrow', async () => {
      await p.locator('#mNav button[data-view="panel"]').tap();
      await p.locator('#btnAddArrow').tap();
      const onImage = await p.evaluate(() => document.body.classList.contains('view-raw') && App.mode === 'arrow');
      const t = await p.evaluate(() => { const S = App.S, m = S.markers[0], bd = m.bands[Math.floor(m.bands.length / 2)], b = document.getElementById('editor').getBoundingClientRect(), q = Editor.toScr(S.lanes[4].x, bd.y); return { x: b.left + q.x, y: b.top + q.y }; });
      const a0 = await p.evaluate(() => App.S.arrows.length);
      await touch('pointerdown', 40, t.x, t.y); await touch('pointerup', 40, t.x, t.y);
      await p.waitForTimeout(300);
      const placed = (await p.evaluate(() => App.S.arrows.length)) - a0;
      const docked = await p.evaluate(() => { const e = document.getElementById('popover'), r = e.getBoundingClientRect(); return !e.classList.contains('hidden') && r.left <= 10 && r.right >= innerWidth - 10; });
      const noKeyboard = await p.evaluate(() => document.activeElement.id !== 'pName');
      await p.locator('#pOk').tap();
      return onImage && placed === 1 && docked && noKeyboard ? true : { onImage, placed, docked, noKeyboard };
    });
    await check('phone: group line by tapping the first and last lane names', async () => {
      const g0 = await p.evaluate(() => App.S.groups.length);
      await p.locator('#mNav button[data-view="panel"]').tap();
      await p.locator('#btnAddGroup').tap();
      await p.locator('#preview g[data-edit="lane"]').nth(1).tap();
      const waits = await p.evaluate(g0 => App.S.groups.length === g0 && App.mode === 'group', g0);
      await p.locator('#preview g[data-edit="lane"]').nth(3).tap();
      const g = await p.evaluate(g0 => App.S.groups[g0], g0);
      await p.keyboard.press('Escape');
      return waits && g && g.to - g.from === 2 ? true : { waits, g };
    });
    await check('phone: figure zoom for small labels', async () => {
      await p.locator('#mNav button[data-view="fig"]').tap();
      const w = () => p.evaluate(() => document.querySelector('#preview svg').getBoundingClientRect().width);
      const w1 = await w();
      await p.locator('#btnFigZoom').tap();
      const w2 = await w();
      await p.locator('#btnFigZoom').tap();
      return Math.abs(w2 / w1 - 2) < 0.05 ? true : { w1, w2 };
    });
    await check('phone: a large camera photo is scaled to 10 MP; a TIFF is left alone', async () => {
      const r = await p.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
        const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, 4000, 3000); g.fillStyle = '#eee'; g.fillRect(800, 1200, 300, 40);
        const jpg = new File([await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9))], 'IMG_0001.JPG', { type: 'image/jpeg' });
        const tif = new File([new Uint8Array(16)], 'gel.tif', { type: 'image/tiff' });
        const [a, b] = await Mobile.fitPhotos([jpg, tif]);
        const bm = await createImageBitmap(a);
        return { name: a.name, px: bm.width * bm.height, tiffSame: b === tif };
      });
      return /^IMG_0001_\d+x\d+\.png$/.test(r.name) && r.px <= 10e6 && r.px > 9.9e6 && r.tiffSame ? true : r;
    });
    await check('phone: no page errors', async () => (errors.length ? errors : true));
  } finally { await ctx.close(); }

  // ---------- inside WeChat: no downloads, so the picture is the way out ----------
  {
    const c = await browser.newContext(phone({ userAgent: (devices[PHONE[engine]].userAgent || '') + ' MicroMessenger/8.0.47' }));
    const q = await c.newPage();
    await check('WeChat: export shows the picture and explains how to save', async () => {
      await q.goto(`${base}/index.html?demo=1&lang=en`);
      await ready(q);
      await q.evaluate(() => App.setPref('preflight', false));
      await q.locator('#mExport').tap();
      const note = await q.isVisible('#mWechatNote');
      await q.locator('#exportSheet [data-x="png"]').tap();
      await q.waitForSelector('#resultSheet:not(.hidden)', { timeout: 60000 });
      const r = { note, wechat: await q.isVisible('#rsWechat'), noDownload: !(await q.isVisible('#rsSave')) };
      return r.note && r.wechat && r.noDownload ? true : r;
    });
    await c.close();
  }

  // ---------- desktop: unchanged ----------
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', acceptDownloads: true });
    const q = await c.newPage();
    await check('desktop: no phone controls; SVG export downloads directly', async () => {
      await q.goto(`${base}/index.html?demo=1&lang=en`);
      await ready(q);
      await q.evaluate(() => App.setPref('preflight', false));
      const ui = { phone: await q.evaluate(() => UI.isPhone()), nav: await q.isVisible('#mNav'), more: await q.isVisible('#btnMore'), png: await q.isVisible('#btnPNG') };
      const dl = q.waitForEvent('download', { timeout: 20000 });
      await q.locator('#btnExportMenu').click();
      await q.locator('#btnSVG').click();
      const name = (await dl).suggestedFilename();
      return !ui.phone && !ui.nav && !ui.more && ui.png && name.endsWith('.svg') ? true : { ui, name };
    });
    await c.close();
  }
  return results;
}
