/* Marker-unit headings must stay attached to the scale, not float above the condition table. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readPptx} from './pptx.mjs';

export async function unitHeaderChecks(browser,base,root,engine){
  const results=[],ctx=await browser.newContext({viewport:{width:1500,height:1000}}),p=await ctx.newPage();
  const check=async(name,fn)=>{try{await fn();results.push(['ok',name]);}catch(e){results.push(['FAIL',name,e.message]);}};
  try {
    await p.goto(base+'/index.html?demo=1&lang=en');
    await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
    await check('unit headers: bp/kb/kDa stay at the gel edge with 0–4 condition rows',async()=>{
      const r=await p.evaluate(()=>{
        App.buildFigure(false);const gel=App._lastGel,R=App.renderState(false),host=document.createElement('div');
        host.style.cssText='position:fixed;left:-20000px;top:0';document.body.appendChild(host);
        // Layout geometry only; keep the test fast and independent of image encoding/painting.
        const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
        R.lanes.forEach((l,i)=>{l.name=i===0||i===R.lanes.length-1?'M':'Sample '+i;});
        R.groups=[{from:1,to:R.lanes.length-2,text:'Treatment group'}];R.preview=true;
        const ladder=JSON.parse(JSON.stringify(R.markers[0]));
        R.markers=[{...ladder,lane:0,side:'left'},{...ladder,lane:R.lanes.length-1,side:'right'}];
        const failures=[];let cases=0;
        const intersects=(a,b)=>a.left<b.right-.25&&b.left<a.right-.25&&a.top<b.bottom-.25&&b.top<a.bottom-.25;
        const inspect=(unit,count,pt,mp,cp,numbers,angle,family)=>{
          R.markers.forEach(m=>m.unit=unit);R.conditions=Array.from({length:count},(_,k)=>({name:['Drug A','Drug B','Induction','Long condition name'][k],values:R.lanes.map((_,i)=>i%2?'+':'−'),pt:cp}));
          Object.assign(R.style,{fontPt:pt,markerPt:mp,lanePt:pt,fontFamily:family,laneNumbers:numbers,labelAngle:angle,unitHeader:true});
          const f=Render.build(R,gel,pixel);host.innerHTML=f.svg;
          const texts=Array.from(host.querySelectorAll('text')),units=texts.filter(t=>t.textContent==='('+unit+')');
          if(units.length!==2)throw Error('Expected two unit headings');
          const others=texts.filter(t=>!units.includes(t));
          for(const u of units){
            const a=u.getBoundingClientRect();
            // Condition names/cells and marker values are horizontal. Lane labels may rotate; the
            // stress fixtures keep outer lanes named M, so these can be checked with real bounds too.
            const collision=others.find(t=>intersects(a,t.getBoundingClientRect()));
            if(collision){const b=collision.getBoundingClientRect();failures.push({unit,count,family,pt,mp,cp,numbers,angle,collision:collision.textContent,unitY:u.getAttribute('y'),otherY:collision.getAttribute('y'),unitBox:[a.top,a.bottom],otherBox:[b.top,b.bottom]});}
          }
          const y=units.map(t=>+t.getAttribute('y'));
          if(count && mp===7 && cp===7){
            // The block nearest the gel must sit at its usual baseline: the lane names in the default
            // order, the bottom condition row in the legacy one. Either way the unit header must not
            // reserve an empty row below it.
            // A tilted lane name carries its baseline in the wrapping group's translate and leaves the
            // <text> at y=0, so read the baseline from whichever of the two the render actually used.
            const baselineOf=el=>{
              const g=el.matches('text')?null:el.querySelector('g[transform]');
              const m=g&&/translate\(\s*([-\d.eE+]+)[,\s]+([-\d.eE+]+)/.exec(g.getAttribute('transform')||'');
              if(m)return +m[2];
              const t=el.matches('text')?el:el.querySelector('text');
              return t?+t.getAttribute('y'):NaN;
            };
            const nearest=R.style.laneNamesAboveConditions!==true
              ? Math.max(...Array.from(host.querySelectorAll('[data-edit="lane"]'),baselineOf).filter(Number.isFinite))
              : baselineOf(host.querySelector(`[data-edit="condname"][data-r="${count-1}"]`));
            const expected=-R.style.labelGapPt-(numbers?pt*1.25:0);
            if(Math.abs(nearest-expected)>.01)failures.push({error:'unnecessary blank row below conditions',unit,count,family,numbers,y:nearest,expected});
          }
          R.preview=false;const exportDoc=new DOMParser().parseFromString(Render.build(R,gel,pixel).svg,'image/svg+xml');R.preview=true;
          const exported=Array.from(exportDoc.querySelectorAll('text')).filter(t=>t.textContent==='('+unit+')').map(t=>+t.getAttribute('y'));
          if(JSON.stringify(y)!==JSON.stringify(exported))failures.push({error:'preview/export differ',y,exported});
          if(y[0]!==y[1])failures.push({error:'left/right headings differ',y});
          cases++;return y[0];
        };
        try{
          for(const family of Render.fontNames)for(const unit of ['bp','kb','kDa'])for(const numbers of [false,true]){
            const y0=inspect(unit,0,7,7,7,numbers,'0',family);
            for(const n of [1,4]){
              const y=inspect(unit,n,7,7,7,numbers,n===1?'45':'90',family);
              if(y!==y0)failures.push({error:'heading moved with annotation rows',unit,family,n,y0,y});
            }
          }
          for(const family of Render.fontNames)for(const [mp,cp] of [[4,14],[14,4],[14,14]])for(const numbers of [false,true])inspect('kDa',3,7,mp,cp,numbers,'45',family);
          return {cases,failures};
        }finally{host.remove();}
      });
      assert.equal(r.cases,120);assert.deepEqual(r.failures,[]);
    });
    await check('unit headers: crop-edge bands have room; hidden/auto units leave no blank row',async()=>{
      const r=await p.evaluate(()=>{
        App.buildFigure(false);const gel=App._lastGel,R=App.renderState(false),host=document.createElement('div');host.style.cssText='position:fixed;left:-20000px';document.body.appendChild(host);
        R.preview=true;R.conditions=[{name:'Drug',values:R.lanes.map(()=>'+'),pt:14}];R.style.markerPt=14;R.style.laneNumbers=false;R.style.unitHeader=true;
        const m=R.markers[0];m.unit='kDa';m.bands=[{bp:250,y:0,show:true},{bp:100,y:100,show:true}];
        try{
          const show=()=>{const f=Render.build(R,gel,App._gelHref);host.innerHTML=f.svg;return f;};
          show();const texts=Array.from(host.querySelectorAll('text')),unit=texts.find(t=>t.textContent==='(kDa)'),band=texts.find(t=>t.textContent==='250');
          const a=unit.getBoundingClientRect(),b=band.getBoundingClientRect(),clear=a.bottom<b.top;
          const condY=()=>+host.querySelector('[data-edit="condname"] text').getAttribute('y');const reserved=condY();
          R.style.unitHeader=false;show();const noHeader=!host.textContent.includes('(kDa)'),unreserved=condY();
          R.style.unitHeader=true;m.unit='auto';show();const auto=!host.textContent.includes('(kDa)'),autoY=condY();
          R.markers=[];show();const absent=condY();
          return {clear,noHeader,auto,reserved,unreserved,autoY,absent};
        }finally{host.remove();}
      });
      assert(r.clear);assert(r.noHeader);assert(r.auto);assert(r.reserved<r.unreserved);assert.equal(r.autoY,r.unreserved);assert.equal(r.absent,r.unreserved);
    });
    await check('unit headers: PPTX keeps editable headings at the SVG positions',async()=>{
      const r=await p.evaluate(async()=>{
        const S=App.S,fl=App.figureLanes();S.conditions=['Drug A','Drug B','Induction'].map(name=>({name,values:S.lanes.map((_,i)=>i%2?'+':'−')}));
        S.lanes.forEach((l,i)=>l.name=i===fl[0]?'M':'S'+(i+1));S.groups=[{from:fl[1],to:fl.at(-1),text:'Treatment'}];S.style.labelAngle='0';S.style.laneNumbers=false;App.commit();
        const f=App.buildFigure(false),doc=new DOMParser().parseFromString(f.svg,'image/svg+xml'),u=Array.from(doc.querySelectorAll('text')).find(t=>t.textContent==='(bp)');
        const b=new Uint8Array(await(await PPTX.build()).arrayBuffer());let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));
        const canvas=await Export.svgToCanvas(f.svg,f.w,f.h,300);
        return {b64:btoa(s),png:canvas.toDataURL('image/png').split(',')[1],svg:f.svg,y:+u.getAttribute('y'),vy:f.vy,pt:+u.getAttribute('font-size')};
      });
      const b=Buffer.from(r.b64,'base64'),entries=readPptx(b);
      const units=await p.evaluate(s=>{
        const d=new DOMParser().parseFromString(s,'application/xml'),a='http://schemas.openxmlformats.org/drawingml/2006/main',ns='http://schemas.openxmlformats.org/presentationml/2006/main';
        return Array.from(d.getElementsByTagNameNS(ns,'sp')).filter(sp=>Array.from(sp.getElementsByTagNameNS(a,'t')).some(t=>t.textContent==='(bp)')).map(sp=>+sp.getElementsByTagNameNS(a,'off')[0].getAttribute('y')/12700);
      },entries.get('ppt/slides/slide1.xml').toString('utf8'));
      assert.equal(units.length,1);assert(Math.abs(units[0]-(r.y-r.vy-r.pt*.91))<.001);
      const dir=path.join(root,'test-results','unit-header',engine);fs.mkdirSync(dir,{recursive:true});
      fs.writeFileSync(path.join(dir,'conditions.pptx'),b);fs.writeFileSync(path.join(dir,'conditions.svg'),r.svg);fs.writeFileSync(path.join(dir,'conditions.png'),Buffer.from(r.png,'base64'));
    });
  }catch(e){results.push(['FAIL','unit-header runner',e.stack]);}finally{await ctx.close();}
  return results;
}
