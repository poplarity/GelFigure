/* Font selection is a layout/export feature, not a font download service. Exercise real SVG bounds,
 * raster pixels, project/template persistence and native Office text runs on all three engines. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readPptx} from './pptx.mjs';

export async function fontChecks(browser, base, root, engine) {
  const out=[],ctx=await browser.newContext({viewport:{width:1600,height:960}}),p=await ctx.newPage(),errors=[],fontRequests=[];
  p.on('pageerror',e=>errors.push(e.message));
  p.on('request',r=>{if(r.resourceType()==='font')fontRequests.push(r.url());});
  const check=async(name,fn)=>{try{await fn();out.push(['ok',name]);}catch(e){out.push(['FAIL',name,e.message]);}};
  const names=['Arial','Times New Roman','Helvetica','Calibri','Cambria'];
  const dir=path.join(root,'test-results','fonts',engine);fs.mkdirSync(dir,{recursive:true});
  try {
    await p.goto(base+'/index.html?demo=1&lang=en');
    await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
    await p.evaluate(()=>{
      const f=App.figureLanes(),S=App.S;
      S.lanes.forEach((l,i)=>{l.name=i===f[0]?'M':i===f[1]?'*β-actin*':i===f[2]?'WT & μ':'Sample '+i;});
      S.groups=[{from:f[1],to:f[2],text:'A narrow group with *italic* words',pt:8},{from:f[3],to:f[4],text:'Adjacent group label with μ ± × ≈',pt:8},{from:f[6],to:f[8],text:'Line one\n第二行 *italic*',pt:9}];
      S.conditions=[{name:'Drug',values:S.lanes.map((_,i)=>i%2?'+':'−')}];
      S.arrows=[{y:S.crop.y+S.crop.h*.45,text:'Target β',size:false,side:'right',pt:8}];
      S.labels=[{text:'Synthetic example',pos:'below'}];
      Object.assign(S.style,{labelAngle:'45',frame:true,panelLetter:'A',groupTicks:true});App.commit();
      document.getElementById('fontFamily').closest('details').open=true;
    });
    await check('fonts: five system choices, real label bounds stay separate in every fit mode',async()=>{
      assert.deepEqual(await p.locator('#fontFamily option').evaluateAll(os=>os.map(o=>o.value)),names);
      const widths=[];
      for(const name of names){
        await p.locator('#fontFamily').selectOption(name);
        const r=await p.evaluate(name=>{
          const checks=[];
          for(const mode of ['wrap','shrink','none']){
            App.S.style.groupFit=mode;App.commit();UI.updatePreview();
            const svg=document.querySelector('#preview > svg');
            const boxes=Array.from(svg.querySelectorAll('g[data-edit="group"]')).map(g=>g.getBoundingClientRect());
            let collisions=0;
            boxes.forEach((a,i)=>boxes.slice(i+1).forEach(b=>{if(a.left<b.right-.5&&b.left<a.right-.5&&a.top<b.bottom-.5&&b.top<a.bottom-.5)collisions++;}));
            checks.push({mode,collisions,family:svg.getAttribute('font-family')});
          }
          App.S.style.groupFit='wrap';App.commit();
          const log=Export.processingLog(App.S);
          return {checks,chosen:App.S.style.fontFamily,width:Render.measure('WWWW iii β-actin',10,false,name),logFont:log.environment.figureFont,embedded:log.environment.fontsEmbedded};
        },name);
        assert.equal(r.chosen,name);assert.equal(r.logFont,name);assert.equal(r.embedded,false);
        for(const c of r.checks){assert.equal(c.collisions,0,`${name}/${c.mode} labels overlap`);assert(c.family.includes(name));}
        widths.push(r.width);
      }
      assert(Math.abs(widths[0]-widths[1])>.5,'Serif/sans-serif layout must use different metrics, even with generic fallback fonts');
    });
    await check('fonts: undo, templates, projects, preferences and legacy defaults',async()=>{
      const r=await p.evaluate(async()=>{
        const sel=document.getElementById('fontFamily');const set=v=>{sel.value=v;sel.dispatchEvent(new Event('change'));};
        set('Arial');set('Times New Roman');const saved=App.snapshot();App.undo();const undo=App.S.style.fontFamily;App.redo();const redo=App.S.style.fontFamily;
        const t=JSON.parse(JSON.stringify(App.template())),project=await App.projectBlob();set('Calibri');App.applyTemplate(t);App.commit();const template=App.S.style.fontFamily,preferences=App.prefs().style.fontFamily;
        set('Cambria');await App.openProject(await project.arrayBuffer());const roundTrip=App.snapshot()===saved;
        const legacy=JSON.parse(JSON.stringify(t));delete legacy.style.fontFamily;App.applyTemplate(legacy);const legacyFont=App.S.style.fontFamily;
        const invalid=JSON.parse(JSON.stringify(t));invalid.style.fontFamily='bad" onload="test';App.applyTemplate(invalid);const safe=App.S.style.fontFamily==='Arial'&&!App.buildFigure(false).svg.includes('onload=');
        App.applyTemplate(t);App.commit();
        return {undo,redo,template,roundTrip,preferences,legacyFont,safe};
      });
      assert.equal(r.undo,'Arial');assert.equal(r.redo,'Times New Roman');assert.equal(r.template,'Times New Roman');assert(r.roundTrip);assert.equal(r.preferences,'Times New Roman');assert.equal(r.legacyFont,'Arial');assert(r.safe);
    });
    await check('fonts: PNG/TIFF use the chosen glyphs and SVG text stays editable',async()=>{
      const r=await p.evaluate(async()=>{
        const original=App.S.style.fontFamily;
        // A large, unrotated panel label makes the glyph pixels observable independently of wrapping.
        App.S.style.panelLetter='AgW';App.S.style.panelPt=14;
        const samples=[];
        for(const font of ['Arial','Times New Roman']){
          App.S.style.fontFamily=font;const f=App.buildFigure(false),doc=new DOMParser().parseFromString(f.svg,'image/svg+xml');
          const label=Array.from(doc.querySelectorAll('text')).find(t=>t.textContent==='AgW');
          const canvas=await Export.svgToCanvas(f.svg,f.w,f.h,300),ctx=canvas.getContext('2d');
          // Count dark pixels in a fixed-width box around the panel label. It is otherwise blank.
          const x=(+label.getAttribute('x')-f.vx)*300/72,y=(+label.getAttribute('y')-f.vy)*300/72;
          const box=ctx.getImageData(Math.max(0,Math.floor(x-45*300/72)),Math.max(0,Math.floor(y-16*300/72)),Math.min(canvas.width,Math.ceil(x)),Math.ceil(20*300/72));
          let dark=0;for(let i=0;i<box.data.length;i+=4)if(box.data[i]<150)dark++;
          const result=[];const old=Export.deliver;Export.deliver=(blob,name)=>{result.push({blob,name});return true;};
          try{await Export.exportPNG(f.svg,f.w,f.h,300,'font.png',App.S);await Export.exportTIFF(f.svg,f.w,f.h,300,'font.tif',App.S);}finally{Export.deliver=old;}
          const tiff=await TIFF.decode(await result[1].blob.arrayBuffer());
          const raw=ctx.getImageData(0,0,canvas.width,canvas.height).data;
          // TIFF exposes normalised grayscale pixels; compare a useful sample against the same SVG render.
          let diff=0;for(let i=0;i<tiff.data.length;i+=97){const v=(.299*raw[i*4]+.587*raw[i*4+1]+.114*raw[i*4+2])/255;diff=Math.max(diff,Math.abs(tiff.data[i]-v));}
          samples.push({font,dark,diff,svgFont:doc.documentElement.getAttribute('font-family'),texts:doc.querySelectorAll('text').length,png:result[0].blob.size});
        }
        App.S.style.fontFamily=original;App.S.style.panelLetter='A';App.S.style.panelPt=8;App.commit();return samples;
      });
      assert.notEqual(r[0].dark,r[1].dark,'Serif and sans-serif raster labels must differ');
      for(const x of r){assert(x.dark>0);assert(x.diff<.005);assert(x.texts>10);assert(x.svgFont.includes(x.font));assert(x.png>1000);}
    });
    await check('fonts: all five PPTX faces persist without embedded font files',async()=>{
      for(const name of names){
        const f=await p.evaluate(async face=>{
          App.S.style.fontFamily=face;App.commit();const svg=App.buildFigure(false).svg,blob=await PPTX.build(),b=new Uint8Array(await blob.arrayBuffer());
          let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return {b64:btoa(s),svg};
        },name);
        const bytes=Buffer.from(f.b64,'base64'),entries=readPptx(bytes),slide=entries.get('ppt/slides/slide1.xml').toString('utf8'),theme=entries.get('ppt/theme/theme1.xml').toString('utf8');
        const faces=[...slide.matchAll(/typeface="([^"]+)"/g)].map(m=>m[1]);assert(faces.length>20);assert(faces.every(face=>face===name));assert(theme.includes(`typeface="${name}"`));
        assert(![...entries.keys()].some(n=>/^ppt\/fonts\//.test(n)));assert(!entries.get('ppt/presentation.xml').toString().includes('embeddedFontLst'));
        const id=name.replaceAll(' ','-');fs.writeFileSync(path.join(dir,id+'.pptx'),bytes);fs.writeFileSync(path.join(dir,id+'.svg'),f.svg);
      }
      await p.locator('#fontFamily').selectOption('Times New Roman');
      await p.locator('#preview > svg').screenshot({path:path.join(dir,'times-preview.png')});
      assert.deepEqual(errors,[]);assert.deepEqual(fontRequests,[]);
    });
    await check('fonts: offline single HTML and phone selector work without downloads',async()=>{
      const mctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
      try{
        const q=await mctx.newPage();let network=0;await q.route(/^https?:/,r=>{network++;r.abort();});
        await q.goto(pathToFileURL(path.join(root,'dist','GelFigure.html')).href+'?demo=1&lang=zh');
        await q.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
        await q.locator('#mNav [data-view="panel"]').tap();await q.evaluate(()=>document.getElementById('fontFamily').closest('details').open=true);
        await q.locator('#fontFamily').selectOption('Times New Roman');
        const info=await q.evaluate(()=>({font:App.S.style.fontFamily,svg:App.buildFigure(false).fontFamily,w:innerWidth,sw:document.documentElement.scrollWidth}));
        assert.equal(info.font,'Times New Roman');assert.equal(info.svg,'Times New Roman');assert.equal(info.w,info.sw);assert.equal(network,0);
        await q.locator('#fontFamily').scrollIntoViewIfNeeded();await q.screenshot({path:path.join(dir,'phone-font.png'),animations:'disabled'});
      }finally{await mctx.close();}
    });
  }catch(e){out.push(['FAIL','font runner',e.stack]);}finally{await ctx.close();}
  return out;
}
