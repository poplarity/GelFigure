import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
export async function cropLaneResetChecks(browser,base,root,engine){
 const out=[],c=await browser.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const check=async(n,f)=>{try{await f();out.push(['ok','Crop lane reset: '+n]);}catch(e){out.push(['FAIL','Crop lane reset: '+n,e.stack]);}};
 const seed=async()=>p.evaluate(()=>{
  const S=App.S;S.crop={x:500,y:150,w:300,h:600};S.lanePitch=100;S.laneHalfW=30;
  S.lanes=[100,200,300,400,550,650,750,900].map((x,i)=>({x,name:['old1','old2','old3','old4','M','Sample','M','old8'][i],hidden:false}));
  S.lanes[5].nameRuns=[{text:'Sample',italic:true}];S.lanes[5].weight=600;S.lanes[5].markerExcluded=true;
  S.markers=[0,4,6,7].map((lane,i)=>({...App.newMarker(lane),weight:600,userAssigned:true,ladderLocked:true,bands:[{bp:1000,y:300+i*20,show:i!==1,manual:true,matched:true}]}));
  S.conditions=[{name:'Drug',values:['x1','x2','x3','x4','m1','sample','m2','x8']}];S.groups=[{from:0,to:2,text:'Outside'},{from:3,to:5,text:'Crossing'},{from:4,to:6,text:'Inside'}];
  S.notes=[{kind:'text',x:660,y:500,text:'Keep note'}];S.style.laneNumbers=true;App.selLane=5;App.commit();
  return App.snapshot();
 });
 const read=async()=>p.evaluate(()=>({snapshot:App.snapshot(),lanes:App.S.lanes,range:App.laneRange(),markers:App.S.markers,values:App.S.conditions[0].values,groups:App.S.groups,sel:App.selLane,notes:App.S.notes}));
 try{
  await p.goto(base+'/index.html?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
  await check('manual count replaces the working lane set, rebases numbering and can be undone',async()=>{
   const before=await seed();await p.locator('#cropLaneN').fill('3');await p.locator('#cropLaneN').press('Enter');const r=await read();
   assert.deepEqual(r.lanes.map(l=>l.x),[550,650,750],'outside guides survived count correction');assert.deepEqual(r.range,[0,2]);assert.equal(await p.locator('#laneCountNote').textContent(),'3 wells');
   assert.deepEqual(r.lanes.map(l=>l.name),['M','Sample','M']);assert.equal(r.lanes[1].weight,600);assert(r.lanes[1].markerExcluded);assert.equal(r.lanes[1].nameRuns[0].italic,true);
   assert.deepEqual(r.markers.map(m=>m.lane),[0,2]);assert.equal(r.markers[0].bands[0].show,false);assert(r.markers.every(m=>m.bands[0].manual&&m.weight===600));
   assert.deepEqual(r.values,['m1','sample','m2']);assert.deepEqual(r.groups,[{from:0,to:1,text:'Crossing'},{from:0,to:2,text:'Inside'}]);assert.equal(r.sel,1);assert.equal(r.notes[0].text,'Keep note');
   const numbers=await p.evaluate(()=>{const h=document.createElement('div');h.innerHTML=App.buildFigure(false).svg;return [...h.querySelectorAll('text')].slice(0,3).map(t=>t.textContent);});assert.deepEqual(numbers,['1','2','3']);
   const dir=path.join(root,'test-results/crop-lane-reset',engine);fs.mkdirSync(dir,{recursive:true});await p.screenshot({path:path.join(dir,'count-reset.png')});
   await p.evaluate(()=>App.undo());assert.equal((await read()).snapshot,before);
  });
  await check('count increase/decrease removes outside wells without inventing Marker roles',async()=>{
   await seed();await p.locator('#laneCountPlus').click();assert.equal(await p.evaluate(()=>App.S.lanes.length),4);assert.deepEqual(await p.evaluate(()=>App.laneRange()),[0,3]);
   assert.equal(await p.evaluate(()=>App.S.markers.length),2);await p.locator('#laneCountMinus').click();assert.equal(await p.evaluate(()=>App.S.lanes.length),3);assert.deepEqual(await p.evaluate(()=>App.laneRange()),[0,2]);
  });
  await check('successful re-detection keeps confirmed in-crop identities and drops outside guides',async()=>{
   const before=await seed();const r=await p.evaluate(()=>{
    const det=Engine.detectLanes,auto=App.autoMarkers,match=App.matchMarkers;try{
     Engine.detectLanes=()=>({centers:[50,150,250],pitch:100});App.autoMarkers=()=>{App.S.markers=[];};App.matchMarkers=()=>{};
     document.getElementById('btnRedetectCrop').click();return {lanes:App.S.lanes.map(l=>[l.x,l.name]),markers:App.S.markers.map(m=>[m.lane,m.bands[0].manual,m.bands[0].show]),values:App.S.conditions[0].values,range:App.laneRange()};
    }finally{Engine.detectLanes=det;App.autoMarkers=auto;App.matchMarkers=match;}
   });
   assert.deepEqual(r.lanes,[[550,'M'],[650,'Sample'],[750,'M']]);assert.deepEqual(r.range,[0,2]);assert.deepEqual(r.markers,[[0,true,false],[2,true,true]]);assert.deepEqual(r.values,['m1','sample','m2']);
   await p.evaluate(()=>App.undo());assert.equal((await read()).snapshot,before);
  });
  await check('failed re-detection and plain crop changes do not discard prior lanes',async()=>{
   await seed();const r=await p.evaluate(()=>{const before=App.snapshot(),det=Engine.detectLanes;let empty;try{Engine.detectLanes=()=>({centers:[],pitch:0});empty=App.redetectCrop();}finally{Engine.detectLanes=det;}const same=App.snapshot()===before;App.S.crop.x+=5;App.afterRangeChange();return {same,n:empty.lanes,lanes:App.S.lanes.length};});assert.deepEqual(r,{same:true,n:0,lanes:8});
  });
  await check('undo and project reopen retain the corrected current lane set',async()=>{
   await seed();await p.locator('#cropLaneN').fill('3');await p.locator('#cropLaneN').press('Enter');const r=await p.evaluate(async()=>{const blob=await(await App.projectBlob()).arrayBuffer(),before=App.snapshot();await App.openProject(blob);return {same:App.snapshot()===before,range:App.laneRange(),n:App.S.lanes.length};});assert.deepEqual(r,{same:true,range:[0,2],n:3});
  });
  await check('resizing a crop-edge Marker preserves endpoints despite floating-point rounding',async()=>{
   const r=await p.evaluate(()=>{const S=App.S;S.crop={x:0,y:100,w:1000,h:600};S.lanes=Array.from({length:15},(_,i)=>({x:i===14?1000:i*1000/14,name:i===14?'M':''}));S.markers=[{...App.newMarker(14),userAssigned:true,bands:[{bp:1000,y:300,manual:true,matched:true,show:true}]}];S.conditions=[{name:'Edge',values:S.lanes.map((_,i)=>String(i))}];S.groups=[{from:13,to:14,text:'Edge group'}];App.commit();document.getElementById('laneCountPlus').click();return {n:S.lanes.length,range:App.laneRange(),last:S.lanes.at(-1).x,marker:S.markers[0]?.lane,value:S.conditions[0].values.at(-1),group:S.groups[0].to};});assert.deepEqual(r,{n:16,range:[0,15],last:1000,marker:15,value:'14',group:15});
  });
  await check('no unhandled errors',async()=>assert.deepEqual(errors,[]));
 }finally{await c.close();}return out;
}
