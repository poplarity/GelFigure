/* Local release history and a non-modal, once-per-version startup notice. No network requests. */
(function(G){
  'use strict';
  const $=id=>document.getElementById(id),L=G.L,A=G.App,KEY='gelfig.updatesSeen.v1';
  const releases=G.GelFigureReleases||[],current=releases.find(r=>r.version===A.VERSION);
  const card=document.createElement('aside');card.id='updateNotice';card.className='update-notice hidden';card.setAttribute('aria-live','polite');card.setAttribute('aria-labelledby','updateNoticeTitle');document.body.appendChild(card);
  const dialog=document.createElement('div');dialog.id='updatesDlg';dialog.className='dlg hidden';document.body.appendChild(dialog);
  let opener=null,automaticShown=false;
  const parsed=v=>typeof v==='string'&&v.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  function compare(a,b){
    const x=parsed(a),y=parsed(b);if(!x)return -1;if(!y)return 1;
    for(let i=1;i<=3;i++)if(+x[i]!==+y[i])return +x[i]>+y[i]?1:-1;
    if(!x[4]&&!y[4])return 0;if(!x[4])return 1;if(!y[4])return -1;
    return x[4].localeCompare(y[4],undefined,{numeric:true});
  }
  const bullets=r=>r[G.I18N.lang==='en'?'en':'zh']||[];
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const label=r=>'v'+r.version+(r.version.includes('-')?L(' · 开发预览',' · Development preview'):'');
  function hideNotice(){card.classList.add('hidden');}
  function showNotice(){
    if(!current||automaticShown||A.S||location.hash==='#feedback')return;
    const seen=G.PrefStorage.getItem(KEY);if(compare(A.VERSION,seen)<=0)return;
    automaticShown=true;G.PrefStorage.setItem(KEY,A.VERSION);
    renderNotice();card.classList.remove('hidden');
  }
  function renderNotice(){
    if(!current)return;
    card.innerHTML=`<button class="update-dismiss" id="updateNoticeClose" aria-label="${L('关闭更新提示','Dismiss update notice')}">×</button><span class="update-eyebrow">${esc(label(current))}</span><h3 id="updateNoticeTitle">${L('这次更新了什么','What’s new in GelFigure')}</h3><ul>${bullets(current).map(t=>'<li>'+esc(t)+'</li>').join('')}</ul><div class="update-notice-footer"><button class="btn sm" id="updateNoticeHistory">${L('查看历次更新','View release history')}</button><span>${L('此版本仅提示一次','Shown once per version')}</span></div>`;
    $('updateNoticeClose').onclick=hideNotice;$('updateNoticeHistory').onclick=()=>open($('btnUpdatesStart'));
  }
  function close(){
    dialog.classList.add('hidden');
    const target=opener?.isConnected&&opener.getClientRects().length?opener:$(G.UI.isPhone()?'btnMore':'btnTplMenu');target?.focus({preventScroll:true});
  }
  function renderDialog(){
    dialog.innerHTML=`<div class="dlg-body updates-body" role="dialog" aria-modal="true" aria-labelledby="updatesTitle"><div class="updates-head"><div><h3 id="updatesTitle">${L('更新日志','Release history')}</h3><p id="updatesCurrent">${L('当前运行版本','Running version')} <b>v${esc(A.VERSION)}</b></p></div><button class="updates-close" id="updatesClose" aria-label="${L('关闭','Close')}">×</button></div><div class="updates-history" id="updatesHistory" tabindex="0">${releases.map(r=>`<article class="release-entry${r.version===A.VERSION?' current':''}" data-version="${esc(r.version)}"><h4>${esc(label(r))}${r.version===A.VERSION?`<span class="release-current">${L('当前版本','Current')}</span>`:''}</h4><time datetime="${r.date}">${r.date}</time><ul>${bullets(r).map(t=>'<li>'+esc(t)+'</li>').join('')}</ul></article>`).join('')}</div><div class="updates-footer"><span>${L('简要记录每一版的主要变化','Brief highlights from each version')}</span><a href="https://github.com/poplarity/GelFigure/blob/${A.VERSION.includes('-')?'dev':'main'}/CHANGELOG.md" target="_blank" rel="noopener noreferrer">${L('完整更新日志 ↗','Full changelog ↗')}</a></div></div>`;
    $('updatesClose').onclick=close;
  }
  function open(button){
    G.UI.flushPending();hideNotice();opener=button||document.activeElement;renderDialog();dialog.classList.remove('hidden');$('updatesClose').focus({preventScroll:true});
  }
  dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
  dialog.addEventListener('keydown',e=>{
    e.stopPropagation();if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();close();return;}
    if(e.key==='Tab'){
      const list=[...dialog.querySelectorAll('button,a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length),first=list[0],last=list.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  card.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing){e.stopPropagation();hideNotice();}});
  for(const id of ['btnUpdates','btnUpdatesStart','btnHelpUpdates'])$(id).onclick=()=>open($(id));
  document.querySelectorAll('[data-app-version]').forEach(el=>{el.textContent='v'+A.VERSION;});
  G.I18N.onChange(()=>{
    if(!card.classList.contains('hidden'))renderNotice();
    if(!dialog.classList.contains('hidden')){const top=$('updatesHistory').scrollTop;renderDialog();$('updatesHistory').scrollTop=top;$('updatesClose').focus({preventScroll:true});}
  });
  G.addEventListener('storage',e=>{if(e.key===KEY&&compare(e.newValue,A.VERSION)>=0)hideNotice();});
  A.on(w=>{if(w==='loaded')hideNotice();});
  // Wait for a visible page before consuming the one-time notice; never open a modal at startup.
  const ready=()=>{if(document.visibilityState==='visible')showNotice();};
  document.addEventListener('visibilitychange',ready);requestAnimationFrame(ready);
  G.Updates={open,close,showNotice,compare,releases,key:KEY};
})(window);
