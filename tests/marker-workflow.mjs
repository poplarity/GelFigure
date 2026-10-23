import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export async function markerWorkflowChecks(browser,base,root,engine){
 const results=[],ctx=await browser.newContext({viewport:{width:1500,height:1000}}),p=await ctx.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 const check=async(name,fn)=>{try{await fn();results.push(['ok','marker workflow: '+name]);}catch(e){results.push(['FAIL','marker workflow: '+name,e.stack]);}};
 const dir=path.join(root,'test-results','marker-workflow',engine);fs.mkdirSync(dir,{recursive:true});
 const load=async()=>{await p.goto(base+'/index.html?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});};
 const selectSize=async bp=>{
  const el=p.locator(`[data-size="${bp}"]`);
  await el.evaluate(e=>{const host=e.closest('.marker-reference-scroll'),r=e.getBoundingClientRect(),h=host.getBoundingClientRect();if(r.bottom>h.bottom)host.scrollTop+=r.bottom-h.bottom+5;if(r.top<h.top)host.scrollTop-=h.top-r.top+5;});
  const r=await el.boundingBox();assert(await p.evaluate(([x,y])=>!!document.elementFromPoint(x,y)?.closest('[data-size]'),[r.x+r.width/2,r.y+r.height/2]));await p.mouse.click(r.x+r.width/2,r.y+r.height/2);
 };
 const imagePoint=async(bp)=>p.evaluate(bp=>{const m=App.S.markers[0],b=m.bands.find(b=>b.bp===bp),r=document.getElementById('editor').getBoundingClientRect(),q=Editor.toScr(App.S.lanes[m.lane].x,b.y);return {x:r.left+q.x,y:r.top+q.y};},bp);
 try{
  await load();
  await check('left-side lane controls expose one combined detection button; crop selectors are removed',async()=>{
   assert.equal(await p.locator('#rawCol #cropLaneN').count(),0);assert(await p.locator('#panel #cropLaneN').isVisible());
   assert.equal(await p.locator('#rangeA,#rangeB,#btnRangeAuto').count(),0);
   assert.equal(await p.locator('#btnRedetectCrop').evaluate(e=>e.closest('details')),null);assert(await p.locator('#btnRedetectCrop').isVisible());
  });
  await check('combined crop detection preserves marker identity and never writes M onto a sample',async()=>{
   const r=await p.evaluate(()=>{
    const before=App.snapshot(),det=Engine.detectLanes,auto=App.autoMarkers,match=App.matchMarkers;let calls=0;
    try{
     const S=App.S;S.crop={x:50,y:100,w:400,h:600};S.lanePitch=100;S.lanes=[10,100,200,300,400,490].map((x,i)=>({x,name:['outside','A','M','B','M','outside2'][i],hidden:false}));
     S.lanes[3].markerExcluded=true;S.markers=[2,4].map(lane=>({...App.newMarker(lane),userAssigned:true,bands:[{bp:1000,y:300,show:true,manual:true,matched:true}]}));S.groups=[{from:1,to:3,text:'Group'}];S.conditions=[{name:'Drug',values:['out','a','m1','b','m2','out2']}];
     Engine.detectLanes=()=>({centers:[50,100,150,250,350],pitch:75});App.autoMarkers=()=>{calls++;S.markers=[];};App.matchMarkers=()=>{};
     document.getElementById('btnRedetectCrop').click();
     return {calls,x:S.lanes.map(l=>l.x),names:S.lanes.map(l=>l.name),markers:S.markers.map(m=>[S.lanes[m.lane].x,m.bands[0].y]),values:S.conditions[0].values,excluded:S.lanes.find(l=>l.x===300).markerExcluded};
    }finally{Engine.detectLanes=det;App.autoMarkers=auto;App.matchMarkers=match;App.S=JSON.parse(before);App.emit('loaded');}
   });
   assert.deepEqual(r,{calls:1,x:[10,100,150,200,300,400,490],names:['outside','A','','M','B','M','outside2'],markers:[[200,300],[400,300]],values:['out','a','','m1','b','m2','out2'],excluded:true});
  });
  await check('crop detection also discovers unassigned markers; plain cropping does not invent new roles',async()=>{
   const r=await p.evaluate(()=>{
    App.S.markers=[];App.S.lanes.forEach(l=>{l.name='';delete l.markerExcluded;});
    const res=App.redetectCrop(),found=App.S.markers.length;App.commit();
    const before=App.snapshot(),auto=App.autoMarkers;let called=0;App.autoMarkers=()=>called++;
    App.S.markers=[];App.setLaneRange(2,6);App.afterRangeChange();const keptEmpty=App.S.markers.length===0;App.autoMarkers=auto;App.S=JSON.parse(before);App.emit('loaded');return {found,res,cropAutoCalls:called,keptEmpty};
   });assert(r.found>0);assert(r.res.markers>0);assert.equal(r.cropAutoCalls,0);assert(r.keptEmpty);
  });
  await check('a weak best candidate is rejected and unobserved bands are not shown by default',async()=>{
   const r=await p.evaluate(()=>{
    const before=App.snapshot(),multi=Engine.matchMulti;
    try{
     Engine.matchMulti=(...args)=>{const out=multi(...args);out.forEach(row=>row.forEach((b,i)=>{if(i>=3)b.matched=false;}));return out;};
     App.autoMarkers();const hadCandidates=App.markerCandidates.length>0,rejected=App.S.markers.length===0;
     App.S=JSON.parse(before);const m=App.S.markers[0];App.matchMarkers(true,[m]);const hidden=m.bands.filter(b=>!b.matched&&!b.manual).every(b=>!b.show);
     return {hadCandidates,rejected,hidden};
    }finally{Engine.matchMulti=multi;App.S=JSON.parse(before);App.emit('loaded');}
   });assert.deepEqual(r,{hadCandidates:true,rejected:true,hidden:true});
  });
  await check('selected-lane detection keeps the chosen model and leaves another marker untouched',async()=>{
   const r=await p.evaluate(()=>{
    const before=App.snapshot(),first=App.S.markers[0],other=UI.figLanes().find(i=>i!==first.lane);
    App.S.markers.push({...App.newMarker(other),userAssigned:true,bands:[{bp:500,y:345,manual:true,matched:true,show:true}]});App.commit();
    const saved=JSON.stringify(App.S.markers[1]),model=first.ladderId;document.querySelector('[data-mi="0"] [data-f="align"]').click();
    const result={model:App.S.markers[0].ladderId===model,other:JSON.stringify(App.S.markers[1])===saved,confirmed:App.S.markers[0].userAssigned};
    App.S=JSON.parse(before);App.emit('loaded');return result;
   });assert.deepEqual(r,{model:true,other:true,confirmed:true});
  });
  await check('reference stays beside the image without a modal or replacing the working views',async()=>{
   await p.locator('[data-mi="0"] [data-f="guide"]').click();await p.waitForSelector('#markerReference:not(.hidden)');
   assert.equal(await p.locator('#markerGuide').count(),0);assert.equal(await p.locator('.dlg:not(.hidden)').count(),0);
   assert(await p.locator('#preview svg').isVisible());assert(await p.locator('#editor').isVisible());
   const r=await p.locator('#markerReference').boundingBox();assert(r.width<=180);
   await p.screenshot({path:path.join(dir,'reference.png')});
  });
  await check('reference preview is non-destructive, and real-image clicks place manual anchors',async()=>{
   const saved=await p.evaluate(()=>JSON.stringify(App.S.markers)),model=await p.evaluate(()=>App.S.markers[0].ladderId);
   const other=await p.locator('#markerReferenceModel option').evaluateAll(os=>os.find(o=>!o.selected).value);
   await p.locator('#markerReferenceModel').selectOption(other);assert.equal(await p.evaluate(()=>JSON.stringify(App.S.markers)),saved);assert(await p.locator('#markerUseModel').isVisible());
   await p.locator('#markerReferenceModel').selectOption(model);
   const bp=await p.evaluate(()=>App.S.markers[0].bands.find(b=>b.show&&b.y>App.S.crop.y+App.S.crop.h*.4)?.bp);
   assert(bp);await selectSize(bp);const q=await imagePoint(bp);await p.mouse.click(q.x,q.y);
   assert(await p.evaluate(bp=>App.S.markers[0].bands.find(b=>b.bp===bp).manual,bp));
   // Clicking the same real band opens a small picker; dismissing it makes no edits.
   const before=await p.evaluate(()=>App.snapshot());await p.mouse.click(q.x,q.y);assert(await p.locator('#markerBandPop').isVisible());
   assert((await p.locator('#markerBandPop').boundingBox()).width<=300);await p.locator('#markerBandClose').click();assert.equal(await p.evaluate(()=>App.snapshot()),before);
   await p.locator('#markerReferenceClose').click();
  });
  await check('font, hide, show and delete are available directly on a figure number',async()=>{
   const target=p.locator('#preview [data-edit="marker"]:not([data-band="-1"])').first();
   const info=await target.evaluate(e=>({mi:+e.dataset.marker,bi:+e.dataset.band}));const bp=await p.evaluate(({mi,bi})=>App.S.markers[mi].bands[bi].bp,info);
   await target.click();await p.locator('#markerPopPt').fill('8');await p.locator('#markerPopPt').press('Tab');assert.equal(await p.evaluate(()=>App.S.style.markerPt),8);
   await p.locator('#markerHideOne').click();assert(await p.locator('#markerLabelPop').isVisible());
   assert(await p.evaluate(({mi,bp})=>{const b=App.S.markers[mi].bands.find(b=>b.bp===bp);return !b.show&&b.matched&&!b.excluded;},{mi:info.mi,bp}));
   await p.locator('#markerHideOne').click();assert(await p.evaluate(({mi,bp})=>App.S.markers[mi].bands.find(b=>b.bp===bp).show,{mi:info.mi,bp}));
   await p.locator('#markerDeleteOne').click();await p.evaluate(mi=>App.alignMarker(mi),info.mi);
   assert(await p.evaluate(({mi,bp})=>{const b=App.S.markers[mi].bands.find(b=>b.bp===bp);return b.excluded&&!b.show&&!b.matched&&!b.manual;},{mi:info.mi,bp}));
   await p.locator('#markerDeleteOne').press('Control+z');assert(await p.evaluate(({mi,bp})=>!App.S.markers[mi].bands.find(b=>b.bp===bp).excluded,{mi:info.mi,bp}));
  });
  await check('a deleted band is not recreated by combined lane and marker detection',async()=>{
   const r=await p.evaluate(()=>{
    const before=App.snapshot();try{
     const m=App.S.markers[0],bp=m.bands.find(b=>b.matched&&b.show).bp,x=App.S.lanes[m.lane].x;
     App.removeMarkerBand(0,bp);App.redetectCrop();
     const kept=App.S.markers.find(k=>App.S.lanes[k.lane].x===x),b=kept?.bands.find(b=>b.bp===bp);
     return kept?.ladderId===m.ladderId&&b.excluded&&!b.show&&!b.manual;
    }finally{App.S=JSON.parse(before);App.emit('loaded');}
   });assert(r);
  });
  await check('removing a marker on the figure is respected by the next combined detection',async()=>{
   await p.locator('#preview [data-edit="marker"]').first().click();const x=await p.evaluate(()=>App.S.lanes[App.S.markers[0].lane].x);
   await p.locator('#markerRemoveLane').click();await p.locator('#btnRedetectCrop').click();
   assert(await p.evaluate(x=>{const i=App.S.lanes.findIndex(l=>l.markerExcluded&&Math.abs(l.x-x)<App.S.lanePitch*.45);return i>=0&&!App.S.markers.some(m=>m.lane===i);},x));
  });
  await load();
  await check('manual marker/model choices and band anchors survive crop automation',async()=>{
   const r=await p.evaluate(()=>{
    const m=App.S.markers[0],band=m.bands.find(b=>b.matched&&b.show);m.userAssigned=true;m.ladderLocked=true;band.manual=true;
    const old={x:App.S.lanes[m.lane].x,id:m.ladderId,bp:band.bp,y:band.y};App.redetectCrop();
    const kept=App.S.markers.find(m=>m.userAssigned&&m.ladderId===old.id&&Math.abs(App.S.lanes[m.lane].x-old.x)<App.S.lanePitch*.45),b=kept?.bands.find(b=>b.bp===old.bp);
    return !!kept&&b.manual&&Math.abs(b.y-old.y)<1e-6;
   });assert(r);
  });
  await check('applying a saved marker choice overrides a previous role removal',async()=>{
   const r=await p.evaluate(()=>{
    const before=App.snapshot();try{
     const tpl=App.template(),m=App.S.markers[0],x=App.S.lanes[m.lane].x,id=m.ladderId;
     App.removeMarker(0);App.applyTemplate(tpl);App.redetectCrop();
     const kept=App.S.markers.find(k=>App.S.lanes[k.lane].x===x);
     return kept?.ladderId===id&&kept.userAssigned&&!App.S.lanes[kept.lane].markerExcluded;
    }finally{App.S=JSON.parse(before);App.emit('loaded');}
   });assert(r);
  });
  await check('protein reference contains protein ladders, and editors never appear in exported SVG',async()=>{
   await p.evaluate(async()=>{await App.load({name:'synthetic-protein.tif',buffer:Demo.encodeTiff16(Demo.makeProteinGel())});MarkerUI.open(0);});
   assert(await p.locator('#markerReferenceModel option').evaluateAll(os=>os.every(o=>Ladders.kindOf(Ladders.get(o.value))==='protein')));
   assert((await p.locator('.marker-ref-lane').textContent()).includes('kDa'));
   assert(await p.evaluate(()=>{const svg=App.buildFigure(false).svg;return !svg.includes('data-edit=')&&!svg.includes('markerReference')&&!svg.includes('ladder-reference');}));await p.locator('#markerReferenceClose').click();
  });
  await check('replacing a project cancels an unfinished canvas band drag',async()=>{
   await p.evaluate(()=>MarkerUI.open(0));const bp=await p.evaluate(()=>App.S.markers[0].bands.find(b=>b.show&&b.matched&&b.y>App.S.crop.y+100).bp),q=await imagePoint(bp);
   const r=await p.evaluate(({x,y})=>{
    const before=App.snapshot(),cv=document.getElementById('editor');cv.dispatchEvent(new PointerEvent('pointerdown',{pointerId:77,pointerType:'mouse',button:0,clientX:x,clientY:y,bubbles:true}));
    window.dispatchEvent(new PointerEvent('pointermove',{pointerId:77,pointerType:'mouse',clientX:x,clientY:y+15,bubbles:true}));
    const moved=App.snapshot()!==before,next=JSON.parse(before);next.markers[0].bands.forEach(b=>b.y+=2);const expected=JSON.stringify(next.markers);
    App.S=next;App.emit('loaded');window.dispatchEvent(new PointerEvent('pointerup',{pointerId:77,pointerType:'mouse',clientX:x,clientY:y+15,bubbles:true}));
    const intact=JSON.stringify(App.S.markers)===expected;App.S=JSON.parse(before);App.emit('loaded');return {moved,intact};
   },q);assert.deepEqual(r,{moved:true,intact:true});
  });
  await check('phone layouts keep controls in Settings and use a compact reference on the image',async()=>{
   for(const width of [390,320]){
    await p.setViewportSize({width,height:844});await p.locator('#mNav [data-view="panel"]').click();assert(await p.locator('#cropLaneN').isVisible());assert(await p.locator('#btnRedetectCrop').isVisible());
    await p.locator('[data-mi="0"] [data-f="guide"]').click();assert(await p.locator('#markerReference').isVisible());assert(await p.locator('#editor').isVisible());
    await p.waitForFunction(()=>document.getElementById('markerReference').getBoundingClientRect().top>=document.getElementById('modeBanner').getBoundingClientRect().bottom);
    const ref=await p.locator('#markerReference').boundingBox();assert(ref.width<=140);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);assert.equal(await p.locator('.dlg:not(.hidden)').count(),0);
    const q=await p.evaluate(()=>{const m=App.S.markers[0],b=m.bands.find(b=>b.show),r=document.getElementById('editor').getBoundingClientRect(),pt=Editor.toScr(App.S.lanes[m.lane].x,b.y);return {x:r.left+pt.x,y:r.top+pt.y};});
    assert(await p.evaluate(q=>document.elementFromPoint(q.x,q.y)?.id==='editor',q),'upper marker band must be reachable on the source canvas');
    if(width===390)await p.screenshot({path:path.join(dir,'phone-reference.png')});await p.locator('#markerReferenceClose').click();
   }
   await p.setViewportSize({width:1500,height:1000});await p.evaluate(()=>{document.getElementById('panel').scrollTop=0;});await p.screenshot({path:path.join(dir,'desktop.png')});
  });
  await check('no unhandled errors in the marker workflow',async()=>assert.deepEqual(errors,[]));
 }finally{await ctx.close();}
 await check('offline single HTML keeps reference and font controls available without network',async()=>{
  const c=await browser.newContext();try{await c.setOffline(true);const p=await c.newPage();await p.goto(pathToFileURL(path.join(root,'dist/GelFigure.html')).href+'?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});await p.evaluate(()=>MarkerUI.open(0));assert(await p.locator('#markerReference').isVisible());assert.equal(await p.locator('.dlg:not(.hidden)').count(),0);}finally{await c.close();}
 });return results;
}
