import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
export async function arrowSpacingChecks(browser,base,root,engine){
 const out=[],c=await browser.newContext(),p=await c.newPage();const check=async(name,fn)=>{try{await fn();out.push(['ok','arrow spacing: '+name]);}catch(e){out.push(['FAIL','arrow spacing: '+name,e.stack]);}};
 try{
  await p.goto(base+'/index.html?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
  await check('hidden or vertically cropped-out marker columns do not push arrows away',async()=>{
   const cases=await p.evaluate(()=>{
    const saved=App.snapshot(),results=[];
    try{for(const side of ['left','right'])for(const count of [0,1,2])for(const mode of ['hidden','outside']){
     App.S=JSON.parse(saved);const S=App.S,m=S.markers[0];S.markers=Array.from({length:count},(_,i)=>({...JSON.parse(JSON.stringify(m)),lane:i?5:m.lane,side}));
     S.markers.forEach(m=>m.bands.forEach(b=>{if(mode==='hidden')b.show=false;else{b.show=true;b.y=S.crop.y-100;}}));
     S.arrows=[{y:S.crop.y+S.crop.h*.4,text:'216 bp',size:false,side},{y:S.crop.y+S.crop.h*.55,text:'166 bp',size:false,side},{y:S.crop.y+S.crop.h*.75,text:'50 bp',size:false,side}];
     const before=JSON.stringify(S.markers),f=App.buildFigure(true),svg=new DOMParser().parseFromString(f.svg,'image/svg+xml');
     const gaps=[...svg.querySelectorAll('[data-edit="arrow"] path')].map(el=>{const x=+el.getAttribute('d').match(/^M([^,]+)/)[1];return side==='right'?x-f.gelW:-x;});
     results.push({side,count,mode,gaps,unchanged:before===JSON.stringify(S.markers)});
    }}finally{App.S=JSON.parse(saved);App.emit('loaded');}return results;
   });for(const x of cases){assert(x.unchanged);assert(x.gaps.every(v=>Math.abs(v-1.5)<.02),JSON.stringify(x));}
  });
  await check('visible marker labels still get space, while a hidden preceding column does not',async()=>{
   const r=await p.evaluate(()=>{
    const saved=App.snapshot(),S=App.S,original=JSON.parse(JSON.stringify(S.markers[0]));
    const gap=()=>{const f=App.buildFigure(true),svg=new DOMParser().parseFromString(f.svg,'image/svg+xml');return +svg.querySelector('[data-edit="arrow"] path').getAttribute('d').match(/^M([^,]+)/)[1]-f.gelW;};
    try{S.markers=[{...JSON.parse(JSON.stringify(original)),side:'right'}];S.arrows=[{y:S.crop.y+S.crop.h*.5,text:'Product',size:false,side:'right'}];const single=gap();
     S.markers.unshift({...JSON.parse(JSON.stringify(original)),lane:5,side:'right',bands:original.bands.map(b=>({...b,show:false}))});const withHidden=gap();
     return {single,withHidden};
    }finally{App.S=JSON.parse(saved);App.emit('loaded');}
   });assert(r.single>1.5);assert(Math.abs(r.single-r.withHidden)<.02);
  });
  await check('long edge names do not become an arrow offset',async()=>{
   const r=await p.evaluate(()=>{
    App.S.markers.forEach(m=>{m.side='right';m.bands.forEach(b=>b.show=false);});App.S.lanes.at(-1).name='A very long right-edge sample name';App.S.style.labelAngle='45';
    App.S.arrows=[{y:App.S.crop.y+App.S.crop.h*.5,text:'216 bp',size:false,side:'right'}];App.commit();const f=App.buildFigure(true),svg=new DOMParser().parseFromString(f.svg,'image/svg+xml');return +svg.querySelector('[data-edit="arrow"] path').getAttribute('d').match(/^M([^,]+)/)[1]-f.gelW;
   });assert(Math.abs(r-1.5)<.02);const dir=path.join(root,'test-results','arrow-spacing',engine);fs.mkdirSync(dir,{recursive:true});await p.screenshot({path:path.join(dir,'fixed.png')});
  });
 }finally{await c.close();}return out;
}
