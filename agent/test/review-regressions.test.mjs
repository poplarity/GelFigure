import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import os from'node:os';import path from'node:path';import zlib from'node:zlib';
import{AgentService}from'../src/service.mjs';import{revision}from'../src/common.mjs';import{checkDimensions}from'../src/files.mjs';import{synthetic,completeSpec}from'./helpers.mjs';
let dir,s,base;
test.before(async()=>{dir=await fs.mkdtemp(path.join(os.tmpdir(),'gel-agent-review-'));await fs.writeFile(path.join(dir,'gel.tif'),await synthetic());s=new AgentService({workspace:dir});await s.analyze({input:'gel.tif',out:'base'});base=JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(dir,'base/project.gelfig'))));});
test.after(async()=>{await s.close();await fs.rm(dir,{recursive:true,force:true});});
async function fixture(name,edit){const P=structuredClone(base);edit(P);await fs.writeFile(path.join(dir,name+'.gelfig'),zlib.gzipSync(JSON.stringify(P)));await s.analyze({input:name+'.gelfig',out:name+'-a'});return JSON.parse(await fs.readFile(path.join(dir,name+'-a/analysis.json'),'utf8'));}
async function saved(name){return JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(dir,name,'project.gelfig'))));}
test('hidden Marker manual calibration survives specifying only visible markers',async()=>{
 const a=await fixture('hidden',P=>{const last=P.state.lanes.length-1;P.state.lanes[last].hidden=true;P.state.markers.push({...structuredClone(P.state.markers[0]),lane:last,userAssigned:true,bands:P.state.markers[0].bands.map(b=>({...b,manual:true,y:b.y+10}))});});
 const spec=completeSpec(a);spec.markers=spec.markers.filter(m=>!a.lanes.find(l=>l.id===m.laneId).hidden);const p=await s.prepare({analysis:'hidden-a/analysis.json',spec,out:'hidden-p'});assert.equal(p.status,'ready_to_render');const P=await saved('hidden-p');const hidden=P.state.markers.find(m=>P.state.lanes[m.lane].hidden);assert(hidden&&hidden.bands.every(b=>b.manual),'hidden calibration was deleted');
});
test('marker omission removes inherited size claims but keeps plain arrow text and hidden calibration',async()=>{
 const a=await fixture('omit',P=>{P.state.arrows=[{text:'Target',size:true,sizeText:'1000 bp',y:P.state.crop.y+100}];P.state.brackets=[{text:'Smear',y1:P.state.crop.y+100,y2:P.state.crop.y+200,side:'right'}];});const spec={...completeSpec(a),markerPolicy:'omit',markers:[]};
 const p=await s.prepare({analysis:'omit-a/analysis.json',spec,out:'omit-p'});assert.equal(p.status,'ready_to_render');await s.render({plan:'omit-p/plan.json',out:'omit-final'});const svg=await fs.readFile(path.join(dir,'omit-final/figure.svg'),'utf8');assert(svg.includes('Target'));assert(!svg.includes('1000 bp'),'omitted Marker still produced an unsupported size');const log=JSON.parse(await fs.readFile(path.join(dir,'omit-final/processing-log.json'),'utf8'));assert.equal(log.brackets[0].sizeRange,null);
});
test('array replacement can explicitly clear existing lane labels',async()=>{
 const a=await fixture('labels',P=>{P.state.lanes[1].name='Previous';});const spec={...completeSpec(a),laneLabels:[],allowUnlabelledLanes:true};const p=await s.prepare({analysis:'labels-a/analysis.json',spec,out:'labels-p'});assert.equal(p.status,'ready_to_render');const P=await saved('labels-p');assert(P.state.lanes.filter(l=>!l.hidden).every(l=>l.name===''),'old labels remain despite replacement');
});
test('custom ladder definitions are part of project revision and render integrity',async()=>{
 const P=structuredClone(base);P.ladders=[{id:'custom_probe',kind:'dna',name:'Custom ladder',sizes:[1000,500],ref:[]}];const a=revision(P);P.ladders[0].name='Changed scientific model';assert.notEqual(revision(P),a);
});
test('validate preserves valid unanswered plans rather than applying unresolved settings',async()=>{
 const a=JSON.parse(await fs.readFile(path.join(dir,'base/analysis.json'),'utf8')),spec={...completeSpec(a),orientationConfirmed:false};const p=await s.prepare({analysis:'base/analysis.json',spec,out:'unanswered'});assert.equal(p.status,'awaiting_answers');const r=await s.validate({plan:'unanswered/plan.json'});assert.equal(r.status,'awaiting_answers');assert(r.questions.some(q=>q.id.startsWith('ORIENTATION_REQUIRED')));
});
test('TIFF dimensions guard every linked page, matching largest-page decoding',()=>{
 const b=Buffer.alloc(76);b.write('II');b.writeUInt16LE(42,2);b.writeUInt32LE(8,4);
 for(const [off,w,next]of[[8,1,42],[42,16001,0]]){b.writeUInt16LE(2,off);let e=off+2;b.writeUInt16LE(256,e);b.writeUInt16LE(4,e+2);b.writeUInt32LE(1,e+4);b.writeUInt32LE(w,e+8);e+=12;b.writeUInt16LE(257,e);b.writeUInt16LE(4,e+2);b.writeUInt32LE(1,e+4);b.writeUInt32LE(1,e+8);b.writeUInt32LE(next,off+26);}
 assert.throws(()=>checkDimensions(b),e=>e.code==='INPUT_SIZE_LIMIT');
});
test('size-based arrows use combined Marker calibration and expose disagreement before export',async()=>{
 const a=await fixture('arrows',P=>{const last=P.state.lanes.length-1;P.state.markers[0].userAssigned=true;P.state.markers[0].bands.forEach(b=>b.manual=b.matched);P.state.markers.push({...structuredClone(P.state.markers[0]),lane:last,userAssigned:true,bands:P.state.markers[0].bands.map(b=>({...b,manual:!!b.matched,y:b.y+20}))});});
 const spec=completeSpec(a);spec.annotations=[{type:'arrow',laneId:a.lanes[1].id,size:1000,text:'Target'}];const p=await s.prepare({analysis:'arrows-a/analysis.json',spec,out:'arrows-p'});assert.equal(p.status,'needs_review');assert(p.quality.some(i=>i.code==='MARKER_DISAGREEMENT'),'inconsistent calibrations were silently accepted');
});
test('exact upper and lower calibrated endpoint sizes remain valid despite floating rounding',async()=>{
 const a=await fixture('endpoints',P=>{P.state.markers[0].userAssigned=true;P.state.markers[0].bands=P.state.markers[0].bands.map(b=>({...b,show:[1000,500].includes(b.bp),matched:[1000,500].includes(b.bp),manual:[1000,500].includes(b.bp),excluded:![1000,500].includes(b.bp),y:b.bp===1000?212:b.bp===500?312:b.y}));});
 for(const size of [1000,500]){const spec=completeSpec(a);spec.annotations=[{type:'arrow',laneId:a.lanes[1].id,size,text:'Endpoint'}];const p=await s.prepare({analysis:'endpoints-a/analysis.json',spec,out:'endpoint-'+size});assert.equal(p.status,'ready_to_render',JSON.stringify(p));}
});
