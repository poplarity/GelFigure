import assert from 'node:assert/strict';import path from 'node:path';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
export async function updateChecks(browser,base,root,engine){
 const out=[],dir=path.join(root,'test-results','updates',engine);fs.mkdirSync(dir,{recursive:true});
 const check=async(name,fn)=>{try{await fn();out.push(['ok','release history: '+name]);}catch(e){out.push(['FAIL','release history: '+name,e.stack]);}};
 const c=await browser.newContext({viewport:{width:1440,height:960}}),p=await c.newPage(),errors=[],remote=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base))remote.push(r.url());});
 try{
  await check('new version appears once, without a modal or stealing focus',async()=>{
   await c.addInitScript(()=>{if(!localStorage.getItem('test.seeded')){localStorage.setItem('gelfig.updatesSeen.v1','0.6.12');localStorage.setItem('test.seeded','1');}});
   await p.goto(base+'/index.html?lang=zh');await p.locator('#updateNotice').waitFor({state:'visible'});
   assert.equal(await p.locator('#updateNotice li').count(),3);assert.equal(await p.locator('#updatesDlg').isVisible(),false);
   assert.equal(await p.evaluate(()=>document.getElementById('updateNotice').contains(document.activeElement)),false);
   assert.equal(await p.evaluate(()=>PrefStorage.getItem(Updates.key)),await p.evaluate(()=>App.VERSION));
   await p.locator('#btnLang').click();assert(await p.locator('#updateNoticeTitle').textContent().then(t=>t.includes('What')));
   await p.screenshot({path:path.join(dir,'startup-desktop.png')});await p.locator('#updateNoticeClose').click();
   await p.reload();await p.waitForFunction(()=>!!window.Updates);await p.evaluate(()=>Updates.showNotice());assert.equal(await p.locator('#updateNotice').isVisible(),false);
  });
  await check('file menu and start page always reopen all versions with current version marked',async()=>{
   await p.locator('#btnTplMenu').click();await p.locator('#btnUpdates').click();await p.locator('#updatesDlg').waitFor({state:'visible'});
   assert.equal(await p.locator('.release-entry').count(),await p.evaluate(()=>GelFigureReleases.length));assert.equal(await p.locator('.release-entry.current').count(),1);
   assert.equal(await p.locator('.release-entry.current').getAttribute('data-version'),await p.evaluate(()=>App.VERSION));
   await p.locator('#updatesClose').press('Shift+Tab');assert.equal(await p.evaluate(()=>document.activeElement.tagName),'A');
   await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'updatesClose');
   await p.keyboard.press('Escape');assert(!(await p.locator('#updatesDlg').isVisible()));
   await p.locator('#btnUpdatesStart').click();assert(await p.locator('#updatesDlg').isVisible());
   await p.evaluate(()=>I18N.set('zh'));assert.equal(await p.locator('#updatesTitle').textContent(),'更新日志');
   await p.locator('#updatesHistory').evaluate(el=>el.scrollTop=el.scrollHeight);
   assert(await p.locator('[data-version="0.5.0"]').isVisible());await p.screenshot({path:path.join(dir,'history-desktop.png')});await p.locator('#updatesClose').click();
  });
  await check('version comparison suppresses refreshes/downgrades and recognises a new stable release',async()=>{
   const r=await p.evaluate(()=>({same:Updates.compare('0.6.13','0.6.13'),newer:Updates.compare('0.6.13','0.6.12'),stable:Updates.compare('0.6.13','0.6.13-dev'),older:Updates.compare('0.6.12','0.6.13'),unknown:Updates.compare('0.6.13',null)}));
   assert.equal(r.same,0);assert(r.newer>0&&r.stable>0&&r.older<0&&r.unknown>0);
   await p.evaluate(()=>PrefStorage.setItem(Updates.key,'99.0.0'));await p.reload();await p.waitForFunction(()=>!!window.Updates);await p.evaluate(()=>Updates.showNotice());assert(!(await p.locator('#updateNotice').isVisible()));
  });
  await check('history window does not mutate images, undo history or annotations',async()=>{
   await p.goto(base+'/index.html?demo=1&lang=zh');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
   const before=await p.evaluate(()=>({state:App.snapshot(),undo:App.hist.length}));
   await p.evaluate(()=>Updates.open());await p.locator('#updatesClose').press('Control+z');await p.locator('#updatesClose').press('Escape');
   assert.deepEqual(await p.evaluate(()=>({state:App.snapshot(),undo:App.hist.length})),before);
   await p.locator('#btnHelp').click();await p.locator('#btnHelpUpdates').click();assert(await p.locator('#updatesDlg').isVisible());await p.locator('#updatesClose').click();assert.equal(await p.evaluate(()=>document.activeElement.id),'btnHelpUpdates');
   await p.locator('#btnHelpClose').click();assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
  });
 }finally{await c.close();}
 await check('phone first-open notice and permanent More entry fit at 320/390px in both languages',async()=>{
  for(const width of [320,390]){
   const c=await browser.newContext({viewport:{width,height:844},hasTouch:true});try{
    const p=await c.newPage();await p.goto(base+'/index.html?lang=zh');await p.locator('#updateNotice').waitFor({state:'visible'});
    let r=await p.locator('#updateNotice').boundingBox();assert(r.x>=0&&r.x+r.width<=width+1&&r.y>=0&&r.y+r.height<780);
    await p.locator('#updateNoticeHistory').click();assert(await p.locator('#updatesDlg').isVisible());await p.locator('#updatesClose').click();
    await p.locator('#btnMore').click();await p.locator('[data-m="updates"]').click();
    for(const lang of ['zh','en']){
     await p.evaluate(lang=>I18N.set(lang),lang);r=await p.locator('.updates-body').boundingBox();assert(r.x>=0&&r.x+r.width<=width+1&&r.y>=0&&r.y+r.height<=844);
     assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);await p.screenshot({path:path.join(dir,`phone-${width}-${lang}.png`)});
    }
   }finally{await c.close();}
  }
 });
 await check('offline single HTML retains history and remembers a seen version',async()=>{
  const c=await browser.newContext({offline:true}),p=await c.newPage(),requests=[];p.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});try{
   await p.goto(pathToFileURL(path.join(root,'dist/GelFigure.html')).href+'?lang=en');await p.locator('#updateNotice').waitFor({state:'visible'});await p.locator('#updateNoticeClose').click();
   await p.reload();await p.waitForFunction(()=>!!window.Updates);await p.evaluate(()=>Updates.showNotice());assert(!(await p.locator('#updateNotice').isVisible()));
   await p.locator('#btnUpdatesStart').click();assert.equal(await p.locator('.release-entry').count(),await p.evaluate(()=>GelFigureReleases.length));assert.deepEqual(requests,[]);
  }finally{await c.close();}
 });
 await check('blocked storage still allows the notice and history without exceptions',async()=>{
  const c=await browser.newContext();try{
   await c.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError');}}));const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto(base+'/index.html?lang=en');await p.locator('#updateNotice').waitFor({state:'visible'});await p.locator('#updateNoticeHistory').click();assert(await p.locator('#updatesDlg').isVisible());assert.deepEqual(errors,[]);
  }finally{await c.close();}
 });return out;
}
