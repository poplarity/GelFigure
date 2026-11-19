import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import os from'node:os';import path from'node:path';import{fileURLToPath}from'node:url';
import{Client}from'@modelcontextprotocol/sdk/client/index.js';import{StdioClientTransport}from'@modelcontextprotocol/sdk/client/stdio.js';import{synthetic,completeSpec}from'./helpers.mjs';
test('real stdio MCP runs analysis, gathers questions, prepares answers and exports the same engine',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gelfigure-mcp-workflow-'));await fs.writeFile(path.join(dir,'gel.tif'),await synthetic());
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../bin/gelfigure.mjs',import.meta.url)),'mcp','--workspace',dir],stderr:'pipe'}),client=new Client({name:'gelfigure-e2e',version:'1.0.0'});let stderr='';transport.stderr?.on('data',d=>stderr+=d);
 try{
  await client.connect(transport);const call=async(name,args)=>{const r=await client.callTool({name:'gelfigure_'+name,arguments:args});assert(!r.isError,JSON.stringify(r));return r.structuredContent;};
  const a=await call('analyze',{input:'gel.tif',out:'a'});assert.equal(a.status,'succeeded');
  const missing=await call('prepare',{analysis:'a/analysis.json',spec:{expectedRevision:a.revision},out:'questions'});assert.equal(missing.status,'awaiting_answers');assert(missing.questions.length>3);
  const analysis=JSON.parse(await fs.readFile(path.join(dir,'a/analysis.json'),'utf8'));const ready=await call('prepare',{analysis:'a/analysis.json',spec:completeSpec(analysis),out:'ready'});assert.equal(ready.status,'ready_to_render');
  const final=await call('render',{plan:'ready/plan.json',out:'final'});assert.equal(final.status,'succeeded');assert((await fs.stat(path.join(dir,'final/figure.pptx'))).size>1000);assert.equal(stderr,'');
 }finally{await client.close();await transport.close();await fs.rm(dir,{recursive:true,force:true});}
});
