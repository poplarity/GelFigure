import {chromium}from'playwright';import {fileURLToPath,pathToFileURL}from'node:url';import path from'node:path';import fs from'node:fs/promises';
import {AgentError}from'./common.mjs';
export const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export class Runtime{
 constructor(timeoutMs=120000){this.timeoutMs=timeoutMs;this.browser=null;this.pending=null;}
 async start(){
  if(!this.pending)this.pending=chromium.launch({headless:true}).then(b=>this.browser=b).catch(e=>{this.pending=null;throw new AgentError('RUNTIME_MISSING','Managed Chromium could not start. Run gelfigure setup or use the complete portable package.',{reason:e.message.split('\n').slice(0,3).join(' ')});});
  return this.pending;
 }
 async run(fn){
  const b=await this.start(),context=await b.newContext({offline:true,viewport:{width:1440,height:1000},locale:'en-US',timezoneId:'UTC',acceptDownloads:false}),page=await context.newPage();
  const errors=[];page.on('dialog',async d=>{errors.push(d.message());await d.dismiss();});
  await context.route(/^https?:/,route=>route.abort());
  let timer;
  try{return await Promise.race([(async()=>{await page.goto(pathToFileURL(path.join(appRoot,'agent/host.html')).href);await page.waitForFunction(()=>!!window.GelFigureAPI);return await fn({page,call:async(method,arg)=>{const r=await page.evaluate(async({method,arg})=>GelFigureAPI.call(method,arg),{method,arg});if(!r.ok)throw new AgentError(r.error.code,r.error.message);return r.value;}});})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new AgentError('TIMEOUT','Task exceeded the execution time limit')),this.timeoutMs);})]);}
  catch(e){if(e instanceof AgentError)throw e;throw new AgentError('RUNTIME_ERROR','Local rendering failed',{reason:e.message});}
  finally{clearTimeout(timer);await context.close().catch(()=>{});}
 }
 async info(){const r=await this.run(async({call})=>({engineVersion:await call('summaryVersion'),fonts:await call('fonts')}));return {...r,browserVersion:this.browser.version(),platform:process.platform,arch:process.arch,node:process.version,network:'offline',uiAutomation:false};}
 async close(){await this.browser?.close();this.browser=null;this.pending=null;}
}
