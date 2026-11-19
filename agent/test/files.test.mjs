import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import os from'node:os';import path from'node:path';import{Workspace,checkDimensions,parseProject}from'../src/files.mjs';
import{AgentService}from'../src/service.mjs';
test('missing workspace produces a controlled error before starting a browser',async()=>{
 const s=new AgentService({workspace:path.join(os.tmpdir(),'gelfigure-impossible-missing-'+Date.now())});try{await assert.rejects(s.doctor(),e=>e.code==='ENOENT');assert.equal(s.runtime.browser,null);}finally{await s.close();}
});
test('source input format and declared dimensions are validated before decode',()=>{
 assert.throws(()=>checkDimensions(Buffer.from('junk')),e=>e.code==='INPUT_INVALID');assert.throws(()=>parseProject(Buffer.from('{}')),e=>e.code==='INPUT_INVALID');
 const p=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(p);p.writeUInt32BE(10,16);p.writeUInt32BE(20,20);assert.deepEqual(checkDimensions(p),{w:10,h:20});
});
test('output directories are exclusive and failed writes are clearly marked',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gelfigure-files-')),w=new Workspace(dir);try{
  await w.writeRun('one',{'a.json':'{}'});await assert.rejects(w.writeRun('one',{'a.json':'overwrite'}),e=>e.code==='OUTPUT_EXISTS');assert.equal(await fs.readFile(path.join(dir,'one/a.json'),'utf8'),'{}');
  await assert.rejects(w.writeRun('two',{'../outside':'data'}),e=>e.code==='OUTPUT_ERROR');assert.equal(JSON.parse(await fs.readFile(path.join(dir,'two/failure.json'),'utf8')).status,'failed');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('project crop and rotation bounds cannot allocate an unbounded canvas',()=>{
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(100,16);png.writeUInt32BE(100,20);
 const p={gelfigProject:1,source:{bytes:png.toString('base64')},state:{lanes:[{x:50}],crop:{x:0,y:0,w:1e9,h:1e9},rotation:0,orient:''}};assert.throws(()=>parseProject(Buffer.from(JSON.stringify(p))),e=>e.code==='INPUT_INVALID');
});
test('EXIF JPEG orientation is applied before project-orientation crop validation',()=>{
 const app=Buffer.alloc(32);app.writeUInt16BE(0xffe1,0);app.writeUInt16BE(30,2);app.write('Exif\0\0',4,'binary');app.write('II',10);app.writeUInt16LE(42,12);app.writeUInt32LE(8,14);app.writeUInt16LE(1,18);app.writeUInt16LE(0x112,20);app.writeUInt16LE(3,22);app.writeUInt32LE(1,24);app.writeUInt16LE(6,28);
 const frame=Buffer.from([255,192,0,11,8,0,60,0,80,1,1,17,0,255,218,0,2]);const jpg=Buffer.concat([Buffer.from([255,216]),app,frame]);assert.deepEqual(checkDimensions(jpg),{w:60,h:80});
 const p={gelfigProject:1,source:{bytes:jpg.toString('base64')},state:{lanes:[{x:30}],crop:{x:0,y:0,w:60,h:80},rotation:0,orient:''}};assert.equal(parseProject(Buffer.from(JSON.stringify(p))).state.crop.h,80);
});
