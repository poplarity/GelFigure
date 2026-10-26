import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {readPptx} from './pptx.mjs';
export async function nameFormatChecks(browser,base,root,engine){
 const out=[],ctx=await browser.newContext({viewport:{width:1440,height:1000}}),p=await ctx.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));const dir=path.join(root,'test-results','name-format',engine);fs.mkdirSync(dir,{recursive:true});
 const check=async(name,fn)=>{try{await fn();out.push(['ok','name formatting: '+name]);}catch(e){out.push(['FAIL','name formatting: '+name,e.stack]);}};
 const open=async i=>{await p.evaluate(i=>FigEdit.openEd('lane',i),i);await p.waitForSelector('#floatEd:not(.hidden)');};
 const select=async(a,z)=>p.locator('#floatEd').evaluate((el,[a,z])=>{el.focus();el.setSelectionRange(a,z);},[a,z]);
 try{
  await p.goto(base+'/index.html?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
  await check('default layout is shared; only an explicitly customised lane changes',async()=>{
   await p.evaluate(()=>{App.S.lanes.forEach((l,i)=>l.name=i?'Sample':'M');App.S.style.labelAngle='45';App.S.style.lanePt=8;App.commit();});
   assert(await p.evaluate(()=>App.S.lanes.every(l=>!l.nameStyle)));
   await open(0);await p.locator('#fedLaneSettings summary').click();assert(!(await p.locator('#fedOwn').isChecked()));await p.locator('#fedOwn').check();
   await p.locator('#fedOwnPt').fill('10');await p.locator('#fedOwnPt').press('Tab');await p.locator('#fedOwnAngle').fill('0');await p.locator('#fedOwnAngle').press('Tab');await p.evaluate(()=>FigEdit.flush());
   const r=await p.evaluate(()=>({own:App.S.lanes[0].nameStyle,others:App.S.lanes.slice(1).every(l=>!l.nameStyle),global:App.S.style.labelAngle,rot:document.querySelector('#preview [data-edit="lane"][data-src="0"] [transform]')?.getAttribute('transform'),next:document.querySelector('#preview [data-edit="lane"][data-src="1"] [transform]')?.getAttribute('transform')}));
   assert.deepEqual(r.own,{pt:10,angle:'0'});assert(r.others);assert.equal(r.global,'45');assert(!r.rot);assert(r.next.includes('rotate(-45)'));
   await open(0);await p.locator('#fedLaneSettings summary').click();await p.locator('#fedOwn').uncheck();await p.evaluate(()=>FigEdit.flush());assert(await p.evaluate(()=>!App.S.lanes[0].nameStyle));
   await p.evaluate(()=>App.undo());assert.equal(await p.evaluate(()=>App.S.lanes[0].nameStyle.angle),'0');
  });
  await check('selected text becomes italic, superscript or subscript without exposing markup',async()=>{
   await open(1);await p.locator('#floatEd').fill('ERH-/-');await select(0,3);await p.locator('#fedItalic').click();await select(3,6);await p.locator('#fedSup').click();
   await p.locator('#floatEd').press('Control+z');assert(await p.locator('#floatEd').isVisible());assert(!(await p.evaluate(()=>NameText.runs(App.S.lanes[1]).some(r=>r.script))));
   await p.locator('#floatEd').press('Control+Shift+z');assert(await p.evaluate(()=>NameText.runs(App.S.lanes[1]).some(r=>r.script==='sup')));
   assert.equal(await p.locator('#floatEd').inputValue(),'ERH-/-');await p.evaluate(()=>FigEdit.flush());
   assert.deepEqual(await p.evaluate(()=>App.S.lanes[1].nameRuns),[{text:'ERH',italic:true},{text:'-/-',script:'sup'}]);
   await open(2);await p.locator('#floatEd').fill('H2O');await select(1,2);await p.locator('#fedSub').click();await p.evaluate(()=>FigEdit.flush());
   assert.equal(await p.evaluate(()=>App.S.lanes[2].nameRuns[1].script),'sub');
   await open(2);await select(1,2);await p.locator('#fedSub').click();assert(await p.evaluate(()=>!NameText.runs(App.S.lanes[2]).some(r=>r.script)));await p.locator('#fedSub').click();await p.evaluate(()=>FigEdit.flush());
  });
  await check('shared italic defaults allow a single upright marker and literal/unpaired stars',async()=>{
   await p.evaluate(()=>{App.S.style.laneItalic=true;App.commit();});await open(0);await select(0,1);await p.locator('#fedNormal').click();await p.evaluate(()=>FigEdit.flush());
   assert.equal(await p.locator('#preview [data-src="0"] text tspan').first().getAttribute('font-style'),'normal');
   assert.equal(await p.locator('#preview [data-src="3"] text tspan').first().getAttribute('font-style'),'italic');
   await open(0);await select(0,1);await p.locator('#fedClear').click();await p.evaluate(()=>FigEdit.flush());assert.equal(await p.locator('#preview [data-src="0"] text tspan').first().getAttribute('font-style'),'italic');
   await open(0);await select(0,1);await p.locator('#fedNormal').click();await p.evaluate(()=>FigEdit.flush());
   const r=await p.evaluate(()=>{App.S.lanes[3].name='*lacZ*';delete App.S.lanes[3].nameRuns;App.S.lanes[4].name='WT*';App.commit();return {legacy:NameText.runs(App.S.lanes[3]),literal:NameText.plain(NameText.runs(App.S.lanes[4]))};});
   assert.deepEqual(r.legacy,[{text:'lacZ',italic:true}]);assert.equal(r.literal,'WT*');await open(3);assert.equal(await p.locator('#floatEd').inputValue(),'lacZ');await p.evaluate(()=>FigEdit.flush());
  });
  await check('typing preserves runs; IME and Escape keep editing safe',async()=>{
   const before=await p.evaluate(()=>App.snapshot());await open(1);await select(3,3);await p.locator('#floatEd').press('ArrowRight');
   await p.locator('#floatEd').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})));
   await p.locator('#floatEd').press('Enter');assert(await p.locator('#floatEd').isVisible());assert(await p.locator('#fedSup').isDisabled());
   await p.locator('#floatEd').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
   await p.locator('#floatEd').fill('ERH edited');await p.locator('#floatEd').press('Escape');assert.equal(await p.evaluate(()=>App.snapshot()),before);
   const r=await p.evaluate(()=>{const r=[{text:'A',italic:true},{text:'😀',script:'sup'},{text:'B'}];return NameText.edit(r,'A😃B');});assert.equal(r.map(x=>x.text).join(''),'A😃B');assert(r.some(x=>x.text==='😃'&&x.script==='sup'));
  });
  await check('styles and projects preserve per-lane formatting; legacy templates restore shared settings',async()=>{
   const r=await p.evaluate(async()=>{
    const before=JSON.stringify(App.S.lanes.map(l=>[l.name,l.nameRuns,l.nameStyle])),tpl=JSON.parse(JSON.stringify(App.template())),blob=await(await App.projectBlob()).arrayBuffer();
    App.S.lanes.forEach(l=>{delete l.nameRuns;delete l.nameStyle;});App.applyTemplate(tpl);
    const template=JSON.stringify(App.S.lanes.map(l=>[l.name,l.nameRuns,l.nameStyle]))===before;
    await App.openProject(blob);const project=JSON.stringify(App.S.lanes.map(l=>[l.name,l.nameRuns,l.nameStyle]))===before;
    const old=JSON.parse(JSON.stringify(tpl));old.lanes.forEach(l=>{delete l.nameRuns;delete l.nameStyle;});delete old.style.laneItalic;App.applyTemplate(old);
    const legacy=App.S.lanes.every(l=>!l.nameStyle&&!l.nameRuns)&&!App.S.style.laneItalic;
    await App.openProject(blob);return {template,project,legacy};
   });assert.deepEqual(r,{template:true,project:true,legacy:true});
  });
  await check('SVG bounds and editable PowerPoint preserve run size, baseline and per-lane angle',async()=>{
   const r=await p.evaluate(async()=>{
    const S=App.S;S.style.laneItalic=false;S.conditions=[{name:'Drug',values:S.lanes.map((_,i)=>i%2?'+':'-')}];S.groups=[{from:1,to:3,text:'Formatting'}];App.commit();
    const bad=[];
    for(const family of ['Arial','Times New Roman'])for(const pt of [6,10,14])for(const angle of ['0','37','90']){
     Object.assign(S.style,{fontFamily:family,lanePt:pt,labelAngle:angle});UI.updatePreview();const svg=document.querySelector('#preview svg'),outer=svg.getBoundingClientRect();
     for(const el of svg.querySelectorAll('[data-edit="lane"]')){const b=el.getBoundingClientRect();if(b.left<outer.left-1||b.right>outer.right+1||b.top<outer.top-1||b.bottom>outer.bottom+1)bad.push(family+'/'+pt+'/'+angle);}
    }
    Object.assign(S.style,{fontFamily:'Arial',lanePt:8,labelAngle:'45'});App.commit();
    const f=App.buildFigure(false),bytes=new Uint8Array(await(await PPTX.build()).arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));
    const cv=await Export.svgToCanvas(f.svg,f.w,f.h,300);return {bad,svg:f.svg,pptx:btoa(s),png:cv.toDataURL(),min:f.minPt,log:Export.processingLog(S).lanes.slice(0,3)};
   });assert.deepEqual(r.bad,[]);assert(r.svg.includes('data-name-baseline="3.2"'));assert(r.svg.includes('data-name-baseline="-1.76"'));assert(r.min<8);
   const zip=readPptx(Buffer.from(r.pptx,'base64')),xml=zip.get('ppt/slides/slide1.xml').toString();assert(xml.includes('baseline="55556"'));assert(xml.includes('baseline="-30556"'));assert(xml.includes('sz="576"'));assert(xml.includes('i="1"'));assert.equal(r.log[0].nameStyle.angle,'0');
   fs.writeFileSync(path.join(dir,'rich.pptx'),Buffer.from(r.pptx,'base64'));fs.writeFileSync(path.join(dir,'rich.svg'),r.svg);fs.writeFileSync(path.join(dir,'rich.png'),Buffer.from(r.png.split(',')[1],'base64'));await p.screenshot({path:path.join(dir,'desktop.png')});
  });
  await check('lane-count changes and local history keep name formatting attached to its lane',async()=>{
   const r=await p.evaluate(async()=>{
    const before=App.snapshot(),gene=JSON.stringify(App.S.lanes.find(l=>l.name==='ERH-/-').nameRuns),m=JSON.stringify(App.S.lanes[0].nameStyle);
    App.resizeLaneGrid(App.figureLanes().length+2);App.commit();
    const grid=JSON.stringify(App.S.lanes.find(l=>l.name==='ERH-/-').nameRuns)===gene&&JSON.stringify(App.S.lanes[0].nameStyle)===m;
    App.undo();const undo=App.snapshot()===before;await App.saveDraft();const id=App.projectId;
    App.S.lanes.forEach(l=>{delete l.nameStyle;delete l.nameRuns;});await App.restoreHistory(id);
    return {grid,undo,history:App.snapshot()===before};
   });assert.deepEqual(r,{grid:true,undo:true,history:true});
  });
  await check('phone editing toolbar stays reachable and form keys never delete a lane',async()=>{
   for(const width of [390,320]){
    await p.setViewportSize({width,height:844});await p.locator('#mNav [data-view="fig"]').click();await open(1);await p.locator('#fedLaneSettings summary').click();await p.locator('#fedOwn').check();
    const before=await p.evaluate(()=>App.S.lanes.length);await p.locator('#fedOwnPt').fill('9');await p.locator('#fedOwnPt').press('Backspace');await p.locator('#fedOwnPt').fill('8');await p.locator('#fedOwnPt').press('Tab');assert.equal(await p.evaluate(()=>App.S.lanes.length),before);
    const box=await p.locator('#fedBar').boundingBox();assert(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=844);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);await p.screenshot({path:path.join(dir,'phone-'+width+'.png')});await p.evaluate(()=>FigEdit.flush());
   }assert.deepEqual(errors,[]);
  });
 }finally{await ctx.close();}
 await check('offline single HTML keeps selected-text formatting and editable PPTX',async()=>{
  const c=await browser.newContext({offline:true});try{const p=await c.newPage();await p.goto(pathToFileURL(path.join(root,'dist/GelFigure.html')).href+'?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
   await p.evaluate(()=>FigEdit.openEd('lane',App.figureLanes()[1]));await p.locator('#floatEd').fill('H2O');await p.locator('#floatEd').evaluate(el=>el.setSelectionRange(1,2));await p.locator('#fedSub').click();await p.evaluate(()=>FigEdit.flush());assert(await p.evaluate(()=>NameText.runs(App.S.lanes[App.figureLanes()[1]]).some(r=>r.script==='sub')));
  }finally{await c.close();}
 });return out;
}
