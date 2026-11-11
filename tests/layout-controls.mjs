import assert from 'node:assert/strict';
import path from 'node:path';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
import {readPptx} from './pptx.mjs';

export async function layoutControlChecks(browser,base,root,engine){
  const results=[],c=await browser.newContext({viewport:{width:1440,height:960}}),p=await c.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  const check=async(name,fn)=>{try{await fn();results.push(['ok','layout controls: '+name]);}catch(e){results.push(['FAIL','layout controls: '+name,e.stack]);}};
  const dir=path.join(root,'test-results','layout-controls',engine);fs.mkdirSync(dir,{recursive:true});
  const angleMenu=async()=>{if(!await p.locator('#laneAngleMenu').evaluate(e=>e.open))await p.locator('#laneAngleMenu summary').click();};
  const setAngle=async n=>{await angleMenu();await p.locator('#laneAngleNumber').fill(String(n));await p.locator('#laneAngleNumber').press('Tab');};
  try{
    await p.goto(base+'/index.html?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
    await check('export stays at the desktop right edge across widths, languages and long filenames',async()=>{
      for(const lang of ['en','zh']){
        await p.evaluate(lang=>{I18N.set(lang);App.S.file.name='An_extremely_long_gel_image_filename_'.repeat(9)+'.tif';App.commit();App.cacheStatus='error';window.dispatchEvent(new Event('gelfigure-cache'));},lang);
        for(const width of [1600,1366,1251,1250,1100,1024,901]){
          await p.setViewportSize({width,height:960});const r=await p.evaluate(()=>{const right=document.getElementById('btnExportMenu').getBoundingClientRect(),chip=document.getElementById('imgChip').getBoundingClientRect(),cache=document.getElementById('cacheStatus').getBoundingClientRect(),bar=document.querySelector('.topbar-right').getBoundingClientRect();return {gap:innerWidth-right.right,overflow:document.documentElement.scrollWidth>innerWidth,overlap:Math.max(chip.right,cache.right)>bar.left+1,top:right.top};});
          assert(Math.abs(r.gap-14)<2,`${lang}/${width}: ${JSON.stringify(r)}`);assert(!r.overflow&&!r.overlap);assert(r.top>=0&&r.top<52);
        }
      }
      await p.screenshot({path:path.join(dir,'header-901.png')});await p.setViewportSize({width:1440,height:960});
    });
    await check('selects are field height and draw their own arrow, not the engine default',async()=>{
      // Safari's native select ignores padding and lands ~10px shorter than the input beside it.
      const r=await p.evaluate(()=>{
        const vis=e=>{const b=e.getBoundingClientRect();return b.width>4&&b.height>4&&getComputedStyle(e).visibility!=='hidden';};
        const selects=[...document.querySelectorAll('select')].filter(vis).map(e=>{
          const cs=getComputedStyle(e);return {id:e.id,appearance:cs.appearance,arrow:cs.backgroundImage!=='none',h:+e.getBoundingClientRect().height.toFixed(1),pr:parseFloat(cs.paddingRight)};
        });
        const fields=[...document.querySelectorAll('input[type=text],input[type=number]')].filter(vis).map(e=>+e.getBoundingClientRect().height.toFixed(1));
        return {selects,fields,dpi:document.getElementById('dpiTop')?document.getElementById('dpiTop').getBoundingClientRect().height:0};
      });
      assert(r.selects.length>=1,JSON.stringify(r));
      for(const s of r.selects){assert.equal(s.appearance,'none',`${s.id||'select'} still uses the native appearance`);assert(s.arrow,`${s.id||'select'} has no drawn arrow`);assert(s.pr>=20,`${s.id||'select'} leaves no room for the arrow (${s.pr}px)`);}
      if(r.fields.length){const ref=Math.max(...r.fields);for(const s of r.selects)assert(Math.abs(s.h-ref)<=2,`select ${s.h}px vs field ${ref}px`);}
      assert(r.dpi>=28,`top-bar dpi select is ${r.dpi}px tall`);
    });
    await check('hover and edit highlight paint the glyph in every engine, and never reach an export',async()=>{
      // Safari renders nothing for CSS drop-shadow() on an inline SVG group; the highlight is an SVG
      // filter, so this asserts actual pixels rather than the computed style.
      const blue=async clip=>{
        const shot=await p.screenshot({clip});
        return p.evaluate(async b64=>{
          const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();
          const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);
          const d=x.getImageData(0,0,c.width,c.height).data;let n=0;
          for(let i=0;i<d.length;i+=4) if(d[i+2]-d[i]>40&&d[i+2]>120) n++;
          return n;
        },shot.toString('base64'));
      };
      // A figure that re-renders between measuring and pointing replaces the node under the cursor,
      // so the hover is re-applied to a freshly located element before each reading.
      const where=()=>p.evaluate(()=>{
        const gs=[...document.querySelectorAll('#preview [data-edit="lane"]')].filter(e=>{const b=e.getBoundingClientRect();return b.width>6&&b.height>6;});
        if(!gs.length) return null;const b=gs[0].getBoundingClientRect();
        return {cx:b.x+b.width/2,cy:b.y+b.height/2,clip:{x:b.x-10,y:b.y-10,width:b.width+20,height:b.height+20}};
      });
      const hovered=async()=>{
        for(let i=0;i<12;i++){
          const s=await where();if(!s) return null;
          await p.mouse.move(s.cx,s.cy);
          if(await p.evaluate(()=>!!document.querySelector('#preview [data-edit="lane"]:hover'))) return s;
          await p.waitForTimeout(60);
        }
        return null;
      };
      await p.mouse.move(4,4);await p.waitForTimeout(150);const idleSpot=await where();
      assert(idleSpot,'no lane name on the figure to hover');
      const idle=await blue(idleSpot.clip);
      const spot=await hovered();
      assert(spot,'the lane name never reported :hover');
      await p.waitForTimeout(120);const hover=await blue((await where()).clip);
      assert(hover>idle+20,`hover highlight paints nothing (${idle} -> ${hover} accent pixels)`);
      await p.evaluate(()=>{const g=[...document.querySelectorAll('#preview [data-edit="lane"]')].find(e=>e.getBoundingClientRect().width>6);g.classList.add('active');});
      await p.waitForTimeout(150);const active=await blue((await where()).clip);
      assert(active>idle+20,`edit highlight paints nothing (${idle} -> ${active} accent pixels)`);
      await p.mouse.move(4,4);await p.evaluate(()=>document.querySelectorAll('#preview .ed.active').forEach(e=>e.classList.remove('active')));
      const clean=await p.evaluate(async()=>{
        const saved=App.lastExport||null;const f=App.buildFigure(false);
        return {exported:/gf-glow/.test(f.svg),preview:/gf-glow/.test(document.getElementById('preview').innerHTML),saved:!!saved};
      });
      assert.equal(clean.exported,false,'the glow filter leaked into the exported SVG');
      assert.equal(clean.preview,true,'the preview carries its own filter definitions');
    });
    await check('automatic angle retains the existing short/long/narrow lane rules',async()=>{
      const r=await p.evaluate(()=>{
        const S=App.S;S.lanes.forEach(l=>l.name='A');Object.assign(S.style,{labelAngle:'auto',autoWidth:true,mmPerLane:5.5});App.commit();
        const short=App.buildFigure(false).angle;
        S.lanes.forEach((l,i)=>l.name='Long sample name '+i);App.commit();const long=App.buildFigure(false).angle;
        const saved=S.style.gelWidthMm;S.style.autoWidth=false;S.style.gelWidthMm=22;App.commit();const narrow=App.buildFigure(false).angle;
        S.style.autoWidth=true;S.style.gelWidthMm=saved;App.commit();return {short,long,narrow,default:App.defaultStyle().labelAngle};
      });assert.deepEqual(r,{short:0,long:45,narrow:90,default:'auto'});
      assert.equal(await p.locator('#panel #labelAngle').count(),0);assert.equal(await p.locator('#figureTools #labelAngle').count(),1);
    });
    await check('preset, numeric and live slider angles change only name layout and undo as one gesture',async()=>{
      const geom=()=>p.evaluate(()=>JSON.stringify([App.S.crop,App.S.lanes,App.S.markers,App.S.groups,App.S.conditions]));const before=await geom();
      await angleMenu();await p.locator('#labelAngle').selectOption('30');assert.equal(await p.evaluate(()=>UI.lastFig().angle),30);
      await setAngle(37);assert.equal(await p.locator('#labelAngle').inputValue(),'custom');assert.equal(await p.evaluate(()=>UI.lastFig().angle),37);
      const hist=await p.evaluate(()=>App.hist.length);
      await p.locator('#laneAngleSlider').evaluate(el=>{for(const v of ['41','52','63']){el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}});
      await p.waitForFunction(()=>UI.lastFig().angle===63);assert.equal(await p.evaluate(()=>App.hist.length),hist);
      await p.locator('#laneAngleSlider').dispatchEvent('change');assert.equal(await p.evaluate(()=>App.hist.length),hist+1);
      await p.evaluate(()=>App.undo());assert.equal(await p.evaluate(()=>UI.lastFig().angle),37);assert.equal(await geom(),before);
      await setAngle(110);assert.equal(await p.locator('#laneAngleNumber').inputValue(),'90');
      await p.locator('#laneAngleNumber').fill('');await p.locator('#laneAngleNumber').press('Tab');assert.equal(await p.locator('#laneAngleNumber').inputValue(),'90');
      await p.locator('#labelAngle').selectOption('auto');assert.equal(await p.evaluate(()=>App.S.style.labelAngle),'auto');assert.equal(await p.evaluate(()=>UI.lastFig().angle),45);
    });
    await check('all manual angles stay within SVG bounds with groups, conditions and different fonts',async()=>{
      const r=await p.evaluate(()=>{
        const S=App.S,fl=App.figureLanes();S.groups=[{from:fl[1],to:fl[3],text:'Treatment'}];S.conditions=[{name:'Drug',values:S.lanes.map((_,i)=>i%2?'+':'−')}];
        const failures=[];
        for(const family of ['Arial','Times New Roman'])for(const angle of [0,1,17,37,67,89,90]){
          Object.assign(S.style,{labelAngle:String(angle),fontFamily:family});UI.updatePreview();
          const svg=document.querySelector('#preview svg'),outer=svg.getBoundingClientRect();
          for(const el of svg.querySelectorAll('[data-edit="lane"], [data-edit="group"], [data-edit="condname"]')){
            const b=el.getBoundingClientRect();if(b.left<outer.left-1||b.right>outer.right+1||b.top<outer.top-1||b.bottom>outer.bottom+1)failures.push(family+'/'+angle+'/'+el.dataset.edit);
          }
          const f=App.buildFigure(false);if(f.angle!==angle||!Number.isFinite(f.w)||!Number.isFinite(f.h))failures.push('invalid layout '+angle);
        }
        S.style.labelAngle='37';App.commit();return failures;
      });assert.deepEqual(r,[]);await p.screenshot({path:path.join(dir,'custom-angle-37.png')});
    });
    await check('custom angle persists in project/templates and SVG, PNG, TIFF and editable PPTX',async()=>{
      const r=await p.evaluate(async()=>{
        const tpl=JSON.parse(JSON.stringify(App.template())),saved=await (await App.projectBlob()).arrayBuffer();App.S.style.labelAngle='auto';App.applyTemplate(tpl);const template=App.S.style.labelAngle;
        App.S.style.labelAngle='90';await App.openProject(saved);const project=App.S.style.labelAngle,f=App.buildFigure(false);
        const files=[],old=Export.deliver;Export.deliver=(blob,name)=>{files.push({blob,name});return true;};
        try{await Export.exportPNG(f.svg,f.w,f.h,300,'angle.png',App.S);await Export.exportTIFF(f.svg,f.w,f.h,300,'angle.tif',App.S);}finally{Export.deliver=old;}
        const dims=[];for(const file of files){const d=await TIFF.decodeBuffer(await file.blob.arrayBuffer(),file.name);dims.push([d.width,d.height]);}
        const bytes=new Uint8Array(await (await PPTX.build()).arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));
        const invalid={...tpl,style:{...tpl.style,labelAngle:'not-an-angle'}};App.applyTemplate(invalid);
        const fallback=App.S.style.labelAngle;await App.openProject(saved);
        return {template,project,angle:f.angle,svg:f.svg.includes('rotate(-37)'),dims,expected:[Math.round(f.w/72*300),Math.round(f.h/72*300)],pptx:btoa(text),fallback};
      });assert.equal(r.template,'37');assert.equal(r.project,'37');assert.equal(r.angle,37);assert(r.svg);assert.equal(r.fallback,'auto');assert.deepEqual(r.dims,[r.expected,r.expected]);
      const parts=readPptx(Buffer.from(r.pptx,'base64')),xml=parts.get('ppt/slides/slide1.xml').toString();assert(xml.includes('Long sample name'));assert(xml.includes('rot="'+(323*60000)+'"')||xml.includes('rot="'+(-37*60000)+'"'));fs.writeFileSync(path.join(dir,'angle-37.pptx'),Buffer.from(r.pptx,'base64'));
    });
    await check('phone controls fit, keep mobile export available and retain a chosen angle',async()=>{
      for(const width of [390,320]){
        await p.setViewportSize({width,height:844});await p.locator('#mNav [data-view="fig"]').click();await setAngle(28);
        assert.equal(await p.evaluate(()=>UI.lastFig().angle),28);assert(await p.locator('#mExport').isVisible());assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);
        const b=await p.locator('#laneAngleMenu .figure-text-fields').boundingBox();assert(b.x>=0&&b.x+b.width<=width+1,`${width}px: the angle menu must stay on screen, got ${JSON.stringify(b)}`);
        await p.screenshot({path:path.join(dir,'phone-'+width+'.png')});await p.locator('#laneAngleNumber').press('Escape');assert(!(await p.locator('#laneAngleMenu').evaluate(e=>e.open)));
      }
      assert.deepEqual(errors,[]);
    });
  }finally{await c.close();}
  await check('offline HTML offers manual angles with the same automatic default',async()=>{
    const c=await browser.newContext({offline:true});try{const p=await c.newPage();await p.goto(pathToFileURL(path.join(root,'dist/GelFigure.html')).href+'?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
      assert.equal(await p.evaluate(()=>App.S.style.labelAngle),'auto');await p.locator('#laneAngleMenu summary').click();await p.locator('#laneAngleNumber').fill('25');await p.locator('#laneAngleNumber').press('Tab');assert.equal(await p.evaluate(()=>App.buildFigure(true).angle),25);
    }finally{await c.close();}
  });return results;
}
