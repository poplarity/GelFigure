import fs from 'node:fs/promises';import path from 'node:path';import zlib from 'node:zlib';
import {AgentError}from'./common.mjs';
export const MAX_INPUT=64*1024*1024,MAX_JSON=4*1024*1024,MAX_PROJECT_JSON=160*1024*1024;
export class Workspace{
 constructor(root){this.path=root;this.ready=this.init();this.ready.catch(()=>{});}
 async init(){if(typeof this.path!=='string'||!path.isAbsolute(this.path))throw new AgentError('WORKSPACE_REQUIRED','An absolute existing workspace directory is required');this.path=await fs.realpath(this.path);if(!(await fs.stat(this.path)).isDirectory())throw new AgentError('WORKSPACE_REQUIRED','Workspace must be a directory');}
 contains(p){const r=path.relative(this.path,p);return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));}
 async resolve(p,existing=true){
  await this.ready;if(typeof p!=='string'||!p||p.includes('\0')||/^[a-z][a-z\d+.-]*:\/\//i.test(p))throw new AgentError('INVALID_PATH','Use a local file path');
  const full=path.resolve(this.path,p);if(!this.contains(full))throw new AgentError('PATH_OUTSIDE_WORKSPACE','Path is outside the configured workspace');
  let current=full;
  while(true){try{const real=await fs.realpath(current);if(!this.contains(real))throw new AgentError('PATH_OUTSIDE_WORKSPACE','A symbolic link escapes the workspace');if(existing&&current!==full)throw new AgentError('INPUT_NOT_FOUND','Input file does not exist');return full;}catch(e){if(e instanceof AgentError)throw e;if(e.code!=='ENOENT')throw e;if(existing)throw new AgentError('INPUT_NOT_FOUND','Input file does not exist');const parent=path.dirname(current);if(parent===current)throw new AgentError('INVALID_PATH','Cannot resolve path');current=parent;}}
 }
 async read(p,limit=MAX_INPUT){const full=await this.resolve(p),st=await fs.stat(full);if(!st.isFile())throw new AgentError('INVALID_PATH','Input must be a regular file');if(st.size>limit)throw new AgentError('INPUT_SIZE_LIMIT','Input exceeds byte limit',{limit,bytes:st.size});return {full,bytes:await fs.readFile(full)};}
 async json(p){const {full,bytes}=await this.read(p,MAX_JSON);try{return {full,data:JSON.parse(bytes.toString('utf8'))};}catch{throw new AgentError('INPUT_INVALID','Input JSON is invalid');}}
 async available(p){const full=await this.resolve(p,false);try{await fs.lstat(full);throw new AgentError('OUTPUT_EXISTS','Output directory already exists; choose a new run directory');}catch(e){if(e.code!=='ENOENT')throw e;}return full;}
 async writeRun(out,files){
  const full=await this.available(out);await fs.mkdir(path.dirname(full),{recursive:true});await this.resolve(path.dirname(full));
  try{await fs.mkdir(full);}catch(e){if(e.code==='EEXIST')throw new AgentError('OUTPUT_EXISTS','Output directory already exists');throw e;}
  try{for(const [name,contents]of Object.entries(files)){if(!/^[\w.-]+$/.test(name))throw new AgentError('INVALID_PATH','Invalid artifact filename');await fs.writeFile(path.join(full,name),contents,{flag:'wx'});}return full;}
  catch(e){await fs.writeFile(path.join(full,'failure.json'),JSON.stringify({status:'failed',code:e.code||'OUTPUT_ERROR',message:'Run did not complete'})).catch(()=>{});throw new AgentError('OUTPUT_ERROR','Could not finish writing the task output',{cause:e.code});}
 }
 relative(p){return path.relative(this.path,p).split(path.sep).join('/');}
}
export function parseProject(buffer){
 try{
  const bytes=buffer[0]===31&&buffer[1]===139?zlib.gunzipSync(buffer,{maxOutputLength:MAX_PROJECT_JSON}):buffer;
  if(bytes.length>MAX_PROJECT_JSON)throw Error('too large');const p=JSON.parse(bytes.toString('utf8'));
  if(p.gelfigProject!==1||!p.source||typeof p.source.bytes!=='string'||p.source.bytes.length>MAX_INPUT*4/3+8||!p.state||!Array.isArray(p.state.lanes)||p.state.lanes.length>60||p.state.lanes.length<1)throw Error('bad project');
  for(const key of ['markers','conditions','groups','arrows','boxes','brackets','labels','notes'])if(p.state[key]!=null&&(!Array.isArray(p.state[key])||p.state[key].length>500))throw Error('invalid annotation arrays');
  if(p.source.bytes.length===0||!p.state.crop||Object.values(p.state.crop).some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('bad crop');
  const raw=Buffer.from(p.source.bytes,'base64');if(raw.length>MAX_INPUT)throw Error('too large');const dimensions=checkDimensions(raw),S=p.state,swap=/^r(?:90|270)/.test(S.orient||''),W=swap?dimensions.h:dimensions.w,H=swap?dimensions.w:dimensions.h,c=S.crop;
  if(!['','h','r90','r90h','r180','r180h','r270','r270h'].includes(S.orient||'')||typeof S.rotation!=='number'||!Number.isFinite(S.rotation)||Math.abs(S.rotation)>45||c.x<0||c.y<0||c.w<=0||c.h<=0||c.x+c.w>W+1||c.y+c.h>H+1||S.lanes.some(l=>!l||typeof l.x!=='number'||!Number.isFinite(l.x)||Math.abs(l.x)>2*W))throw Error('invalid project geometry');
  return p;
 }catch(e){throw new AgentError('INPUT_INVALID','Invalid or oversized GelFigure project',{reason:e.message});}
}
export function checkDimensions(b){
 let w=0,h=0;
 if(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){w=b.readUInt32BE(16);h=b.readUInt32BE(20);}
 else if(b.length>=8&&((b[0]===73&&b[1]===73)||(b[0]===77&&b[1]===77))){
  const le=b[0]===73,u16=o=>le?b.readUInt16LE(o):b.readUInt16BE(o),u32=o=>le?b.readUInt32LE(o):b.readUInt32BE(o);let off=u32(4);const seen=new Set();let pages=0;
  if(u16(2)!==42)throw new AgentError('INPUT_INVALID','Only classic TIFF is supported');
  while(off){
   if(seen.has(off)||++pages>64||off+2>b.length)throw new AgentError('INPUT_INVALID','Invalid TIFF page chain');seen.add(off);
   const n=u16(off);if(n>1024||off+6+n*12>b.length)throw new AgentError('INPUT_INVALID','Invalid TIFF directory');
   let pw=0,ph=0;
   for(let i=0;i<n;i++){
    const at=off+2+i*12,tag=u16(at),type=u16(at+2),count=u32(at+4);
    if((tag===256||tag===257)&&count>=1){const width=type===3?2:type===4?4:0;if(!width)throw new AgentError('INPUT_INVALID','Unsupported TIFF dimensions');const pos=count*width<=4?at+8:u32(at+8);if(pos+width>b.length)throw new AgentError('INPUT_INVALID','Invalid TIFF dimension pointer');const v=type===3?u16(pos):u32(pos);if(tag===256)pw=v;else ph=v;}
   }
   if(pw>16000||ph>16000||pw*ph>40000000)throw new AgentError('INPUT_SIZE_LIMIT','TIFF page exceeds pixel limit',{width:pw,height:ph,maxPixels:40000000});
   if(pw*ph>w*h){w=pw;h=ph;}off=u32(off+2+n*12);
  }
 }else if(b.length>4&&b[0]===255&&b[1]===216){
  let o=2,orientation=1;
  while(o+4<b.length){
   if(b[o]!==255)break;const marker=b[o+1];if(marker===217||marker===218)break;const len=b.readUInt16BE(o+2);if(len<2||o+2+len>b.length)break;
   if(marker===225&&len>=24&&b.toString('binary',o+4,o+10)==='Exif\0\0'){
    const start=o+10,end=o+2+len;try{const le=b.toString('ascii',start,start+2)==='II',get16=p=>le?b.readUInt16LE(p):b.readUInt16BE(p),get32=p=>le?b.readUInt32LE(p):b.readUInt32BE(p);if(['II','MM'].includes(b.toString('ascii',start,start+2))&&get16(start+2)===42){const ifd=start+get32(start+4);if(ifd+2<=end){const n=get16(ifd);if(n<=128&&ifd+2+n*12<=end)for(let i=0;i<n;i++){const at=ifd+2+i*12;if(get16(at)===274&&get16(at+2)===3&&get32(at+4)===1){const v=get16(at+8);if(v>=1&&v<=8)orientation=v;}}}}}catch{}
   }
   if([192,193,194].includes(marker)&&len>=7){h=b.readUInt16BE(o+5);w=b.readUInt16BE(o+7);}o+=len+2;
  }
  if(orientation>=5&&orientation<=8)[w,h]=[h,w];
 }else if(b.length>=26&&b.toString('ascii',0,2)==='BM'){w=Math.abs(b.readInt32LE(18));h=Math.abs(b.readInt32LE(22));}
 if(!w||!h)throw new AgentError('INPUT_INVALID','Unsupported or invalid image; use TIFF, PNG, JPEG or BMP');
 if(w>16000||h>16000||w*h>40000000)throw new AgentError('INPUT_SIZE_LIMIT','Source exceeds pixel limit',{width:w,height:h,maxPixels:40000000});return {w,h};
}
