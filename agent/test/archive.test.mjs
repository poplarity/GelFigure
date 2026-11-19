import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import os from'node:os';import path from'node:path';import{archiveBundle,extractBundle}from'../scripts/archive.mjs';
test('distribution archive retains executable permissions after extraction',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gel-archive-'));try{
  const source=path.join(dir,'bundle');await fs.mkdir(path.join(source,'runtime'),{recursive:true});for(const f of ['gelfigure','runtime/node','runtime/chromium'])await fs.writeFile(path.join(source,f),'executable',{mode:0o755});
  const archive=await archiveBundle(source,path.join(dir,'portable.tar.gz'));await extractBundle(archive,path.join(dir,'restored'));
  for(const f of ['gelfigure','runtime/node','runtime/chromium']){const st=await fs.stat(path.join(dir,'restored/bundle',f));if(process.platform!=='win32')assert.equal(st.mode&0o111,0o111,f);}
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
