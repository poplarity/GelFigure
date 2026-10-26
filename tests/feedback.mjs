import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {pathToFileURL} from 'node:url';
const ENDPOINT='https://formsubmit.co/ajax/GelFigureFeedbackTestOnly';
export async function feedbackChecks(browser,base,root,engine){
 const out=[],c=await browser.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage(),errors=[],requests=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/index.html*',async route=>{const r=await route.fetch(),html=(await r.text()).replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]+)(">)/,(_,a,policy,z)=>a+policy.replace(/connect-src [^;]*;/,"connect-src 'self' file: data: blob: "+ENDPOINT+';')+z);await route.fulfill({response:r,body:html});});
 await p.route('**/js/support-config.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text())+'\nwindow.GelFigureSupport.feedbackEndpoint='+JSON.stringify(ENDPOINT)+';'});});
 let reply={status:200,body:{success:'true'}},hold=null;
 await p.route(ENDPOINT,async route=>{requests.push({method:route.request().method(),body:route.request().postData(),headers:route.request().headers()});if(hold)await hold;await route.fulfill({status:reply.status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(reply.body)});});
 const check=async(name,fn)=>{try{await fn();out.push(['ok','community feedback: '+name]);}catch(e){out.push(['FAIL','community feedback: '+name,e.stack]);}};
 const open=async()=>{await p.locator('#btnCommunity').click();await p.locator('#communityChoices [data-support="feedback"]').click();};
 const dir=path.join(root,'test-results','feedback',engine);fs.mkdirSync(dir,{recursive:true});
 try{
  await p.goto(base+'/index.html?lang=en');
  await check('persistent entry works before import and drafts survive closing',async()=>{
   await open();assert.equal(await p.locator('#feedbackSend').isDisabled(),false);await p.locator('#feedbackMessage').fill('Please improve the marker picker.');await p.locator('#feedbackEmail').fill('reply@example.com');
   await p.locator('#feedbackClose').click();assert(await p.locator('#communityDlg').isVisible());await p.locator('#communityChoices [data-support="feedback"]').click();assert.equal(await p.locator('#feedbackMessage').inputValue(),'Please improve the marker picker.');assert.equal(await p.locator('#feedbackEmail').inputValue(),'reply@example.com');
   assert.equal(requests.length,0);
  });
  await check('inline submission sends only typed fields and version, with no GitHub account',async()=>{
   await p.locator('#feedbackKind').selectOption('suggestion');await p.locator('#feedbackSend').click();await p.waitForFunction(()=>document.getElementById('feedbackStatus').classList.contains('success'));
   assert.equal(requests.length,1);assert.equal(requests[0].method,'POST');const q=new URLSearchParams(requests[0].body);assert.equal(q.get('message'),'Please improve the marker picker.');assert.equal(q.get('email'),'reply@example.com');assert(q.get('version'));assert.equal(q.get('_url'),'https://poplarity.github.io/GelFigure/');assert(!requests[0].headers.cookie);
   assert.deepEqual([...q.keys()].sort(),['_honey','_subject','_template','_url','category','email','message','version'].sort());assert.equal(await p.locator('#feedbackMessage').inputValue(),'');
  });
  await check('failure keeps text; no duplicate sends while pending or reopening',async()=>{
   reply={status:429,body:{success:'false'}};await p.locator('#feedbackMessage').fill('My description must not disappear.');await p.locator('#feedbackSend').click();await p.waitForFunction(()=>document.getElementById('feedbackStatus').classList.contains('error'));assert.equal(await p.locator('#feedbackMessage').inputValue(),'My description must not disappear.');
   reply={status:200,body:{success:'true'}};let release;hold=new Promise(r=>release=r);const count=requests.length;await p.locator('#feedbackSend').click();await p.waitForFunction(()=>document.getElementById('feedbackSend').disabled);await p.locator('#feedbackClose').click();await p.locator('#communityChoices [data-support="feedback"]').click();assert(await p.locator('#feedbackSend').isDisabled());
   await p.evaluate(()=>document.getElementById('feedbackForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));release();hold=null;await p.waitForFunction(()=>document.getElementById('feedbackStatus').classList.contains('success'));assert.equal(requests.length,count+1);
  });
  await check('Star is voluntary, and sponsorship explains token costs without gating',async()=>{
   await p.locator('#feedbackClose').click();const star=p.locator('#communityChoices [data-support="star"]');assert.equal(await star.getAttribute('href'),'https://github.com/poplarity/GelFigure');assert.equal(await star.getAttribute('target'),'_blank');
   await p.locator('#communityChoices [data-support="sponsor"]').click();assert((await p.locator('.sponsor-body').textContent()).includes('tokens'));assert.equal(await p.locator('#sponsorStar').getAttribute('href'),'https://github.com/poplarity/GelFigure');await p.locator('#sponsorClose').click();await p.locator('#communityClose').click();
  });
  await check('header remains right-aligned; phone entry and form fit without requiring an image',async()=>{
   for(const width of [1440,1100,1024,901]){await p.setViewportSize({width,height:1000});const r=await p.locator('#btnExportMenu').boundingBox();assert(Math.abs(width-r.x-r.width-14)<2);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);}
   await p.setViewportSize({width:320,height:844});await p.waitForFunction(()=>UI.isPhone());await p.locator('#btnMore').click();await p.locator('[data-m="community"]').click();await p.locator('#communityChoices [data-support="feedback"]').click();
   const b=await p.locator('.feedback-body').boundingBox();assert(b.x>=0&&b.x+b.width<=320);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),320);await p.screenshot({path:path.join(dir,'phone.png')});
   await p.locator('#feedbackClose').click();await p.locator('#communityClose').click();
  });
  await check('actual image/project metadata is never added to the submitted payload',async()=>{
   await p.setViewportSize({width:1440,height:1000});await p.evaluate(async()=>{App.forceJsHash=true;await App.load({name:'PRIVATE_unpublished_sample.tif',buffer:Demo.encodeTiff16(Demo.makeGel())});App.S.lanes[1].name='PRIVATE sample ID';});
   await open();await p.locator('#feedbackMessage').fill('A layout suggestion only.');await p.locator('#feedbackSend').click();await p.waitForFunction(()=>document.getElementById('feedbackStatus').classList.contains('success'));
   const body=requests.at(-1).body;assert(!body.includes('PRIVATE')&&!body.includes('data%3Aimage')&&!body.includes('lanes'));assert.deepEqual(errors,[]);await p.screenshot({path:path.join(dir,'desktop.png')});
  });
 }finally{await c.close();}
 await check('local HTML keeps feedback drafts and offers a web fallback without a failed send',async()=>{
  const c=await browser.newContext({offline:true});try{
   const p=await c.newPage(),sent=[];p.on('request',r=>{if(/^https?:/.test(r.url()))sent.push(r.url());});await p.goto(pathToFileURL(path.join(root,'dist/GelFigure.html')).href+'?lang=en');await p.locator('#btnCommunity').click();await p.locator('#communityChoices [data-support="feedback"]').click();
   await p.locator('#feedbackMessage').fill('A note written in the offline app.');assert(await p.locator('#feedbackSend').isDisabled());assert.equal(await p.locator('#feedbackOnline').getAttribute('href'),'https://poplarity.github.io/GelFigure/#feedback');
   await p.evaluate(()=>document.getElementById('feedbackForm').dispatchEvent(new Event('submit',{cancelable:true})));await p.locator('#feedbackClose').click();await p.locator('#communityChoices [data-support="feedback"]').click();assert.equal(await p.locator('#feedbackMessage').inputValue(),'A note written in the offline app.');assert.deepEqual(sent,[]);
  }finally{await c.close();}
 });return out;
}
