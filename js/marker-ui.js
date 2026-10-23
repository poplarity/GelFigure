/* BlotFigure-style, non-modal marker reference and contextual band/label controls.
 * A reference is schematic; calibration positions always come from the original-image canvas. */
(function(G){
  'use strict';
  const App=G.App,UI=G.UI,L=G.L,E=G.Engine,$=id=>document.getElementById(id),esc=UI.esc,S=()=>App.S;
  const card=document.createElement('aside');card.id='markerReference';card.className='marker-reference-card hidden';$('editorBox').appendChild(card);
  const picker=document.createElement('div');picker.id='markerBandPop';picker.className='marker-small-pop hidden';document.body.appendChild(picker);
  const labels=document.createElement('div');labels.id='markerLabelPop';labels.className='marker-small-pop hidden';document.body.appendChild(labels);
  [picker,labels].forEach(p=>{p.setAttribute('role','dialog');p.setAttribute('aria-modal','false');});
  let active=null,moving=null,candidate='',applied='',selected=null,bandTarget=null,labelTarget=null;
  // Floating-panel positions belong to this editing session, never to figure state or undo.
  const popPositions=new Map();let popDrag=null;
  const current=()=>S()&&S().markers.includes(active)?active:null;
  const index=m=>S().markers.indexOf(m);
  const size=(bp,m)=>G.Ladders.fmt(bp,m?.unit==='kDa'?'kDa':'bp')+' '+(m?.unit==='kDa'?'kDa':'bp');
  function closePicker(){endPopDrag(picker);picker.classList.add('hidden');bandTarget=null;}
  function closeLabels(){endPopDrag(labels);labels.classList.add('hidden');labelTarget=null;}
  function close(){active=null;selected=null;card.classList.add('hidden');closePicker();if(App.mode==='marker-band')G.FigEdit.setMode(null);}
  // The phone instruction banner changes height with language/selected band. Measure it rather
  // than hiding the card's close button or the top of the real lane behind a fixed offset.
  function layout(){
    const box=$('editorBox').getBoundingClientRect(),banner=$('modeBanner'),bar=$('selBar');
    const br=banner.getBoundingClientRect(),sr=bar.getBoundingClientRect();
    const top=UI.isPhone()&&!banner.classList.contains('hidden')?Math.max(0,br.bottom-box.top+8):0;
    const bottom=!bar.classList.contains('hidden')?Math.max(0,box.bottom-sr.top+8):0;
    card.style.top=Math.max(UI.isPhone()?8:10,top)+'px';
    card.style.maxHeight=Math.max(40,box.height-Math.max(10,top)-bottom-10)+'px';
    return {top,bottom};
  }
  const layoutObserver=new ResizeObserver(()=>{if(current())layout();});
  [$('editorBox'),$('modeBanner'),$('selBar')].forEach(el=>layoutObserver.observe(el));
  function movePop(pop,x,y,remember=false){
    const v=window.visualViewport,left=(v?.offsetLeft||0)+8,top=(v?.offsetTop||0)+8;
    const width=v?.width||innerWidth,height=v?.height||innerHeight;
    pop.style.maxWidth=Math.max(1,width-16)+'px';pop.style.maxHeight=Math.max(1,height-16)+'px';
    const r=pop.getBoundingClientRect();
    const pos={x:E.clamp(x,left,Math.max(left,left+width-r.width-16)),y:E.clamp(y,top,Math.max(top,top+height-r.height-16))};
    pop.style.left=pos.x+'px';pop.style.top=pos.y+'px';
    if(remember)popPositions.set(pop,pos);
  }
  function place(pop,rect){
    pop.classList.remove('hidden');const pos=popPositions.get(pop);
    movePop(pop,pos?pos.x:rect.right+8,pos?pos.y:Math.max(54,rect.top),!!pos);
  }
  function popTitle(title){return `<button type="button" class="marker-pop-grip" title="${L('拖动移动；方向键微调','Drag to move; arrow keys nudge')}" aria-label="${esc(title)} · ${L('移动面板','Move panel')}">${esc(title)}</button>`;}
  function endPopDrag(pop){
    if(!popDrag||(pop&&popDrag.pop!==pop))return;const d=popDrag;popDrag=null;
    d.pop.classList.remove('is-dragging');if(d.pop.hasPointerCapture(d.id))d.pop.releasePointerCapture(d.id);
  }
  [picker,labels].forEach(pop=>{
    pop.addEventListener('pointerdown',e=>{
      const handle=e.target.closest('.marker-pop-grip');if(!handle||e.button!==0||popDrag)return;
      e.preventDefault();e.stopPropagation();handle.focus({preventScroll:true});
      const r=pop.getBoundingClientRect();popDrag={pop,id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};
      pop.classList.add('is-dragging');try{pop.setPointerCapture(e.pointerId);}catch(_){} // synthetic/ended pointers have no capture
    });
    pop.addEventListener('lostpointercapture',()=>endPopDrag(pop));
    pop.addEventListener('keydown',e=>{
      if(e.isComposing||!e.target.closest('.marker-pop-grip'))return;
      const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!d)return;
      e.preventDefault();const r=pop.getBoundingClientRect(),step=e.shiftKey?20:5;movePop(pop,r.left+d[0]*step,r.top+d[1]*step,true);
    });
  });
  window.addEventListener('pointermove',e=>{
    const d=popDrag;if(!d||d.id!==e.pointerId)return;if(e.cancelable)e.preventDefault();
    movePop(d.pop,d.left+e.clientX-d.x,d.top+e.clientY-d.y,true);
  },{passive:false});
  ['pointerup','pointercancel'].forEach(type=>window.addEventListener(type,e=>{if(popDrag?.id===e.pointerId)endPopDrag();}));
  window.addEventListener('blur',()=>endPopDrag());
  function keepPopsVisible(){[picker,labels].forEach(pop=>{if(!pop.classList.contains('hidden')){const r=pop.getBoundingClientRect();movePop(pop,r.left,r.top,popPositions.has(pop));}});}
  window.addEventListener('resize',()=>{endPopDrag();keepPopsVisible();});
  window.visualViewport?.addEventListener('resize',keepPopsVisible);
  window.visualViewport?.addEventListener('scroll',keepPopsVisible);
  const popObserver=new ResizeObserver(keepPopsVisible);[picker,labels].forEach(pop=>popObserver.observe(pop));
  function diagram(lad,m){
    const ks=lad.sizes,H=Math.max(200,ks.length*18),span=Math.max(1e-6,Math.log(ks[0])-Math.log(ks[ks.length-1]));
    let last=-20;const ys=ks.map(k=>(last=Math.max(10+(Math.log(ks[0])-Math.log(k))/span*H,last+15))),height=ys[ys.length-1]+16;
    return `<svg class="ladder-reference" width="116" height="${height}" viewBox="0 0 116 ${height}" aria-label="${L('Marker 条带示意','Schematic marker bands')}"><rect x="3" y="2" width="37" height="${height-4}" rx="4" fill="#eef2f8"/>${ks.map((k,i)=>{
      const ref=(lad.ref||[]).includes(k),marked=candidate===m.ladderId&&m.bands.some(b=>b.bp===k&&b.manual);
      return `<g data-size="${k}" tabindex="0" role="button" aria-label="${esc(size(k,m))}" aria-pressed="${selected===k}"><rect x="0" y="${ys[i]-7}" width="115" height="15" rx="3" fill="${selected===k?'#dbeafe':'transparent'}"/><rect x="7" y="${ys[i]-(ref?3:2)}" width="29" height="${ref?6:4}" rx="1" fill="${ref?'#d86a22':'#4263eb'}"/><text x="45" y="${ys[i]+4}" font-size="11" fill="#24324a" font-weight="${ref?700:400}">${k}${marked?' ✓':''}</text></g>`;
    }).join('')}</svg>`;
  }
  function render(reset){
    const m=current();if(!m){close();return;}if(m.ladderId!==applied){if(candidate===applied)candidate=m.ladderId;applied=m.ladderId;}const lad=G.Ladders.get(candidate)||G.Ladders.get(m.ladderId);if(!lad)return;
    const top=reset?0:card.querySelector('.marker-reference-scroll')?.scrollTop||0,preview=candidate!==m.ladderId;
    card.innerHTML=`<div class="marker-ref-head"><b>${L('Marker 参考','Marker reference')}</b><button id="markerReferenceClose" aria-label="${L('结束校准','Finish calibration')}">×</button></div>
      <div class="marker-ref-lane">${L('泳道','Lane')} ${m.lane+1} · ${m.unit==='kDa'?'kDa':'bp'}</div>
      <select id="markerReferenceModel" title="${L('预览型号','Preview a ladder')}">${UI.ladderOptions(G.Ladders.ordered(App.gelKind()),candidate)}</select>
      ${preview?`<button class="btn sm primary" id="markerUseModel">${L('使用此型号','Use this ladder')}</button><span class="marker-ref-note">${L('预览中，尚未改变标注','Preview only; labels unchanged')}</span>`:''}
      <div class="marker-reference-scroll">${diagram(lad,m)}</div>
      <p class="marker-ref-note">${L('图例可滚动。橙色为参考带；间距和颜色仅作示意。','Scroll for all bands. Orange = reference bands; spacing and colours are schematic.')}</p>
      <div class="marker-ref-actions"><button class="btn sm" id="markerAlign">${L('识别此泳道','Detect bands')}</button><button class="btn sm" id="markerRefLabels">${L('标签 / 字号','Labels / font')}</button></div>`;
    card.classList.remove('hidden');card.querySelector('.marker-reference-scroll').scrollTop=top;
    requestAnimationFrame(layout);
    $('markerReferenceClose').onclick=close;
    $('markerReferenceModel').onchange=e=>{candidate=e.target.value;selected=null;render(true);};
    if($('markerUseModel'))$('markerUseModel').onclick=()=>{m.ladderId=candidate;m.bands=[];m.ladderLocked=true;m.userAssigned=true;App.prefLadder=candidate;App.alignMarker(index(m));App.commit();render(true);};
    $('markerAlign').disabled=preview;$('markerAlign').onclick=()=>{App.alignMarker(index(m));App.commit();UI.toast(L('只更新这个 Marker 泳道，保留手动定位','Updated this marker lane only; manual anchors kept'));};
    $('markerRefLabels').onclick=()=>labelPopover(index(m),-1,$('markerRefLabels'));
    card.querySelectorAll('[data-size]').forEach(el=>{
      const choose=()=>{if(preview){UI.toast(L('先点“使用此型号”再标注','Use this ladder before marking'));return;}selected=+el.dataset.size;closePicker();render();$('modeText').textContent=L(`已选 ${size(selected,m)}，点黄色 Marker 泳道上的实际条带`,`${size(selected,m)} selected: click its real band on the yellow marker lane`);};
      el.onclick=choose;el.onkeydown=e=>{if(!e.isComposing&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();choose();}};
    });
  }
  function open(mi,band,focus=true){
    const m=S()?.markers[mi];if(!m)return;UI.flushPending();closeLabels();closePicker();active=m;applied=m.ladderId;candidate=G.Ladders.get(m.ladderId)?m.ladderId:App.defaultLadder(App.gelKind());selected=band>=0?m.bands[band]?.bp??null:null;
    G.FigEdit.setMode('marker-band');if(G.Mobile&&UI.isPhone())G.Mobile.setView('raw');render(true);App.selLane=m.lane;
    if(focus)requestAnimationFrame(()=>{if(current()===m){const r=layout();G.Editor.fitMarker(m.lane,card.offsetWidth+18,r.top,r.bottom);}});else G.Editor.draw();
  }
  function assignLane(i,mi){
    if(!S()||!S().lanes[i]||S().lanes[i].hidden){UI.toast(L('请选择未剪除的泳道','Choose a lane that is not cut out'));return false;}
    const used=S().markers.findIndex(m=>m.lane===i);if(mi!=null&&used>=0&&used!==mi){UI.toast(L('这个泳道已经是另一个 Marker','That lane is already another marker'));return false;}
    if(mi==null&&used>=0){S().markers[used].userAssigned=true;App.commit();open(used);return true;}
    if(mi==null){mi=S().markers.length;S().markers.push(App.newMarker(i));}const m=S().markers[mi];if(!m)return false;
    if(m.lane!==i){if(S().lanes[m.lane]?.name==='M')S().lanes[m.lane].name='';m.lane=i;m.bands=[];}
    m.userAssigned=true;delete S().lanes[i].markerExcluded;App.selLane=i;if(!S().lanes[i].name)S().lanes[i].name='M';App.alignMarker(mi);App.commit();open(mi);return true;
  }
  function pickLane(mi){if(!S())return;UI.flushPending();close();closeLabels();moving=mi??null;G.FigEdit.setMode('marker-lane');if(G.Mobile&&UI.isPhone())G.Mobile.setView('raw');G.Editor.fitCrop();}
  function chooseLane(i){if(assignLane(i,moving))moving=null;}
  function pickAt(x){const lanes=UI.figLanes();if(lanes.length)chooseLane(lanes.reduce((a,b)=>Math.abs(S().lanes[a].x-x)<Math.abs(S().lanes[b].x-x)?a:b));}
  function snap(m,y,free){
    y=E.clamp(y,S().crop.y,S().crop.y+S().crop.h);if(free)return y;
    const tolerance=Math.max(3,8/G.Editor.zoom()),peaks=App.lanePeaks(m.lane).map(p=>p.y+S().crop.y);
    const best=peaks.reduce((a,b)=>Math.abs(b-y)<Math.abs(a-y)?b:a,Infinity);return Math.abs(best-y)<=tolerance?best:y;
  }
  function placeBand(m,bp,y,oldBp){
    if(!S().markers.includes(m))return;let b=m.bands.find(b=>b.bp===bp);if(!b){b={bp,ref:(G.Ladders.get(m.ladderId)?.ref||[]).includes(bp)};m.bands.push(b);}
    if(oldBp!=null&&oldBp!==bp){const old=m.bands.find(b=>b.bp===oldBp);if(old)Object.assign(old,{manual:false,matched:false,show:false,excluded:true});}
    Object.assign(b,{y,manual:true,matched:true,show:true});delete b.excluded;m.userAssigned=true;App.matchMarkers(false,[m]);selected=null;closePicker();App.commit();
    $('modeText').textContent=L('点黄色泳道条带选大小，或先在参考图选大小再点实际条带；拖黄线微调','Click a band on the yellow lane to choose its size, or choose a reference size first; drag yellow lines to adjust');
  }
  function bandPicker(m,y,oldBp){
    closeLabels();bandTarget={marker:m,state:S()};const lad=G.Ladders.get(m.ladderId);if(!lad)return;
    picker.innerHTML=`<div class="marker-pop-head">${popTitle(L('这条带的大小','Band size'))}<button class="btn sm ghost" id="markerBandClose" aria-label="${L('关闭','Close')}">×</button></div>
      <div class="marker-size-grid">${lad.sizes.map(bp=>`<button data-band-size="${bp}" class="${bp===oldBp?'selected ':''}${(lad.ref||[]).includes(bp)?'reference':''}">${bp}</button>`).join('')}</div>
      <p class="hint">${L('按所选型号标注；橙色为参考带。','Sizes from the selected ladder; orange = reference bands.')} ${m.unit==='kDa'?'kDa':'bp'}</p>
      ${oldBp!=null?`<div class="actions"><button class="btn sm" id="markerBandHide">${L('隐藏标签','Hide label')}</button><button class="btn sm danger" id="markerBandDelete">${L('删除标记','Delete mark')}</button></div>`:''}`;
    const q=G.Editor.toScr(S().lanes[m.lane].x,y),r=$('editor').getBoundingClientRect();place(picker,{right:r.left+q.x,top:r.top+q.y});$('markerBandClose').onclick=closePicker;
    picker.querySelectorAll('[data-band-size]').forEach(b=>b.onclick=()=>placeBand(m,+b.dataset.bandSize,y,oldBp));
    if($('markerBandHide'))$('markerBandHide').onclick=()=>{m.bands.find(b=>b.bp===oldBp).show=false;closePicker();App.commit();};
    if($('markerBandDelete'))$('markerBandDelete').onclick=()=>{App.removeMarkerBand(index(m),oldBp);closePicker();App.commit();UI.toast(L('标记已删除，可撤销','Mark deleted; undo is available'));};
  }
  function point(x,y,free=false){
    const m=current();if(!m)return;if(candidate!==m.ladderId){UI.toast(L('先使用预览型号，再校准条带','Apply the previewed ladder before calibration'));return;}
    if(Math.abs(x-S().lanes[m.lane].x)>Math.max(S().laneHalfW*1.8,(S().lanePitch||40)*0.45)){UI.toast(L('请点当前黄色 Marker 泳道；换泳道请点左侧“换泳道”','Click the active yellow marker lane; use Change lane to select another'));return;}
    y=snap(m,y,free);if(selected!=null)placeBand(m,selected,y);else bandPicker(m,y,null);
  }
  function editBand(mi,bi){const m=S()?.markers[mi],b=m?.bands[bi];if(!b)return;open(mi,null,false);bandPicker(m,b.y,b.bp);}
  function labelPopover(mi,bi,anchor){
    const m=S()?.markers[mi];if(!m)return;const at=(anchor||$('preview')).getBoundingClientRect();UI.flushPending();closePicker();closeLabels();const bp=m.bands[bi]?.bp;labelTarget={marker:m,state:S(),bp};
    labels.innerHTML=`<div class="marker-pop-head">${popTitle(L('Marker · 泳道','Marker · lane')+' '+(m.lane+1))}<button class="btn sm ghost" id="markerPopClose" aria-label="${L('关闭','Close')}">×</button></div>
      <label class="inline-label">${L('Marker 字号','Marker font')} <input id="markerPopPt" class="num" type="number" min="4" max="14" step="0.5" value="${S().style.markerPt||''}" placeholder="${S().style.fontPt}"> pt</label>
      ${bp!=null?`<div class="marker-selected-actions"><b>${esc(size(bp,m))}</b><button class="btn sm" id="markerHideOne">${L('隐藏标签','Hide label')}</button><button class="btn sm danger" id="markerDeleteOne">${L('删除标记','Delete mark')}</button></div>`:''}
      <div class="marker-pop-options"><label>${L('单位','Unit')}<select id="markerPopUnit">${(App.gelKind()==='protein'?['kDa']:['bp','kb','auto']).map(u=>`<option value="${u}">${u==='auto'?'bp / kb':u}</option>`).join('')}</select></label><label>${L('标签位置','Label side')}<select id="markerPopSide"><option value="auto">${L('自动','Auto')}</option><option value="left">${L('左','Left')}</option><option value="right">${L('右','Right')}</option></select></label></div>
      <p class="hint">${L('勾选只控制显示，隐藏仍保留校准；删除会移除该定位点。','Visibility keeps calibration; Delete removes the anchor too.')}</p>
      <div class="marker-pop-bands">${m.bands.map(b=>`<label class="switch"><input type="checkbox" data-visible-size="${b.bp}" ${b.show?'checked':''} ${b.excluded?'disabled':''}>${esc(G.Ladders.fmt(b.bp,m.unit))}</label>`).join('')}</div>
      <div class="actions"><button class="btn sm" id="markerPopGuide">${L('定位条带 / 图例','Locate bands / reference')}</button><button class="btn sm danger" id="markerRemoveLane">${L('取消此 Marker','Remove marker role')}</button></div>`;
    place(labels,at);$('markerPopClose').onclick=closeLabels;$('markerPopUnit').value=m.unit;$('markerPopSide').value=m.side;
    $('markerPopPt').onchange=e=>{S().style.markerPt=e.target.value===''?null:E.clamp(+e.target.value||7,4,14);App.commit();};
    $('markerPopUnit').onchange=e=>{m.unit=e.target.value;App.commit();};$('markerPopSide').onchange=e=>{m.side=e.target.value;App.commit();};
    labels.querySelectorAll('[data-visible-size]').forEach(cb=>cb.onchange=()=>{m.bands.find(b=>b.bp===+cb.dataset.visibleSize).show=cb.checked;App.commit();});
    if($('markerHideOne'))$('markerHideOne').onclick=()=>{const b=m.bands.find(b=>b.bp===bp);b.show=!b.show;App.commit();};
    if($('markerDeleteOne'))$('markerDeleteOne').onclick=()=>{App.removeMarkerBand(index(m),bp);App.commit();UI.toast(L('标记已删除，Ctrl/⌘+Z 可撤销','Mark deleted; Ctrl/⌘+Z undoes it'));};
    $('markerPopGuide').onclick=()=>open(index(m),bi);
    $('markerRemoveLane').onclick=()=>{App.removeMarker(index(m));closeLabels();App.commit();UI.toast(L('已取消 Marker，自动识别会尊重这个选择；可撤销','Marker role removed; detection respects this choice. Undo is available.'));};
    syncLabels();
  }
  function syncLabels(){
    if(!labelTarget)return;const m=labelTarget.marker;if(S()!==labelTarget.state||!S().markers.includes(m)){closeLabels();return;}
    labels.querySelectorAll('[data-visible-size]').forEach(cb=>{const b=m.bands.find(b=>b.bp===+cb.dataset.visibleSize);cb.checked=!!b?.show;cb.disabled=!b||!!b.excluded;cb.parentElement.classList.toggle('is-deleted',!b||!!b.excluded);});
    if($('markerHideOne')){const b=m.bands.find(b=>b.bp===labelTarget.bp);$('markerHideOne').textContent=b?.show?L('隐藏标签','Hide label'):L('显示标签','Show label');$('markerHideOne').disabled=!b||!!b.excluded;$('markerDeleteOne').disabled=!b||!!b.excluded;}
  }
  App.on(w=>{
    if(w==='loaded'){close();closeLabels();popPositions.clear();moving=null;if(App.mode==='marker-lane')G.FigEdit.setMode(null);return;}
    if(w==='change'){if(bandTarget&&(S()!==bandTarget.state||!S().markers.includes(bandTarget.marker)))closePicker();if(active){if(current())render();else close();}syncLabels();}
  });
  [picker,labels].forEach(pop=>pop.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!['text','number'].includes(e.target.type)){e.preventDefault();e.shiftKey?App.redo():App.undo();return;}if(e.key==='Escape')pop===picker?closePicker():closeLabels();}));
  card.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing){e.stopPropagation();close();}});
  document.addEventListener('pointerdown',e=>{if(!picker.contains(e.target))closePicker();if(!labels.contains(e.target))closeLabels();},true);
  G.I18N.onChange(()=>{closePicker();closeLabels();if(current())render();});
  G.MarkerUI={open,close,layout,labelPopover,pickLane,chooseLane,pickAt,assignLane,point,editBand,pendingSize:()=>selected!=null,
    modeChanged(mode){if(mode!=='marker-band'){card.classList.add('hidden');selected=null;closePicker();active=null;}}};
})(window);
