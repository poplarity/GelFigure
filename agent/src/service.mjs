import path from'node:path';import fs from'node:fs/promises';import zlib from'node:zlib';import crypto from'node:crypto';
import {AgentError,canonical,digest,revision,sealPlan,verifyPlan,assertRevision}from'./common.mjs';import{normalizeSpec,mergeSpec,semanticQuestions}from'./plan.mjs';import{Workspace,parseProject,checkDimensions}from'./files.mjs';import{Runtime}from'./runtime.mjs';
const json=v=>JSON.stringify(v,null,2)+'\n',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export class AgentService{
 constructor({workspace,timeoutMs=120000}={}){this.files=new Workspace(workspace);this.runtime=new Runtime(timeoutMs);this.queue=Promise.resolve();}
 _serial(fn){const p=this.queue.then(async()=>{await this.files.ready;return fn();});this.queue=p.catch(()=>{});return p;}
 async close(){await this.queue;await this.runtime.close();}
 doctor(){return this._serial(async()=>({apiVersion:'1',status:'succeeded',...await this.runtime.info(),workspace:this.files.path}));}
 ladders({query='',kind}={}){return this._serial(async()=>{if(typeof query!=='string'||query.length>200||kind&&!['dna','protein'].includes(kind))throw new AgentError('INVALID_SPEC','Invalid ladder query');const rows=await this.runtime.run(({call})=>call('ladders'));const words=query.toLowerCase().split(/\s+/).filter(Boolean);return{apiVersion:'1',status:'succeeded',ladders:rows.filter(l=>(!kind||l.kind===kind)&&words.every(w=>(l.name+' '+l.id+' '+l.sizes.join(' ')).toLowerCase().includes(w)))};});}
 async _load(call,bytes,name,options={}){const project=/\.(gelfig|json)$/i.test(name);if(project)parseProject(bytes);else checkDimensions(bytes);const result=await call('load',{base64:bytes.toString('base64'),name:path.basename(name),project,...options});const P=(await call('project')).data;if(P.source.sha256!==hash(Buffer.from(P.source.bytes,'base64')))throw new AgentError('SOURCE_INTEGRITY','Original image checksum does not match');return result;}
 _analysis(summary,P,quality){return{apiVersion:'1',kind:'gelfigure-analysis',...summary,revision:revision(P),project:'project.gelfig',quality:quality.issues};}
 analyze({input,out,gelType,orientation,crop,laneCount,lanePositions}={}){return this._serial(async()=>{
  await this.files.available(out);if(gelType&&!['dna','protein'].includes(gelType)||orientation&&!['h','r90','r180','r270','r90h','r180h','r270h'].includes(orientation))throw new AgentError('INVALID_SPEC','Invalid gel type or orientation');
  if(crop&&(typeof crop!=='object'||Array.isArray(crop)||Object.keys(crop).sort().join(',')!=='h,space,w,x,y'||crop.space!=='oriented-image-px'||['x','y','w','h'].some(k=>typeof crop[k]!=='number'||!Number.isFinite(crop[k]))||crop.x<0||crop.y<0||crop.w<=0||crop.h<=0))throw new AgentError('INVALID_SPEC','Invalid crop coordinates');
  if(laneCount!=null&&(!Number.isInteger(laneCount)||laneCount<1||laneCount>60)||lanePositions!=null&&(!Array.isArray(lanePositions)||!lanePositions.length||lanePositions.length>60||lanePositions.some((x,i)=>typeof x!=='number'||!Number.isFinite(x)||i>0&&x<=lanePositions[i-1]))||laneCount!=null&&lanePositions!=null)throw new AgentError('INVALID_SPEC','Provide a valid count or increasing lane positions, not both');
  const {bytes,full}=await this.files.read(input);const r=await this.runtime.run(async({call})=>{const summary=await this._load(call,bytes,full,{gelType,orientation,crop,laneCount,lanePositions}),project=await call('project'),quality=await call('quality'),diagnostic=await call('diagnostic');return{summary,project,quality,diagnostic};});
  const analysis=this._analysis(r.summary,r.project.data,r.quality),dir=await this.files.writeRun(out,{'analysis.json':json(analysis),'project.gelfig':Buffer.from(r.project.base64,'base64'),'diagnostic.png':Buffer.from(r.diagnostic,'base64')});
  return{apiVersion:'1',status:'succeeded',analysis:this.files.relative(path.join(dir,'analysis.json')),project:this.files.relative(path.join(dir,'project.gelfig')),diagnostic:this.files.relative(path.join(dir,'diagnostic.png')),revision:analysis.revision,summary:{source:analysis.source,lanes:analysis.lanes,markers:analysis.markers.map(({bands,...m})=>m),gelType:analysis.gelType,rotation:analysis.rotation,crop:analysis.crop},quality:r.quality};
 });}
 async _from(file,kind){
  const {full,data}=await this.files.json(file);if(data.apiVersion!=='1'||data.kind!==kind)throw new AgentError('INPUT_INVALID','Unsupported document type/version');
  if(kind==='gelfigure-plan')verifyPlan(data);
  if(data.project!=='project.gelfig')throw new AgentError('INPUT_INVALID','Project must be the sibling project.gelfig');
  const {bytes}=await this.files.read(path.join(path.dirname(full),data.project)),project=parseProject(bytes);
  assertRevision(data.revision,revision(project));if((data.sourceSha256||data.source?.sha256)!==project.source.sha256)throw new AgentError('SOURCE_INTEGRITY','Document and source image do not match');
  return{data,bytes,full,project};
 }
 prepare({analysis,spec,out}={}){return this._serial(async()=>{const from=await this._from(analysis,'gelfigure-analysis');return this._prepare(from,normalizeSpec(spec),out);});}
 async _prepare(from,spec,out){
  await this.files.available(out);assertRevision(spec.expectedRevision,from.data.revision);
  const result=await this.runtime.run(async({call})=>{
   const summary=await this._load(call,from.bytes,'project.gelfig');if(summary.engineVersion!==from.data.engineVersion)throw new AgentError('ENGINE_VERSION','Use the same GelFigure engine version as this project analysis');
   const analysis={...summary,revision:from.data.revision},ladders=await call('ladders'),questions=semanticQuestions(analysis,spec,ladders);
   if(questions.length)return{questions,summary,project:await call('project'),quality:await call('quality',spec)};
   await call('apply',spec);return{questions,summary:await call('summary'),project:await call('project'),quality:await call('quality',spec)};
  });
  const unanswered=result.quality.issues.filter(i=>i.severity==='error'||i.severity==='warning'&&(!i.acknowledgeable||!spec.acknowledgements?.includes(i.code)));
  const status=result.questions.length?'awaiting_answers':unanswered.length?'needs_review':'ready_to_render';
  const plan=sealPlan({apiVersion:'1',kind:'gelfigure-plan',status,engineVersion:result.summary.engineVersion,analysisRevision:from.data.analysisRevision||from.data.revision,revision:revision(result.project.data),sourceSha256:result.project.data.source.sha256,project:'project.gelfig',spec,questions:result.questions,quality:result.quality.issues,metrics:result.quality.metrics});
  const dir=await this.files.writeRun(out,{'plan.json':json(plan),'project.gelfig':Buffer.from(result.project.base64,'base64'),'resolved-spec.json':json(spec),'quality-report.json':json(result.quality)});
  return{apiVersion:'1',status,plan:this.files.relative(path.join(dir,'plan.json')),revision:plan.revision,digest:plan.digest,questions:plan.questions,quality:plan.quality};
 }
 revise({plan,spec,out}={}){return this._serial(async()=>{const from=await this._from(plan,'gelfigure-plan');assertRevision(spec?.expectedRevision,from.data.revision);return this._prepare(from,mergeSpec(from.data.spec,spec),out);});}
 async _validate(from,call){
  const summary=await this._load(call,from.bytes,'project.gelfig');if(summary.engineVersion!==from.data.engineVersion)throw new AgentError('ENGINE_VERSION','Project was prepared with another engine version');
  const spec=normalizeSpec(from.data.spec),questions=semanticQuestions({...summary,revision:spec.expectedRevision},spec,await call('ladders'));
  if(!questions.length){
   await call('apply',spec);const reapplied=await call('project');
   if(revision(reapplied.data)!==from.data.revision)throw new AgentError('PLAN_SPEC_MISMATCH','The plan settings do not match its prepared project; prepare or revise again');
  }
  const quality=await call('quality',spec);
  const blockers=quality.issues.filter(i=>i.severity==='error'||i.severity==='warning'&&(!i.acknowledgeable||!spec.acknowledgements?.includes(i.code)));
  return{status:questions.length?'awaiting_answers':blockers.length?'needs_review':'ready_to_render',questions,quality,spec};
 }
 validate({plan}={}){return this._serial(async()=>{const from=await this._from(plan,'gelfigure-plan');return this.runtime.run(async({call})=>({apiVersion:'1',...await this._validate(from,call),revision:from.data.revision}));});}
 render({plan,out}={}){return this._serial(async()=>{
  const from=await this._from(plan,'gelfigure-plan');if(from.data.status!=='ready_to_render'||from.data.questions.length)throw new AgentError('PLAN_NOT_READY','Resolve all preparation questions and quality issues before rendering',{status:from.data.status,questions:from.data.questions});
  await this.files.available(out);
  const result=await this.runtime.run(async({call})=>{const checked=await this._validate(from,call);if(checked.status!=='ready_to_render')throw new AgentError('PLAN_NOT_READY','Preparation checks no longer pass',checked);return{checked,exported:await call('exportsFor',checked.spec),project:await call('project')};});
  const artifacts=Object.fromEntries(result.exported.files.map(f=>[f.name,Buffer.from(f.base64,'base64')]));artifacts['project.gelfig']=Buffer.from(result.project.base64,'base64');artifacts['resolved-spec.json']=json(result.checked.spec);artifacts['quality-report.json']=json(result.checked.quality);artifacts['processing-log.json']=json(result.exported.log);artifacts['legend.txt']=result.exported.legend.join('\n')+'\n';
  const manifest={apiVersion:'1',status:'succeeded',engineVersion:from.data.engineVersion,sourceSha256:from.data.sourceSha256,revision:from.data.revision,planDigest:from.data.digest,runtime:{node:process.version,browser:this.runtime.browser.version(),platform:process.platform,arch:process.arch},files:Object.entries(artifacts).map(([name,v])=>({name,bytes:Buffer.byteLength(v),sha256:hash(v)}))};artifacts['manifest.json']=json(manifest);
  const dir=await this.files.writeRun(out,artifacts);return{apiVersion:'1',status:'succeeded',revision:manifest.revision,manifest:this.files.relative(path.join(dir,'manifest.json')),artifacts:Object.keys(artifacts).map(name=>this.files.relative(path.join(dir,name))),quality:result.checked.quality};
 });}
}
