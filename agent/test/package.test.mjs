import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import os from'node:os';import path from'node:path';import{spawnSync}from'node:child_process';
// Run explicitly after building a portable bundle; kept separate from normal source tests.
test('portable bundle starts without system Node or browser configuration',{skip:!process.env.GELFIGURE_PORTABLE_TEST},async()=>{
 const root=path.resolve(process.env.GELFIGURE_PORTABLE_TEST),workspace=await fs.mkdtemp(path.join(os.tmpdir(),'gel-portable-'));try{
  const launcher=path.join(root,process.platform==='win32'?'gelfigure.cmd':'gelfigure');const r=spawnSync(launcher,['doctor','--workspace',workspace],{encoding:'utf8',env:{...process.env,PATH:process.platform==='win32'?process.env.SystemRoot+'\\System32':'/usr/bin:/bin',PLAYWRIGHT_BROWSERS_PATH:'',NODE_PATH:''},timeout:60000,shell:process.platform==='win32'});assert.equal(r.status,0,r.stderr||r.stdout);const info=JSON.parse(r.stdout);assert.equal(info.status,'succeeded');assert(info.browserVersion);
 }finally{await fs.rm(workspace,{recursive:true,force:true});}
});
