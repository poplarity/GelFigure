import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
export async function exportSupportChecks(browser,base){
 const out=[],c=await browser.newContext({viewport:{width:1440,height:960}}),p=await c.newPage(),errors=[],external=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base))external.push(r.url());});
 const check=async(name,fn)=>{try{await fn();out.push(['ok','export support: '+name]);}catch(e){out.push(['FAIL','export support: '+name,e.stack]);}};
 try{
  await p.goto(base+'/index.html?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});await p.evaluate(()=>App.setPref('preflight',false));
  await check('failed export does not show a thank-you prompt',async()=>{
   const r=await p.evaluate(async()=>{const old=Export.exportSVG,alert=window.alert;let caught=false;window.alert=()=>{};Export.exportSVG=()=>{throw new Error('Synthetic failure');};try{await document.getElementById('btnSVG').onclick();}catch(_){caught=true;}finally{Export.exportSVG=old;window.alert=alert;}return {caught,hidden:document.getElementById('exportThanks').classList.contains('hidden')};});assert(r.caught&&r.hidden);
  });
  await check('successful export downloads first and offers optional feedback without uploading',async()=>{
   const download=p.waitForEvent('download');await p.evaluate(()=>document.getElementById('btnSVG').click());assert((await download).suggestedFilename().endsWith('.svg'));await p.waitForSelector('#exportThanks:not(.hidden)');
   await p.locator('#exportThanks [data-support="feedback"]').click();assert(await p.locator('#feedbackDlg').isVisible());assert(await p.locator('#feedbackMessage').isVisible());await p.locator('#feedbackClose').click();
   const state=await p.evaluate(()=>App.snapshot());await p.locator('#exportThanks [data-support="sponsor"]').click();await p.waitForFunction(()=>document.getElementById('sponsorQr')?.src.startsWith('data:image/png'));
   assert.equal(await p.locator('#sponsorOpen').getAttribute('href'),await p.evaluate(()=>new URL(GelFigureSupport.sponsor).href));assert.equal(await p.evaluate(()=>new URL(GelFigureSupport.sponsor).hostname),'qr.alipay.com');
   assert.equal(await p.locator('#sponsorSave').getAttribute('href'),await p.locator('#sponsorQr').getAttribute('src'));assert.equal(await p.evaluate(()=>App.snapshot()),state);assert.deepEqual(external,[]);
   await p.locator('#sponsorClose').click();assert(await p.locator('#exportThanks').isVisible());
   await p.locator('#exportThanks .support-close').click();const next=p.waitForEvent('download');await p.evaluate(()=>document.getElementById('btnSVG').click());await next;assert(await p.locator('#exportThanks').isVisible());
  });
  await check('phone export keeps the file controls and renders only configured safe sponsorship links',async()=>{
   await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>UI.isPhone());await p.evaluate(()=>{ExportSupport.links.sponsor='https://example.com/author-support';document.getElementById('btnSVG').click();});await p.waitForSelector('#resultSheet:not(.hidden)');
   assert(await p.locator('#rsSave').isVisible());assert(await p.locator('#resultSheet .rs-done').isVisible());assert(await p.locator('#exportThanksMobile').isVisible());
   assert.equal(await p.locator('#exportThanksMobile [data-support="sponsor"]').getAttribute('href'),'https://example.com/author-support');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),390);
   await p.locator('#resultSheet .rs-done').click();await p.evaluate(()=>{ExportSupport.links.sponsor='javascript:alert(1)';document.getElementById('btnSVG').click();});await p.waitForSelector('#resultSheet:not(.hidden)');assert.equal(await p.locator('#exportThanksMobile [data-support="sponsor"]').count(),0);
   assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  });
  await check('Alipay QR is local and opening/saving it does not replace the exported file',async()=>{
   await p.locator('#resultSheet .rs-done').click();await p.evaluate(()=>{ExportSupport.links.sponsor=GelFigureSupport.sponsor;document.getElementById('btnSVG').click();});await p.waitForSelector('#resultSheet:not(.hidden)');
   const file=await p.locator('#rsName').textContent();await p.locator('#exportThanksMobile [data-support="sponsor"]').click();await p.waitForFunction(()=>document.getElementById('sponsorQr')?.src.startsWith('data:image/png'));
   const b=await p.locator('.sponsor-body').boundingBox();assert(b.x>=0&&b.x+b.width<=390);const download=p.waitForEvent('download');await p.locator('#sponsorSave').click();assert.equal((await download).suggestedFilename(),'GelFigure_alipay.png');
   await p.locator('#sponsorClose').press('Escape');assert(await p.locator('#resultSheet').isVisible());assert.equal(await p.locator('#rsName').textContent(),file);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  });
 }finally{await c.close();}
 await check('single HTML shows the same Alipay QR offline without external requests',async()=>{
  const c=await browser.newContext({offline:true});try{
   const p=await c.newPage(),requests=[];p.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
   await p.goto(pathToFileURL(path.resolve('dist/GelFigure.html')).href+'?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});await p.evaluate(()=>{App.setPref('preflight',false);document.getElementById('btnSVG').click();});
   await p.locator('#exportThanks [data-support="sponsor"]').click();await p.waitForFunction(()=>document.getElementById('sponsorQr')?.src.startsWith('data:image/png'));
   const data=await p.locator('#sponsorQr').getAttribute('src'),dir=path.resolve('test-results/export-support',browser.browserType().name());fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'qr.png'),Buffer.from(data.split(',')[1],'base64'));
   await p.screenshot({path:path.join(dir,'sponsor.png')});assert.deepEqual(requests,[]);assert.equal(await p.locator('#sponsorOpen').getAttribute('href'),await p.evaluate(()=>new URL(GelFigureSupport.sponsor).href));
  }finally{await c.close();}
 });return out;
}
