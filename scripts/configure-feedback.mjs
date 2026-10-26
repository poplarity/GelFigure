/* Configure a public form ID, or an email only with the maintainer's explicit --public-email choice.
 * Never accept activation URLs. Keep folder/single-HTML CSP limited to this exact endpoint. */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),arg=process.argv[2];
if(!arg)throw new Error('Usage: node scripts/configure-feedback.mjs https://formsubmit.co/PUBLIC_FORM_ID (or --clear)');
let endpoint='',publicEmail=false;
if(arg!=='--clear'){
 const u=new URL(arg);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port)throw new Error('Use a plain HTTPS form endpoint');
 if(u.hostname==='formsubmit.co'&&/^\/(?:ajax\/)?[A-Za-z0-9_-]{8,160}$/.test(u.pathname)){const id=u.pathname.split('/').at(-1);endpoint='https://formsubmit.co/ajax/'+id;}
 else if(u.hostname==='formsubmit.co'&&process.argv.includes('--public-email')){
  const email=decodeURIComponent(u.pathname.replace(/^\/(?:ajax\/)?/,''));if(!/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email))throw new Error('Invalid public feedback email');
  endpoint='https://formsubmit.co/ajax/'+encodeURIComponent(email);publicEmail=true;
 }
 else if(u.hostname==='formspree.io'&&/^\/f\/[A-Za-z0-9_-]{5,100}$/.test(u.pathname))endpoint=u.href;
 else throw new Error('Use a public opaque form ID, not an email address, confirmation link or secret API key');
}
const cfgPath=path.join(root,'js/support-config.js'),source=fs.readFileSync(cfgPath,'utf8'),marker='window.GelFigureSupport = ',at=source.indexOf(marker);
if(at<0)throw new Error('Cannot locate support configuration');
const config=JSON.parse(source.slice(at+marker.length).trim().replace(/;$/,''));config.feedbackEndpoint=endpoint;config.feedbackPublicEmail=publicEmail;
const htmlPath=path.join(root,'index.html'),html=fs.readFileSync(htmlPath,'utf8');
let changed=false;
const next=html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]+)(">)/,(_,a,policy,z)=>{
 if(!/connect-src [^;]*;/.test(policy))throw new Error('Cannot locate CSP connect-src');changed=true;
 return a+policy.replace(/connect-src [^;]*;/,"connect-src 'self' file: data: blob:"+(endpoint?' '+endpoint:'')+';')+z;
});
if(!changed)throw new Error('Cannot locate CSP meta element');
fs.writeFileSync(cfgPath,source.slice(0,at)+marker+JSON.stringify(config)+';\n');fs.writeFileSync(htmlPath,next);
console.log(endpoint?'Feedback form configured; CSP permits only that endpoint.':'Feedback endpoint cleared; external submissions disabled.');
