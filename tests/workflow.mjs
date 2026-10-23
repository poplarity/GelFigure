import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

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
    await check('marker labels are editable on the figure and visibility does not dismiss the popup',async()=>{
      await p.locator('#preview [data-edit="marker"]').first().click();
      await p.locator('#markerPopPt').fill('6');await p.locator('#markerPopPt').press('Tab');
      const before=await p.evaluate(()=>App.S.markers.map(m=>m.bands.map(b=>[b.bp,b.y,b.manual])));
      const cb=p.locator('#markerLabelPop [data-visible-band]').first();const was=await cb.isChecked();await cb.setChecked(!was);
      assert(await p.locator('#markerLabelPop').isVisible());assert.equal(await p.evaluate(()=>App.S.style.markerPt),6);
      assert.deepEqual(await p.evaluate(()=>App.S.markers.map(m=>m.bands.map(b=>[b.bp,b.y,b.manual]))),before);
      await p.locator('#markerPopClose').click();
    });
    await check('marker picking waits for an explicit lane and does not create duplicates',async()=>{
      const n=await p.evaluate(()=>App.S.markers.length);
      await p.locator('#btnAddMarker').click();assert.equal(await p.evaluate(()=>App.S.markers.length),n);
      await p.locator('#modeCancel').click();assert.equal(await p.evaluate(()=>App.S.markers.length),n);
      await p.locator('#btnAddMarker').click();
      const i=await p.evaluate(()=>App.S.markers[0].lane);await p.locator(`#preview [data-edit="lane"][data-src="${i}"]`).click();
      await p.waitForSelector('#markerGuide:not(.hidden)');assert.equal(await p.evaluate(()=>App.S.markers.length),n);
    });
    await check('ladder browsing previews without changing annotations; guide places real calibration anchors',async()=>{
      const original=await p.evaluate(()=>JSON.stringify(App.S.markers));
      const other=await p.locator('#markerGuideModel option').evaluateAll(os=>os.find(o=>!o.selected).value);
      await p.locator('#markerGuideModel').selectOption(other);assert.equal(await p.evaluate(()=>JSON.stringify(App.S.markers)),original);
      assert(await p.locator('#markerUseModel').isVisible());
      const originalId=JSON.parse(original)[0].ladderId;await p.locator('#markerGuideModel').selectOption(originalId);
      // Firefox's automation scrollIntoView for an SVG child can reset its scrolling parent.
      // Scroll the real container, verify the hit target, then use an ordinary pointer click.
      await p.locator('.marker-reference-scroll').evaluate(e=>{e.scrollTop=e.scrollHeight;});
      const last=p.locator('[data-size]').last(),target=await last.boundingBox(),scroll=await p.locator('.marker-reference-scroll').evaluate(e=>e.scrollTop);
      const point={x:target.x+target.width/2,y:target.y+target.height/2};
      assert(await p.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('[data-size]'),point));
      await p.mouse.click(point.x,point.y);
      assert.equal(await p.locator('.marker-reference-scroll').evaluate(e=>e.scrollTop),scroll,'choosing a band keeps the reference scrolled to it');
      const bp=await p.evaluate(()=>App.S.markers[0].bands[Math.floor(App.S.markers[0].bands.length/2)].bp);
      await p.locator(`[data-size="${bp}"]`).click();
      const rect=await p.locator('#markerLanePreview').boundingBox();await p.mouse.click(rect.x+rect.width/2,rect.y+rect.height*.5);
      assert(await p.evaluate(k=>App.S.markers[0].bands.some(b=>b.bp===k&&b.manual&&b.show),bp));
      await p.screenshot({path:path.join(dir,'marker-guide.png')});await p.locator('#markerGuideDone').click();
    });
    await check('changing marker lanes preserves other markers and is undoable',async()=>{
      const r=await p.evaluate(()=>{
        const was=App.snapshot(),m=App.S.markers[0],other=UI.figLanes().find(i=>!App.S.markers.some(m=>m.lane===i));
        MarkerUI.assignLane(other,0);const moved=App.S.markers[0].lane===other;MarkerUI.close();App.undo();
        return {moved,undo:App.snapshot()===was};
      });assert.deepEqual(r,{moved:true,undo:true});
    });
    await check('protein guides show protein ladders; applying a preview keeps source bytes intact',async()=>{
      const source=await p.evaluate(async()=>{await App.load({name:'synthetic_protein.tif',buffer:Demo.encodeTiff16(Demo.makeProteinGel())});return App.S.file.sha256;});
      await p.evaluate(()=>MarkerUI.open(0));
      assert(await p.locator('#markerGuideModel option').evaluateAll(os=>os.every(o=>Ladders.kindOf(Ladders.get(o.value))==='protein')));
      const model=await p.locator('#markerGuideModel option').evaluateAll(os=>os.find(o=>!o.selected).value);
      await p.locator('#markerGuideModel').selectOption(model);await p.locator('#markerUseModel').click();
      assert.equal(await p.evaluate(()=>App.S.markers[0].ladderId),model);
      assert.equal(await p.evaluate(()=>App.sha256(App.srcBuffer)),source);
      assert((await p.locator('.marker-compare-title').last().textContent()).includes('kDa'));
      await p.locator('#markerGuideClose').click();
    });
    await check('a missing custom model can be replaced through the guide',async()=>{
      const state=await p.evaluate(()=>App.snapshot());
      await p.evaluate(()=>{App.S.markers[0].ladderId='missing-custom-model';MarkerUI.open(0);});
      assert(await p.locator('#markerUseModel').isVisible());
      await p.locator('#markerUseModel').click();assert(await p.evaluate(()=>!!Ladders.get(App.S.markers[0].ladderId)));
      await p.locator('#markerGuideClose').click();await p.evaluate(s=>{App.S=JSON.parse(s);App.emit('change');},state);
    });
    await check('export SVG contains no editor handles or schematic reference',async()=>{
      const r=await p.evaluate(()=>({preview:App.buildFigure(true).svg,exported:App.buildFigure(false).svg}));
      assert(r.preview.includes('data-edit="marker"'));assert(!r.exported.includes('data-edit='));assert(!r.exported.includes('ladder-reference'));
    });
    await check('replacing a project cancels a marker gesture without writing into the new project',async()=>{
      const before=await p.evaluate(()=>App.snapshot());await p.evaluate(()=>MarkerUI.open(0));
      const bp=await p.evaluate(()=>App.S.markers[0].bands[4].bp);await p.locator(`[data-size="${bp}"]`).click();
      const r=await p.evaluate(s=>{
        const cv=document.getElementById('markerLanePreview'),rect=cv.getBoundingClientRect();
        cv.dispatchEvent(new PointerEvent('pointerdown',{pointerId:77,button:0,clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2,bubbles:true}));
        const started=App.S.markers[0].bands.some(b=>b.manual);
        const next=JSON.parse(s);next.markers[0].bands.forEach(b=>{b.y+=3;});const expected=JSON.stringify(next.markers);
        App.S=next;App.emit('loaded');const intact=JSON.stringify(App.S.markers)===expected;
        App.S=JSON.parse(s);App.emit('loaded');return {started,intact};
      },before);assert.deepEqual(r,{started:true,intact:true});
    });
    await check('phone and narrow desktop layouts expose the same tools without overflow',async()=>{
      for(const width of [1024,390,320]){
        await p.setViewportSize({width,height:860});
        if(width<900){
          await p.locator('#mNav [data-view="raw"]').click();
          assert(await p.locator('#cropLaneN').isVisible(), await p.evaluate(()=>{let el=document.getElementById('cropLaneN'),a=[];while(el){const c=getComputedStyle(el),r=el.getBoundingClientRect();a.push([el.id,el.className,c.display,c.visibility,r.width,r.height]);el=el.parentElement;}return JSON.stringify(a);}));
          await p.locator('#mNav [data-view="fig"]').click();
        }
        assert(await p.locator('#btnEditNames').isVisible());
        await p.locator('#figureTextMenu summary').click();assert(await p.locator('#markerPt').isVisible());
        assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);
        await p.locator('#figureTextMenu summary').click();
        await p.evaluate(()=>MarkerUI.open(0));
        assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);
        const box=await p.locator('.marker-guide-body').boundingBox();assert(box.width<=width);
        if(width===390)await p.screenshot({path:path.join(dir,'phone-guide.png')});
        await p.locator('#markerGuideClose').click();
      }
      await p.setViewportSize({width:1600,height:1000});await p.screenshot({path:path.join(dir,'desktop.png')});
    });
    await check('no unhandled interaction errors',async()=>assert.deepEqual(errors,[]));
  } finally {await ctx.close();}
  await check('offline single HTML offers marker references and direct editing',async()=>{
    const c=await browser.newContext();try{
      await c.setOffline(true);const p=await c.newPage();await p.goto(pathToFileURL(path.join(root,'dist/GelFigure.html')).href+'?demo=1&lang=en');
      await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});await p.evaluate(()=>MarkerUI.open(0));
      assert(await p.locator('.ladder-reference').isVisible());assert(await p.locator('#markerLanePreview').isVisible());
    }finally{await c.close();}
  });return results;
}
