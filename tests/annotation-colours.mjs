import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readPptx} from './pptx.mjs';

export async function annotationColourChecks(browser,base,root,engine){
 const out=[],ctx=await browser.newContext({viewport:{width:1440,height:1000}}),p=await ctx.newPage(),errors=[];
 const dir=path.join(root,'test-results','annotation-colours',engine);fs.mkdirSync(dir,{recursive:true});
 p.on('pageerror',e=>errors.push(e.message));
 const check=async(name,fn)=>{try{await fn();out.push(['ok','annotation colours: '+name]);}catch(e){out.push(['FAIL','annotation colours: '+name,e.stack]);}};
 try{
  await p.goto(base+'/index.html?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
  await p.evaluate(()=>{
   const S=App.S,c=S.crop;S.lanes.forEach((l,i)=>{l.name=i?'Sample '+i:'M';delete l.nameRuns;});
   S.groups=[{from:1,to:3,text:'Treatment'}];S.conditions=[{name:'Drug',values:S.lanes.map((_,i)=>i%2?'+':'−')}];
   S.arrows=[{y:c.y+c.h*.45,text:'Target',side:'right',size:false}];
   S.boxes=[{x:c.x+c.w*.3,y:c.y+c.h*.4,w:c.w*.2,h:c.h*.15,text:'Region',zoom:2}];
   S.brackets=[{y1:c.y+c.h*.65,y2:c.y+c.h*.85,text:'Smear',side:'right'}];
   S.labels=[{text:'Coomassie',pos:'left'}];App.commit();
   window.colourGeometry=JSON.stringify([S.crop,S.lanes.map(l=>l.x),S.markers.map(m=>m.bands.map(b=>[b.bp,b.y])),S.levels]);
   window.colourPixels=Array.from(App.src.data);
  });
  await check('lane names colour a selection, keep scripts/italics, undo and restore default',async()=>{
   await p.evaluate(()=>FigEdit.openEd('lane',1));await p.locator('#floatEd').fill('ERH-/-');
   await p.locator('#floatEd').evaluate(el=>{el.focus();el.setSelectionRange(3,6);});
   await p.locator('#fedSup').click();await p.locator('#fedRed').click();
   assert.deepEqual(await p.evaluate(()=>App.S.lanes[1].nameRuns),[{text:'ERH'},{text:'-/-',script:'sup',color:'red'}]);
   await p.locator('#floatEd').press('Control+z');assert(!(await p.evaluate(()=>NameText.runs(App.S.lanes[1]).some(r=>r.color))));
   await p.locator('#floatEd').press('Control+Shift+z');assert(await p.evaluate(()=>NameText.runs(App.S.lanes[1]).some(r=>r.color==='red')));
   await p.locator('#fedColorDefault').click();assert(!(await p.evaluate(()=>NameText.runs(App.S.lanes[1]).some(r=>r.color))));
   await p.locator('#fedRed').click();await p.evaluate(()=>FigEdit.flush());
   await p.evaluate(()=>FigEdit.openEd('lane',1));await p.locator('#fedColorDefault').click();await p.locator('#floatEd').press('Escape');
   assert(await p.evaluate(()=>NameText.runs(App.S.lanes[1]).some(r=>r.color==='red')));
   assert.deepEqual(await p.evaluate(()=>NameText.normalize([{text:'unsafe',color:'url(https://invalid.example)'}])),[{text:'unsafe'}]);
  });
  await check('group lines, condition rows and all annotation popovers offer red/default',async()=>{
   for(const [kind,field] of [['group','groups'],['condname','conditions']]){
    await p.evaluate(kind=>FigEdit.openEd(kind,0),kind);await p.locator('#fedRed').click();await p.evaluate(()=>FigEdit.flush());
    assert.equal(await p.evaluate(field=>App.S[field][0].color,field),'red');
   }
   for(const [kind,field] of [['box','boxes'],['bracket','brackets'],['label','labels']]){
    await p.evaluate(kind=>FigEdit.annoPopover(kind,0),kind);await p.locator('#qColor').selectOption('red');await p.locator('#qOk').click();
    assert.equal(await p.evaluate(field=>App.S[field][0].color,field),'red');
   }
   await p.evaluate(()=>FigEdit.arrowPopover(0));await p.locator('#pColor').selectOption('red');await p.locator('#pOk').click();
   assert.equal(await p.evaluate(()=>App.S.arrows[0].color),'red');
   assert.equal(await p.locator('#preview [data-edit="box"] rect[stroke="#d32f2f"]').count(),2);
   assert.equal(await p.locator('#preview [data-edit="arrow"] path').getAttribute('fill'),'#d32f2f');
   assert.equal(await p.locator('#preview [data-edit="condname"] text').first().getAttribute('fill'),'#d32f2f');
   assert.equal(await p.locator('#preview [data-edit="bracket"] path').getAttribute('stroke'),'#d32f2f');
   for(const sym of ['star','hash','dagger']){
    await p.evaluate(sym=>{App.S.arrows[0].sym=sym;App.commit();},sym);
    assert.equal(await p.locator('#preview [data-edit="arrow"] text').first().getAttribute('fill'),'#d32f2f');
   }
   await p.evaluate(()=>{delete App.S.arrows[0].sym;App.commit();});
  });
  await check('one marker size or the whole ladder can be red, including ticks and units',async()=>{
   const b=await p.evaluate(()=>{const m=App.S.markers[0];const b=m.bands.findIndex(b=>b.show&&b.y>App.S.crop.y+App.S.crop.h*.1);MarkerUI.labelPopover(0,b);return {bi:b,bp:m.bands[b].bp};});
   await p.locator('#markerBandColor').selectOption('red');
   assert.equal(await p.locator(`#preview [data-edit="marker"][data-marker="0"][data-band="${b.bi}"] text`).getAttribute('fill'),'#d32f2f');
   await p.locator('#markerPopColor').selectOption('red');await p.locator('#markerPopClose').click();
   assert.equal(await p.locator('#preview [data-edit="marker"][data-marker="0"][data-band="-1"] text').getAttribute('fill'),'#d32f2f');
   await p.evaluate(()=>App.undo());assert(!(await p.evaluate(()=>App.S.markers[0].color)));await p.evaluate(()=>App.redo());
   const r=await p.evaluate(bp=>{App.alignMarker(0);return App.S.markers[0].bands.find(b=>b.bp===bp).color;},b.bp);assert.equal(r,'red');
  });
  await check('PNG, RGB TIFF and editable PowerPoint retain red over a grayscale gel',async()=>{
   const r=await p.evaluate(async()=>{
    const S=App.S,f=App.buildFigure(false),downloads=[],old=Export.deliver;
    Export.deliver=(blob,name)=>{downloads.push({blob,name});return true;};
    try{await Export.exportPNG(f.svg,f.w,f.h,300,'colour.png',S);await Export.exportTIFF(f.svg,f.w,f.h,300,'colour.tif',S);}finally{Export.deliver=old;}
    const b64=async b=>{const a=new Uint8Array(await b.arrayBuffer());let s='';for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s);};
    const decoded=await TIFF.decode(await downloads[1].blob.arrayBuffer());
    const cv=await Export.svgToCanvas(f.svg,f.w,f.h,300),pixels=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
    let red=0,tiffRed=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>150&&pixels[i]>pixels[i+1]*1.7&&pixels[i]>pixels[i+2]*1.7)red++;
    for(let i=0;i<(decoded.rgb||[]).length;i+=3)if(decoded.rgb[i]>150&&decoded.rgb[i]>decoded.rgb[i+1]*1.7&&decoded.rgb[i]>decoded.rgb[i+2]*1.7)tiffRed++;
    return {svg:f.svg,png:await b64(downloads[0].blob),tiff:await b64(downloads[1].blob),pptx:await b64(await PPTX.build()),red,tiffRed,gray:!App.isColour(),log:Export.processingLog(S)};
   });assert(r.gray);assert(r.red>100);assert.equal(r.tiffRed,r.red);
   const zip=readPptx(Buffer.from(r.pptx,'base64')),xml=zip.get('ppt/slides/slide1.xml').toString();
   assert(xml.includes('srgbClr val="D32F2F"'));assert(xml.includes('<a:t xml:space="preserve">Region</a:t>'));assert(xml.includes('a:srcRect'));assert(xml.includes('baseline="55556"'));
   assert.equal(r.log.regionBoxes[0].color,'red');assert.equal(r.log.groups[0].color,'red');assert.equal(r.log.markers[0].color,'red');
   for(const [ext,data] of [['png',r.png],['tif',r.tiff],['pptx',r.pptx]])fs.writeFileSync(path.join(dir,'red-annotations.'+ext),Buffer.from(data,'base64'));
   fs.writeFileSync(path.join(dir,'red-annotations.svg'),r.svg);await p.screenshot({path:path.join(dir,'desktop.png')});
  });
  await check('projects, history, templates and re-matching keep colour; source pixels stay intact',async()=>{
   const r=await p.evaluate(async()=>{
    const S=App.S,geometry=JSON.stringify([S.crop,S.lanes.map(l=>l.x),S.markers.map(m=>m.bands.map(b=>[b.bp,b.y])),S.levels]);
    const noPixelChange=JSON.stringify(Array.from(App.src.data))===JSON.stringify(window.colourPixels);
    const before=App.snapshot(),blob=await(await App.projectBlob()).arrayBuffer(),tpl=JSON.parse(JSON.stringify(App.template()));
    S.boxes[0].color=undefined;await App.openProject(blob);const project=App.snapshot()===before;
    await App.saveDraft();const id=App.projectId;delete App.S.labels[0].color;await App.restoreHistory(id);const history=App.snapshot()===before;
    App.applyTemplate(tpl);const template=App.S.groups[0].color==='red'&&App.S.conditions[0].color==='red'&&App.S.arrows[0].color==='red'&&App.S.labels[0].color==='red'&&App.S.markers[0].color==='red'&&App.S.markers[0].bands.some(b=>b.color==='red')&&NameText.runs(App.S.lanes[1]).some(r=>r.color==='red');
    const legacy=JSON.parse(JSON.stringify(tpl));for(const field of ['groups','conditions','arrows','labels','brackets'])for(const a of legacy[field]||[])delete a.color;
    for(const l of legacy.lanes){if(l.marker){delete l.marker.color;delete l.marker.redBands;}if(l.nameRuns)l.nameRuns.forEach(r=>delete r.color);}
    App.applyTemplate(legacy);const oldDefault=!App.S.groups[0].color&&!App.S.markers[0].color&&!NameText.runs(App.S.lanes[1]).some(r=>r.color);
    await App.openProject(blob);return {project,history,template,oldDefault,noPixelChange,geometry:geometry===window.colourGeometry};
   });assert(r.project);assert(r.history);assert(r.template);assert(r.oldDefault);assert(r.noPixelChange);assert(r.geometry);
  });
  await check('default boxes still contrast against dark gels, and unknown colour tokens are ignored',async()=>{
   const r=await p.evaluate(()=>{
    const s=App.renderState(false);s.bright=true;s.levels.invert=false;s.boxes.forEach(b=>delete b.color);
    const href=App.buildFigure(false).svg.match(/href="(data:image\/png;base64,[^"]+)"/)[1];
    const f=Render.build(s,App._lastGel,href);return {svg:f.svg,col:Render.annotationColor('url(https://invalid.example)')};
   });assert(r.svg.includes('stroke="#fff"'));assert.equal(r.col,'#000');
  });
  await check('phone toolbar and annotation colours work at 320px without overflow',async()=>{
   await p.setViewportSize({width:320,height:844});await p.locator('#mNav [data-view="fig"]').click();
   await p.evaluate(()=>FigEdit.openEd('lane',2));await p.locator('#fedRed').click();await p.evaluate(()=>FigEdit.flush());
   assert(await p.evaluate(()=>NameText.runs(App.S.lanes[2]).every(r=>r.color==='red')));
   await p.evaluate(()=>FigEdit.annoPopover('box',0));await p.locator('#qColor').selectOption('');await p.locator('#qColor').selectOption('red');
   const rect=await p.locator('#popover').boundingBox();assert(rect.x>=0&&rect.x+rect.width<=321&&rect.y>=0&&rect.y+rect.height<=844);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),320);await p.screenshot({path:path.join(dir,'phone.png')});await p.locator('#qOk').click();assert.deepEqual(errors,[]);
  });
 }finally{await ctx.close();}
 await check('single HTML works offline with editable red text and region boxes',async()=>{
  const c=await browser.newContext({offline:true});try{
   const p=await c.newPage();await p.goto(pathToFileURL(path.join(root,'dist/GelFigure.html')).href+'?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
   await p.evaluate(()=>FigEdit.openEd('lane',App.figureLanes()[1]));await p.locator('#fedRed').click();await p.evaluate(()=>FigEdit.flush());
   assert(await p.evaluate(()=>NameText.runs(App.S.lanes[App.figureLanes()[1]]).every(r=>r.color==='red')));
   const r=await p.evaluate(async()=>{const c=App.S.crop;App.S.boxes=[{x:c.x+c.w*.3,y:c.y+c.h*.3,w:c.w*.2,h:c.h*.2,color:'red'}];App.commit();return {svg:App.buildFigure(false).svg,pptx:await(await PPTX.build()).arrayBuffer().then(b=>b.byteLength)};});assert(r.svg.includes('stroke="#d32f2f"'));assert(r.pptx>1000);
  }finally{await c.close();}
 });return out;
}
