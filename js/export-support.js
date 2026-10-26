/* Persistent feedback/support/Star entry plus optional, non-blocking export reminders.
 * Payments and stars always require an explicit user action; no payment SDK or tracking. */
(function(G){
  'use strict';
  const config=G.GelFigureSupport||{},links={
    sponsor:config.sponsor||'',
    feedback:'https://github.com/poplarity/GelFigure/issues/new/choose',
    star:'https://github.com/poplarity/GelFigure'
  };
  const $=id=>document.getElementById(id),L=G.L;
  const desktop=document.createElement('aside');desktop.id='exportThanks';desktop.className='export-thanks hidden';desktop.setAttribute('role','status');document.body.appendChild(desktop);
  const mobile=document.createElement('div');mobile.id='exportThanksMobile';mobile.className='export-thanks-mobile hidden';document.querySelector('#resultSheet .rs-done').before(mobile);
  const hub=document.createElement('div');hub.id='communityDlg';hub.className='dlg hidden';document.body.appendChild(hub);let hubOpener=null;
  const url=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch(_){return '';}};
  const alipay=()=>!!config.alipayQr&&!!url(links.sponsor)&&url(links.sponsor)===url(config.sponsor)&&new URL(url(links.sponsor)).hostname==='qr.alipay.com';
  const sponsor=document.createElement('div');sponsor.id='sponsorDlg';sponsor.className='dlg hidden';document.body.appendChild(sponsor);
  let opener=null;
  function closeSponsor(){sponsor.classList.add('hidden');if(opener?.isConnected)opener.focus();}
  function openSponsor(button){
    if(!alipay())return;opener=button;
    sponsor.innerHTML=`<div class="dlg-body sponsor-body" role="dialog" aria-modal="true" aria-labelledby="sponsorTitle">
      <button class="dlg-x" id="sponsorClose" aria-label="${L('关闭','Close')}">×</button>
      <h3 id="sponsorTitle">${L('支持 GelFigure 的持续维护','Support continued work on GelFigure')}</h3>
      <p>${L('制作和维护这个工具不容易，反复开发、调试也要花钱买 Token。如果 GelFigure 帮你省了时间，欢迎自愿支持我补一点 Token 成本、回回血，让我能继续开发和维护。谢谢你的支持！','Building and maintaining this tool takes time and paid AI tokens. If GelFigure saved you time, you can optionally help cover token costs so I can keep improving it. Thank you for your support!')}</p>
      <img id="sponsorQr" alt="${L('作者提供的支付宝收款码','Author-provided Alipay payment QR code')}">
      <p class="sponsor-scan">${L('使用支付宝扫一扫','Scan with Alipay')}</p>
      <p class="hint">${L('手机可长按二维码保存，再到支付宝相册扫码；也可打开收款链接。支付前请在支付宝核对收款方。','On a phone, save the QR image and scan it from Alipay, or open the payment link. Check the recipient in Alipay before paying.')}</p>
      <div class="support-actions"><a class="btn primary" id="sponsorOpen" target="_blank" rel="noopener noreferrer">${L('打开支付宝收款链接','Open Alipay payment link')}</a><a class="btn" id="sponsorSave" download="GelFigure_alipay.png" target="_blank" rel="noopener noreferrer">${L('保存二维码','Save QR code')}</a></div>
      <p class="hint">${L('赞助完全自愿，不影响工具功能或导出。','Support is optional and does not affect tools or exports.')}</p>
      <div class="sponsor-star"><strong>${L('也欢迎在 GitHub 点个 Star','A GitHub Star also helps')}</strong><p>${L('如果喜欢这个工具，有 GitHub 账号的话，欢迎点个 Star，帮助更多人发现 GelFigure。','If you like the tool and have a GitHub account, give the project a Star to help others discover it.')}</p><a class="btn support-star" id="sponsorStar" target="_blank" rel="noopener noreferrer">${L('去 GitHub 点 Star','Star on GitHub')}</a></div>
    </div>`;
    const qr=$('sponsorQr'),save=$('sponsorSave');qr.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(config.alipayQr);save.hidden=true;$('sponsorOpen').href=url(links.sponsor);
    // PNG makes long-press saving work on mobile. The encoded payment destination is unchanged.
    qr.onload=()=>{if(qr.src.startsWith('data:image/png'))return;const canvas=document.createElement('canvas');canvas.width=qr.naturalWidth*2;canvas.height=qr.naturalHeight*2;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(qr,0,0,canvas.width,canvas.height);const png=canvas.toDataURL('image/png');qr.src=png;save.href=png;save.hidden=false;};
    $('sponsorStar').href=links.star;$('sponsorClose').onclick=closeSponsor;sponsor.classList.remove('hidden');$('sponsorClose').focus();
  }
  sponsor.addEventListener('click',e=>{if(e.target===sponsor)closeSponsor();});
  sponsor.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.stopPropagation();closeSponsor();}
    if(e.key==='Tab'){const items=[...sponsor.querySelectorAll('button,a[href]')].filter(el=>el.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
  function action(kind,label){
    if(kind==='feedback'){const b=document.createElement('button');b.type='button';b.dataset.support=kind;b.className='btn sm';b.textContent=label;b.onclick=()=>G.Feedback.open(b);return b;}
    const href=url(links[kind]);if(!href)return null;const qr=kind==='sponsor'&&alipay(),a=document.createElement(qr?'button':'a');
    if(qr){a.type='button';a.onclick=()=>openSponsor(a);}else{a.href=href;a.target='_blank';a.rel='noopener noreferrer';}
    a.className='btn sm '+(kind==='sponsor'?'support-author':kind==='star'?'support-star':'');a.dataset.support=kind;a.textContent=label;return a;
  }
  function closeHub(){hub.classList.add('hidden');const target=hubOpener?.isConnected&&hubOpener.getClientRects().length?hubOpener:$(G.UI.isPhone()?'btnMore':'btnCommunity');target?.focus();}
  function openHub(button){
    G.UI.flushPending();hubOpener=button||document.activeElement;hub.innerHTML=`<div class="dlg-body community-body" role="dialog" aria-modal="true" aria-labelledby="communityTitle"><button class="dlg-x" id="communityClose" aria-label="${L('关闭','Close')}">×</button><h3 id="communityTitle">${L('反馈与支持','Feedback and support')}</h3><p>${L('使用中的问题、建议和支持，随时都可以从这里找到。','Questions, suggestions and ways to support the project are always available here.')}</p><div class="community-choices" id="communityChoices"></div></div>`;
    for(const [kind,label,desc] of [
      ['feedback',L('留下反馈','Leave feedback'),L('在工具里填写，不需要 GitHub 账号。','Write here without a GitHub account.')],
      ['sponsor',L('赞助作者','Support the author'),L('自愿补一点 Token 成本，支持持续开发与维护。','Optionally help cover token costs and ongoing maintenance.')],
      ['star',L('在 GitHub 点 Star','Star on GitHub'),L('有 GitHub 账号的话，欢迎帮更多人发现这个工具。','Have a GitHub account? Help others discover the project.')]
    ]){const item=action(kind,label);if(!item)continue;item.className='community-choice';item.replaceChildren();const title=document.createElement('strong'),detail=document.createElement('span');title.textContent=label;detail.textContent=desc;item.append(title,detail);$('communityChoices').appendChild(item);}
    $('communityClose').onclick=closeHub;hub.classList.remove('hidden');$('communityClose').focus();
  }
  $('btnCommunity').onclick=()=>openHub($('btnCommunity'));
  hub.addEventListener('click',e=>{if(e.target===hub)closeHub();});hub.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.stopPropagation();closeHub();}
    if(e.key==='Tab'){const list=[...hub.querySelectorAll('button,a[href]')].filter(el=>el.getClientRects().length),first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
  function render(host,closable){
    host.replaceChildren();
    const title=document.createElement('strong');title.textContent=L('这张图，做得还顺手吗？','Did making this figure go smoothly?');host.appendChild(title);
    const text=document.createElement('p');text.textContent=L('欢迎留下建议，也可以自愿支持作者持续维护。','Share a suggestion, or optionally support continued development.');host.appendChild(text);
    const actions=document.createElement('div');actions.className='support-actions';host.appendChild(actions);
    for(const [kind,label] of [['feedback',L('留下反馈','Leave feedback')],['sponsor',L('赞助作者','Support the author')],['star','GitHub Star']]){const a=action(kind,label);if(a)actions.appendChild(a);}
    if(!url(links.sponsor))text.textContent=L('欢迎反馈使用问题和建议，帮助工具继续改进。','Share issues or suggestions to help improve the tool.');
    const hint=document.createElement('small');hint.className='support-hint';hint.textContent=L('关闭后，也可从顶栏“反馈 / 支持”再次打开。','You can reopen these options from Feedback / support in the top bar.');host.appendChild(hint);
    if(closable){const close=document.createElement('button');close.type='button';close.className='support-close';close.textContent='×';close.setAttribute('aria-label',L('关闭此提示','Dismiss this reminder'));close.onclick=()=>desktop.classList.add('hidden');host.appendChild(close);}
  }
  function show(){
    if(!G.App.S)return;
    if(!$('resultSheet').classList.contains('hidden')){render(mobile,false);mobile.classList.remove('hidden');return;}
    render(desktop,true);desktop.classList.remove('hidden');
  }
  G.addEventListener('gelfigure-figure-exported',show);
  new MutationObserver(()=>{if($('resultSheet').classList.contains('hidden'))mobile.classList.add('hidden');}).observe($('resultSheet'),{attributes:true,attributeFilter:['class']});
  function language(){closeSponsor();$('btnCommunity').setAttribute('aria-label',L('反馈与支持','Feedback and support'));if(!hub.classList.contains('hidden'))openHub(hubOpener);if(!desktop.classList.contains('hidden'))render(desktop,true);if(!mobile.classList.contains('hidden'))render(mobile,false);}
  G.I18N.onChange(language);language();
  G.ExportSupport={show,links,openHub};
})(window);
