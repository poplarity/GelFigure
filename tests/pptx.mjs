/* Export contract tests: inspect the ZIP/DrawingML and original image bytes independently of the
 * writer. Native PowerPoint visual/editability checks are also documented in docs/pptx.md. */
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function unzip(b) {
  const end = b.length - 22;
  assert.equal(b.readUInt32LE(end), 0x06054b50);
  const count = b.readUInt16LE(end + 10), start = b.readUInt32LE(end + 16);
  assert.equal(start + b.readUInt32LE(end + 12), end);
  const out = new Map(); let at = start;
  for (let n = 0; n < count; n++) {
    assert.equal(b.readUInt32LE(at), 0x02014b50);
    const len = b.readUInt32LE(at + 20), nameLen = b.readUInt16LE(at + 28), extra = b.readUInt16LE(at + 30), comment = b.readUInt16LE(at + 32);
    const name = b.toString('utf8', at + 46, at + 46 + nameLen), offset = b.readUInt32LE(at + 42);
    assert(!out.has(name)); assert(!name.includes('..')); assert.equal(b.readUInt16LE(at + 10), 0);
    assert.equal(b.readUInt32LE(offset), 0x04034b50);
    assert.equal(b.readUInt16LE(offset + 8), 0);
    const localLen = b.readUInt16LE(offset + 26), localExtra = b.readUInt16LE(offset + 28);
    assert.equal(b.toString('utf8', offset + 30, offset + 30 + localLen), name);
    const data = b.subarray(offset + 30 + localLen + localExtra, offset + 30 + localLen + localExtra + len);
    assert.equal(data.length, len); assert.equal(crc32(data), b.readUInt32LE(at + 16)); assert.equal(crc32(data), b.readUInt32LE(offset + 14));
    out.set(name, data); at += 46 + nameLen + extra + comment;
  }
  assert.equal(at, end);
  return out;
}
// Compare PNG pixel scanlines even if the browser chooses a different lossless compression stream.
function pngPixels(b) {
  assert.equal(b.readUInt32BE(0), 0x89504e47);
  const data = []; let ihdr;
  for (let off = 8; off < b.length;) {
    const n = b.readUInt32BE(off), type = b.toString('ascii', off + 4, off + 8), bytes = b.subarray(off + 8, off + 8 + n);
    if (type === 'IHDR') ihdr = bytes;
    if (type === 'IDAT') data.push(bytes);
    assert(!['eXIf', 'tEXt', 'iTXt'].includes(type), 'No source metadata in embedded PNG');
    off += n + 12;
  }
  return { ihdr: ihdr.toString('hex'), pixels: inflateSync(Buffer.concat(data)) };
}

export async function pptxChecks(browser, base, root, engine) {
  const results = [], ctx = await browser.newContext({ viewport: { width: 1600, height: 960 } });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  const check = async (label, f) => { try { await f(); results.push(['ok', label]); } catch (e) { results.push(['FAIL', label, e.message]); } };
  let bundle;
  try {
    await p.goto(`${base}/index.html?demo=1&lang=en`);
    await p.waitForFunction(() => document.title.startsWith('READY '), null, { timeout: 120000 });
    await p.evaluate(() => {
      const S = App.S, r = S.crop;
      App.setPref('preflight', false);
      S.lanes.forEach((l,i) => { if (l.x >= r.x && l.x <= r.x + r.w) l.name = i === 1 ? '*lacZ* & β' : 'Lane ' + (i+1); });
      const lanes = App.figureLanes();
      S.groups = [{ from: lanes[1], to: lanes[3], text: 'Control & test\n第二行 *italic*', pt: 8 }];
      S.conditions = [{ name: 'Drug', values: S.lanes.map((_,i) => i % 2 ? '+' : '−'), pt: 6 }];
      S.arrows = [{ y: r.y + r.h * .3, text: 'Target & <test>', size: false, side: 'right', pt: 9 }, { y: r.y + r.h * .6, text: 'Non-specific', sym: 'star', side: 'left', size: false }];
      S.brackets = [{ y1: r.y + r.h * .4, y2: r.y + r.h * .7, text: 'Smear', side: 'right', pt: 8 }];
      S.boxes = [{ x: r.x + r.w * .3, y: r.y + r.h * .2, w: r.w * .4, h: r.h * .18, text: 'Inset', zoom: 2, dash: true }];
      S.labels = [{ text: 'Coomassie', pos: 'left' }, { text: 'Exposure 30 s', pos: 'right' }, { text: 'Synthetic example', pos: 'below' }];
      Object.assign(S.style, { labelAngle: '45', panelLetter: 'A', frame: true, laneNumbers: true });
      App.commit();
    });
    async function capture(spliced) {
      return p.evaluate(async cut => {
        if (cut) { App.S.lanes[App.figureLanes()[4]].hidden = true; App.S.style.spliceStyle = 'line'; App.commit(); }
        const before = App.snapshot(), f = App.buildFigure(false);
        const geometry = { w: f.w, h: f.h, vx: f.vx, vy: f.vy, scale: f.scale, crop: { ...App.S.crop }, segs: App._lastGel.segs.map(s => ({ ...s })), fullW: App.fullCanvas.width, fullH: App.fullCanvas.height };
        const src = App.fullCanvas.toDataURL('image/png').split(',')[1];
        const toB64 = bytes => { let s = ''; for (let i=0; i<bytes.length; i+=16384) s += String.fromCharCode(...bytes.subarray(i,i+16384)); return btoa(s); };
        const blob = await PPTX.build();
        return { pptx: toB64(new Uint8Array(await blob.arrayBuffer())), source: src, svg: f.svg, geometry, unchanged: App.snapshot() === before, mime: blob.type };
      }, spliced);
    }
    await check('PPTX: valid ZIP, XML, relationships and one full-size image', async () => {
      bundle = await capture(false);
      const b = Buffer.from(bundle.pptx, 'base64'), entries = unzip(b);
      assert.equal(bundle.mime, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      assert(bundle.unchanged, 'Export must not mutate project state');
      assert.equal([...entries.keys()].filter(n => n.startsWith('ppt/media/')).length, 1);
      const orig = pngPixels(Buffer.from(bundle.source,'base64')), media = pngPixels(entries.get('ppt/media/gel.png'));
      assert.deepEqual(media, orig, 'Full processed image is retained losslessly');
      const names = [...entries.keys()];
      const xmls = [...entries].filter(([n]) => /\.xml$|\.rels$/.test(n)).map(([n,b])=>[n,b.toString('utf8')]);
      const parsed = await p.evaluate(([xmls,names]) => xmls.map(([name,s]) => {
        const d = new DOMParser().parseFromString(s,'application/xml');
        return { name, invalid: !!d.querySelector('parsererror'), relationships: Array.from(d.getElementsByTagName('Relationship')).map(r=>({ target:r.getAttribute('Target'), mode:r.getAttribute('TargetMode') })) };
      }), [xmls,names]);
      for (const file of parsed) {
        assert(!file.invalid, 'Malformed XML: '+file.name);
        for (const rel of file.relationships) {
          assert(!rel.mode, 'No external links');
          const dir = file.name === '_rels/.rels' ? '' : path.posix.dirname(file.name.replace('/_rels/','/'));
          assert(entries.has(path.posix.normalize(path.posix.join(dir, rel.target))), 'Missing relationship target: '+rel.target);
        }
      }
      const slide = entries.get('ppt/slides/slide1.xml').toString('utf8');
      assert(!slide.includes('data:image')); assert(slide.includes('<p:txBody>')); assert(slide.includes('<p:cxnSp>')); assert(slide.includes('<a:custGeom>')); assert(slide.includes('<a:custDash>'));
      const dir = path.join(root,'test-results','pptx',engine); fs.mkdirSync(dir,{recursive:true});
      fs.writeFileSync(path.join(dir,'editable.pptx'),b); fs.writeFileSync(path.join(dir,'reference.svg'),bundle.svg);
      fs.writeFileSync(path.join(dir,'geometry.json'),JSON.stringify(bundle.geometry,null,2));
      await p.evaluate(() => UI.updatePreview());
      await p.locator('#preview > svg').screenshot({ path:path.join(dir,'preview.png') });
    });
    await check('PPTX: editable multi-line text, italics, sizes, rotations and symbols', async () => {
      assert(bundle);
      const xml = unzip(Buffer.from(bundle.pptx,'base64')).get('ppt/slides/slide1.xml').toString('utf8');
      const r = await p.evaluate(s => {
        const d = new DOMParser().parseFromString(s,'application/xml'), ns='http://schemas.openxmlformats.org/drawingml/2006/main', ps='http://schemas.openxmlformats.org/presentationml/2006/main';
        return Array.from(d.getElementsByTagNameNS(ps,'sp')).map(sp => ({
          texts:Array.from(sp.getElementsByTagNameNS(ns,'t')).map(t=>t.textContent),
          paras:sp.getElementsByTagNameNS(ns,'p').length,
          italic:Array.from(sp.getElementsByTagNameNS(ns,'rPr')).some(r=>r.getAttribute('i')==='1'),
          sizes:Array.from(sp.getElementsByTagNameNS(ns,'rPr')).map(r=>r.getAttribute('sz')),
          rot:sp.getElementsByTagNameNS(ns,'xfrm')[0]?.getAttribute('rot')
        }));
      },xml);
      const group=r.find(s=>s.texts.join('').includes('第二行')); assert(group); assert(group.paras>=2); assert(group.italic); assert(group.sizes.every(n=>n==='800'));
      assert(r.some(s=>s.texts.includes('*'))); assert(r.some(s=>s.texts.includes('Target & <test>') && s.sizes.includes('900')));
      assert(r.some(s=>+s.rot===315*60000)); assert(r.some(s=>+s.rot===90*60000)); assert(r.some(s=>+s.rot===270*60000));
    });
    await check('PPTX: splice and inset pictures retain exact native crop geometry', async () => {
      const b=await capture(true), entries=unzip(Buffer.from(b.pptx,'base64')), g=b.geometry;
      const pics=await p.evaluate(s=>{
        const d=new DOMParser().parseFromString(s,'application/xml'), a='http://schemas.openxmlformats.org/drawingml/2006/main', pp='http://schemas.openxmlformats.org/presentationml/2006/main';
        return Array.from(d.getElementsByTagNameNS(pp,'pic')).map(el=>{
          const c=el.getElementsByTagNameNS(a,'srcRect')[0], off=el.getElementsByTagNameNS(a,'off')[0], ext=el.getElementsByTagNameNS(a,'ext')[0];
          return {name:el.getElementsByTagNameNS(pp,'cNvPr')[0].getAttribute('name'), crop:Object.fromEntries(['l','r','t','b'].map(k=>[k,+c.getAttribute(k)])),x:+off.getAttribute('x')/12700,y:+off.getAttribute('y')/12700,w:+ext.getAttribute('cx')/12700,h:+ext.getAttribute('cy')/12700};
        });
      },entries.get('ppt/slides/slide1.xml').toString('utf8'));
      const main=pics.filter(p=>p.name.startsWith('Gel ')), inset=pics.filter(p=>p.name.startsWith('Enlarged'));
      assert.equal(main.length,2); assert(inset.length>=2,'Inset across splice must also use separate crop objects');
      main.forEach((p,i)=>{
        const s=g.segs[i]; assert(Math.abs(p.x-(s.off*g.scale-g.vx))<.001); assert(Math.abs(p.w-(s.px1-s.px0)*g.scale)<.001);
        assert(Math.abs(p.crop.l/100000*g.fullW-(Math.round(g.crop.x)+s.px0))<=g.fullW/100000);
        assert(Math.abs(p.crop.t/100000*g.fullH-Math.round(g.crop.y))<=g.fullH/100000);
        assert(Math.abs((1-p.crop.r/100000)*g.fullW-(Math.round(g.crop.x)+s.px1))<=g.fullW/100000);
      });
      assert(entries.get('ppt/slides/slide1.xml').toString().includes('<p:cxnSp>'),'Splice divider is editable');
      const dir=path.join(root,'test-results','pptx',engine); fs.writeFileSync(path.join(dir,'spliced.pptx'),Buffer.from(b.pptx,'base64')); fs.writeFileSync(path.join(dir,'spliced.svg'),b.svg);
    });
    await check('PPTX: desktop button downloads; no script errors', async () => {
      await p.locator('#btnExportMenu').click();
      const pending=p.waitForEvent('download'); await p.locator('#btnPPTX').click(); const dl=await pending;
      assert(dl.suggestedFilename().endsWith('_figure.pptx')); assert.equal(await dl.failure(),null); assert.deepEqual(errors,[]);
    });
    await check('PPTX: single-file build exports with network blocked', async () => {
      const q=await ctx.newPage(); await q.route('http://**/*', r=>r.abort()); await q.route('https://**/*',r=>r.abort());
      await q.goto(pathToFileURL(path.join(root,'dist','GelFigure.html')).href+'?demo=1&lang=en');
      await q.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
      const r=await q.evaluate(async()=>{const b=await PPTX.build(); return {type:b.type,size:b.size};});
      assert(r.size>1000); assert.equal(r.type,'application/vnd.openxmlformats-officedocument.presentationml.presentation'); await q.close();
    });
    await check('PPTX: phone export delivers a downloadable PowerPoint file', async () => {
      const mctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
      try {
        const q=await mctx.newPage(); await q.goto(base+'/index.html?demo=protein&lang=zh');
        await q.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
        await q.evaluate(()=>App.setPref('preflight',false)); await q.locator('#mExport').tap(); await q.locator('[data-x="pptx"]').tap();
        await q.waitForFunction(()=>!document.getElementById('resultSheet').classList.contains('hidden'),null,{timeout:30000});
        assert((await q.locator('#rsName').textContent()).endsWith('.pptx')); assert(!(await q.locator('#rsPreview').isVisible()));
        const pending=q.waitForEvent('download'); await q.locator('#rsSave').tap(); const dl=await pending; assert(dl.suggestedFilename().endsWith('.pptx'));
        await dl.saveAs(path.join(root,'test-results','pptx',engine,'protein.pptx'));
      } finally { await mctx.close(); }
    });
  } catch(e) { results.push(['FAIL','PPTX runner',e.stack]); }
  finally { await ctx.close(); }
  return results;
}
