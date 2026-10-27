import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
export function checkUpdates(root){
 const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'js/releases.js'),'utf8'),context,{timeout:1000});
 const rows=context.window.GelFigureReleases,version=fs.readFileSync(path.join(root,'js/app.js'),'utf8').match(/App\.VERSION\s*=\s*'([^']+)'/)[1];
 if(!Array.isArray(rows)||rows[0]?.version!==version)throw Error('Update js/releases.js: newest release must match App.VERSION');
 const seen=new Set();for(const r of rows){
  if(!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(r.version)||seen.has(r.version))throw Error('Invalid/duplicate release version');seen.add(r.version);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw Error('Release date is missing: '+r.version);
  for(const lang of ['zh','en'])if(!Array.isArray(r[lang])||r[lang].length<1||r[lang].length>3||r[lang].some(t=>typeof t!=='string'||!t.trim()||t.length>240))throw Error('Add 1–3 short bilingual update bullets: '+r.version);
 }
 for(const [,v]of fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8').matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm))if(!seen.has(v))throw Error('Release history is missing '+v);
 return {version,releases:rows.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(checkUpdates(path.resolve(fileURLToPath(new URL('..',import.meta.url)))));
