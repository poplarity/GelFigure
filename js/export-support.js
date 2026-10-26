/* Optional author support after a successful figure export. Links only: no payment SDK,
 * analytics, upload, automatic navigation or gates in front of the user's download. */
(function(G){
  'use strict';
  const config=G.GelFigureSupport||{},links={
    sponsor:config.sponsor||'',
    feedback:'https://github.com/poplarity/GelFigure/issues/new/choose'
  };
  const $=id=>document.getElementById(id),L=G.L;
  const desktop=document.createElement('aside');desktop.id='exportThanks';desktop.className='export-thanks hidden';desktop.setAttribute('role','status');document.body.appendChild(desktop);
  const mobile=document.createElement('div');mobile.id='exportThanksMobile';mobile.className='export-thanks-mobile hidden';document.querySelector('#resultSheet .rs-done').before(mobile);
  let shown=false,dismissed=false;
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
      <p>${L('如果这个工具帮到了你，欢迎自愿赞助作者。','If this tool helped you, you are welcome to support its author.')}</p>
      <img id="sponsorQr" alt="${L('作者提供的支付宝收款码','Author-provided Alipay payment QR code')}">
      <p class="sponsor-scan">${L('使用支付宝扫一扫','Scan with Alipay')}</p>
      <p class="hint">${L('手机可长按二维码保存，再到支付宝相册扫码；也可打开收款链接。支付前请在支付宝核对收款方。','On a phone, save the QR image and scan it from Alipay, or open the payment link. Check the recipient in Alipay before paying.')}</p>
      <div class="support-actions"><a class="btn primary" id="sponsorOpen" target="_blank" rel="noopener noreferrer">${L('打开支付宝收款链接','Open Alipay payment link')}</a><a class="btn" id="sponsorSave" download="GelFigure_alipay.png" target="_blank" rel="noopener noreferrer">${L('保存二维码','Save QR code')}</a></div>
      <p class="hint">${L('赞助完全自愿，不影响工具功能或导出。','Support is optional and does not affect tools or exports.')}</p>
    </div>`;
    const qr=$('sponsorQr'),save=$('sponsorSave');qr.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(config.alipayQr);save.hidden=true;$('sponsorOpen').href=url(links.sponsor);
    // PNG makes long-press saving work on mobile. The encoded payment destination is unchanged.
    qr.onload=()=>{if(qr.src.startsWith('data:image/png'))return;const canvas=document.createElement('canvas');canvas.width=qr.naturalWidth*2;canvas.height=qr.naturalHeight*2;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(qr,0,0,canvas.width,canvas.height);const png=canvas.toDataURL('image/png');qr.src=png;save.href=png;save.hidden=false;};
    $('sponsorClose').onclick=closeSponsor;sponsor.classList.remove('hidden');$('sponsorClose').focus();
  }
  sponsor.addEventListener('click',e=>{if(e.target===sponsor)closeSponsor();});
  sponsor.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.stopPropagation();closeSponsor();}
    if(e.key==='Tab'){const items=[...sponsor.querySelectorAll('button,a[href]')].filter(el=>el.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
  function render(host,closable){
    host.replaceChildren();
    const title=document.createElement('strong');title.textContent=L('这张图，做得还顺手吗？','Did making this figure go smoothly?');host.appendChild(title);
    const text=document.createElement('p');text.textContent=L('欢迎留下建议，也可以自愿支持作者持续维护。','Share a suggestion, or optionally support continued development.');host.appendChild(text);
    const actions=document.createElement('div');actions.className='support-actions';host.appendChild(actions);
    for(const [kind,label] of [['sponsor',L('赞助作者','Support the author')],['feedback',L('留下反馈','Leave feedback')]]){
      const href=url(links[kind]);if(!href)continue;
      const qr=kind==='sponsor'&&alipay(),a=document.createElement(qr?'button':'a');
      if(qr){a.type='button';a.onclick=()=>openSponsor(a);}else{a.href=href;a.target='_blank';a.rel='noopener noreferrer';}
      a.className='btn sm '+(kind==='sponsor'?'support-author':'');a.dataset.support=kind;a.textContent=label;actions.appendChild(a);
    }
    if(!url(links.sponsor))text.textContent=L('欢迎反馈使用问题和建议，帮助工具继续改进。','Share issues or suggestions to help improve the tool.');
    const hint=document.createElement('small');hint.className='support-hint';hint.textContent=L('反馈将打开 GitHub，不自动附带图片或项目。','Feedback opens GitHub; no image or project is attached automatically.');host.appendChild(hint);
    if(closable){const close=document.createElement('button');close.type='button';close.className='support-close';close.textContent='×';close.setAttribute('aria-label',L('关闭，本次会话不再显示','Dismiss for this session'));close.onclick=()=>{dismissed=true;desktop.classList.add('hidden');};host.appendChild(close);}
  }
  function show(){
    if(!G.App.S)return;
    if(!$('resultSheet').classList.contains('hidden')){render(mobile,false);mobile.classList.remove('hidden');return;}
    if(shown||dismissed)return;shown=true;render(desktop,true);desktop.classList.remove('hidden');
  }
  G.addEventListener('gelfigure-figure-exported',show);
  new MutationObserver(()=>{if($('resultSheet').classList.contains('hidden'))mobile.classList.add('hidden');}).observe($('resultSheet'),{attributes:true,attributeFilter:['class']});
  G.I18N.onChange(()=>{closeSponsor();if(!desktop.classList.contains('hidden'))render(desktop,true);if(!mobile.classList.contains('hidden'))render(mobile,false);});
  G.ExportSupport={show,links};
})(window);
