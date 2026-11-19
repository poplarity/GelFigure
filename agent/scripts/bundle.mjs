#!/usr/bin/env node
// Offline portable directory: host Node + matched headless shell + dependencies + same app engine.
import {officialNode}from'./node-runtime.mjs';
import fs from'node:fs/promises';import path from'node:path';import os from'node:os';import{fileURLToPath}from'node:url';import{spawnSync}from'node:child_process';import{createRequire}from'node:module';import crypto from'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),require=createRequire(import.meta.url);
const args=process.argv.slice(2),arg=name=>{const i=args.indexOf('--'+name);return i<0?null:args[i+1];};
if(!arg('out')){process.stderr.write('Usage: node agent/scripts/bundle.mjs --out NEW_DIRECTORY [--node NODE_BINARY] [--node-license LICENSE] [--browser-cache PLAYWRIGHT_CACHE]\n');process.exit(1);}
const downloaded=arg('node')?null:await officialNode(arg('node-version')||'22.22.0');
const out=path.resolve(arg('out')),node=path.resolve(arg('node')||downloaded.binary);
try{await fs.lstat(out);throw Error('Output exists; choose a new directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const core=path.dirname(require.resolve('playwright-core/package.json')),catalog=JSON.parse(await fs.readFile(path.join(core,'browsers.json'),'utf8'));
const cache=path.resolve(arg('browser-cache')||process.env.PLAYWRIGHT_BROWSERS_PATH||({darwin:path.join(os.homedir(),'Library/Caches/ms-playwright'),win32:path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local'),'ms-playwright'),linux:path.join(process.env.XDG_CACHE_HOME||path.join(os.homedir(),'.cache'),'ms-playwright')}[process.platform]));
const executableCheck=spawnSync(node,['--version'],{encoding:'utf8'});if(executableCheck.status!==0)throw Error('Node binary cannot execute');
const nodeVersion=executableCheck.stdout.trim();if(Number(nodeVersion.slice(1).split('.')[0])<22)throw Error('Node22 or newer required');
const licenses=[arg('node-license'),downloaded?.license,path.resolve(node,'../../LICENSE'),path.resolve(node,'../LICENSE'),path.resolve(node,'../../share/doc/node/LICENSE'),path.resolve(node,'../../../LICENSE')].filter(Boolean);
let nodeLicense;for(const p of licenses){try{const s=await fs.readFile(p,'utf8');if(s.includes('Node.js')||s.includes('Node')&&s.includes('Permission is hereby granted')){nodeLicense=s;break;}}catch{}}
if(!nodeLicense){const tag=nodeVersion;const response=await fetch('https://raw.githubusercontent.com/nodejs/node/'+tag+'/LICENSE');if(!response.ok)throw Error('Node license unavailable; provide --node-license');nodeLicense=await response.text();}
const shell=catalog.browsers.find(b=>b.name==='chromium-headless-shell');const shellDir='chromium_headless_shell-'+shell.revision;
await fs.access(path.join(cache,shellDir));await fs.mkdir(out,{recursive:true});
for(const dir of ['runtime/browsers','runtime/licenses','agent'])await fs.mkdir(path.join(out,dir),{recursive:true});
try{
 for(const file of ['js','css','index.html','LICENSE','README.md','README.zh-CN.md'])await fs.cp(path.join(root,file),path.join(out,file),{recursive:true});
 for(const file of ['src','bin','host.html','bootstrap.js','browser.js','package.json','package-lock.json','node_modules'])await fs.cp(path.join(root,'agent',file),path.join(out,'agent',file),{recursive:true});
 await fs.cp(path.join(root,'skills/gelfigure'),path.join(out,'skill'),{recursive:true});
 const nodeName=process.platform==='win32'?'node.exe':'node';await fs.copyFile(node,path.join(out,'runtime',nodeName));if(process.platform!=='win32')await fs.chmod(path.join(out,'runtime',nodeName),0o755);
 await fs.writeFile(path.join(out,'runtime/licenses/NODE-LICENSE.txt'),nodeLicense);
 // Include optional platform helper for Windows dependency validation; no video features are used.
 for(const name of ['chromium-headless-shell',...(process.platform==='win32'?['winldd']:[])]){
  const item=catalog.browsers.find(b=>b.name===name),dir=name.replaceAll('-','_')+'-'+item.revision;await fs.cp(path.join(cache,dir),path.join(out,'runtime/browsers',dir),{recursive:true});
 }
 await fs.writeFile(path.join(out,'gelfigure'),'#!/bin/sh\nGELFIGURE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexport PLAYWRIGHT_BROWSERS_PATH="$GELFIGURE_ROOT/runtime/browsers"\nexec "$GELFIGURE_ROOT/runtime/node" "$GELFIGURE_ROOT/agent/bin/gelfigure.mjs" "$@"\n',{mode:0o755});
 await fs.writeFile(path.join(out,'gelfigure.cmd'),'@echo off\r\nset "PLAYWRIGHT_BROWSERS_PATH=%~dp0runtime\\browsers"\r\n"%~dp0runtime\\node.exe" "%~dp0agent\\bin\\gelfigure.mjs" %*\r\n');
 await fs.writeFile(path.join(out,'START-HERE.txt'),'GelFigure Agent portable / 本地 Agent 工具\n\nRun gelfigure doctor --workspace ABSOLUTE_EXISTING_FOLDER\nStart MCP: gelfigure mcp --workspace ABSOLUTE_EXISTING_FOLDER\nWindows: gelfigure.cmd. macOS/Linux: ./gelfigure.\nNo separate Node or Chrome installation needed. / 无需另装 Node 或 Chrome。\nUse only the package built for your OS/CPU. / 请使用匹配系统和 CPU 的版本。\nCopy skill/ to the skill folder supported by your Agent. See docs/ for the workflow and CLI/MCP examples.\nLinux may require browser system libraries. macOS signing/notarization is not provided by this development bundle.\nOffline image execution; your Agent model may still use a network service.\n');
 await fs.mkdir(path.join(out,'docs'),{recursive:true});for(const file of ['agent-interface.md','agent-interface.zh-CN.md'])await fs.copyFile(path.join(root,'docs',file),path.join(out,'docs',file));
 const info={tool:'gelfigure-agent',version:JSON.parse(await fs.readFile(path.join(root,'agent/package.json'),'utf8')).version,engineVersion:JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version,platform:process.platform,arch:process.arch,node:nodeVersion,nodeDistribution:downloaded?.download||'explicitly-provided',playwright:JSON.parse(await fs.readFile(path.join(root,'agent/node_modules/playwright/package.json'),'utf8')).version,browserRevision:shell.revision};
 await fs.writeFile(path.join(out,'bundle.json'),JSON.stringify(info,null,2)+'\n');
 const probe=spawnSync(path.join(out,process.platform==='win32'?'gelfigure.cmd':'gelfigure'),['doctor','--workspace',out],{encoding:'utf8',env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:'',NODE_PATH:'',PATH:process.platform==='win32'?process.env.PATH:'/usr/bin:/bin'},shell:process.platform==='win32',timeout:60000});if(probe.status!==0)throw Error('Portable doctor failed: '+probe.stderr+probe.stdout);
 const sums=[];async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())await walk(file);else if(e.isFile()&&e.name!=='SHA256SUMS.txt'){const hash=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');sums.push(hash+'  '+path.relative(out,file).split(path.sep).join('/'));}}}await walk(out);await fs.writeFile(path.join(out,'SHA256SUMS.txt'),sums.sort().join('\n')+'\n');
 process.stdout.write(JSON.stringify({status:'succeeded',directory:out,...info})+'\n');await downloaded?.cleanup();
}catch(e){await fs.writeFile(path.join(out,'BUILD-FAILED.txt'),e.message).catch(()=>{});await downloaded?.cleanup();throw e;}
