import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import zlib from 'node:zlib';
import {AgentService}from'../src/service.mjs';import {synthetic,completeSpec}from'./helpers.mjs';
let dir,service,a,ready;
test.before(async()=>{dir=await fs.mkdtemp(path.join(os.tmpdir(),'gelfigure-agent-'));await fs.writeFile(path.join(dir,'gel.tif'),await synthetic());service=new AgentService({workspace:dir});});
test.after(async()=>{await service?.close();await fs.rm(dir,{recursive:true,force:true});});
test('headless analysis returns measured evidence, stable ids and diagnostic but no final figure',async()=>{
 const r=await service.analyze({input:'gel.tif',out:'analysis'});assert.equal(r.status,'succeeded');a=JSON.parse(await fs.readFile(path.join(dir,'analysis/analysis.json'),'utf8'));assert(a.lanes.length>4);assert.equal(a.markers.length,1);assert(a.lanes.every(l=>/^lane_\d+$/.test(l.id)));assert(a.source.sha256);assert.equal(a.coordinateSpace,'oriented-image-px');assert((await fs.stat(path.join(dir,'analysis/diagnostic.png'))).size>1000);assert(!((await fs.readdir(path.join(dir,'analysis'))).some(f=>f==='figure.png')));
});
test('missing experimental semantics produces all questions and refuses final rendering',async()=>{
 const r=await service.prepare({analysis:'analysis/analysis.json',spec:{schemaVersion:'1',expectedRevision:a.revision},out:'incomplete'});assert.equal(r.status,'awaiting_answers');assert(r.questions.length>=4);await assert.rejects(service.render({plan:'incomplete/plan.json',out:'forbidden'}),e=>e.code==='PLAN_NOT_READY');await assert.rejects(fs.stat(path.join(dir,'forbidden')),e=>e.code==='ENOENT');
});
test('explicit answers prepare before all-format exports and standard project reopens',async()=>{
 const spec=completeSpec(a);const p=await service.prepare({analysis:'analysis/analysis.json',spec,out:'ready'});assert.equal(p.status,'ready_to_render',JSON.stringify(p));ready=p;
 const r=await service.render({plan:'ready/plan.json',out:'result'});assert.equal(r.status,'succeeded',JSON.stringify(r));for(const f of ['figure.png','figure.svg','figure.tif','figure.pptx','project.gelfig','quality-report.json','resolved-spec.json','manifest.json'])assert((await fs.stat(path.join(dir,'result',f))).size>0,f);
 const raw=await fs.readFile(path.join(dir,'result/project.gelfig'));const project=JSON.parse(zlib.gunzipSync(raw));assert.equal(project.gelfigProject,1);assert.equal(project.state.lanes.filter(l=>l.name.startsWith('Sample')).length,a.lanes.length-1);assert(project.source.sha256===a.source.sha256);
 const again=await service.analyze({input:'result/project.gelfig',out:'reopened'});assert.equal(again.status,'succeeded');const read=JSON.parse(await fs.readFile(path.join(dir,'reopened/analysis.json'),'utf8'));assert.deepEqual(read.lanes.map(l=>[l.id,l.name,l.x]),project.state.lanes.map(l=>[l.agentId,l.name,l.x]));
});
test('render rejects a tampered plan and a tampered project',async()=>{
 const plan=JSON.parse(await fs.readFile(path.join(dir,'ready/plan.json'),'utf8'));await fs.mkdir(path.join(dir,'bad'));await fs.copyFile(path.join(dir,'ready/project.gelfig'),path.join(dir,'bad/project.gelfig'));await fs.writeFile(path.join(dir,'bad/plan.json'),JSON.stringify({...plan,status:'awaiting_answers'}));await assert.rejects(service.render({plan:'bad/plan.json',out:'bad-result'}),e=>e.code==='PLAN_INTEGRITY');
 await fs.writeFile(path.join(dir,'bad/plan.json'),JSON.stringify(plan));const P=JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(dir,'bad/project.gelfig'))));P.state.lanes[1].name='tampered';await fs.writeFile(path.join(dir,'bad/project.gelfig'),zlib.gzipSync(JSON.stringify(P)));await assert.rejects(service.render({plan:'bad/plan.json',out:'bad-result2'}),e=>e.code==='STALE_REVISION');
});
test('revise makes a new gated plan and preserves original project',async()=>{
 const old=await fs.readFile(path.join(dir,'ready/project.gelfig'));const spec={expectedRevision:ready.revision,laneLabels:a.lanes.map(l=>({laneId:l.id,text:l.number===2?'KO':l.marker?'M':'Sample '+l.number}))};const r=await service.revise({plan:'ready/plan.json',spec,out:'revised'});assert.equal(r.status,'ready_to_render');assert.notEqual(r.revision,ready.revision);assert.deepEqual(await fs.readFile(path.join(dir,'ready/project.gelfig')),old);await service.render({plan:'revised/plan.json',out:'revised-result'});assert((await fs.readFile(path.join(dir,'revised-result/figure.svg'),'utf8')).includes('KO'));
});
test('path escapes, existing outputs, damaged inputs and invalid specs fail explicitly',async()=>{
 await assert.rejects(service.analyze({input:'../outside.tif',out:'escape'}),e=>e.code==='PATH_OUTSIDE_WORKSPACE');await assert.rejects(service.analyze({input:'gel.tif',out:'analysis'}),e=>e.code==='OUTPUT_EXISTS');await fs.writeFile(path.join(dir,'bad.tif'),'not a tiff');await assert.rejects(service.analyze({input:'bad.tif',out:'bad-input'}),e=>e.code==='INPUT_INVALID');await assert.rejects(service.prepare({analysis:'analysis/analysis.json',spec:{...completeSpec(a),image:{gamma:'1.2'}},out:'bad-spec'}),e=>e.code==='INVALID_SPEC');
});
test('a recomputed checksum cannot render a spec that was never applied to the bound project',async()=>{
 const {sealPlan}=await import('../src/common.mjs');const plan=JSON.parse(await fs.readFile(path.join(dir,'ready/plan.json'),'utf8'));plan.spec.laneLabels[1].text='Never prepared';const resealed=sealPlan(plan);await fs.mkdir(path.join(dir,'resigned'));await fs.copyFile(path.join(dir,'ready/project.gelfig'),path.join(dir,'resigned/project.gelfig'));await fs.writeFile(path.join(dir,'resigned/plan.json'),JSON.stringify(resealed));await assert.rejects(service.render({plan:'resigned/plan.json',out:'resigned-output'}),e=>e.code==='PLAN_SPEC_MISMATCH');
});
test('all supported kinds of semantic omission remain questions instead of accidental exports',async()=>{
 const r=await service.prepare({analysis:'analysis/analysis.json',spec:{...completeSpec(a),markerPolicy:'omit',markers:[],conflicts:[{id:'lane-order',field:'laneLabels',message:'Record and image order differ',resolved:false}]},out:'conflict'});assert.equal(r.status,'awaiting_answers');assert(r.questions.some(q=>q.id.startsWith('UNRESOLVED_CONFLICT')));
 const detector=await service.prepare({analysis:'analysis/analysis.json',spec:{...completeSpec(a),provenance:[{field:'markers',source:'detector',reference:'rank score',confirmed:true}]},out:'detector-only'});assert.equal(detector.status,'awaiting_answers');
});
test('symlink escapes and oversized dimensions never reach image decoding',async()=>{
 const other=await fs.mkdtemp(path.join(os.tmpdir(),'gelfigure-outside-'));try{await fs.writeFile(path.join(other,'gel.tif'),await fs.readFile(path.join(dir,'gel.tif')));await fs.symlink(other,path.join(dir,'outside-link'),process.platform==='win32'?'junction':'dir');await assert.rejects(service.analyze({input:'outside-link/gel.tif',out:'link-read'}),e=>e.code==='PATH_OUTSIDE_WORKSPACE');await assert.rejects(service.analyze({input:'gel.tif',out:'outside-link/write'}),e=>e.code==='PATH_OUTSIDE_WORKSPACE');}finally{await fs.rm(other,{recursive:true,force:true});}
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(20000,16);png.writeUInt32BE(20000,20);await fs.writeFile(path.join(dir,'huge.png'),png);await assert.rejects(service.analyze({input:'huge.png',out:'huge-run'}),e=>e.code==='INPUT_SIZE_LIMIT');
});
test('independent queued tasks do not share names or inferred marker libraries',async()=>{
 const r=await Promise.all([service.analyze({input:'gel.tif',out:'parallel-a'}),service.analyze({input:'gel.tif',out:'parallel-b'})]);assert.equal(r[0].revision,r[1].revision);assert(r.every(x=>x.summary.lanes.every(l=>l.name===''||l.name==='M')));
});
test('explicit crop and lane-count answers produce a new analysis revision and do not reuse stale bindings',async()=>{
 const r=await service.analyze({input:'gel.tif',out:'corrected',crop:{x:400,y:150,w:450,h:600,space:'oriented-image-px'},laneCount:5});const x=JSON.parse(await fs.readFile(path.join(dir,'corrected/analysis.json'),'utf8'));assert.equal(x.lanes.length,5);assert.deepEqual(x.crop,{x:400,y:150,w:450,h:600});assert.notEqual(r.revision,a.revision);await assert.rejects(service.prepare({analysis:'corrected/analysis.json',spec:completeSpec(a),out:'wrong-old-binding'}),e=>e.code==='STALE_REVISION');
});
