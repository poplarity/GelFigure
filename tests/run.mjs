#!/usr/bin/env node
/* Runs GelFigure's two self-tests in real browsers through Playwright:
 *   test/test.html                       engine: TIFF decoding, deskew, crop, lanes, ladders, rendering
 *   index.html?demo=1&uitest=1&draft=1    interface: editing, rotation, lane removal, exports, projects, drafts…
 *   tests/mobile.mjs                      phone layout and touch (emulated phone per engine), desktop unchanged
 * The app is served from a throw-away local HTTP server (no network access is needed).
 * Usage: node tests/run.mjs [--browser=chromium,firefox,webkit] [--channel=msedge] */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { execFileSync } from 'node:child_process';
import { startupChecks } from './startup.mjs';
import { mobileChecks } from './mobile.mjs';
import { pptxChecks } from './pptx.mjs';
import { fontChecks } from './fonts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1];
const browsers = (arg('browser') || 'chromium,firefox,webkit').split(',').filter(Boolean);
const channel = arg('channel');   // e.g. msedge to use an installed Edge instead of Playwright's Chromium
const ENGINES = { chromium, firefox, webkit };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// interface self-test expectations: [description, predicate on the result object]
const UI_CHECKS = [
  ['no exception', r => !r.error],
  ['Enter moves to the next lane', r => r.enterNext.name1 === 'Sample A' && r.enterNext.editorOpen],
  ['IME Enter does not commit', r => r.imeEnter.stillEditing],
  ['Backspace/Delete never delete lanes while typing', r => r.backspace.lanesBefore === r.backspace.whileTyping],
  ['Backspace on the image deletes the selected lane (Mac delete key)', r => r.backspace.afterKey === r.backspace.lanesBefore - 1 && r.backspace.afterUndo === r.backspace.lanesBefore],
  ['Backspace on a lane picked in the list deletes it; a stray one does not', r => r.backspace.strayKey === r.backspace.lanesBefore && r.backspace.listKey === r.backspace.lanesBefore - 1 && r.backspace.final === r.backspace.lanesBefore],
  ['arrow snaps to the band and gets a size', r => Math.abs(r.arrow.snappedTo - r.arrow.band) <= 1 && /\d/.test(r.arrow.label)],
  ['narrowing the range keeps names', r => r.rangeMiddle.lanesUnchanged],
  ['condition cell cycles', r => r.cond === '+'],
  ['re-detect in crop fixes bad lanes', r => r.cropRedetect.maxErrRedetect != null && r.cropRedetect.maxErrRedetect < 3 && r.cropRedetect.namesKept && r.cropRedetect.outsideUntouched],
  ['even spacing matches the true lanes', r => r.cropRedetect.maxErrEven != null && r.cropRedetect.maxErrEven < 3],
  ['style template round trip', r => r.template.ok],
  ['rotation is reversible', r => r.rotationCarry.every(x => x.roundTripLane < 2.5 && x.roundTripBand < 3)],
  ['carried bands agree with a fresh match', r => r.rotationCarry.every(x => x.bandVsScratchMatch < 3)],
  ['H removes and restores a lane; marker lane asks first', r => r.empty.hOnLane && r.empty.hBack && r.empty.markerNeedsConfirm],
  ['empty lane is suggested', r => r.empty.emptyWells.length > 0 && r.empty.barShown],
  ['group line splits at a splice', r => r.groupSplit.extraLines === r.groupSplit.expected],
  ['extrapolated size marked ≈', r => r.extrap.outside.startsWith('≈') && !r.extrap.inside.startsWith('≈') && r.extrap.info === true],
  ['reset everything returns to the import state', r => r.resetAll.equalsInitial && r.resetAll.hist === 1],
  ['custom ladder travels with the template', r => r.templateLadder.carried === 1 && r.templateLadder.present && r.templateLadder.markerUses],
  ['wrong favourite falls back to the full library', r => JSON.stringify(r.favorites.fallback.picked) === JSON.stringify(r.favorites.truth) && !!r.favorites.fallback.notice],
  ['favourites keep the right ladder', r => JSON.stringify(r.favorites.withFav) === JSON.stringify(r.favorites.truth)],
  ['PNG carries pHYs, sRGB and iTXt once', r => ['pHYs', 'sRGB', 'iTXt'].every(c => r.export.pngChunks.filter(x => x === c).length === 1)],
  ['TIFF export is lossless with 300 dpi', r => r.export.tiffMaxDiff === 0 && Math.round(r.export.tiffDpi) === 300],
  ['project file round trip', r => r.project.same],
  ['best exposure is picked', r => r.exposures.picked === 'exp_x0.7.tif'],
  ['switching exposure keeps annotations', r => r.exposures.switched.kept && r.exposures.nameKept === 'keepme' && r.exposures.stripItems === 3],
  ['protein gel detected automatically', r => r.protein.prot.kind === 'protein' && r.protein.prot.ladderKind === 'protein' && r.protein.prot.markerUnit === 'kDa'],
  ['protein values are labelled in kDa', r => /kDa\)?/.test(r.protein.prot.label || '') && r.protein.prot.header >= 1],
  ['manual gel-type switch keeps names and arrows', r => r.protein.asDna.kind === 'dna' && r.protein.asDna.ladderKind === 'dna' && r.protein.asDna.unit !== 'kDa' && r.protein.asDna.name === 'Prot A' && r.protein.asDna.arrows === 1
    && r.protein.back.kind === 'protein' && r.protein.back.unit === 'kDa' && r.protein.back.name === 'Prot A' && r.protein.back.arrows === 1 && r.protein.back.bands > 4],
  ['crowded gel: only the ladder lane is taken for the marker', r => r.crowded.kind === 'protein' && r.crowded.bandsInSampleLane >= 10 && r.crowded.markerIsFirst && r.crowded.namedM === 1],
  ['a removed marker stays removed when lanes are re-spaced', r => r.crowded.markersAfterEven === 0],
  ['purification gel: lysate lanes are not taken for markers', r => JSON.stringify(r.purification.markers) === '[0]' && r.purification.candidates > 1],
  ['favourite ladders follow the gel type', r => JSON.stringify(r.protein.favKinds) === '["protein"]'],
  ['equal spacing between hand-placed end lanes', r => r.endsEven.got === r.endsEven.n && r.endsEven.maxErr != null && r.endsEven.maxErr < 3],
  ['region box with enlarged inset', r => r.anno.inset === 1 && r.anno.boxLabel && r.anno.legendZoom],
  ['side bracket and side text', r => r.anno.bracket && r.anno.sideText && r.anno.below && r.anno.tplLabels === 2 && r.anno.tplBrackets === 1],
  ['band symbol * with legend note', r => r.anno.star && r.anno.legendStar],
  ['boxes and brackets rotate with the gel', r => r.anno.rotBack < 0.5],
  ['splice settings only once a lane is cut', r => r.anno.spliceBox.before === true && r.anno.spliceBox.after === false],
  ['band list stays open while ticking', r => r.bandsOpen.open && r.bandsOpen.rebuilt],
  ['undo drops a selection that no longer exists', r => r.undoSel.selLane === -1 && r.undoSel.lanesBack],
  ['popover Delete removes its own arrow', r => JSON.stringify(r.popDel) === '["C"]'],
  ['a box starting in a cut lane keeps its width', r => r.cutBox.width != null && r.cutBox.width > 5],
  ['long group labels never overlap (wrap / shrink / one line)', r => [r.groupFit.wrap, r.groupFit.shrink, r.groupFit.none].every(m => m.overlaps === 0)
    && r.groupFit.wrap.lines[0] > 1 && r.groupFit.wrap.sizes[0] === 7 && r.groupFit.shrink.sizes[0] < 7 && r.groupFit.shrink.sizes[0] >= 5 && r.groupFit.none.lines[0] === 1],
  ['typed line breaks, per-item and lane-name sizes, carried by templates', r => r.groupFit.manualBreak && r.groupFit.groupPt && r.groupFit.lanePt && r.groupFit.arrowPt && r.groupFit.tplKeeps],
  ['pre-flight checks the smallest printed text', r => r.groupFit.preflightMin && r.groupFit.fixedTo6],
  ['editor bar: ↵ breaks a group label, A+ sets its own size', r => r.groupFit.barEdit.barShown && r.groupFit.barEdit.text === 'A\nB' && r.groupFit.barEdit.pt === 8 && r.groupFit.barEdit.closed],
  ['DNA gel still detected after protein mode', r => r.dnaAfter.kind === 'dna' && r.dnaAfter.ladderKind === 'dna' && r.dnaAfter.unit !== 'kDa'],
  ['draft is saved and restored', r => r.draft && r.draft.restored && r.draftDropped]
];

async function runIn(name, base) {
  const out = { browser: name, results: [], ok: true };
  const fail = (what, detail) => { out.ok = false; out.results.push(['FAIL', what, detail]); };
  const pass = what => out.results.push(['ok', what]);
  const browser = await ENGINES[name].launch(channel && name === 'chromium' ? { channel } : {});
  try {
    const startup = await startupChecks(browser, base, ROOT);
    out.results.push(...startup);
    if (startup.some(r => r[0] === 'FAIL')) out.ok = false;
    const mobile = await mobileChecks(browser, base, name);
    out.results.push(...mobile);
    if (mobile.some(r => r[0] === 'FAIL')) out.ok = false;
    const pptx = await pptxChecks(browser, base, ROOT, name);
    out.results.push(...pptx);
    if (pptx.some(r => r[0] === 'FAIL')) out.ok = false;
    const fonts = await fontChecks(browser, base, ROOT, name);
    out.results.push(...fonts);
    if (fonts.some(r => r[0] === 'FAIL')) out.ok = false;
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 960 } });
    const watch = page => {
      const errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      page.on('console', m => { if (m.type() === 'error' && /Content.Security.Policy|Refused to/i.test(m.text())) errs.push(m.text()); });
      return errs;
    };

    // engine self-test
    {
      const page = await ctx.newPage(), errs = watch(page);
      await page.goto(`${base}/test/test.html`);
      await page.waitForFunction(() => /"allOk"/.test(document.getElementById('out').textContent), null, { timeout: 180000 });
      const r = JSON.parse(await page.textContent('#out'));
      r.allOk ? pass('engine self-test') : fail('engine self-test', JSON.stringify(r).slice(0, 600));
      if (errs.length) fail('engine page errors', errs.join(' | '));
      await page.close();
    }
    // interface self-test (English UI)
    {
      const page = await ctx.newPage(), errs = watch(page);
      await page.goto(`${base}/index.html?demo=1&uitest=1&draft=1&lang=en`);
      await page.waitForFunction(() => document.title.startsWith('UITEST '), null, { timeout: 300000 });
      const r = JSON.parse((await page.title()).slice(7));
      for (const [what, ok] of UI_CHECKS) {
        let good = false;
        try { good = !!ok(r); } catch (e) { /* missing field = failure */ }
        good ? pass(what) : fail(what, r.error ? r.error.split('\n')[0] : '');
      }
      if (errs.length) fail('interface page errors', errs.join(' | '));
      await page.close();
    }
    // privacy: the Content Security Policy must stop every request to another origin
    {
      const page = await ctx.newPage();
      await page.goto(`${base}/index.html`);
      outside.hits = [];
      await page.evaluate(async t => {
        try { await fetch(t + '/fetch', { method: 'POST', body: 'x' }); } catch (e) { /* expected */ }
        await new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = t + '/img'; });
        try { navigator.sendBeacon(t + '/beacon', 'x'); } catch (e) { /* expected */ }
        try { const x = new XMLHttpRequest(); x.open('GET', t + '/xhr'); x.send(); } catch (e) { /* expected */ }
        try { new WebSocket(t.replace('http', 'ws') + '/ws'); } catch (e) { /* expected */ }
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = t + '/css'; document.head.appendChild(l);
      }, outside.url);
      await page.waitForTimeout(2000);
      outside.hits.length ? fail('no request leaves the page', outside.hits.join(', ')) : pass('no request leaves the page');
      await page.close();
    }
    // Chinese interface loads and detects the demo gel
    {
      const page = await ctx.newPage(), errs = watch(page);
      await page.goto(`${base}/index.html?demo=1&lang=zh`);
      await page.waitForFunction(() => document.title.startsWith('READY '), null, { timeout: 180000 });
      const r = JSON.parse((await page.title()).slice(6));
      r.lanes.length === 11 && r.markers.length === 1 ? pass('Chinese UI + demo detection') : fail('Chinese UI + demo detection', JSON.stringify(r).slice(0, 300));
      if (errs.length) fail('Chinese UI page errors', errs.join(' | '));
      await page.close();
    }
  } catch (e) {
    fail('runner', e.message);
  } finally { await browser.close(); }
  return out;
}

execFileSync(process.execPath, ['scripts/bundle-onefile.mjs'], { cwd: ROOT });
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
// a second origin that records anything the page manages to send
const outside = { hits: [] };
const sink = http.createServer((req, res) => { outside.hits.push(`${req.method} ${req.url}`); res.end(); });
await new Promise(r => sink.listen(0, '127.0.0.1', r));
outside.url = `http://localhost:${sink.address().port}`;
let allOk = true;
for (const name of browsers) {
  if (!ENGINES[name]) { console.error(`unknown browser: ${name}`); allOk = false; continue; }
  const t0 = Date.now();
  const r = await runIn(name, base);
  console.log(`\n${name}${channel && name === 'chromium' ? ` (${channel})` : ''} — ${r.ok ? 'PASS' : 'FAIL'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  r.results.forEach(([s, what, detail]) => console.log(`  ${s === 'ok' ? '✓' : '✗'} ${what}${detail ? `\n      ${detail}` : ''}`));
  allOk = allOk && r.ok;
}
server.close(); sink.close();
process.exit(allOk ? 0 : 1);
