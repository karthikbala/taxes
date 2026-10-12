import {load} from 'cheerio';

export const miamiDeedUrl='https://miamidade.realtdm.com/public/cases/List';
const bodyLimit=1000000;
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const secretName=/(?:csrf|xsrf|token|password|secret|verification|nonce|session|authenticity)/i;

export function normalizeMiamiDeedFolio(folio){
 if(folio===undefined||folio===null||folio==='')return null;
 if(typeof folio!=='string'||!/^\d{13}$|^\d{2}-\d{4}-\d{3}-\d{4}$/.test(folio))throw Object.assign(new Error('Miami deed search requires a 13-digit folio.'),{code:'invalid_deed_folio'});
 const digits=folio.replace(/-/g,'');return digits.slice(0,2)+'-'+digits.slice(2,6)+'-'+digits.slice(6,9)+'-'+digits.slice(9);
}

// Fixed-source discovery/search only. Callers cannot supply a URL or script.
export function miamiDeedCaptureCode(folio){const requestedFolio=normalizeMiamiDeedFolio(folio);return `
await (async()=>{
 let response=null,navigationError=null;
 try{response=await page.goto(${JSON.stringify(miamiDeedUrl)},{waitUntil:'domcontentloaded',timeout:22000});}
 catch{navigationError='NAVIGATION_INCOMPLETE';}
 const requestedFolio=${JSON.stringify(requestedFolio)};
 let searchApplied=false,searchError=null,searchSubmission=null;const searchResponses=[];
 if(requestedFolio){
  const observe=r=>{try{const u=new URL(r.url());const req=r.request();const type=req.resourceType();if(u.origin==='https://miamidade.realtdm.com'&&u.pathname.toLowerCase()==='/public/cases/list'&&type==='document'&&req.method()==='POST'){const data=new URLSearchParams(req.postData()||'');searchSubmission={http_status:r.status(),parcel:data.get('filterParcelNumber'),status:data.get('filterCaseStatus'),other_filters:['filterPartyName','filterCaseNumber','filterAppNumber','filterCertNumber','filterPropAddress','filterSaleDateStart','filterSaleDateStop'].map(k=>data.get(k)),page:data.get('filterPage')};}if(u.origin==='https://miamidade.realtdm.com'&&['xhr','fetch'].includes(type)&&searchResponses.length<20)searchResponses.push({url:u.origin+u.pathname,http_status:r.status()});}catch{}};
  if(!response||response.status()<200||response.status()>=300||navigationError)searchError='INITIAL_SOURCE_NOT_READY';
  else{
   page.on('response',observe);
   try{
    const input=page.locator('#filterParcelNumber');const button=page.getByRole('button',{name:'Process Search',exact:true});
    if(await input.count()!==1||await button.count()!==1)searchError='SEARCH_CONTROLS_MISSING_OR_AMBIGUOUS';
    else{await input.fill(requestedFolio,{timeout:4000});searchApplied=true;try{await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:15000}),button.click({timeout:4000})]);await page.locator('#filterParcelNumber[data-original="'+requestedFolio+'"]').waitFor({state:'attached',timeout:5000});}catch{searchError='SEARCH_WAIT_INCOMPLETE';}}
   }catch{searchError='SEARCH_FAILED';}
   finally{page.off('response',observe);}
   if(!searchError&&searchResponses.some(r=>r.http_status>=400))searchError='SEARCH_HTTP_ERROR';
  }
 }
 const html=await page.content();
 let byteLength=0;for(const character of html){const point=character.codePointAt(0);byteLength+=point<=127?1:point<=2047?2:point<=65535?3:4;}
 if(byteLength>=${bodyLimit})throw new Error('SOURCE_BODY_LIMIT');
 const controls=await page.evaluate(()=>({
  inputs:Array.from(document.querySelectorAll('input:not([type="hidden"]),button')).filter(e=>!e.hidden&&e.getAttribute('aria-hidden')!=='true').slice(0,80).map(e=>({tag:e.tagName.toLowerCase(),id:e.id,name:e.name||'',type:e.type||'',label:e.getAttribute('aria-label')||e.labels?.[0]?.textContent||e.textContent||''})),
  selects:Array.from(document.querySelectorAll('select')).filter(e=>!e.hidden).slice(0,20).map(e=>({id:e.id,name:e.name,label:e.getAttribute('aria-label')||e.labels?.[0]?.textContent||'',options:Array.from(e.options).slice(0,80).map(o=>({text:o.textContent}))})),
  forms:Array.from(document.querySelectorAll('form')).slice(0,20).map(e=>({method:e.method,action:e.action})),
  links:Array.from(document.querySelectorAll('a[href]')).slice(0,80).map(e=>({text:e.textContent,href:e.href}))
 }));
 console.log('INVISIA_RESULT='+JSON.stringify({html,url:page.url(),http_status:response?response.status():null,content_type:response?response.headers()['content-type']||null:null,navigation_error:navigationError,requested_folio:requestedFolio,search_applied:searchApplied,search_error:searchError,search_responses:searchResponses,search_submission:searchSubmission,controls,pdf:null}));
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
 const publicStatusMenu=$('#filterCaseStatusDropdown').parent().find('[class*="dropdown-menu"],[role="menu"]');
 const caseStatusLabels=publicStatusMenu.find('label,button,a,[role="menuitem"]').filter((_,e)=>!secretName.test([$(e).attr('id'),$(e).attr('name')].join(' '))).slice(0,30).map((_,e)=>clean($(e).text())).get().filter(Boolean);
 $('.modal,script,style,noscript,[hidden],[aria-hidden="true"],input[type="hidden"],[style*="display:none"],[style*="display: none"]').remove();
 const text=clean($('body').text());
 const httpStatus=Number.isInteger(capture.http_status)?capture.http_status:null;
 const blocked=[403,429].includes(httpStatus)||(Array.isArray(capture.search_responses)&&capture.search_responses.some(r=>[403,429].includes(r.http_status)))||/verify (?:that )?you are human|checking your browser|just a moment|access denied|sorry, you have been blocked|please enable javascript and cookies|captcha verification required/i.test(text);
 const login=/(?:\/)(?:login|signin|sign-in)(?:\/|$)/i.test(new URL(url).pathname)||/please (?:log|sign) in to (?:access|view|continue)|login required|authentication required/i.test(text)||($('input[type="password"]').length>0&&/\blog\s?in\b|\bsign\s?in\b/i.test(text));
 const status=blocked?'BLOCKED':login?'LOGIN_REQUIRED':capture.navigation_error||httpStatus===null||httpStatus<200||httpStatus>=300?'FAILED':'DISCOVERY_ONLY';
 const visible=e=>!secretName.test([$(e).attr('id'),$(e).attr('name'),$(e).attr('type')].join(' '));
 const controls={inputs:[],selects:[],forms:[],links:[]};
 const requestedFolio=normalizeMiamiDeedFolio(capture.requested_folio);
 const searchApplied=capture.search_applied===true&&requestedFolio!==null;
 const searchEvidence={tables:[],pagination:[],case_status_labels:[]};
 if(status==='DISCOVERY_ONLY'){
  $('input:not([type="hidden"]),button').filter((_,e)=>visible(e)).slice(0,80).each((_,e)=>{const x=$(e),id=x.attr('id')||null;controls.inputs.push({tag:e.tagName,id,name:x.attr('name')||null,type:x.attr('type')||null,label:clean(x.attr('aria-label')||(id?$('label').filter((_,l)=>$(l).attr('for')===id).first().text():'')||x.text())});});
  $('select').filter((_,e)=>visible(e)).slice(0,20).each((_,e)=>{const x=$(e),id=x.attr('id')||null;controls.selects.push({id,name:x.attr('name')||null,label:clean(x.attr('aria-label')||(id?$('label').filter((_,l)=>$(l).attr('for')===id).first().text():'')),options:x.find('option').slice(0,80).map((_,o)=>clean($(o).text())).get()});});
  $('form').slice(0,20).each((_,e)=>{const x=$(e),action=publicUrl(x.attr('action')||url);if(action)controls.forms.push({method:clean(x.attr('method')||'GET').toUpperCase(),action});});
  $('a[href]').slice(0,80).each((_,e)=>{const x=$(e),href=publicUrl(x.attr('href'));if(href)controls.links.push({text:clean(x.text()),href});});
 }
 if(status==='DISCOVERY_ONLY'&&searchApplied){
  // Evidence remains unverified. Input echoes never establish parcel identity.
  $('input,textarea,[name],[id]').filter((_,e)=>secretName.test([$(e).attr('name'),$(e).attr('id')].join(' '))).remove();
  $('table').slice(0,10).each((_,e)=>{const t=$(e);searchEvidence.tables.push({headers:t.find('thead th,thead td').slice(0,40).map((_,cell)=>clean($(cell).text())).get(),rows:t.find('tbody tr').slice(0,100).map((_,r)=>[$(r).find('th,td').slice(0,40).map((_,cell)=>clean($(cell).text())).get()]).get()});});
  $('[class*="pagination"],[id*="pagination"],[aria-label*="pagination"],[aria-label*="Pagination"],.dataTables_info,.dataTables_paginate,[class*="pager"]').slice(0,10).each((_,e)=>{const p=$(e);searchEvidence.pagination.push({text:clean(p.text()),links:p.find('a[href]').slice(0,30).map((_,a)=>({text:clean($(a).text()),href:publicUrl($(a).attr('href'))})).get().filter(a=>a.href)});});
  searchEvidence.case_status_labels=caseStatusLabels;
  // No hidden values, script bodies, input echoes or URL tokens enter text evidence.
  $('input,textarea,select').remove();
  $('a[href]').each((_,e)=>{const x=$(e),href=publicUrl(x.attr('href'));if(href)x.attr('href',href);else x.removeAttr('href');});
  searchEvidence.visible_text=clean($('body').text()).slice(0,100000);
 }
 const searchResponses=Array.isArray(capture.search_responses)?capture.search_responses.slice(0,20).map(r=>({url:publicUrl(r.url),http_status:Number.isInteger(r.http_status)?r.http_status:null})).filter(r=>r.url):[];
 return {status,url,http_status:httpStatus,requested_folio:requestedFolio,search_applied:searchApplied,search_error:capture.search_error?clean(capture.search_error).replace(/[^A-Z_]/g,'').slice(0,80):null,search_responses:searchResponses,search_evidence:searchEvidence,navigation_incomplete:Boolean(capture.navigation_error),controls,record_verified:false,parcel_identity:null,case_identity:null,coverage:'UNAVAILABLE',note:status==='FAILED'?'The public portal request did not complete successfully; no record or clearance evidence was obtained.':status==='BLOCKED'?'The Clerk portal returned a blocking response or access challenge; no case or clearance evidence was obtained.':status==='LOGIN_REQUIRED'?'The Clerk portal requires authentication; no case or clearance evidence was obtained.':'Public portal discovery only. Search controls and links require further adapter evidence; no parcel, tax-deed case or historical clearance is verified.'};
}
