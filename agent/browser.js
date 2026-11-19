/* Bounded facade over the SAME engine/render/export code as the webpage. Not loaded by the web app. */
(function(G){
 'use strict';const A=G.App,E=G.Engine;
 A.saveDraft=async()=>{};A.saveDraftSoon=()=>{};A.newCachedProject=()=>{};A.forceJsHash=true;
 const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;
 const b64=async b=>{const u=new Uint8Array(await b.arrayBuffer());let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode(...u.subarray(i,i+32768));return btoa(s);};
 const failure=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
 function workingMarkers(){const keep=new Set(A.figureLanes().filter(i=>!A.S.lanes[i].hidden));return A.S.markers.filter(m=>keep.has(m.lane));}
 function ids(){let n=0;const seen=new Set();A.S.lanes.forEach(l=>{if(!/^lane_\d{3,}$/.test(l.agentId||'')||seen.has(l.agentId)){do{l.agentId='lane_'+String(++n).padStart(3,'0');}while(seen.has(l.agentId));}seen.add(l.agentId);});}
 let fontInfo=[];
 async function fonts(){return Promise.all(['Arial','Times New Roman','Helvetica','Calibri','Cambria'].map(async name=>{let available=false;try{await new FontFace('gelfigure_probe','local(\"'+name+'\")').load();available=true;}catch{}return{name,available};}));}
 function summary(){
  const S=A.S,keep=A.figureLanes();
  return {engineVersion:A.VERSION,source:{sha256:S.file.sha256,name:S.file.name,width:A.rawSrc.w,height:A.rawSrc.h,bits:S.file.bits},coordinateSpace:'oriented-image-px',lanes:keep.map(i=>({id:S.lanes[i].agentId,number:i+1,x:S.lanes[i].x,name:S.lanes[i].name,hidden:!!S.lanes[i].hidden,marker:S.markers.some(m=>m.lane===i)})),markers:S.markers.filter(m=>keep.includes(m.lane)).map(m=>({laneId:S.lanes[m.lane].agentId,ladderId:m.ladderId,fitScore:m.score??null,matched:m.bands.filter(b=>b.matched||b.manual).length,total:m.bands.length,bands:m.bands.map(b=>({size:b.bp,y:b.y,matched:!!b.matched,manual:!!b.manual,show:!!b.show}))})),gelType:{value:A.gelKind(),confidence:A.gelDetection?.confidence??null,manual:!!A.gelDetection?.manual},rotation:S.rotation,crop:{...S.crop}};
 }
 function fitWidth(mm){
  const S=A.S;S.style.autoWidth=false;
  // Solve the total width (including labels) without shrinking fonts or moving any image feature.
  for(let i=0;i<12;i++){const f=A.buildFigure(false),delta=mm-f.w/G.Render.MM;if(Math.abs(delta)<.05)return;S.style.gelWidthMm=E.clamp(S.style.gelWidthMm+delta,10,180);}
 }
 function apply(spec){
  const S=A.S,at=id=>{const i=S.lanes.findIndex(l=>l.agentId===id);if(i<0)failure('UNKNOWN_LANE','Unknown lane '+id);return i;};
  if(spec.gelType)A.setGelType(spec.gelType);
  if(spec.laneLabels){A.figureLanes().filter(i=>!S.lanes[i].hidden).forEach(i=>{S.lanes[i].name='';delete S.lanes[i].nameRuns;});spec.laneLabels.forEach(l=>{const lane=S.lanes[at(l.laneId)];lane.name=l.text;lane.nameRuns=[{text:l.text}];});}
  const active=new Set(A.figureLanes().filter(i=>!S.lanes[i].hidden)),inactiveMarkers=S.markers.filter(m=>!active.has(m.lane)).map(m=>({...m,calibrationEnabled:false}));
  if(spec.markerPolicy==='omit'){S.markers=inactiveMarkers;S.arrows=S.arrows.map(a=>({...a,size:false,sizeText:''}));}
  else if(spec.markers){
   S.markers=inactiveMarkers.concat(spec.markers.map(q=>{const i=at(q.laneId),old=S.markers.find(m=>m.lane===i&&m.ladderId===q.ladderId);return old?{...old,calibrationEnabled:true,unit:q.unit||old.unit}:{...A.newMarker(i,q.ladderId),unit:q.unit||(spec.gelType==='protein'?'kDa':'bp'),userAssigned:true,ladderLocked:true,calibrationEnabled:true};}));
   A.matchMarkers(false,S.markers.filter(m=>active.has(m.lane)));
  }
  if(spec.groups)S.groups=spec.groups.map(g=>({from:at(g.from),to:at(g.to),text:g.text}));
  if(spec.conditions)S.conditions=spec.conditions.map(c=>({name:c.name,values:S.lanes.map(l=>c.values[l.agentId]||'')}));
  if(spec.image){
   if(spec.image.display==='colour'&&!A.hasColour())failure('NO_COLOUR_DATA','The source has no original colour data');
   A.setDisplayMode(spec.image.display||'gray');
   if(spec.image.invert!=null)S.levels.invert=spec.image.invert;
   if(spec.image.gamma!=null)S.levels.gamma=spec.image.gamma;
  }
  if(spec.layout){const v=spec.layout;for(const k of ['fontPt','fontFamily','labelAngle','laneNumbers'])if(v[k]!=null)S.style[k]=v[k];}
  if(spec.exports)S.style.dpi=spec.exports.dpi;
  if(spec.annotations){
   S.labels=[];S.notes=[];S.arrows=[];
   spec.annotations.forEach(v=>{
    if(v.type==='sideText')S.labels.push({text:v.text,pos:v.position});
    else if(v.type==='text')S.notes.push({kind:'text',text:v.text,x:S.crop.x+v.at.x*S.crop.w,y:S.crop.y+v.at.y*S.crop.h,angle:0});
    else if(v.type==='arrow'){
     const markers=workingMarkers();if(!markers.length)failure('MARKER_REQUIRED','A calibrated marker is needed for size-based arrows');
     const ranges=markers.map(m=>m.bands.filter(b=>b.matched||b.manual).map(b=>b.y)).filter(ys=>ys.length>=2);
     if(!ranges.length)failure('MARKER_REQUIRED','No calibrated band range is available');
     let lo=Math.max(S.crop.y,...ranges.map(ys=>Math.min(...ys))),hi=Math.min(S.crop.y+S.crop.h,...ranges.map(ys=>Math.max(...ys)));
     const top=A.estimateInfo(lo),bottom=A.estimateInfo(hi);
     if(hi<=lo||!top||!bottom||v.size>top.bp*(1+1e-10)||v.size<bottom.bp*(1-1e-10))failure('SIZE_OUTSIDE_CALIBRATION','Requested arrow size is outside the shared calibrated range');
     const target=Math.max(bottom.bp,Math.min(top.bp,v.size));
     for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(A.estimateInfo(mid).bp>target)lo=mid;else hi=mid;}
     S.arrows.push({y:(lo+hi)/2,text:v.text,size:true,side:'right',agentRequestedSize:v.size});
    }
   });
  }
  if(spec.layout?.figureWidthMm)fitWidth(spec.layout.figureWidthMm);
  A.updateSaturation();A.commit();return summary();
 }
 function quality(spec){
  const S=A.S,f=A.buildFigure(false),out=[],issue=(code,severity,message,evidence,acknowledgeable=false)=>out.push({code,severity,message,evidence,acknowledgeable});
  const k=A.clipStats(),bc=A.bandClipFrac(),eff=A.effectiveDpi();
  if(!A.isColour()&&k.sensorFrac>.0005)issue('SOURCE_SATURATION','warning','Source pixels are saturated; shorter exposure is recommended',{fraction:k.sensorFrac,pixels:k.sensor,pixelsInCrop:k.n,region:'current-crop',warningThreshold:.0005},true);
  else if(!A.isColour()&&k.sensor>0)issue('SOURCE_SATURATION_PRESENT','info','Saturated pixels remain in this crop below the warning threshold',{fraction:k.sensorFrac,pixels:k.sensor,pixelsInCrop:k.n,region:'current-crop',warningThreshold:.0005});
  if(bc>.001)issue('CONTRAST_CLIPPING','error','Display levels flatten band-side intensities',{fraction:bc});
  if(eff<300)issue('LOW_EFFECTIVE_DPI','error','Effective gel resolution is below 300 dpi; export DPI cannot recover detail',{effectiveDpi:eff});
  if(f.minPt<5)issue('MIN_FONT_SIZE','error','Printed text is below 5 pt',{minPt:f.minPt});
  if(f.overlaps.length)issue('LABEL_OVERLAP','warning','Text layout may overlap',{messages:f.overlaps},true);
  if(S.levels.gamma!==1&&!A.isColour())issue('NONLINEAR_GAMMA','warning','Nonlinear gamma must be disclosed in the legend',{gamma:S.levels.gamma},true);
  S.markers.filter(m=>A.figureLanes().includes(m.lane)&&!S.lanes[m.lane].hidden).forEach(m=>{
   if(m.bands.filter(b=>b.matched||b.manual).length<2)issue('MARKER_UNMATCHED','error','Marker lacks two calibrated bands',{laneId:S.lanes[m.lane].agentId,ladderId:m.ladderId});
  });
  if(S.arrows.some(a=>a.size&&A.estimateInfo(a.y)?.disagree))issue('MARKER_DISAGREEMENT','warning','Marker calibrations disagree at a requested arrow position',{requested:S.arrows.filter(a=>a.size).map(a=>({size:a.agentRequestedSize??null,estimated:A.estimateInfo(a.y)?.bp??null}))},true);
  const host=document.createElement('div');host.style.cssText='position:fixed;left:-100000px;top:0';host.innerHTML=f.svg;document.body.appendChild(host);
  try{const svg=host.querySelector('svg'),v=svg.viewBox.baseVal;let bad=0;for(const t of svg.querySelectorAll('text')){
   const r=t.getBoundingClientRect(),s=svg.getBoundingClientRect();if(r.left<s.left-.75||r.right>s.right+.75||r.top<s.top-.75||r.bottom>s.bottom+.75)bad++;
  }if(bad)issue('TEXT_BOUNDS','error','Text extends outside the exported figure',{count:bad});}finally{host.remove();}
  if(spec?.layout?.figureWidthMm&&Math.abs(f.w/G.Render.MM-spec.layout.figureWidthMm)>.15)issue('FIGURE_WIDTH_UNREACHABLE','error','Requested total width cannot be met without changing constraints',{requestedMm:spec.layout.figureWidthMm,actualMm:f.w/G.Render.MM});
  const dpi=spec?.exports?.dpi||S.style.dpi,w=Math.ceil(f.w/72*dpi),h=Math.ceil(f.h/72*dpi);
  if(w>16000||h>16000||w*h>64000000)issue('EXPORT_SIZE_LIMIT','error','Requested raster would exceed supported pixel limit',{width:w,height:h,maxPixels:64000000});
  const font=fontInfo.find(v=>v.name===S.style.fontFamily);if(font&&!font.available)issue('FONT_SUBSTITUTION','warning','Requested font is missing; the system fallback can change layout',{requested:S.style.fontFamily},true);
  issue('FONT_ENVIRONMENT','info','Fonts use this machine; cross-platform substitution can change layout',{requested:S.style.fontFamily,stack:G.Render.fontStack(S.style.fontFamily),embedded:false});
  return {issues:out,metrics:{figureWidthMm:f.w/G.Render.MM,figureHeightMm:f.h/G.Render.MM,effectiveGelDpi:eff,exportDpi:dpi,minPt:f.minPt,widthPx:w,heightPx:h}};
 }
 async function diagnostic(){
  A.renderFull();const S=A.S,c=document.createElement('canvas'),scale=Math.min(1,1400/A.fullCanvas.width,1100/A.fullCanvas.height);c.width=Math.ceil(A.fullCanvas.width*scale);c.height=Math.ceil(A.fullCanvas.height*scale);
  const ctx=c.getContext('2d');ctx.drawImage(A.fullCanvas,0,0,c.width,c.height);ctx.scale(scale,scale);ctx.strokeStyle='#ed4141';ctx.lineWidth=2/scale;ctx.strokeRect(S.crop.x,S.crop.y,S.crop.w,S.crop.h);ctx.font=`${13/scale}px Arial`;ctx.textAlign='center';
  A.figureLanes().forEach(i=>{const l=S.lanes[i];ctx.strokeStyle=S.markers.some(m=>m.lane===i)?'#e4ba00':'#2f6feb';ctx.beginPath();ctx.moveTo(l.x,S.crop.y);ctx.lineTo(l.x,S.crop.y+S.crop.h);ctx.stroke();ctx.fillStyle='#2f6feb';ctx.fillText(String(i+1),l.x,Math.max(16/scale,S.crop.y-6/scale));});
  return b64(await new Promise(r=>c.toBlob(r,'image/png')));
 }
 async function exportsFor(spec){
  const allMarkers=A.S.markers;A.S.markers=workingMarkers();const f=A.buildFigure(false),old=G.Export.deliver,files=[];G.Export.deliver=(blob,name)=>{files.push({blob,name});return true;};
  try{
   for(const format of spec.exports.formats){
    if(format==='png')await G.Export.exportPNG(f.svg,f.w,f.h,spec.exports.dpi,'figure.png',A.S);
    if(format==='tiff')await G.Export.exportTIFF(f.svg,f.w,f.h,spec.exports.dpi,'figure.tif',A.S);
    if(format==='svg')files.push({name:'figure.svg',blob:new Blob([f.svg],{type:'image/svg+xml'})});
    if(format==='pptx')files.push({name:'figure.pptx',blob:await G.PPTX.build()});
   }
   const preview=await G.Export.svgToCanvas(f.svg,f.w,f.h,Math.min(144,1600*72/f.w,1600*72/f.h));files.push({name:'preview.png',blob:await new Promise(r=>preview.toBlob(r,'image/png'))});
   return {files:await Promise.all(files.map(async v=>({name:v.name,base64:await b64(v.blob)}))),log:G.Export.processingLog(A.S),legend:G.Export.legendHints(A.S)};
  }finally{G.Export.deliver=old;A.S.markers=allMarkers;}
 }
 G.GelFigureAPI=Object.freeze({version:'1',engineVersion:A.VERSION,
  async load(input){
   if(input.project)await A.openProject(bytes(input.base64));else await A.load({name:input.name,buffer:bytes(input.base64)});
   if(!A.S)failure('INPUT_INVALID','Image loading failed');if(input.orientation)A.setOrient(input.orientation);if(input.gelType)A.setGelType(input.gelType);
   if(input.crop){const {x,y,w,h}=input.crop;if(x+w>A.ensureRot().w||y+h>A.ensureRot().h)failure('INVALID_SPEC','Crop lies outside the oriented image');A.S.crop={x,y,w,h};A.updateSaturation();}
   if(input.laneCount!=null)A.setCropLaneCount(input.laneCount);
   if(input.lanePositions){const c=A.S.crop;if(input.lanePositions.some(x=>x<c.x||x>c.x+c.w))failure('INVALID_SPEC','Lane positions must lie inside the crop');A.replaceLanes(input.lanePositions);if(input.lanePositions.length>1){A.S.lanePitch=(input.lanePositions.at(-1)-input.lanePositions[0])/(input.lanePositions.length-1);A.S.laneHalfW=A.S.lanePitch*.3;}}
   if(input.crop||input.laneCount!=null||input.lanePositions)A.detectMarkersInCrop();ids();
   await document.fonts.ready;fontInfo=await fonts();return summary();
  },summaryVersion:()=>A.VERSION,summary,apply,quality,diagnostic,exportsFor,fonts,project:async()=>({data:A.projectData(),base64:await b64(await A.projectBlob())}),
  ladders:()=>G.Ladders.all().map(l=>({id:l.id,name:l.name,kind:l.kind,sizes:l.sizes,ref:l.ref,custom:!!l.custom})),
  async call(method,arg){try{return {ok:true,value:await this[method](arg)};}catch(e){return {ok:false,error:{code:e.code||'RUNTIME_ERROR',message:e.message}};}}
 });
})(window);
