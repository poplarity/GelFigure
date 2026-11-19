#!/usr/bin/env node
import fs from'node:fs/promises';import path from'node:path';import{spawnSync}from'node:child_process';import{pathToFileURL}from'node:url';
export async function archiveBundle(input,output){
 const source=await fs.realpath(input),out=path.resolve(output);if(!out.endsWith('.tar.gz'))throw Error('Portable archives must end in .tar.gz');
 try{await fs.lstat(out);throw Error('Archive output already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.mkdir(path.dirname(out),{recursive:true});const r=spawnSync('tar',['-czf',out,'-C',path.dirname(source),path.basename(source)],{encoding:'utf8'});if(r.status!==0)throw Error('Archive failed: '+r.stderr);return out;
}
export async function extractBundle(archive,destination){
 const full=path.resolve(destination);await fs.mkdir(full);const r=spawnSync('tar',['-xzf',path.resolve(archive),'-C',full],{encoding:'utf8'});if(r.status!==0)throw Error('Extraction failed: '+r.stderr);return full;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const [op,input,output]=process.argv.slice(2);if(!input||!output||!['pack','extract'].includes(op))throw Error('Usage: archive.mjs pack DIRECTORY ARCHIVE.tar.gz | extract ARCHIVE.tar.gz NEW_DIRECTORY');
 console.log(await(op==='pack'?archiveBundle(input,output):extractBundle(input,output)));
}
