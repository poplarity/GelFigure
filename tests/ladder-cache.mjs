import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export async function ladderCacheChecks(browser,base,root){
  const results=[];
  const check=async(name,fn)=>{try{await fn();results.push(['ok','marker cache: '+name]);}catch(e){results.push(['FAIL','marker cache: '+name,e.stack]);}};
  const open=async(c,url=base+'/index.html')=>{const p=await c.newPage();await p.goto(url);await p.evaluate(()=>Ladders.ready);await p.evaluate(()=>Ladders.flush());return p;};
  await check('old local models/favourites migrate and both gel types survive reopening',async()=>{
    const c=await browser.newContext();try{
      const seed=await c.newPage();await seed.goto(base+'/index.html');await seed.evaluate(()=>Ladders.flush());
      await seed.evaluate(async()=>{
        localStorage.removeItem('gelfig.markerLibrary.v1');
        localStorage.setItem('gelfig.customLadders',JSON.stringify([{id:'custom_legacy',name:'Legacy ladder',sizes:[5000,1000,500],ref:[1000]}]));
        localStorage.setItem('gelfig.favLadders',JSON.stringify(['custom_legacy','biorad_dual']));
        await new Promise((resolve,reject)=>{const r=indexedDB.open('gelfigure-markers',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('library','readwrite');t.objectStore('library').clear();t.oncomplete=()=>{db.close();resolve();};t.onerror=reject;};});
      });await seed.close();
      let p=await open(c);assert(await p.evaluate(()=>Ladders.isFavorite('custom_legacy')));
      const ids=await p.evaluate(async()=>{
        const d=Ladders.saveCustom('Lab marker',[5000,1000,500],'dna'),pr=Ladders.saveCustom('Lab marker',[100,50,25,10],'protein');
        Ladders.toggleFavorite(d.id);Ladders.toggleFavorite(pr.id);
        Ladders.importDef({id:'custom_from_project',name:'Imported project model',kind:'protein',sizes:[100,50,25],ref:[50]});
        await Ladders.flush();return [d.id,pr.id];
      });await p.close();p=await open(c);
      assert.deepEqual(await p.evaluate(ids=>ids.map(id=>[Ladders.get(id).kind,Ladders.isFavorite(id)]),ids),[['dna',true],['protein',true]]);
      assert.equal(await p.evaluate(()=>Ladders.cacheStatus),'saved');
      assert.deepEqual(await p.evaluate(()=>{const m=Ladders.get('custom_from_project');return [m.kind,m.sizes,m.ref];}),['protein',[100,50,25],[50]]);
      const duplicate=await p.evaluate(()=>{const a=Ladders.saveCustom('Lab marker',[1000,5000,500],'dna'),b=Ladders.saveCustom('Lab marker',[7000,1000],'dna');return {a:a.id,b:b.id,n:Ladders.all('dna').filter(l=>l.custom&&l.name.startsWith('Lab marker')).length};});
      assert.equal(duplicate.a,ids[0]);assert.notEqual(duplicate.b,ids[0]);assert.equal(duplicate.n,2);
    }finally{await c.close();}
  });
  for(const mode of ['quota','idb-blocked','all-blocked'])await check(mode+': honest status and durable fallback',async()=>{
    const c=await browser.newContext();try{
      if(mode!=='idb-blocked')await c.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};});
      if(mode!=='quota')await c.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('Blocked','SecurityError');}});});
      let p=await open(c);const info=await p.evaluate(async()=>{const l=Ladders.saveCustom('Fallback marker',[100,50,25],'protein');Ladders.toggleFavorite(l.id);return {id:l.id,saved:await Ladders.flush(),status:Ladders.cacheStatus};});
      assert.equal(info.saved,mode!=='all-blocked');assert.equal(info.status,mode==='all-blocked'?'memory':'saved');
      if(mode==='all-blocked'){const text=await p.locator('#ladderCacheStatus').textContent();assert(/session only|仅本次/.test(text),text);}
      await p.close();p=await open(c);assert.equal(await p.evaluate(id=>!!Ladders.get(id)&&Ladders.isFavorite(id),info.id),mode!=='all-blocked');
      if(mode!=='all-blocked'){
        await p.evaluate(async id=>{Ladders.removeCustom(id);await Ladders.flush();},info.id);await p.close();p=await open(c);
        assert.equal(await p.evaluate(id=>!!Ladders.get(id),info.id),false);
      }
    }finally{await c.close();}
  });
  await check('backup/import merges all models and favourites without changing a figure',async()=>{
    const c=await browser.newContext();try{
      const p=await open(c,base+'/index.html?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
      const r=await p.evaluate(async()=>{
        const d=Ladders.saveCustom('Portable DNA',[8000,4000,1000],'dna'),pr=Ladders.saveCustom('Portable protein',[100,50,25],'protein');
        Ladders.setFavorites([d.id,pr.id,'biorad_dual']);const backup=Ladders.backup();Ladders.removeCustom(pr.id);
        const state=App.snapshot(),n=Ladders.importLibrary(backup),same=state===App.snapshot();
        const count=Ladders.all().length;Ladders.importLibrary(backup);
        const before=JSON.stringify(Ladders.backup());let invalid=false;
        try{Ladders.importLibrary({...backup,custom:[...backup.custom,{id:'bad',name:'bad',sizes:[5,Infinity]}]});}catch(_){invalid=true;}
        const collision={...backup,custom:[{...backup.custom[0],sizes:[9000,2000,500]}],favorites:[d.id]};
        const unchanged=before===JSON.stringify(Ladders.backup());Ladders.importLibrary(collision);await Ladders.flush();
        return {n,same,dedup:count===Ladders.all().length-1,invalid,unchanged,oldSizes:Ladders.get(d.id).sizes,models:Ladders.all().filter(l=>l.custom).length,keys:Object.keys(backup).sort()};
      });assert.deepEqual(r,{n:1,same:true,dedup:true,invalid:true,unchanged:true,oldSizes:[8000,4000,1000],models:3,keys:['custom','favorites','gelfigureMarkerLibrary','version']});
      await p.locator('#customLadderAdv').evaluate(e=>e.open=true);await p.locator('#customName').fill('UI marker');await p.locator('#customSizes').fill('6000,3000,1000');await p.locator('#btnSaveLadder').click();
      await p.waitForFunction(()=>Ladders.all().some(l=>l.name==='UI marker')&&Ladders.cacheStatus==='saved');
      const dl=p.waitForEvent('download');await p.locator('#btnBackupLadders').click();assert.equal((await dl).suggestedFilename(),'GelFigure_markers.json');
      await p.locator('#ladderLibraryInput').setInputFiles({name:'models.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({gelfigureMarkerLibrary:1,version:1,custom:[{id:'imported_test',name:'Imported marker',sizes:[200,100,50],kind:'protein'}],favorites:['imported_test']}))});
      await p.waitForFunction(()=>!!Ladders.get('imported_test'));assert(await p.evaluate(()=>Ladders.isFavorite('imported_test')));
    }finally{await c.close();}
  });
  await check('aborted backup write reports failure and preserves the previous saved catalogue',async()=>{
    const c=await browser.newContext();try{
      let p=await open(c);const old=await p.evaluate(async()=>{const l=Ladders.saveCustom('Durable',[1000,500],'dna');await Ladders.flush();return l.id;});
      const r=await p.evaluate(async()=>{
        Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};
        const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='library'){this.transaction.abort();throw new Error('Test abort');}return put.apply(this,args);};
        const l=Ladders.saveCustom('Unsaved',[2000,500],'dna');return {id:l.id,saved:await Ladders.flush(),status:Ladders.cacheStatus};
      });assert.equal(r.saved,false);assert.equal(r.status,'memory');await p.close();p=await open(c);
      assert.deepEqual(await p.evaluate(({old,id})=>[!!Ladders.get(old),!!Ladders.get(id)],{old,id:r.id}),[true,false]);
    }finally{await c.close();}
  });
  await check('two tabs using the IndexedDB fallback keep independent additions',async()=>{
    const c=await browser.newContext();try{
      await c.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});});
      const a=await open(c),b=await open(c);
      const ids=await Promise.all([a,b].map((p,i)=>p.evaluate(async i=>{const l=Ladders.saveCustom('Tab '+i,[1000+i,500],'dna');await Ladders.flush();return l.id;},i)));
      const p=await open(c);assert(await p.evaluate(ids=>ids.every(id=>Ladders.get(id)),ids));
    }finally{await c.close();}
  });
  await check('offline single HTML restores models before a new gel is detected',async()=>{
    const c=await browser.newContext();try{
      await c.setOffline(true);const url=pathToFileURL(path.join(root,'dist/GelFigure.html')).href;
      let p=await open(c,url);const id=await p.evaluate(async()=>{const l=Ladders.saveCustom('Offline ladder',Ladders.get('gr1kbplus').sizes,'dna');Ladders.setFavorites([l.id]);await Ladders.flush();return l.id;});await p.close();
      p=await open(c,url+'?demo=1&lang=en');await p.waitForFunction(()=>document.title.startsWith('READY '),null,{timeout:120000});
      assert(await p.evaluate(id=>!!Ladders.get(id)&&Ladders.isFavorite(id),id));
      await p.setViewportSize({width:390,height:844});await p.locator('#mNav [data-view="panel"]').click();assert(await p.locator('#btnBackupLadders').isVisible());assert(await p.locator('#btnImportLadders').isVisible());
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),390);
    }finally{await c.close();}
  });
  return results;
}
