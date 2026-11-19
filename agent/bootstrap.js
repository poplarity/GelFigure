/* Separate runtime: no web UI, user browser history, preferences, downloads or network. */
(function(G){
 'use strict';G.L=(zh,en)=>en;G.PrefStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},persistent:false};
 const data={custom:[],favorites:[]};
 G.LadderCache={data,status:'memory',start:()=>Promise.resolve(),flush:async()=>true,change(op){
  if(op.type==='put'){data.custom=data.custom.filter(l=>l.id!==op.ladder.id);data.custom.push(op.ladder);}
  else if(op.type==='remove'){data.custom=data.custom.filter(l=>l.id!==op.id);data.favorites=data.favorites.filter(id=>id!==op.id);}
  else if(op.type==='favorites')data.favorites=op.ids.slice();
  else if(op.type==='favorite')data.favorites=op.on?[...new Set(data.favorites.concat(op.id))]:data.favorites.filter(id=>id!==op.id);
 }};
 G.alert=message=>{const e=new Error(message);e.code='INPUT_INVALID';throw e;};
})(window);
