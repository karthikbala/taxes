import {load} from 'cheerio';

export const miamiDeedUrl='https://miamidade.realtdm.com/public/cases/List';
const bodyLimit=1000000;
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const secretName=/(?:csrf|xsrf|token|password|secret|verification|nonce|session|authenticity)/i;

// This is source discovery only. Callers cannot supply a URL, script or search value.
export function miamiDeedCaptureCode(){return `
await (async()=>{
 let response=null,navigationError=null;
 try{response=await page.goto(${JSON.stringify(miamiDeedUrl)},{waitUntil:'domcontentloaded',timeout:22000});}
 catch{navigationError='NAVIGATION_INCOMPLETE';}
 const html=await page.content();
 let byteLength=0;for(const character of html){const point=character.codePointAt(0);byteLength+=point<=127?1:point<=2047?2:point<=65535?3:4;}
 if(byteLength>=${bodyLimit})throw new Error('SOURCE_BODY_LIMIT');
 const controls=await page.evaluate(()=>({
  inputs:Array.from(document.querySelectorAll('input:not([type="hidden"]),button')).filter(e=>!e.hidden&&e.getAttribute('aria-hidden')!=='true').slice(0,80).map(e=>({tag:e.tagName.toLowerCase(),id:e.id,name:e.name||'',type:e.type||'',label:e.getAttribute('aria-label')||e.labels?.[0]?.textContent||e.textContent||''})),
  selects:Array.from(document.querySelectorAll('select')).filter(e=>!e.hidden).slice(0,20).map(e=>({id:e.id,name:e.name,label:e.getAttribute('aria-label')||e.labels?.[0]?.textContent||'',options:Array.from(e.options).slice(0,80).map(o=>({text:o.textContent}))})),
  forms:Array.from(document.querySelectorAll('form')).slice(0,20).map(e=>({method:e.method,action:e.action})),
  links:Array.from(document.querySelectorAll('a[href]')).slice(0,80).map(e=>({text:e.textContent,href:e.href}))
 }));
 console.log('INVISIA_RESULT='+JSON.stringify({html,url:page.url(),http_status:response?response.status():null,content_type:response?response.headers()['content-type']||null:null,navigation_error:navigationError,controls,pdf:null}));
})();
`;}

function publicUrl(value){
 try{const u=new URL(value,miamiDeedUrl);if(u.origin!==new URL(miamiDeedUrl).origin)return null;u.search='';u.hash='';return u.href;}
 catch{return null;}
}

export function summarizeDeedCapture(capture){
 if(typeof capture?.html!=='string'||new TextEncoder().encode(capture.html).byteLength>=bodyLimit)throw Object.assign(new Error('Deed capture is missing or exceeds the source body limit.'),{code:'managed_source_incomplete'});
 const url=publicUrl(capture.url);
 if(!url)throw Object.assign(new Error('Deed capture source origin differs from the fixed Clerk portal.'),{code:'source_url_rejected'});
 const $=load(capture.html);
 $('script,style,noscript,[hidden],[aria-hidden="true"],input[type="hidden"],[style*="display:none"],[style*="display: none"]').remove();
 const text=clean($('body').text());
 const httpStatus=Number.isInteger(capture.http_status)?capture.http_status:null;
 const blocked=[403,429].includes(httpStatus)||/verify (?:that )?you are human|checking your browser|just a moment|access denied|sorry, you have been blocked|please enable javascript and cookies|captcha verification required/i.test(text);
 const login=/(?:\/)(?:login|signin|sign-in)(?:\/|$)/i.test(new URL(url).pathname)||/please (?:log|sign) in to (?:access|view|continue)|login required|authentication required/i.test(text)||($('input[type="password"]').length>0&&/\blog\s?in\b|\bsign\s?in\b/i.test(text));
 const status=blocked?'BLOCKED':login?'LOGIN_REQUIRED':capture.navigation_error||httpStatus===null||httpStatus<200||httpStatus>=300?'FAILED':'DISCOVERY_ONLY';
 const visible=e=>!secretName.test([$(e).attr('id'),$(e).attr('name'),$(e).attr('type')].join(' '));
 const controls={inputs:[],selects:[],forms:[],links:[]};
 if(status==='DISCOVERY_ONLY'){
  $('input:not([type="hidden"]),button').filter((_,e)=>visible(e)).slice(0,80).each((_,e)=>{const x=$(e),id=x.attr('id')||null;controls.inputs.push({tag:e.tagName,id,name:x.attr('name')||null,type:x.attr('type')||null,label:clean(x.attr('aria-label')||(id?$('label').filter((_,l)=>$(l).attr('for')===id).first().text():'')||x.text())});});
  $('select').filter((_,e)=>visible(e)).slice(0,20).each((_,e)=>{const x=$(e),id=x.attr('id')||null;controls.selects.push({id,name:x.attr('name')||null,label:clean(x.attr('aria-label')||(id?$('label').filter((_,l)=>$(l).attr('for')===id).first().text():'')),options:x.find('option').slice(0,80).map((_,o)=>clean($(o).text())).get()});});
  $('form').slice(0,20).each((_,e)=>{const x=$(e),action=publicUrl(x.attr('action')||url);if(action)controls.forms.push({method:clean(x.attr('method')||'GET').toUpperCase(),action});});
  $('a[href]').slice(0,80).each((_,e)=>{const x=$(e),href=publicUrl(x.attr('href'));if(href)controls.links.push({text:clean(x.text()),href});});
 }
 return {status,url,http_status:httpStatus,navigation_incomplete:Boolean(capture.navigation_error),controls,record_verified:false,parcel_identity:null,case_identity:null,coverage:'UNAVAILABLE',note:status==='FAILED'?'The public portal request did not complete successfully; no record or clearance evidence was obtained.':status==='BLOCKED'?'The Clerk portal returned a blocking response or access challenge; no case or clearance evidence was obtained.':status==='LOGIN_REQUIRED'?'The Clerk portal requires authentication; no case or clearance evidence was obtained.':'Public portal discovery only. Search controls and links require further adapter evidence; no parcel, tax-deed case or historical clearance is verified.'};
}
