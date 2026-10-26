/* Opt-in text feedback. No image, file name, project snapshot or diagnostics are added to the
 * form payload. The only network destination is the maintainer-configured form endpoint. */
(function(G){
 'use strict';
 const $=id=>document.getElementById(id),L=G.L,config=G.GelFigureSupport||{};
 const ONLINE='https://poplarity.github.io/GelFigure/#feedback';
 const dlg=document.createElement('div');dlg.id='feedbackDlg';dlg.className='dlg hidden';document.body.appendChild(dlg);
 let opener=null,busy=false,notice='',noticeKind='',draft={kind:'bug',message:'',email:''};
 function endpoint(){
  try{const u=new URL(config.feedbackEndpoint||'');if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port)return null;
   if(u.hostname==='formsubmit.co'&&/^\/ajax\/[A-Za-z0-9_-]{8,160}$/.test(u.pathname))return {url:u.href,provider:'FormSubmit'};
   if(u.hostname==='formsubmit.co'&&config.feedbackPublicEmail===true&&u.pathname.startsWith('/ajax/')&&/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(decodeURIComponent(u.pathname.slice(6))))return {url:u.href,provider:'FormSubmit'};
   if(u.hostname==='formspree.io'&&/^\/f\/[A-Za-z0-9_-]{5,100}$/.test(u.pathname))return {url:u.href,provider:'Formspree'};
  }catch(_){}return null;
 }
 const kindText=k=>({bug:L('使用问题','Problem'),suggestion:L('功能建议','Suggestion'),other:L('其他反馈','Other')}[k]||L('其他反馈','Other'));
 const notices={
  sending:()=>L('正在提交，请稍候…','Sending, please wait…'),copied:()=>L('反馈内容已复制。','Feedback copied.'),
  copy:()=>L('请复制下方已选中的内容。','Copy the selected text below.'),empty:()=>L('请先填写问题或建议。','Please describe your issue or suggestion.'),
  limited:()=>L('提交较频繁，请稍后再试。内容已保留。','Too many submissions. Please try later; your text is kept.'),
  rejected:()=>L('反馈服务未确认接收，内容已保留。可稍后重试或复制反馈。','The feedback service did not confirm receipt. Your text is kept; retry later or copy it.'),
  success:()=>L('反馈已提交，谢谢你帮助改进 GelFigure！','Feedback submitted. Thank you for helping improve GelFigure!'),
  network:()=>L('暂未收到提交确认，内容已保留。请检查网络后重试，或复制反馈。','No submission confirmation was received. Your text is kept. Check your connection, retry, or copy the feedback.')
 };
 function message(code,kind=''){notice=code;noticeKind=kind;if($('feedbackStatus')){$('feedbackStatus').textContent=notices[code]?.()||'';$('feedbackStatus').className='feedback-status '+kind;}}
 function readDraft(){if($('feedbackMessage'))draft={kind:['bug','suggestion','other'].includes($('feedbackKind').value)?$('feedbackKind').value:'other',message:$('feedbackMessage').value,email:$('feedbackEmail').value};}
 function sync(){
  const ep=endpoint(),local=location.protocol==='file:';
  ['feedbackKind','feedbackMessage','feedbackEmail'].forEach(id=>{$(id).disabled=busy;});
  $('feedbackSend').disabled=busy||!ep||local;$('feedbackSend').textContent=busy?L('正在提交…','Sending…'):L('发送反馈','Send feedback');
  $('feedbackService').textContent=local?L('离线版可以填写和复制内容；请到网页版发送反馈。','You can write and copy feedback here; send it from the online version.'):
   ep?L(`提交时，${ep.provider} 会将填写的内容和可选邮箱转交作者；另附工具版本号，不附带胶图、文件名或项目。`,`When submitted, ${ep.provider} forwards your text and optional email to the author, plus the app version. No gel, file name or project is attached.`):
   L('在线反馈尚未接通。你可以先填写并复制内容。','Online feedback is not connected yet. You can write and copy your message.');
  $('feedbackOnline').classList.toggle('hidden',!local);message(notice,noticeKind);
 }
 function textCopy(){return `GelFigure ${G.App.VERSION}\n${kindText(draft.kind)}\n\n${draft.message}${draft.email?'\n\n'+L('回复邮箱：','Reply email: ')+draft.email:''}`;}
 async function copy(){
  readDraft();const text=textCopy();try{await navigator.clipboard.writeText(text);message('copied');}
  catch(_){const area=$('feedbackCopyText');area.classList.remove('hidden');area.value=text;area.focus();area.select();message('copy');}
 }
 async function submit(e){
  e.preventDefault();if(busy)return;
  const ep=endpoint();if(!ep||location.protocol==='file:'){sync();return;}
  if(!$('feedbackForm').reportValidity())return;
  readDraft();const snapshot={kind:draft.kind,message:draft.message.trim(),email:draft.email.trim()};
  if(!snapshot.message){message('empty','error');$('feedbackMessage').focus();return;}
  if($('feedbackHoney').value)return;
  const payload=new URLSearchParams({category:kindText(snapshot.kind),message:snapshot.message,version:G.App.VERSION,_subject:'GelFigure feedback / '+snapshot.kind,_url:'https://poplarity.github.io/GelFigure/',_template:'table',_honey:''});
  if(snapshot.email)payload.set('email',snapshot.email);
  busy=true;message('sending');sync();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(ep.url,{method:'POST',headers:{Accept:'application/json'},body:payload,credentials:'omit',referrerPolicy:'origin',redirect:'error',signal:controller.signal});
   let data;try{data=await response.json();}catch(_){}
   const accepted=response.ok&&(data?.success===true||data?.success==='true'||data?.ok===true);
   if(!accepted){
    message(response.status===429?'limited':'rejected','error');return;
   }
   draft={kind:'bug',message:'',email:''};$('feedbackKind').value='bug';$('feedbackMessage').value='';$('feedbackEmail').value='';
   message('success','success');
  }catch(_){message('network','error');}
  finally{clearTimeout(timer);busy=false;sync();}
 }
 function render(){
  dlg.innerHTML=`<div class="dlg-body feedback-body" role="dialog" aria-modal="true" aria-labelledby="feedbackTitle">
   <button class="dlg-x" id="feedbackClose" aria-label="${L('关闭','Close')}">×</button><h3 id="feedbackTitle">${L('留下反馈','Leave feedback')}</h3>
   <p class="hint">${L('直接填写即可，无需 GitHub 账号。邮箱选填，方便作者回复。','No GitHub account needed. Your email is optional, if you would like a reply.')}</p>
   <form id="feedbackForm">
    <label>${L('反馈类型','Type')}<select id="feedbackKind"><option value="bug">${L('使用问题','Problem')}</option><option value="suggestion">${L('功能建议','Suggestion')}</option><option value="other">${L('其他反馈','Other')}</option></select></label>
    <label>${L('问题或建议','Your message')}<textarea id="feedbackMessage" rows="5" maxlength="4000" required placeholder="${L('遇到了什么问题？希望增加什么功能？','What went wrong, or what would you like to see?')}"></textarea></label>
    <label>${L('回复邮箱（选填）','Reply email (optional)')}<input id="feedbackEmail" type="email" maxlength="254" autocomplete="email"></label>
    <label class="feedback-honey" aria-hidden="true">Website<input id="feedbackHoney" type="text" tabindex="-1" autocomplete="off"></label>
    <p class="hint" id="feedbackService"></p><div id="feedbackStatus" role="status" aria-live="polite" class="feedback-status"></div>
    <div class="support-actions"><button class="btn primary" id="feedbackSend" type="submit">${L('发送反馈','Send feedback')}</button><button class="btn" id="feedbackCopy" type="button">${L('复制内容','Copy text')}</button><a class="btn hidden" id="feedbackOnline" target="_blank" rel="noopener noreferrer">${L('打开网页版','Open online version')}</a></div>
    <textarea id="feedbackCopyText" class="hidden" readonly rows="4" aria-label="${L('可复制的反馈','Feedback to copy')}"></textarea>
   </form>
   <p class="hint"><a href="https://github.com/poplarity/GelFigure/issues/new/choose" target="_blank" rel="noopener noreferrer">${L('也可通过 GitHub Issues 反馈（需账号）','You can also use GitHub Issues (account required)')}</a></p>
  </div>`;
  $('feedbackKind').value=draft.kind;$('feedbackMessage').value=draft.message;$('feedbackEmail').value=draft.email;$('feedbackOnline').href=ONLINE;
  $('feedbackKind').onchange=e=>draft.kind=e.target.value;$('feedbackMessage').oninput=e=>draft.message=e.target.value;$('feedbackEmail').oninput=e=>draft.email=e.target.value;
  $('feedbackForm').onsubmit=submit;$('feedbackCopy').onclick=copy;$('feedbackClose').onclick=close;sync();
 }
 function open(button){opener=button||document.activeElement;render();dlg.classList.remove('hidden');$('feedbackClose').focus();}
 function close(){readDraft();dlg.classList.add('hidden');if(opener?.isConnected)opener.focus();}
 dlg.addEventListener('click',e=>{if(e.target===dlg)close();});dlg.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
  if(e.key==='Tab'){const els=[...dlg.querySelectorAll('button,input,textarea,select,a[href]')].filter(el=>!el.disabled&&el.tabIndex!==-1&&el.getClientRects().length),first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 });
 G.I18N.onChange(()=>{if(!dlg.classList.contains('hidden'))render();});
 G.Feedback={open,close,endpoint};
 if(location.hash==='#feedback')setTimeout(()=>open(),0);
})(window);
