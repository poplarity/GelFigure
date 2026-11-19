import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import os from'node:os';import path from'node:path';import zlib from'node:zlib';import{AgentService}from'../src/service.mjs';import{synthetic,completeSpec}from'./helpers.mjs';import{readPptx}from'../../tests/pptx.mjs';
test('export files have valid metadata, vector/editable labels, source checksum and physical dimensions',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gelfigure-export-')),s=new AgentService({workspace:dir});try{
 const original=await synthetic();await fs.writeFile(path.join(dir,'gel.tif'),original);await s.analyze({input:'gel.tif',out:'a'});const a=JSON.parse(await fs.readFile(path.join(dir,'a/analysis.json'),'utf8')),spec=completeSpec(a);spec.layout.figureWidthMm=65;spec.laneLabels[1].text='User label';
 const p=await s.prepare({analysis:'a/analysis.json',spec,out:'p'});assert.equal(p.status,'ready_to_render');const r=await s.render({plan:'p/plan.json',out:'r'});assert.equal(r.status,'succeeded');
 const png=await fs.readFile(path.join(dir,'r/figure.png'));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');let phys;
 for(let i=8;i<png.length;){const n=png.readUInt32BE(i),name=png.toString('ascii',i+4,i+8);if(name==='pHYs')phys=png.readUInt32BE(i+8);assert.notEqual(name,'eXIf');i+=n+12;}
 assert(Math.abs(phys*.0254-300)<.1);assert(Math.abs(png.readUInt32BE(16)/300*25.4-65)<.15);
 const pptx=readPptx(await fs.readFile(path.join(dir,'r/figure.pptx'))),slide=pptx.get('ppt/slides/slide1.xml').toString();assert(slide.includes('User label'));assert(slide.includes('<p:txBody>'));assert.equal([...pptx.keys()].filter(n=>n.startsWith('ppt/media/')).length,1);
 const project=JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(dir,'r/project.gelfig'))));assert.deepEqual(Buffer.from(project.source.bytes,'base64'),original);
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'r/manifest.json'),'utf8'));assert(manifest.files.every(f=>f.sha256.length===64));assert.equal(manifest.sourceSha256,a.source.sha256);assert((await fs.readFile(path.join(dir,'r/figure.svg'),'utf8')).includes('User label'));
 }finally{await s.close();await fs.rm(dir,{recursive:true,force:true});}
});
