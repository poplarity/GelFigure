/* Small, independent marker catalogue. Keep a synchronous local copy and a transactional
 * IndexedDB backup; never report durable storage when both writes have failed. */
(function(G){
  'use strict';
  const KEY='gelfig.markerLibrary.v1',CUSTOM='gelfig.customLadders',FAV='gelfig.favLadders';
  const empty=()=>({version:1,custom:[],favorites:[],updatedAt:0});
  let data=empty(),normalize,dbPromise,ready,working=null,ops=[],localSaved=false,status='loading';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const newer=(a,b)=>b&&(!a||b.updatedAt>a.updatedAt)?b:a;
  function announce(next){status=next;G.dispatchEvent(new Event('gelfigure-ladders'));}
  function readLocal(){
    try{
      const raw=G.localStorage.getItem(KEY);if(raw){try{const v=normalize(JSON.parse(raw));if(v)return v;}catch(_){}}
      const custom=G.localStorage.getItem(CUSTOM),favorites=G.localStorage.getItem(FAV);
      return custom||favorites?normalize({version:1,custom:JSON.parse(custom||'[]'),favorites:JSON.parse(favorites||'[]'),updatedAt:0}):null;
    }catch(_){return null;}
  }
  function writeLocal(){
    try{G.localStorage.setItem(KEY,JSON.stringify(data));return true;}catch(_){return false;}
  }
  function apply(base,changes){
    const out=copy(base||empty());
    changes.forEach(op=>{
      if(op.type==='put'){out.custom=out.custom.filter(l=>l.id!==op.ladder.id);out.custom.push(copy(op.ladder));}
      else if(op.type==='remove'){out.custom=out.custom.filter(l=>l.id!==op.id);out.favorites=out.favorites.filter(id=>id!==op.id);}
      else if(op.type==='favorites')out.favorites=op.ids.slice();
      else if(op.type==='favorite')out.favorites=op.on?[...new Set(out.favorites.concat(op.id))]:out.favorites.filter(id=>id!==op.id);
    });
    out.updatedAt=Math.max(Date.now(),(base?.updatedAt||0)+1);return out;
  }
  function database(){
    if(!dbPromise){
      dbPromise=new Promise((resolve,reject)=>{
        let rq,done=false;
        const fail=e=>{if(done)return;done=true;clearTimeout(timer);reject(e);};
        const timer=setTimeout(()=>fail(new Error('Marker cache timeout')),2500);
        try{rq=G.indexedDB.open('gelfigure-markers',1);}catch(e){fail(e);return;}
        rq.onupgradeneeded=()=>{if(!rq.result.objectStoreNames.contains('library'))rq.result.createObjectStore('library');};
        rq.onerror=rq.onblocked=()=>fail(rq.error||new Error('Marker cache blocked'));
        rq.onsuccess=()=>{if(done){rq.result.close();return;}done=true;clearTimeout(timer);const db=rq.result;db.onversionchange=()=>{db.close();dbPromise=null;};resolve(db);};
      });
      dbPromise.catch(()=>{dbPromise=null;});
    }return dbPromise;
  }
  async function transact(changes,seed){
    const db=await database();return new Promise((resolve,reject)=>{
      const tx=db.transaction('library',changes?'readwrite':'readonly'),st=tx.objectStore('library');let result,error;
      const timer=setTimeout(()=>{error=new Error('Marker cache transaction timeout');try{tx.abort();}catch(_){}reject(error);},2500);
      tx.oncomplete=()=>{clearTimeout(timer);resolve(result);};
      tx.onabort=tx.onerror=()=>{clearTimeout(timer);reject(error||tx.error||new Error('Marker cache write failed'));};
      const rq=st.get('catalog');rq.onsuccess=()=>{
        try{const saved=normalize(rq.result);result=changes?apply(saved||seed,changes):saved;if(changes)st.put(result,'catalog');}
        catch(e){error=e;tx.abort();}
      };
    });
  }
  function start(clean){
    normalize=clean;const initial=readLocal();data=initial||empty();localSaved=!!initial;
    ready=(async()=>{
      let saved=null,available=false;
      try{saved=await transact();available=true;}catch(_){}
      const local=readLocal(),base=newer(saved,initial);
      // Migrate a legacy/newer local snapshot before replaying edits made during startup.
      const chosen=newer(base,local),migration=[];
      if(chosen&&chosen!==saved){
        (saved?.custom||[]).filter(l=>!chosen.custom.some(c=>c.id===l.id)).forEach(l=>migration.push({type:'remove',id:l.id}));
        chosen.custom.forEach(l=>migration.push({type:'put',ladder:l}));migration.push({type:'favorites',ids:chosen.favorites});
      }
      ops=migration.concat(ops);data=apply(saved||empty(),ops);
      localSaved=writeLocal();announce(localSaved||saved&&!ops.length?'saved':available?'saving':'memory');
    })();
    ready.then(()=>flush());return ready;
  }
  function change(op){
    data=apply(newer(data,readLocal()),ops.concat(op));ops.push(copy(op));localSaved=writeLocal();
    announce(localSaved?'saved':'saving');flush();
  }
  async function flush(){
    await ready;if(working)return working;
    working=(async()=>{
      // Read/modify/write is one transaction so independent tabs cannot lose each other's additions.
      do{
        const batch=ops.splice(0),seed=copy(data);let saved=null;
        try{saved=await transact(batch,seed);}catch(_){}
        if(saved){data=ops.length?apply(saved,ops):saved;localSaved=writeLocal();}
        else ops=batch.concat(ops); // retain failed writes for a later retry
        announce(localSaved||saved&&!ops.length?'saved':saved?'saving':'memory');
        if(!saved)break;
      }while(ops.length);
      return status==='saved';
    })();
    try{return await working;}finally{working=null;}
  }
  // Use the latest same-origin copy when another tab changes the catalogue; don't overwrite edits.
  G.addEventListener('storage',e=>{if(e.key===KEY&&!ops.length&&!working){const next=readLocal();if(next&&next.updatedAt>data.updatedAt){data=next;localSaved=true;announce('saved');}}});
  G.LadderCache={start,change,flush,get data(){return data;},get status(){return status;}};
})(window);
