/* Lightweight lane-name runs: ordinary text stays a string; optional runs hold only formatting.
 * No HTML is accepted. Existing *italic* names remain readable without exposing markup in editors. */
(function(G){
  'use strict';
  const plain=runs=>runs.map(r=>r.text).join('');
  function normalize(runs){
    const out=[];
    for(const r of runs||[]){
      if(!r||typeof r.text!=='string'||!r.text)continue;
      const n={text:r.text};if(typeof r.italic==='boolean')n.italic=r.italic;
      if(r.script==='sup'||r.script==='sub')n.script=r.script;
      if(r.color==='red')n.color='red';
      const prev=out[out.length-1];
      if(prev&&prev.italic===n.italic&&prev.script===n.script&&prev.color===n.color)prev.text+=n.text;else out.push(n);
    }return out;
  }
  function legacy(value){
    const s=String(value||''),out=[];let at=0,start=0;
    while(at<s.length){
      if(s[at]==='*'&&at+1<s.length&&!/\s/.test(s[at+1])){
        const end=s.indexOf('*',at+1);
        if(end>at+1&&!/\s/.test(s[end-1])){
          if(start<at)out.push({text:s.slice(start,at)});out.push({text:s.slice(at+1,end),italic:true});at=end+1;start=at;continue;
        }
      }at++;
    }
    if(start<s.length)out.push({text:s.slice(start)});return normalize(out);
  }
  function runs(lane){
    const value=String(lane?.name||'');
    if(Array.isArray(lane?.nameRuns)){
      const r=normalize(lane.nameRuns);if(plain(r)===value)return r;
    }return legacy(value);
  }
  function slice(runs,start,end){
    let pos=0;const out=[];
    for(const r of runs){const next=pos+r.text.length,a=Math.max(0,start-pos),b=Math.min(r.text.length,end-pos);if(b>a)out.push({...r,text:r.text.slice(a,b)});pos=next;}
    return normalize(out);
  }
  function edit(runs,value){
    const before=plain(runs);value=String(value);if(before===value)return normalize(runs);
    let a=0,z=0;while(a<Math.min(before.length,value.length)&&before[a]===value[a])a++;
    // Do not split an emoji's surrogate pair while finding a changed range.
    if(a&&/[\uD800-\uDBFF]/.test(before[a-1]))a--;
    while(z<Math.min(before.length,value.length)-a&&before[before.length-1-z]===value[value.length-1-z])z++;
    if(z&&/[\uDC00-\uDFFF]/.test(before[before.length-z]))z--;
    const replacing=before.length-z>a;
    const style=slice(runs,replacing?a:Math.max(0,a-1),replacing?a+1:Math.max(1,a))[0]||runs[0]||{};
    return normalize([...slice(runs,0,a),{...style,text:value.slice(a,value.length-z)},...slice(runs,before.length-z,before.length)]);
  }
  function format(runs,start,end,kind){
    const n=plain(runs).length;start=Math.max(0,Math.min(n,start));end=Math.max(start,Math.min(n,end));if(start===end){start=0;end=n;}
    const middle=slice(runs,start,end),active=middle.length&&middle.every(r=>r.script===kind);
    return normalize([...slice(runs,0,start),...middle.map(r=>{
      const next={...r};
      if(kind==='normal')next.italic=false;
      else if(kind==='italic')next.italic=true;
      else if(kind==='sup'||kind==='sub'){if(active)delete next.script;else next.script=kind;}
      else if(kind==='red')next.color='red';
      else if(kind==='autoColor')delete next.color;
      else if(kind==='clear'){delete next.italic;delete next.script;delete next.color;}
      return next;
    }),...slice(runs,end,n)]);
  }
  function write(lane,r){
    r=normalize(r);lane.name=plain(r);
    if(r.some(r=>r.italic!==undefined||r.script||r.color))lane.nameRuns=r;else delete lane.nameRuns;
  }
  function style(value){
    const s={};if(!value||typeof value!=='object')return s;
    if(Number.isFinite(+value.pt)&&+value.pt>0)s.pt=Math.max(4,Math.min(14,Math.round(+value.pt*2)/2));
    if(value.angle==='auto')s.angle='auto';
    else if(value.angle!=null&&String(value.angle).trim()!==''&&Number.isFinite(+value.angle))s.angle=String(Math.round(Math.max(0,Math.min(90,+value.angle))));
    return s;
  }
  G.NameText={normalize,legacy,runs,plain,slice,edit,format,write,style};
})(window);
