import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {readPptx} from './pptx.mjs';

// Independent tiny uncompressed TIFF fixtures, without using the app's encoder.
function fixture({bits=8,planar=1,le=true,palette=false,alpha=0,hdr=false}={}){
  const w=16,h=12,n=w*h,spp=palette?1:alpha?4:3,N=1<<bits;
  const paletteRGB=Array.from({length:palette?N:0},(_,i)=>[i*47%256,(255-i*19)&255,i*83%256]);
  const samples=[],expected=[];
  for(let i=0;i<n;i++){
    const rgb=palette?paletteRGB[i%N]:[(i*19)%256,(i*7+30)%256,(i*29+100)%256];
    const a=alpha?128:255;
    const stored=alpha===1?rgb.map(v=>Math.round(v*a/255)):rgb;
    if(palette)samples.push(i%N);else samples.push(...stored.map(v=>bits===32?v/255*(hdr?2:1):bits===16?v*257:v),...(alpha?[bits===32?a/255:bits===16?a*257:a]:[]));
    expected.push(...stored.map(v=>Math.round((alpha===1?v:v*a/255)+255-a)));
  }
  const raw=new Uint8Array(palette?Math.ceil(w*bits/8)*h:n*spp*(bits/8)),rv=new DataView(raw.buffer);
  if(palette)for(let i=0;i<n;i++){const x=i%w,y=Math.floor(i/w),bit=x*bits;raw[y*Math.ceil(w*bits/8)+(bit>>3)]|=samples[i]<<(8-bits-(bit&7));}
  else for(let i=0;i<n;i++)for(let c=0;c<spp;c++){const off=(planar===2?c*n+i:i*spp+c)*(bits/8);if(bits===32)rv.setFloat32(off,samples[i*spp+c],le);else if(bits===16)rv.setUint16(off,samples[i*spp+c],le);else raw[off]=samples[i*spp+c];}
  const strips=planar===2?spp:1,size=raw.length/strips;
  const entries=[[256,4,[w]],[257,4,[h]],[258,3,Array(spp).fill(bits)],[259,3,[1]],[262,3,[palette?3:2]],[273,4,Array(strips).fill(0)],[277,3,[spp]],[278,4,[h]],[279,4,Array(strips).fill(size)],[284,3,[planar]]];
  if(palette)entries.push([320,3,[...paletteRGB.map(c=>c[0]*257),...paletteRGB.map(c=>c[1]*257),...paletteRGB.map(c=>c[2]*257)]]);
  if(alpha)entries.push([338,3,[alpha]]);
  if(bits===32)entries.push([339,3,[3]]);
  entries.sort((a,b)=>a[0]-b[0]);let offset=8+2+entries.length*12+4;
  for(const e of entries){const len=e[2].length*(e[1]===3?2:4);if(len>4){e[3]=offset;offset+=len;}}
  const start=offset;entries.find(e=>e[0]===273)[2]=Array.from({length:strips},(_,i)=>start+i*size);
  const bytes=new Uint8Array(start+raw.length),dv=new DataView(bytes.buffer);
  bytes[0]=bytes[1]=le?73:77;dv.setUint16(2,42,le);dv.setUint32(4,8,le);dv.setUint16(8,entries.length,le);
  entries.forEach(([tag,type,vals,extra],i)=>{const p=10+i*12;dv.setUint16(p,tag,le);dv.setUint16(p+2,type,le);dv.setUint32(p+4,vals.length,le);if(extra)dv.setUint32(p+8,extra,le);vals.forEach((v,j)=>{const o=(extra||p+8)+j*(type===3?2:4);if(type===3)dv.setUint16(o,v,le);else dv.setUint32(o,v,le);});});
  bytes.set(raw,start);return {bytes,expected,w,h};
}
export async function colourChecks(browser,base,root,engine){
  const results=[],ctx=await browser.newContext({viewport:{width:1600,height:960}}),p=await ctx.newPage(),errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  const check=async(name,fn)=>{try{await fn();results.push(['ok',name]);}catch(e){results.push(['FAIL',name,e.stack]);}};
  const dir=path.join(root,'test-results','colour',engine);fs.mkdirSync(dir,{recursive:true});
  let source;
  try{
    await p.goto(base+'/index.html?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
    await check('colour: RGB/palette TIFF values, endian, planar and alpha are preserved',async()=>{
      const variants=[{}, {planar:2}, {bits:16}, {bits:16,planar:2,le:false}, {bits:8,palette:true}, {bits:4,palette:true}, {alpha:1}, {alpha:2}, {bits:32}, {bits:32,alpha:2,hdr:true}];
      for(let i=0;i<variants.length;i++){
        const f=fixture(variants[i]);fs.writeFileSync(path.join(dir,`input-${i}.tif`),f.bytes);
        const r=await p.evaluate(async bytes=>{const d=await TIFF.decode(Uint8Array.from(bytes).buffer);return {rgb:Array.from(d.rgb||[]),w:d.width,h:d.height,data:Array.from(d.data)};},Array.from(f.bytes));
        assert.equal(r.w,f.w);assert.equal(r.h,f.h);
        if(variants[i].bits===32)assert(Math.max(...r.rgb.map((v,k)=>Math.abs(v-f.expected[k])))<=1);else assert.deepEqual(r.rgb,f.expected,JSON.stringify(variants[i]));
        assert(r.data.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
      }
      const png=await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=2;c.height=1;const id=new ImageData(Uint8ClampedArray.of(255,0,0,128,0,0,255,255),2,1);c.getContext('2d').putImageData(id,0,0);const b=await new Promise(r=>c.toBlob(r));const d=await TIFF.decodeBuffer(await b.arrayBuffer(),'alpha.png');return Array.from(d.rgb);});
      assert.deepEqual(png,[255,127,127,0,0,255]);
    });
    await check('colour: RGB rotation follows the grayscale geometry pixel-for-pixel',async()=>{
      const r=await p.evaluate(()=>{
        const w=41,h=33,rgb=new Uint8Array(w*h*3);for(let i=0;i<rgb.length;i++)rgb[i]=(i*37)%256;
        let error=0,identity=true;
        for(const deg of [0,-12.3,4.5]){
          const id=Colour.toImageData(rgb,w,h,deg);
          for(let c=0;c<3;c++){const data=Float32Array.from({length:w*h},(_,i)=>rgb[i*3+c]/255),r=Engine.rotate({w,h,data},deg);for(let i=0;i<data.length;i++){error=Math.max(error,Math.abs(id.data[i*4+c]-Math.round(r.data[i]*255)));if(!deg&&id.data[i*4+c]!==rgb[i*3+c])identity=false;}}
        }
        return {error,identity};
      });assert(r.identity);assert(r.error<=1);
    });
    // Synthetic blue-stained gel with coloured reference bands; no experimental data.
    source=await p.evaluate(async()=>{
      const g=Demo.makeProteinGel(),n=g.width*g.height,rgb=new Uint8Array(n*3),t=g.truth;
      for(let i=0;i<n;i++){
        const v=Math.max(0,Math.min(1,g.data[i])),x=i%g.width,y=Math.floor(i/g.width);
        let band=[24,44,148];
        if(Math.abs(x-t.x0)<t.pitch*.4){if(Math.abs(y-t.yOf(75))<15)band=[200,28,36];if(Math.abs(y-t.yOf(25))<15)band=[24,154,68];}
        for(let c=0;c<3;c++)rgb[i*3+c]=Math.round([244,246,250][c]*(1-v)+band[c]*v);
      }
      const buffer=Export.encodeTiffRGB(rgb,g.width,g.height,300,'Synthetic colour gel');
      const bytes=new Uint8Array(buffer);let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));
      window.colourSource={name:'synthetic-colour.tif',buffer};await App.load(window.colourSource);
      return btoa(s);
    });fs.writeFileSync(path.join(dir,'synthetic-colour.tif'),Buffer.from(source,'base64'));
    await check('colour: new imports default to grayscale; switching keeps detection, crop and annotations',async()=>{
      const r=await p.evaluate(()=>{
        const S=App.S,fl=App.figureLanes();S.lanes[fl[1]].name='Sample';S.groups=[{from:fl[1],to:fl.at(-1),text:'Synthetic protein gel'}];S.arrows=[{y:S.crop.y+S.crop.h*.5,text:'Target',size:false}];
        S.levels={black:.2,white:.7,gamma:2,invert:true};App.commit();
        const geometry=()=>JSON.stringify({rotation:App.S.rotation,crop:App.S.crop,lanes:App.S.lanes,markers:App.S.markers,groups:App.S.groups,arrows:App.S.arrows});
        const before=geometry(),data=App.src.data,mode=App.S.displayMode;App.renderFull();
        const initial=App.fullCanvas.getContext('2d').getImageData(0,0,App.src.w,App.src.h).data;let initialGray=true;
        for(let i=0;i<initial.length;i+=388)if(initial[i]!==initial[i+1]||initial[i+1]!==initial[i+2])initialGray=false;
        App.setDisplayMode('colour');const switchedWithoutEdits=geometry()===before;App.setRotation(0);const beforeRotation=geometry();App.commit();App.renderFull();
        const id=App.fullCanvas.getContext('2d').getImageData(0,0,App.src.w,App.src.h).data;let difference=0;
        for(let i=0;i<App.src.w*App.src.h;i+=97)for(let c=0;c<3;c++)difference=Math.max(difference,Math.abs(id[i*4+c]-App.sourceRGB[i*3+c]));
        const palette=App.displayInfo(),hints=Export.legendHints(App.S),clip=App.bandClipFrac();
        document.querySelector('[data-display="gray"]').click();App.renderFull();const g=App.fullCanvas.getContext('2d').getImageData(0,0,App.src.w,App.src.h).data;let gray=true;
        for(let i=0;i<g.length;i+=388)if(g[i]!==g[i+1]||g[i+1]!==g[i+2])gray=false;
        const kept=geometry()===beforeRotation&&data===App.src.data,lv=JSON.stringify(App.S.levels);
        document.querySelector('[data-display="colour"]').click();App.renderFull();
        return {mode,initialGray,switchedWithoutEdits,difference,gray,kept,colourBack:App.isColour(),lvKept:JSON.stringify(App.S.levels)===lv,palette,hints,clip,hidden:document.getElementById('grayAdjustments').classList.contains('hidden'),log:Export.processingLog(App.S).display};
      });
      assert.equal(r.mode,'gray');assert(r.initialGray&&r.switchedWithoutEdits);assert.equal(r.difference,0);assert(r.gray&&r.kept&&r.colourBack&&r.lvKept&&r.hidden);assert.equal(r.clip,0);assert.equal(r.log.mode,'original-colour');assert(!r.hints.some(t=>t.includes('non-linear')||t.includes('inverted')));
    });
    await check('colour: PNG/TIFF/SVG/PPTX and uncropped output retain RGB',async()=>{
      const r=await p.evaluate(async()=>{
        const S=App.S,fl=App.figureLanes();S.lanes[fl[3]].hidden=true;S.boxes=[{x:S.crop.x+S.crop.w*.2,y:S.crop.y+S.crop.h*.3,w:S.crop.w*.4,h:S.crop.h*.2,text:'Inset',zoom:2,dash:true}];App.commit();
        const f=App.buildFigure(false),pngs=[],old=Export.deliver;
        Export.deliver=(blob,name)=>{pngs.push({blob,name});return true;};
        try{await Export.exportPNG(f.svg,f.w,f.h,300,'figure.png',S);await Export.exportTIFF(f.svg,f.w,f.h,300,'figure.tif',S);}finally{Export.deliver=old;}
        const b64=async blob=>{const b=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(s);};
        const tif=await TIFF.decode(await pngs[1].blob.arrayBuffer());
        const original=await new Promise(resolve=>{Export.deliver=(b,n)=>{Export.deliver=old;resolve(b);return true;};Export.exportUncropped(S,App.fullCanvas,'uncropped.png');});
        const origBytes=await new Promise(resolve=>{Export.deliver=(b,n)=>{Export.deliver=old;resolve(b);return true;};Export.exportOriginal(S,App.srcBuffer);});
        return {png:await b64(pngs[0].blob),tif:await b64(pngs[1].blob),svg:f.svg,pptx:await b64(await PPTX.build()),uncropped:await b64(original),original:await b64(origBytes),rgb:!!tif.rgb,spp:tif.spp,dpi:tif.dpi,full:App.fullCanvas.toDataURL('image/png').split(',')[1]};
      });assert(r.rgb);assert.equal(r.spp,3);assert.equal(r.dpi,300);assert.equal(r.original,source);
      for(const k of ['png','tif','pptx','uncropped'])fs.writeFileSync(path.join(dir,k==='uncropped'?'uncropped.png':'figure.'+k),Buffer.from(r[k],'base64'));
      fs.writeFileSync(path.join(dir,'figure.svg'),r.svg);
      const parts=readPptx(Buffer.from(r.pptx,'base64'));
      // the media file is the canvas' pixels with the canvas' metadata blocks cleaned off, so compare
      // the decoded scanlines rather than the encoded bytes (WebKit adds an eXIf block)
      const media=parts.get('ppt/media/gel.png');
      const scan=b=>{const d=[];for(let o=8;o<b.length;){const n=b.readUInt32BE(o),t=b.toString('ascii',o+4,o+8);if(t==='IDAT')d.push(b.subarray(o+8,o+8+n));o+=n+12;}return zlib.inflateSync(Buffer.concat(d));};
      assert.deepEqual(scan(media),scan(Buffer.from(r.full,'base64')));
      assert(parts.get('ppt/slides/slide1.xml').toString().includes('<a:srcRect'));
      const images=await p.evaluate(async({png,tif,uncropped})=>{
        const buf=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;
        const a=await TIFF.decodeBuffer(buf(png),'figure.png'),b=await TIFF.decode(buf(tif)),u=await TIFF.decodeBuffer(buf(uncropped),'uncropped.png');
        let diff=0;for(let i=0;i<a.rgb.length;i++)diff=Math.max(diff,Math.abs(a.rgb[i]-b.rgb[i]));return {diff,uncropped:!!u.rgb};
      },r);assert.equal(images.diff,0);assert(images.uncropped);
    });
    await check('colour: projects, templates, undo and legacy files preserve their intended mode',async()=>{
      const r=await p.evaluate(async()=>{
        const template=JSON.parse(JSON.stringify(App.template())),file=await App.projectBlob();
        App.setDisplayMode('gray');App.commit();App.undo();const undo=App.isColour();App.redo();const redo=!App.isColour();
        App.applyTemplate(template);App.commit();const templated=App.isColour();
        await App.openProject(await file.arrayBuffer());const project=App.isColour();
        const legacy=JSON.parse(JSON.stringify(App.projectData()));delete legacy.state.displayMode;await App.openProject(new TextEncoder().encode(JSON.stringify(legacy)).buffer);const legacyGray=!App.isColour()&&App.hasColour();
        await App.load({name:'gray.tif',buffer:Demo.encodeTiff16(Demo.makeGel())});App.applyTemplate(template);App.commit();
        return {undo,redo,templated,project,legacyGray,noColour:!App.hasColour()&&!App.isColour(),disabled:document.querySelector('[data-display="colour"]').disabled};
      });assert(Object.values(r).every(Boolean),JSON.stringify(r));
    });
    await check('colour: same-size exposure switching replaces colour pixels without losing names',async()=>{
      const r=await p.evaluate(async()=>{
        const a=window.colourSource,d=await TIFF.decode(a.buffer),rgb=d.rgb.map(v=>255-v),b={name:'colour-b.tif',buffer:Export.encodeTiffRGB(rgb,d.width,d.height,300,'Synthetic')};
        await App.loadMany([a,b]);const defaultGray=!App.isColour();App.S.lanes[0].name='Keep name';App.setDisplayMode('colour');App.commit();const next=1-App.expIdx;
        const target=await TIFF.decode(App.exposures[next].buffer);await App.switchExposure(next);App.setRotation(0);App.renderFull();
        const pixels=App.fullCanvas.getContext('2d').getImageData(0,0,App.src.w,App.src.h).data;
        let diff=0;for(let i=0;i<target.rgb.length/3;i+=131)for(let c=0;c<3;c++)diff=Math.max(diff,Math.abs(pixels[i*4+c]-target.rgb[i*3+c]));
        return {defaultGray,kept:App.S.lanes[0].name==='Keep name',mode:App.isColour(),diff};
      });assert(r.defaultGray&&r.kept&&r.mode);assert.equal(r.diff,0);
    });
    await check('colour: offline phone can switch modes and export a colour TIFF',async()=>{
      const mctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
      try{
        const q=await mctx.newPage();await q.route(/^https?:/,r=>r.abort());await q.goto(pathToFileURL(path.join(root,'dist','GelFigure.html')).href+'?demo=1&lang=zh');await q.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
        await q.evaluate(async s=>{const buffer=Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;await App.load({name:'synthetic-colour.tif',buffer});App.setPref('preflight',false);},source);
        await q.locator('#mNav [data-view="panel"]').tap();await q.locator('[data-display="gray"]').tap();assert.equal(await q.evaluate(()=>App.isColour()),false);await q.locator('[data-display="colour"]').tap();
        await q.screenshot({path:path.join(dir,'phone-colour.png'),animations:'disabled'});
        await q.locator('#mExport').tap();await q.locator('#mDpiSeg [data-dpi="300"]').tap();await q.locator('[data-x="tiff"]').tap();await q.waitForFunction(()=>!document.getElementById('resultSheet').classList.contains('hidden'),null,{timeout:30000});
        assert((await q.locator('#rsName').textContent()).endsWith('.tif'));assert.equal(await q.evaluate(()=>innerWidth===document.documentElement.scrollWidth),true);
      }finally{await mctx.close();}
      assert.deepEqual(errs,[]);
    });
  }catch(e){results.push(['FAIL','colour runner',e.stack]);}finally{await ctx.close();}
  return results;
}
