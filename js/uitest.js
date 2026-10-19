/* Interaction self-test, loaded only with ?uitest=1. Results go to document.title as JSON. */
(async function (G) {
  'use strict';
  const App = G.App, R = {};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const key = (el, k, extra) => el.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {})));
  const fed = document.getElementById('floatEd');
  try {
    const fl = G.UI.figLanes();
    document.title = 'UITEST-AT 1 ' + JSON.stringify(R);
    // 1. click-to-edit lane name, Enter jumps to next lane
    G.FigEdit.openEd('lane', fl[1]);
    await wait(30);
    fed.value = 'Sample A'; fed.dispatchEvent(new Event('input'));
    key(fed, 'Enter');
    // the next lane's editor opens on the next animation frame
    for (let t = 0; t < 100 && fed.classList.contains('hidden'); t++) await wait(50);
    R.enterNext = { name1: App.S.lanes[fl[1]].name, editorOpen: !fed.classList.contains('hidden'), placeholderIsLane: fed.placeholder };
    document.title = 'UITEST-AT 2 ' + JSON.stringify(R);
    // 2. IME composing Enter must NOT commit/jump
    fed.value = 'sh'; fed.dispatchEvent(new Event('input'));
    key(fed, 'Enter', { isComposing: true, keyCode: 229 });
    await wait(30);
    R.imeEnter = { stillEditing: !fed.classList.contains('hidden'), placeholder: fed.placeholder };
    fed.value = 'Sample B'; fed.dispatchEvent(new Event('input'));
    key(fed, 'Enter');
    await wait(60);
    R.names = fl.map(i => App.S.lanes[i].name);
    document.title = 'UITEST-AT 3 ' + JSON.stringify(R);
    // 3. Backspace while typing never deletes lanes; Backspace on the image area does nothing either
    const n0 = App.S.lanes.length;
    G.FigEdit.openEd('lane', fl[2]); await wait(20);
    key(fed, 'Backspace'); key(fed, 'Delete');
    fed.blur(); await wait(20);
    App.selLane = fl[2];
    const box = document.getElementById('editorBox'); box.focus();
    key(box, 'Backspace');
    R.backspace = { lanesBefore: n0, lanesAfter: App.S.lanes.length };
    document.title = 'UITEST-AT 4 ' + JSON.stringify(R);
    // 4. place an arrow by clicking a band: snaps to a band and gets a size label
    const mk = App.S.markers[0];
    const b = mk.bands.find(x => x.matched && x.bp === 1000) || mk.bands.find(x => x.matched);
    App.placeArrow(App.S.lanes[mk.lane].x, b.y + 4);
    // the popover opens on the next animation frame, which slow headless browsers can delay
    for (let t = 0; t < 100 && !document.getElementById('pOk'); t++) await wait(50);
    const a = App.S.arrows[App.S.arrows.length - 1];
    R.arrow = { snappedTo: Math.round(a.y), band: Math.round(b.y), label: App.arrowLabel(a), popoverOpen: !document.getElementById('popover').classList.contains('hidden'), stage: document.querySelector('.coach') ? 'same screen' : '' };
    document.getElementById('pOk').click();
    document.title = 'UITEST-AT 5 ' + JSON.stringify(R);
    // 5. narrow the range from the middle: names survive, lanes are not re-created
    const before = App.S.lanes.map(l => l.name).join('|');
    App.setLaneRange(fl[1], fl[2]); App.afterRangeChange(); App.commit();
    await wait(40);
    R.rangeMiddle = { figLanes: G.UI.figLanes().map(i => i + 1), names: G.UI.figLanes().map(i => App.S.lanes[i].name), lanesUnchanged: App.S.lanes.map(l => l.name).join('|') === before };
    App.setLaneRange(fl[0], fl[fl.length - 1]); App.afterRangeChange(); App.commit();
    document.title = 'UITEST-AT 6 ' + JSON.stringify(R);
    // 6. group by dragging lane names (API path) and condition cell cycling
    App.S.groups.push({ from: fl[1], to: fl[2], text: 'Cell line' });
    App.S.conditions.push({ name: 'Dox', values: App.S.lanes.map(() => '') });
    App.commit(); await wait(40);
    const cell = document.querySelector(`#preview g[data-edit="cond"][data-src="${fl[1]}"]`);
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wait(40);
    R.cond = App.S.conditions[0].values[fl[1]];
    R.coach = document.getElementById('coachText').textContent;
    document.title = 'UITEST-AT 8 ' + JSON.stringify(R);
    // 8. bad first detection, fixed inside the crop only
    {
      const good = G.UI.figLanes().map(i => App.S.lanes[i].x);
      const names = G.UI.figLanes().map(i => App.S.lanes[i].name);
      const outsideBefore = App.S.lanes.filter(l => l.x < App.S.crop.x || l.x > App.S.crop.x + App.S.crop.w).map(l => Math.round(l.x));
      // corrupt: shift + squeeze the in-crop lanes and add a bogus one
      const c = App.S.crop;
      const bad = good.map((x, k) => c.x + 10 + k * (c.w - 40) / good.length * 0.8);
      bad.push(c.x + c.w - 15);
      App.replaceLanes(App.S.lanes.filter(l => l.x < c.x || l.x > c.x + c.w).map(l => l.x).concat(bad).sort((a, b) => a - b));
      G.UI.figLanes().forEach((i, k) => { App.S.lanes[i].name = names[k] || ''; });
      App.commit();
      document.getElementById('btnRedetectCrop').click();
      const n1 = G.UI.figLanes().length;
      const after1 = G.UI.figLanes().map(i => App.S.lanes[i].x);
      const err1 = after1.length === good.length ? Math.max(...after1.map((x, k) => Math.abs(x - good[k]))) : null;
      // even spacing with an explicit count
      const markersAfterRedetect = App.S.markers.map(m => [m.lane + 1, m.ladderId]);
      document.getElementById('cropLaneN').value = good.length;
      document.getElementById('btnEvenCrop').click();
      const after2 = G.UI.figLanes().map(i => App.S.lanes[i].x);
      const err2 = after2.length === good.length ? Math.max(...after2.map((x, k) => Math.abs(x - good[k]))) : null;
      const outsideAfter = App.S.lanes.filter(l => l.x < App.S.crop.x || l.x > App.S.crop.x + App.S.crop.w).map(l => Math.round(l.x));
      R.cropRedetect = {
        corrupted: bad.length, redetected: n1, maxErrRedetect: err1 && +err1.toFixed(1),
        maxErrEven: err2 && +err2.toFixed(1), pitch: Math.round(c.w / good.length),
        namesKept: G.UI.figLanes().map(i => App.S.lanes[i].name).join(',') === names.join(','),
        outsideUntouched: JSON.stringify(outsideBefore) === JSON.stringify(outsideAfter),
        markersAfterRedetect, markersAfterEven: App.S.markers.map(m => [m.lane + 1, m.ladderId])
      };
    }
    document.title = 'UITEST-AT 7 ' + JSON.stringify(R);
    // 7. style template round trip: wipe annotations, re-apply, everything comes back
    const tpl = JSON.parse(JSON.stringify(App.template()));
    const ref = JSON.stringify([G.UI.figLanes().map(i => App.S.lanes[i].name), App.S.groups.map(g => [g.from, g.to, g.text]), App.S.markers.map(m => [m.lane, m.ladderId])]);
    G.UI.figLanes().forEach(i => { App.S.lanes[i].name = ''; });
    App.S.groups = []; App.S.markers = []; App.commit();
    App.applyTemplate(tpl);
    const got = JSON.stringify([G.UI.figLanes().map(i => App.S.lanes[i].name), App.S.groups.map(g => [g.from, g.to, g.text]), App.S.markers.map(m => [m.lane, m.ladderId])]);
    R.template = { ok: got === ref, got };

    const S = () => App.S, fig = () => G.UI.figLanes();
    document.title = 'UITEST-AT 9 ' + JSON.stringify(R);
    // 9. rotation carries annotations: compare carried lanes/bands with a fresh detection at the new angle
    R.rotationCarry = [1.5, 4].map(dd => {
      const r0 = S().rotation, snap0 = App.snapshot();
      const lanes0 = fig().map(i => S().lanes[i].x);
      const bands0 = S().markers.map(m => m.bands.map(b => b.y));
      App.setRotation(r0 + dd);
      const carriedLanes = fig().map(i => S().lanes[i].x);
      const carriedBands = S().markers.map(m => m.bands.map(b => b.y));
      App.afterRotation();
      // how far the local refinement had to move matched bands after carrying them
      let refine = 0; S().markers.forEach((m, mi) => m.bands.forEach((b, k) => { if (b.matched) refine = Math.max(refine, Math.abs(b.y - carriedBands[mi][k])); }));
      // what a from-scratch match at the new angle says about the same bands
      const snapR = App.snapshot();
      App.matchMarkers(true);
      let vsScratch = 0; S().markers.forEach((m, mi) => m.bands.forEach((b, k) => { const c = JSON.parse(snapR).markers[mi].bands[k]; if (b.matched && c.matched) vsScratch = Math.max(vsScratch, Math.abs(b.y - c.y)); }));
      App.S = JSON.parse(snapR); App.ensureRot();
      App.redetectLanesInCrop();
      const fresh = fig().map(i => S().lanes[i].x);
      App.S = JSON.parse(snapR); App.ensureRot();
      App.setRotation(r0);
      const back = fig().map(i => S().lanes[i].x);
      let bandBack = 0; S().markers.forEach((m, mi) => m.bands.forEach((b, k) => { bandBack = Math.max(bandBack, Math.abs(b.y - bands0[mi][k])); }));
      const near = (a, list) => Math.min(...list.map(y => Math.abs(a - y)));
      const res = {
        rotatedBy: dd, lanes: carriedLanes.length, freshLanes: fresh.length,
        carriedToFresh: +Math.max(...carriedLanes.map(x => near(x, fresh))).toFixed(1),
        freshToCarried: +Math.max(...fresh.map(x => near(x, carriedLanes))).toFixed(1),
        bandRefineMove: +refine.toFixed(1), bandVsScratchMatch: +vsScratch.toFixed(1),
        roundTripLane: +Math.max(...back.map((x, k) => Math.abs(x - lanes0[k]))).toFixed(2), roundTripBand: +bandBack.toFixed(2),
        pitch: Math.round(S().lanePitch || 0),
        carriedX: carriedLanes.map(Math.round), freshX: fresh.map(Math.round), crop: JSON.parse(snapR).crop
      };
      App.S = JSON.parse(snap0); App.ensureRot(); App.commit();
      return res;
    });
    document.title = 'UITEST-AT 10 ' + JSON.stringify(R);
    // 10. empty lane suggestion + H hotkey (marker lanes need confirmation)
    {
      const empt = App.emptyLanes();
      const boxEl = document.getElementById('editorBox');
      const target = fig().find(i => !S().markers.some(m => m.lane === i));
      App.selLane = target; boxEl.focus(); key(boxEl, 'h');
      const hidAfterH = S().lanes[target].hidden;
      key(boxEl, 'h');
      const restored = !S().lanes[target].hidden;
      const oldConfirm = window.confirm; window.confirm = () => false;
      App.selLane = S().markers[0].lane; key(boxEl, 'h');
      const markerKept = !S().lanes[S().markers[0].lane].hidden;
      window.confirm = oldConfirm; App.selLane = -1;
      R.empty = { emptyWells: empt.map(i => i + 1), barShown: !document.getElementById('emptyBar').classList.contains('hidden'), hOnLane: hidAfterH, hBack: restored, markerNeedsConfirm: markerKept };
    }
    document.title = 'UITEST-AT 11 ' + JSON.stringify(R);
    // 11. group line splits at a splice gap
    {
      const f0 = fig(); const snap = App.snapshot();
      S().groups = [{ from: f0[1], to: f0[3], text: 'G' }]; S().style.spliceStyle = 'gap';
      const count = () => (App.buildFigure(false).svg.match(/<line /g) || []).length;
      const n1 = count();
      App.setLaneHidden(f0[2], true, 'test');
      const n2 = count();
      R.groupSplit = { extraLines: n2 - n1, expected: 1 + (S().style.groupTicks ? 2 : 0) };
      App.S = JSON.parse(snap);
    }
    document.title = 'UITEST-AT 12 ' + JSON.stringify(R);
    // 12. extrapolated / disagreeing size is marked ≈
    {
      const m = S().markers[0], top = Math.min(...m.bands.filter(b => b.matched).map(b => b.y));
      const inside = m.bands.filter(b => b.matched).sort((p, q) => p.y - q.y)[2];
      const aOut = { y: top - 40, text: '', size: true, side: '' }, aIn = { y: inside.y, text: '', size: true, side: '' };
      R.extrap = { outside: App.arrowLabel(aOut), inside: App.arrowLabel(aIn), insideBp: inside.bp, info: App.estimateInfo(aOut.y) && App.estimateInfo(aOut.y).extrap };
    }
    document.title = 'UITEST-AT 13 ' + JSON.stringify(R);
    // 13. reset everything returns exactly to the post-import state
    {
      S().lanes[fig()[0]].name = 'XYZ'; App.setRotation(S().rotation + 2); App.commit();
      App.resetAll();
      R.resetAll = { equalsInitial: App.snapshot() === App.initial, hist: App.hist.length };
      App.S.lanes[G.UI.figLanes()[0]].name = 'M'; App.commit();
    }
    document.title = 'UITEST-AT 14 ' + JSON.stringify(R);
    // 14. custom ladder travels with the template
    {
      const m = S().markers[0], base = G.Ladders.get(m.ladderId);
      const lad = G.Ladders.saveCustom('UITest ladder', base.sizes);
      m.ladderId = lad.id; App.matchMarkers(false); App.commit();
      const tpl2 = JSON.parse(JSON.stringify(App.template()));
      G.Ladders.removeCustom(lad.id);
      const res = App.applyTemplate(tpl2);
      R.templateLadder = { carried: (tpl2.ladders || []).length, imported: res.importedLadders, present: !!G.Ladders.get(lad.id), markerUses: S().markers[0].ladderId === lad.id };
      S().markers[0].ladderId = base.id; App.matchMarkers(false); App.commit();
      G.Ladders.removeCustom(lad.id);
    }
    document.title = 'UITEST-AT 15 ' + JSON.stringify(R);
    // 15. favourites bias + "only favourites" fallback when none fits
    {
      const favBefore = G.Ladders.favorites(), prefBefore = App.prefs().onlyFavLadders;
      const truth = S().markers.map(m => m.ladderId);
      G.Ladders.setFavorites(['gr100']); App.setPref('onlyFavLadders', true);
      App.autoMarkers();
      const fallback = { picked: S().markers.map(m => m.ladderId), notice: App.ladderNotice };
      G.Ladders.setFavorites(truth); App.autoMarkers();
      const withFav = S().markers.map(m => m.ladderId);
      G.Ladders.setFavorites(favBefore); App.setPref('onlyFavLadders', !!prefBefore);
      App.autoMarkers(); App.commit();
      R.favorites = { truth, fallback, withFav, restored: S().markers.map(m => m.ladderId) };
    }
    document.title = 'UITEST-AT 16 ' + JSON.stringify(R);
    // 16. preflight + raster metadata
    {
      const pf = App.preflight();
      const f = App.buildFigure(false);
      const c = await G.Export.svgToCanvas(f.svg, f.w, f.h, 300);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const dec = new Uint8Array(await (await G.Export.pngDecorate(blob, 300, { Description: 'ü 中文' })).arrayBuffer());
      const chunks = []; for (let p = 8; p < dec.length;) { const len = (dec[p] << 24 | dec[p + 1] << 16 | dec[p + 2] << 8 | dec[p + 3]) >>> 0; chunks.push(String.fromCharCode(...dec.slice(p + 4, p + 8))); p += 12 + len; }
      const g = new Uint8Array(c.width * c.height); const id = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < g.length; i++) g[i] = id[i * 4];
      const tif = await G.TIFF.decodeBuffer(G.Export.encodeTiffGray(g, c.width, c.height, 300, 'desc'), 't.tif');
      let maxd = 0; for (let i = 0; i < g.length; i += 97) maxd = Math.max(maxd, Math.abs(Math.round(tif.data[i] * 255) - g[i]));
      R.export = { preflight: pf.map(p => p.level + ':' + p.text.slice(0, 40)), pngChunks: chunks.slice(0, 6), tiffSize: [tif.width || tif.w, tif.height || tif.h], tiffDpi: tif.dpi, tiffMaxDiff: maxd };
    }
    document.title = 'UITEST-AT 17 ' + JSON.stringify(R);
    // 17. project file round trip
    {
      const before = App.snapshot();
      const buf = await (await App.projectBlob()).arrayBuffer();
      await App.openProject(buf);
      R.project = { bytes: buf.byteLength, same: App.snapshot() === before, sha: (App.S.file.sha256 || '').slice(0, 12) };
    }
    document.title = 'UITEST-AT 18 ' + JSON.stringify(R);
    // 18. several exposures: the well-exposed one is chosen, switching keeps annotations
    {
      const g0 = G.Demo.makeGel({ tilt: 0.8 });
      const mk = k => { const d = new Float32Array(g0.data.length); for (let i = 0; i < d.length; i++) d[i] = Math.min(1, g0.data[i] * k); return new File([G.Demo.encodeTiff16({ width: g0.width, height: g0.height, data: d })], `exp_x${k}.tif`); };
      await App.load([mk(0.15), mk(0.7), mk(4)]);
      const pick = App.exposures[App.expIdx].name;
      const fl2 = G.UI.figLanes(); App.S.lanes[fl2[1]].name = 'keepme'; App.commit();
      const other = App.exposures.findIndex((e, k) => k !== App.expIdx);
      const sw = await App.switchExposure(other);
      R.exposures = { scores: App.exposures.map(e => [e.name, +e.score.toFixed(2), +e.clipFrac.toFixed(4)]), picked: pick, switched: sw, nameKept: App.S.lanes[fl2[1]].name, stripItems: document.querySelectorAll('#expoStrip .expo-item').length };
    }
    // 20. protein gel: detected automatically, kDa labels, manual switch keeps annotations, DNA regression
    {
      const pg = G.Demo.makeProteinGel({ tilt: 0.6 });
      await App.load(new File([G.Demo.encodeTiff16(pg)], 'demo_protein.tif', { type: 'image/tiff' }));
      const prot = {
        kind: App.gelKind(), unit: App.sizeUnit(), confidence: App.gelDetection && App.gelDetection.confidence,
        ladderKind: (G.Ladders.get((App.S.markers[0] || {}).ladderId) || {}).kind,
        markerUnit: (App.S.markers[0] || {}).unit,
        ladderCount: G.Ladders.all('protein').length,
        label: App.S.markers[0] ? App.fmtSize(App.S.markers[0].bands[0].bp) : null,
        header: (App.buildFigure(false).svg.match(/\(kDa\)/g) || []).length
      };
      // rename a lane and annotate, then switch to DNA and back: the typing must survive
      const fl2 = G.UI.figLanes();
      App.S.lanes[fl2[1]].name = 'Prot A';
      App.S.arrows = [{ y: App.S.markers[0].bands[3].y, text: 'p55', size: true, side: '' }];
      App.commit();
      App.setGelType('dna');
      const asDna = { kind: App.gelKind(), ladderKind: (G.Ladders.get(App.S.markers[0].ladderId) || {}).kind, unit: App.S.markers[0].unit, name: App.S.lanes[fl2[1]].name, arrows: App.S.arrows.length };
      App.setGelType('protein');
      const back = { kind: App.gelKind(), unit: App.S.markers[0].unit, name: App.S.lanes[fl2[1]].name, arrows: App.S.arrows.length, bands: App.S.markers[0].bands.filter(b => b.show).length };
      R.protein = { prot, asDna, back };

      // a crowded gel: sample lanes carry more bands than the ladder, so only the lane a ladder
      // explains completely may be taken for the marker
      await App.load(new File([G.Demo.encodeTiff16(G.Demo.makeProteinGel({ crowded: true, tilt: 0 }))], 'demo_lysate.tif', { type: 'image/tiff' }));
      const fl3 = G.UI.figLanes();
      R.crowded = {
        kind: App.gelKind(), markers: App.S.markers.map(m => m.lane),
        markerIsFirst: App.S.markers.length === 1 && App.S.markers[0].lane === fl3[0],
        bandsInSampleLane: App.lanePeaks(fl3[2] != null ? fl3[2] : fl3[0]).length
      };
      // removing a wrongly detected marker must survive re-spacing the lanes
      if (!App.S.markers.length) App.S.markers.push(App.newMarker(fl3[0], null));
      App.S.markers = [];
      App.commit();
      document.getElementById('cropLaneN').value = G.UI.figLanes().length;
      document.getElementById('btnEvenCrop').click();
      R.crowded.markersAfterEven = App.S.markers.length;

      // DNA regression: the standard demo is still detected as DNA with bp labels
      await App.load(new File([G.Demo.encodeTiff16(G.Demo.makeGel())], 'demo_gel.tif', { type: 'image/tiff' }));
      R.dnaAfter = { kind: App.gelKind(), unit: (App.S.markers[0] || {}).unit, ladderKind: (G.Ladders.get((App.S.markers[0] || {}).ladderId) || {}).kind };
    }
    document.title = 'UITEST-AT 20 ' + JSON.stringify(R);
    // 19. autosaved draft survives a reload (needs a browser with working IndexedDB: ?uitest=1&draft=1;
    // headless Edge never answers indexedDB.open and holds its virtual clock)
    if (/[?&]draft=1/.test(location.search)) {
      document.title = 'UITEST-AT 19 ' + JSON.stringify(R);
      const ref = App.snapshot();
      await App.saveDraft();
      const d = await App.peekDraft();
      App.S.lanes[G.UI.figLanes()[0]].name = 'changed';
      await App.restoreDraft();
      R.draft = { listed: !!d && d.name, restored: App.snapshot() === ref };
      await App.dropDraft();
      R.draftDropped = !(await App.peekDraft());
    }
  } catch (e) { R.error = String(e) + '\n' + (e.stack || ''); }
  document.title = 'UITEST ' + JSON.stringify(R);
})(window);
