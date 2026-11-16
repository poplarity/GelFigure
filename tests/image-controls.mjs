import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
export async function imageControlChecks(browser,base,root,engine){
 const out=[],c=await browser.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const check=async(n,f)=>{try{await f();out.push(['ok','Image controls: '+n]);}catch(e){out.push(['FAIL','Image controls: '+n,e.stack]);}};
 const ready=async()=>{await p.goto(base+'/index.html?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});};
 try{
  await ready();
  await check('common actions are visible; precise and diagnostic controls are folded',async()=>{
   assert.equal(await p.locator('#imageSection').count(),1);
   for(const id of ['btnDeskew','btnRotCW','btnRotCCW','btnFlipH','btnFlipV','invChk','btnAutoLv'])assert(await p.locator('#'+id).isVisible(),id);
   for(const id of ['rot','rotNum','histo','lvBlack','lvWhite','btnResetRot','btnResetLv','gamma','gelTypeWhy'])assert.equal(await p.locator('#'+id).isVisible(),false,id+' should be progressive');
   assert.equal(await p.locator('#imageColourField').isVisible(),false,'a grayscale source has no colour choice');
   assert(await p.locator('#clipLine').isVisible(),'do not hide clipping evidence');
   const dir=path.join(root,'test-results/image-controls',engine);fs.mkdirSync(dir,{recursive:true});await p.screenshot({path:path.join(dir,'initial.png')});
  });
  await check('opening manual contrast draws the histogram before any edit',async()=>{
   await ready();await p.waitForTimeout(200);await p.locator('#contrastManual > summary').click();
   await p.waitForTimeout(30);assert(await p.locator('#histo').evaluate(cv=>cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data.some((v,i)=>i%4===3&&v>0)),'histogram is blank on first open');await p.locator('#contrastManual > summary').click();
  });
  await check('fine rotation, reset and undo keep image annotations intact',async()=>{
   assert.equal(await p.locator('#rotationFine').count(),1);await p.locator('#rotationFine summary').click();const before=await p.evaluate(()=>App.snapshot());
   const angle=await p.evaluate(()=>App.S.rotation);await p.locator('#rotNum').fill(String(angle+1));await p.locator('#rotNum').press('Tab');assert.equal(await p.evaluate(()=>App.S.rotation),Math.round((angle+1)*10)/10);
   await p.evaluate(()=>App.undo());assert.equal(await p.evaluate(()=>App.snapshot()),before);
   await p.locator('#showGrid').check();await p.locator('#rotationFine summary').click();await p.waitForFunction(()=>!document.getElementById('showGrid').checked);
  });
  await check('manual contrast is live and undoable; reset restores import values',async()=>{
   assert.equal(await p.locator('#contrastManual').count(),1);await p.locator('#contrastManual > summary').click();
   await p.waitForTimeout(30);const ink=await p.locator('#histo').evaluate(cv=>cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data.some((v,i)=>i%4===3&&v>0));assert(ink,'histogram is blank after opening the manual controls');
   const before=await p.evaluate(()=>App.snapshot());await p.locator('#lvBlack').evaluate(el=>{el.value='50';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});assert.notEqual(await p.evaluate(()=>App.snapshot()),before);
   await p.evaluate(()=>App.undo());assert.equal(await p.evaluate(()=>App.snapshot()),before);
   await p.locator('#btnResetLv').click();assert(await p.evaluate(()=>App.S.levels.black===App.initialState().levels.black&&App.S.levels.white===App.initialState().levels.white&&App.S.levels.gamma===1));
  });
  await check('nonlinear gamma remains explicit and an active value is visible when folded',async()=>{
   assert.equal(await p.locator('#gammaControls').count(),1);await p.locator('#gammaControls summary').click();assert(await p.locator('#gamma').isDisabled());
   await p.locator('#gammaUnlock').check();await p.locator('#gamma').fill('1.2');await p.locator('#gamma').press('Tab');assert.equal(await p.evaluate(()=>App.S.levels.gamma),1.2);
   await p.locator('#gammaControls summary').click();await p.locator('#contrastManual > summary').click();assert.match(await p.locator('#imageAdjustState').textContent(),/1.2/);
  });
  await check('replacing a project folds transient controls and clears the grid',async()=>{
   assert.equal(await p.locator('#rotationFine').count(),1);await p.locator('#rotationFine').evaluate(e=>e.open=true);await p.locator('#showGrid').check();
   await p.evaluate(()=>App.emit('loaded'));assert(!(await p.locator('#rotationFine').evaluate(e=>e.open)));assert(!(await p.locator('#showGrid').isChecked()));
   assert(!(await p.locator('#contrastManual').evaluate(e=>e.open)));
  });
  await check('a pending straighten action never edits a replacement project',async()=>{
   const r=await p.evaluate(()=>{
    const timer=window.setTimeout,deskew=App.autoDeskew;let delayed=null,calls=0;
    window.setTimeout=(fn,ms,...args)=>ms===20?(delayed=fn,0):timer(fn,ms,...args);App.autoDeskew=()=>{calls++;return deskew();};
    try{document.getElementById('btnDeskew').click();App.S=JSON.parse(App.snapshot());App.S.rotation=12;const before=App.snapshot();if(delayed)delayed();return {calls,same:App.snapshot()===before,busy:!document.getElementById('busy').classList.contains('hidden')};}
    finally{window.setTimeout=timer;App.autoDeskew=deskew;App.busy(false);}
   });assert.deepEqual(r,{calls:0,same:true,busy:false});
  });
  await check('no runtime errors',async()=>assert.deepEqual(errors,[]));
 }finally{await c.close();}return out;
}
