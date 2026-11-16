import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export async function markerSimplifyChecks(browser,base,root,engine){
 const out=[],c=await browser.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage(),errors=[];
 const dir=path.join(root,'test-results/marker-simplify',engine);fs.mkdirSync(dir,{recursive:true});
 p.on('pageerror',e=>errors.push(e.message));
 const check=async(name,fn)=>{try{await fn();out.push(['ok','Marker simplicity: '+name]);}catch(e){out.push(['FAIL','Marker simplicity: '+name,e.stack]);}};
 const load=async()=>{await p.goto(base+'/index.html?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});};
 const two=async()=>p.evaluate(()=>{const i=UI.figLanes().at(-1);App.S.markers.push({...App.newMarker(i),userAssigned:true,bands:[{bp:500,y:400,matched:true,show:true,manual:true}]});App.commit();});
 const close=async()=>{await p.keyboard.press('Escape');};
 try{
  await load();
  await check('sidebar keeps four labelled essentials and moves the catalogue into management',async()=>{
   assert.equal(await p.locator('#markerSection').count(),1,'a named Marker section is required');
   assert.equal(await p.locator('#markerSection #favAdv,#markerSection #customLadderAdv').count(),0,'catalogue controls clutter the sidebar');
   for(const key of ['lane','ladder','unit','guide'])assert(await p.locator(`[data-mi="0"] [data-f="${key}"]`).isVisible(),key);
   assert.equal(await p.locator('[data-mi="0"] [data-f="ladder"]').evaluate(e=>e.tagName),'BUTTON');
   assert.equal(await p.locator('[data-mi="0"] [data-f="move"]').count(),0,'duplicate lane-selection button');
   assert.equal(await p.locator('[data-mi="0"] details[open]').count(),0,'details should start folded');
   await p.screenshot({path:path.join(dir,'desktop.png')});
  });
  await check('saving a custom library model alone never overwrites a marker',async()=>{
   await two();const before=await p.evaluate(()=>App.snapshot());
   await p.locator('#btnMarkerLib').click();await p.locator('#customLadderAdv').evaluate(e=>e.open=true);
   await p.evaluate(()=>{document.getElementById('customName').value='Library only';document.getElementById('customSizes').value='6000 bp 3000 bp 1000 bp';document.getElementById('btnSaveLadder').click();});
   await p.waitForFunction(()=>Ladders.all('dna').some(l=>l.name==='Library only'));
   assert.equal(await p.evaluate(()=>App.snapshot()),before,'library save unexpectedly changed the figure');
   await p.locator('#btnMarkerLibDone').click();
  });
  await load();await two();
  await check('one searchable chooser previews without edits and applies only to the named marker',async()=>{
   assert.equal(await p.locator('[data-mi="1"] [data-f="ladder"]').evaluate(e=>e.tagName),'BUTTON');
   const before=await p.evaluate(()=>({snapshot:App.snapshot(),first:JSON.stringify(App.S.markers[0]),hist:App.hist.length}));
   await p.locator('[data-mi="1"] [data-f="ladder"]').click();await p.locator('#markerModelDlg').waitFor({state:'visible'});
   assert((await p.locator('#markerModelTarget').textContent()).includes(await p.evaluate(()=>String(App.S.markers[1].lane+1))));
   await p.locator('#markerModelSearch').fill('SM0311');
   assert.equal(await p.locator('#markerModelResults [data-model-id]').count(),1);
   await p.locator('#markerModelResults [data-model-id]').click();
   const id=await p.locator('#markerModelResults [data-model-id]').getAttribute('data-model-id');
   assert((await p.locator('#markerModelPreview').textContent()).includes('3000'));
   assert.equal(await p.evaluate(()=>App.snapshot()),before.snapshot);
   await p.locator('#markerModelApply').click();
   assert.equal(await p.evaluate(()=>JSON.stringify(App.S.markers[0])),before.first);
   assert.equal(await p.evaluate(()=>App.S.markers[1].ladderId),id);assert.equal(await p.evaluate(()=>App.hist.length),before.hist+1);
   await p.evaluate(()=>App.undo());assert.equal(await p.evaluate(()=>App.snapshot()),before.snapshot);
  });
  await check('empty search is understandable, and Escape returns focus without modifying the figure',async()=>{
   assert.equal(await p.locator('[data-mi="0"] [data-f="ladder"]').evaluate(e=>e.tagName),'BUTTON');
   const before=await p.evaluate(()=>App.snapshot());await p.locator('[data-mi="0"] [data-f="ladder"]').click();
   await p.locator('#markerModelSearch').fill('no-such-brand-987654321');assert.equal(await p.locator('#markerModelResults [data-model-id]').count(),0);assert(await p.locator('#markerModelApply').isDisabled());
   assert.match(await p.locator('#markerModelResults').textContent(),/No matching|没有找到/);
   await close();assert.equal(await p.evaluate(()=>App.snapshot()),before);assert.equal(await p.evaluate(()=>document.activeElement.dataset.f),'ladder');
  });
  await check('custom model use explicitly targets the second Marker',async()=>{
   assert.equal(await p.locator('[data-mi="1"] [data-f="ladder"]').evaluate(e=>e.tagName),'BUTTON');
   const first=await p.evaluate(()=>JSON.stringify(App.S.markers[0]));
   await p.locator('[data-mi="1"] [data-f="ladder"]').click();await p.locator('#markerModelCustom').click();
   assert.equal(await p.locator('#customApplyTarget').inputValue(),'1');await p.locator('#customLadderAdv').evaluate(e=>e.open=true);
   await p.locator('#customName').fill('Explicit second');await p.locator('#customSizes').fill('7000,3500,1000');await p.locator('#btnSaveLadder').click();
   await p.waitForFunction(()=>Ladders.get(App.S.markers[1].ladderId)?.name==='Explicit second');
   assert.equal(await p.evaluate(()=>JSON.stringify(App.S.markers[0])),first);await p.locator('#btnMarkerLibDone').click();
  });
  await check('no-unit selection and folded style/band edits survive re-render without losing focus',async()=>{
   assert.equal(await p.locator('[data-mi="1"] [data-f="unit"] option[value="none"]').count(),1);
   await p.locator('[data-mi="1"] [data-f="unit"]').selectOption('none');assert.equal(await p.locator('[data-mi="1"] [data-f="unit"]').inputValue(),'none');
   await p.locator('[data-mi="1"] details[data-section="style"] summary').click();await p.locator('#markerCardWeight-1').focus();await p.locator('#markerCardWeight-1').selectOption('600');
   assert.equal(await p.evaluate(()=>App.S.markers[1].weight),600);assert.equal(await p.locator('#markerCardWeight-1').inputValue(),'600');
   assert(await p.locator('[data-mi="1"] details[data-section="style"]').evaluate(e=>e.open));
   assert.equal(await p.evaluate(()=>document.activeElement.id),'markerCardWeight-1');
   const d=p.locator('[data-mi="1"] details[data-section="bands"]');await d.locator('summary').click();
   const cb=d.locator('[data-band]:not(:disabled)').first();const was=await cb.isChecked();await cb.click();assert.equal(await cb.isChecked(),!was);assert(await d.evaluate(e=>e.open));
  });
  await check('calibration uses the same model chooser with a clear finish action',async()=>{
   await p.locator('[data-mi="1"] [data-f="guide"]').click();assert.equal(await p.locator('#markerReferenceModel').count(),0,'reference has a duplicate model-selection workflow');
   assert(await p.locator('#markerReferenceChange').isVisible());assert.match(await p.locator('#markerReferenceClose').textContent(),/Done|完成/);
   await p.locator('#markerReferenceChange').click();assert(await p.locator('#markerModelDlg').isVisible());await close();
   await p.locator('#markerReferenceClose').click();assert.equal(await p.evaluate(()=>App.mode),null);
  });
  await check('Apply and detect re-detects the current model while keeping manual anchors',async()=>{
   const data=await p.evaluate(()=>{const m=App.S.markers[0],b=m.bands.find(b=>b.matched);b.manual=true;const anchor={bp:b.bp,y:b.y};m.bands=m.bands.filter(b=>b.manual);App.commit();return anchor;});
   await p.locator('[data-mi="0"] [data-f="ladder"]').click();await p.locator('#markerModelApply').click();
   const m=await p.evaluate(()=>App.S.markers[0]);assert(m.bands.length>1,'the current model was not detected');const a=m.bands.find(b=>b.bp===data.bp);assert(a.manual);assert.equal(a.y,data.y);
  });
  await check('library management restores focus to its visible entry',async()=>{
   await p.locator('#btnMarkerLib').focus();await p.keyboard.press('Enter');await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>document.activeElement.id),'btnMarkerLib');
   await p.locator('[data-mi="1"] [data-f="ladder"]').click();await p.locator('#markerModelCustom').click();await p.locator('#btnMarkerLibDone').click();
   assert.equal(await p.evaluate(()=>document.activeElement.closest('.mk-card')?.dataset.mi),'1');assert.equal(await p.evaluate(()=>document.activeElement.dataset.f),'ladder');
  });
  await check('changing a ladder during calibration clears a pending old band size',async()=>{
   await p.locator('[data-mi="0"] [data-f="guide"]').click();await p.locator('#markerReference [data-size]').first().click();assert(await p.evaluate(()=>MarkerUI.pendingSize()));
   await p.locator('#markerReferenceChange').click();await p.locator('#markerModelSearch').fill('SM0311');await p.locator('#markerModelApply').click();
   assert.equal(await p.evaluate(()=>MarkerUI.pendingSize()),false,'old band selection survived a model change');await p.locator('#markerReferenceClose').click();
  });
  await check('reference and library action labels have readable contrast',async()=>{
   const ratio=async selector=>p.locator(selector).evaluate(e=>{
    const rgb=getComputedStyle(e).color.match(/\d+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
    return 1.05/(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]+.05);
   });
   const details=p.locator('[data-mi="0"] details[data-section="bands"]');await details.evaluate(e=>e.open=true);assert(await ratio('[data-mi="0"] [data-locate="0"]')>=4.5,'Locate is too faint');await details.evaluate(e=>e.open=false);
   await p.locator('[data-mi="0"] [data-f="guide"]').click();assert(await ratio('#markerReferenceChange')>=4.5,'Change ladder is too faint');await p.locator('#markerReferenceClose').click();
   await p.locator('#btnMarkerLib').click();assert(await ratio('#btnBackupLadders')>=4.5,'Backup is too faint');assert(await ratio('#btnImportLadders')>=4.5,'Import is too faint');await p.locator('#btnMarkerLibDone').click();
  });
  await check('model chooser traps keyboard focus and does not change the figure when cancelled',async()=>{
   const before=await p.evaluate(()=>App.snapshot());await p.locator('[data-mi="0"] [data-f="ladder"]').click();
   await p.locator('#markerModelApply').focus();await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'markerModelClose');
   await p.keyboard.press('Shift+Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'markerModelApply');await close();assert.equal(await p.evaluate(()=>App.snapshot()),before);
  });
  await check('a late custom save cannot apply a model to a replacement project',async()=>{
   await p.locator('[data-mi="1"] [data-f="ladder"]').click();await p.locator('#markerModelCustom').click();
   await p.locator('#customName').fill('Late library save');await p.locator('#customSizes').fill('8000,4000,2000');
   const state=await p.evaluate(()=>{
    window.oldLadderReady=Ladders.ready;Ladders.ready=new Promise(r=>window.finishLadderReady=r);
    document.getElementById('btnSaveLadder').click();App.S=JSON.parse(App.snapshot());App.emit('loaded');const saved=App.snapshot();finishLadderReady();return saved;
   });
   await p.waitForFunction(()=>Ladders.all('dna').some(l=>l.name==='Late library save'));assert.equal(await p.evaluate(()=>App.snapshot()),state);await p.evaluate(()=>Ladders.ready=oldLadderReady);
  });
  await check('project replacement closes stale model and library editors',async()=>{
   assert.equal(await p.locator('[data-mi="0"] [data-f="ladder"]').evaluate(e=>e.tagName),'BUTTON');
   await p.locator('[data-mi="0"] [data-f="ladder"]').click();await p.evaluate(()=>{App.S=JSON.parse(App.snapshot());App.emit('loaded');});assert(!(await p.locator('#markerModelDlg').isVisible()));
   await p.locator('#btnMarkerLib').click();await p.evaluate(()=>{App.S=JSON.parse(App.snapshot());App.emit('loaded');});assert(!(await p.locator('#markerLibDlg').isVisible()));
  });
  await check('no unhandled errors',async()=>assert.deepEqual(errors,[]));
 }finally{await c.close();}
 return out;
}
