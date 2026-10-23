import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {markerWorkflowChecks} from './marker-workflow.mjs';

export async function workflowChecks(browser, base, root, engine) {
  const results=[],ctx=await browser.newContext({viewport:{width:1600,height:1000}}),p=await ctx.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  const check=async(name,fn)=>{try{await fn();results.push(['ok','workflow: '+name]);}catch(e){results.push(['FAIL','workflow: '+name,e.stack]);}};
  const dir=path.join(root,'test-results','workflow',engine);fs.mkdirSync(dir,{recursive:true});
  const load=async()=>{await p.goto(base+'/index.html?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});};
  try {
    await load();
    await check('end-line dragging links the grid and keeps annotations and outside lanes',async()=>{
      const r=await p.evaluate(()=>{
        const S=App.S,r=App.laneRange();S.lanes[r[0]+1].name='Keep name';S.conditions=[{name:'Drug',values:S.lanes.map((_,i)=>String(i))}];App.commit();
        const before=JSON.parse(App.snapshot()),base=App.laneGrid();
        App.dragLane(r[0],base.xs[r[0]]+10,base);const left=S.lanes[r[0]].x,step=S.lanes[r[0]+1].x-left;
        const even=S.lanes.slice(r[0],r[1]+1).every((l,k)=>Math.abs(l.x-(left+k*step))<1e-7);
        const kept=JSON.stringify(S.markers)===JSON.stringify(before.markers)&&JSON.stringify(S.conditions)===JSON.stringify(before.conditions)&&S.lanes[r[0]+1].name==='Keep name';
        const outside=S.lanes.every((l,i)=>i>=r[0]&&i<=r[1]||l.x===before.lanes[i].x);
        App.restoreLaneGrid(base);return {even,kept,outside,restored:S.lanes.every((l,i)=>l.x===before.lanes[i].x)};
      });assert.deepEqual(r,{even:true,kept:true,outside:true,restored:true});
      const points=await p.evaluate(()=>{const r=App.laneRange(),S=App.S;return {i:r[1],a:Editor.toScr(S.lanes[r[1]].x,S.crop.y+S.crop.h*.45)};});
      const box=await p.locator('#editor').boundingBox();await p.mouse.move(box.x+points.a.x,box.y+points.a.y);await p.mouse.down();await p.mouse.move(box.x+points.a.x-15,box.y+points.a.y,{steps:5});await p.mouse.up();
      assert(await p.evaluate(()=>{const r=App.laneRange(),xs=App.S.lanes.slice(r[0],r[1]+1).map(l=>l.x),d=xs[1]-xs[0];return xs.every((x,i)=>Math.abs(x-xs[0]-i*d)<1e-6);}));
    });
    await check('lane count applies immediately, supports one lane, and never recreates removed markers',async()=>{
      await p.evaluate(()=>{App.S.markers=[];App.commit();});
      await p.locator('#cropLaneN').fill('8');await p.locator('#cropLaneN').press('Tab');
      assert.equal(await p.evaluate(()=>{const r=App.laneRange();return r[1]-r[0]+1;}),8);
      assert.equal(await p.evaluate(()=>App.S.markers.length),0);
      await p.locator('#laneCountPlus').click();assert.equal(await p.locator('#cropLaneN').inputValue(),'9');
      await p.locator('#cropLaneN').fill('1');await p.locator('#cropLaneN').press('Tab');
      assert.equal(await p.locator('#cropLaneN').inputValue(),'1');
      await p.locator('#cropLaneN').fill('8');await p.locator('#cropLaneN').press('Tab');assert.equal(await p.locator('#cropLaneN').inputValue(),'8');
      assert(await p.evaluate(()=>App.S.lanes.every(l=>Number.isFinite(l.x))));
    });
    await load();
    await check('free adjustment is explicit and grid movement is undoable',async()=>{
      const r=await p.evaluate(()=>{
        const range=App.laneRange(),base=App.laneGrid(),i=range[0]+2;
        App.dragLane(i,base.xs[i]+2,base,true);const single=App.S.lanes.every((l,k)=>k===i||l.x===base.xs[k]);
        App.restoreLaneGrid(base);const before=App.snapshot();App.dragLane(i,base.xs[i]+2,base);App.commit();App.undo();
        return {single,undo:App.snapshot()===before};
      });assert.deepEqual(r,{single:true,undo:true});
    });
    await check('count changes preserve both end markers, hidden lanes and condition identities',async()=>{
      const r=await p.evaluate(()=>{
        const before=App.snapshot(),range=App.laneRange(),a=range[0],z=range[1],n=z-a+1;
        App.S.markers=[{...App.newMarker(a),bands:[{bp:1000,y:200,manual:true,matched:true,show:false}]},{...App.newMarker(z),bands:[{bp:500,y:300,manual:true,matched:true,show:true}]}];
        App.S.lanes[a+1].hidden=true;App.S.conditions=[{name:'Identity',values:App.S.lanes.map((_,i)=>'v'+i)}];
        App.resizeLaneGrid(n+2);const markers=App.S.markers.map(m=>[m.lane,m.bands[0].manual,m.bands[0].show]);
        const newRange=App.laneRange(),hidden=App.S.lanes.filter(l=>l.hidden).length,values=App.S.conditions[0].values.filter(Boolean);
        const ok=markers[0][0]===newRange[0]&&markers[1][0]===newRange[1]&&markers.every(m=>m[1])&&!markers[0][2]&&hidden===1&&new Set(values).size===values.length;
        App.S=JSON.parse(before);App.emit('change');return ok;
      });assert(r);
    });
    await check('names and font controls live on the figure, with IME-safe editing and bulk paste',async()=>{
      assert.equal(await p.locator('#panel #laneBulk,#panel #lanePt,#panel #markerPt,#laneList input[type=text]').count(),0);
      await p.locator('#btnEditNames').click();await p.locator('#floatEd').fill('样本一');
      await p.locator('#floatEd').evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})));
      assert(await p.locator('#floatEd').isVisible());await p.locator('#floatEd').press('Enter');
      await p.locator('#btnBulkNames').click();await p.locator('#laneBulk').fill('M\tWT\tKO');await p.locator('#btnBulkApply').click();
      assert.deepEqual(await p.evaluate(()=>UI.figLanes().slice(0,3).map(i=>App.S.lanes[i].name)),['M','WT','KO']);
      await p.locator('#figureTextMenu summary').click();await p.locator('#lanePt').fill('9');await p.locator('#lanePt').press('Tab');
      await p.locator('#markerPt').fill('8');await p.locator('#markerPt').press('Tab');await p.locator('#fontFamily').selectOption('Times New Roman');
      assert.deepEqual(await p.evaluate(()=>[App.S.style.lanePt,App.S.style.markerPt,App.S.style.fontFamily]),[9,8,'Times New Roman']);
      await p.locator('#figureTextMenu summary').click();
    });
    await check('no unhandled grid or name errors',async()=>assert.deepEqual(errors,[]));
  } finally { await ctx.close(); }
  return [...results,...await markerWorkflowChecks(browser,base,root,engine)];
}
