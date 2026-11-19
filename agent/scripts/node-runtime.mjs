import fs from'node:fs/promises';import os from'node:os';import path from'node:path';import crypto from'node:crypto';import{spawnSync}from'node:child_process';
// Fetch official redistributable binaries, rather than copying a Homebrew Node with external dylibs.
export async function officialNode(version='22.22.0'){
 const platform=process.platform,arch=process.arch;if(!['darwin','linux','win32'].includes(platform)||!['arm64','x64'].includes(arch))throw Error('Unsupported bundle platform/architecture');
 const osName=platform==='win32'?'win':platform,stem=`node-v${version}-${osName}-${arch}`,ext=platform==='win32'?'zip':'tar.gz',name=stem+'.'+ext,base=`https://nodejs.org/dist/v${version}/`;
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'gelfigure-node-'));
 const fetchBytes=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Official Node download failed: HTTP '+r.status);return Buffer.from(await r.arrayBuffer());};
 try{
  const sums=(await fetchBytes(base+'SHASUMS256.txt')).toString(),match=sums.split('\n').find(l=>l.trim().endsWith('  '+name));if(!match)throw Error('No official checksum for '+name);
  const bytes=await fetchBytes(base+name),actual=crypto.createHash('sha256').update(bytes).digest('hex');if(actual!==match.slice(0,64))throw Error('Official Node archive checksum mismatch');
  const archive=path.join(folder,name);await fs.writeFile(archive,bytes);
  const r=platform==='win32'?spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Expand-Archive -LiteralPath $env:GELFIGURE_NODE_ARCHIVE -DestinationPath $env:GELFIGURE_NODE_DEST'],{encoding:'utf8',env:{...process.env,GELFIGURE_NODE_ARCHIVE:archive,GELFIGURE_NODE_DEST:folder}}):spawnSync('tar',['-xzf',archive,'-C',folder],{encoding:'utf8'});
  if(r.status!==0)throw Error('Node extraction failed: '+r.stderr);
  return{binary:path.join(folder,stem,platform==='win32'?'node.exe':'bin/node'),license:path.join(folder,stem,'LICENSE'),cleanup:()=>fs.rm(folder,{recursive:true,force:true}),download:{url:base+name,sha256:actual}};
 }catch(e){await fs.rm(folder,{recursive:true,force:true});throw e;}
}
