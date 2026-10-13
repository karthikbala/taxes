import {initNeighbors} from './neighbors.js';
import {sourcePresentation} from './source-status.mjs';
import {renderSections,renderValidation,renderValue,resultBadge,resultRequestId} from './poc-render.mjs';
import {selectedPropertyOrder,selectedParcelCheck} from './property-drilldown.mjs';

import {pocWorkflows,automaticPocMode,automaticPocRequest,workflowSample,supportsNeighbors} from './poc-workflows.mjs';

const el=id=>document.getElementById(id),countyProfiles=new Map();
let last=null,activeLookup=null,neighborsSnapshot=null;
let currentJob=null,watchingJob=false;
const savedJob={get(){try{return sessionStorage.getItem('taxes.pending-job');}catch{return null;}},set(value){try{sessionStorage.setItem('taxes.pending-job',value);}catch{}},clear(){try{sessionStorage.removeItem('taxes.pending-job');}catch{}}};
const text=(parent,tag,value)=>{const n=document.createElement(tag);n.textContent=value;parent.append(n);return n;};
const fields=()=>({
 order:el('order').value,address:el('address').value,owner:el('owner').value,transaction:el('transaction').value,
 parcel:el('parcel').value,account:el('collector-account').value,includePdf:el('include-pdf').checked
});
const selectedMode=()=>automaticPocMode(countyProfiles.get(el('county').value),fields());
const request=()=>automaticPocRequest(countyProfiles.get(el('county').value),fields());
const input=()=>request().body;
const preview=()=>{try{const r=request();el('request').textContent=JSON.stringify(r.body,null,2)+'\n\n'+[
 'curl -X POST '+location.origin+(r.endpoint==='/api/v2/property/lookup'?'/api/v2/property/jobs':r.endpoint),
 '-H "Authorization: Bearer $POC_ACCESS_KEY"',
 '-H "Content-Type: application/json"',
 '--data '+"'"+JSON.stringify(r.body).replaceAll("'", "'\\''")+"'"
].join(' \\\n');}catch(error){el('request').textContent=error.message;}};
const neighborsAvailable=()=>supportsNeighbors(countyProfiles.get(el('county').value),selectedMode());
const setForm=order=>{for(const [id,key]of [['order','scrap_order_id'],['address','address'],['owner','ownerName'],['county','county'],['transaction','transactionType']])el(id).value=order[key]||'';el('parcel').value='';el('collector-account').value='';syncSearch();};
const invalidateNeighbors=()=>{neighborsSnapshot=null;el('neighbors-back').hidden=true;};
function beginLookup(mode){
 if(activeLookup)return false;
 activeLookup=mode;last=null;
 for(const id of ['submit','use-example','neighbors-check','county','neighbors-same-building','download','address','owner','parcel','order','transaction','include-pdf','collector-account'])el(id).disabled=true;
 el('neighbors-back').hidden=!neighborsSnapshot||mode==='neighbors';el('neighbors-back').disabled=true;
 el('selected-property-context').hidden=true;
 el('result-panel').setAttribute('aria-busy','true');
 el('result-title').textContent=mode==='neighbors'?'Neighbouring properties and owner-name matches':'Result and source coverage';
 el('client-result').hidden=mode==='neighbors';el('neighbors-view').hidden=mode!=='neighbors';el('neighbors-map-view').hidden=true;
 for(const id of ['error','request-id','timer'])el(id).textContent='';
 for(const id of ['sections','sources','summary'])el(id).replaceChildren();
 if(mode==='neighbors'||!neighborsSnapshot)for(const id of ['neighbors-result','neighbors-map-result'])el(id).replaceChildren();
 el('status').className='status';el('json').textContent='Waiting for the live result…';
 return true;
}
function finishLookup(mode){
 if(activeLookup!==mode)return;
 activeLookup=null;el('submit').disabled=false;el('county').disabled=false;syncSearch();
 el('neighbors-check').disabled=!neighborsAvailable();el('neighbors-same-building').disabled=!neighborsAvailable();
 el('neighbors-back').disabled=false;el('result-panel').setAttribute('aria-busy','false');
}
function displayFieldAvailability(value,statuses,path=''){
 if(value===null){const labels={NOT_PUBLISHED:'Not published by the inspected source',ACCESS_RESTRICTED:'Source access restricted',SOURCE_OUTAGE:'Source temporarily unavailable',IDENTITY_REVIEW:'Property identity requires review',LAYOUT_UNSUPPORTED:'Source evidence requires review',VALIDATION_CONFLICT:'Source values conflict',BUDGET_PENDING:'Recovery access awaiting approval'};return labels[statuses?.[path]?.reason]||value;}
 if(Array.isArray(value)){if(!value.length&&statuses?.[path]?.status==='UNAVAILABLE')return displayFieldAvailability(null,statuses,path);return value.map((v,i)=>displayFieldAvailability(v,statuses,`${path}[${i}]`));}
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,displayFieldAvailability(v,statuses,path?path+'.'+k:k)]));
 return value;
}
function renderClientData(data,response,expectedFolio,fieldStatus){
 last=data;el('json').textContent=JSON.stringify(data,null,2);
 const meta=data.ExtractionMetadata,record=data.scrapTaxOrderRequest,badge=resultBadge(data,response.ok);
 el('status').textContent=badge.label;el('status').className=badge.className;
 const requestId=resultRequestId(data,response.headers.get('x-request-id'));
 el('request-id').textContent=requestId?'Request ID: '+requestId:'';
 el('error').textContent=data.error?.message||(data.errorMessage&&data.errorMessage!=='NA'?data.errorMessage:'')||'';
 let canDisplay=true;
 if(expectedFolio){
  const check=selectedParcelCheck(data,expectedFolio);
  el('selected-property-context').textContent=check.message;el('selected-property-context').hidden=false;
  if(!check.verified){canDisplay=false;el('status').textContent='Selected property not verified';el('status').className='status warn';el('error').textContent=[check.message,el('error').textContent].filter(Boolean).join(' ');}
 }
 const autoAmbiguous=meta?.match?.requested_address_type==='auto'&&meta.match.status==='AMBIGUOUS';
 if(meta?.match?.status==='ADDRESS_REVIEW_REQUIRED'||autoAmbiguous){
  canDisplay=false;el('status').textContent='Property address confirmation needed';el('status').className='status warn';
  const panel=document.createElement('div');panel.className='section';text(panel,'h3',autoAmbiguous?'More than one property matches':'The supplied address is a mailing address');
  text(panel,'p',autoAmbiguous?'The verified owner and address match more than one parcel across the property-site and mailing-address searches. Confirm the intended parcel before fetching its tax records.':'The county records use this as a mailing address. Their property sites are different. Any separately verified property at the supplied address is also listed with its actual county and current owners. Choose a parcel to fill its county lookup, then fetch its records. Nothing is selected or fetched automatically.');
  const reviewCandidates=autoAmbiguous?(meta.match.candidates||[]).filter(c=>c.verified_address_match&&c.owner_matches_requested):meta.match.candidates||[];
  for(const candidate of [...reviewCandidates.map(c=>({county:el('county').value,county_name:data.county||countyProfiles.get(el('county').value)?.client?.name||countyProfiles.get(el('county').value)?.name,...c})),...(meta.match.site_candidates||[])]){
   const card=document.createElement('article');card.className='record-card';
   text(card,'h4',candidate.county_name+' parcel '+candidate.parcel_id);if(candidate.address_match_type==='site')text(card,'p','This is the property at the supplied address, in '+candidate.county_name+' County. '+(candidate.owner_matches_requested?'The reported owner names match.':'The county owner names differ from the supplied name. Do not attribute this property to that owner.'));renderValue(document,card,{property_site:candidate.address,owners:candidate.owners,mailing_address:candidate.mailing_address,owner_comparison:candidate.owner_matches_requested?'Exact reported owner names':'County owner name differs from the supplied name'});
   const button=document.createElement('button');button.type='button';button.textContent='Use parcel '+candidate.parcel_id;button.disabled=!countyProfiles.get(candidate.county)?.lookup_modes.includes('county');
   if(button.disabled)text(card,'p','This county is currently unavailable in the POC.');
   button.addEventListener('click',()=>{if(activeLookup||button.disabled)return;invalidateNeighbors();clearResults();el('county').value=candidate.county;el('address').value='';el('owner').value='';el('parcel').value=candidate.parcel_id;el('collector-account').value='';syncSearch();el('county-example').textContent='Selected property · '+candidate.address;});
   card.append(button);panel.append(card);
  }
  for(const check of meta.match.site_reference_checks||[])if(check.status==='UNAVAILABLE')text(panel,'p',check.county+' physical-address check is unavailable. No cross-county identity is claimed.');
  el('sections').append(panel);
 }
 if(record&&canDisplay){
  for(const [label,value]of [['Property',record.PropertyInformation?.PropertyAddress??'Unavailable'],['Parcel',record.PropertyInformation?.ParcelNumber??'Unavailable'],['Match',record.matchStatus],['Latest annual bill',record.BillDetails?.taxYear??'Unavailable'],['Historical coverage',record.DelinquencyInformation?.coverage??'Unavailable']]){
   const div=document.createElement('div');text(div,'small',label);text(div,'strong',String(value));el('summary').append(div);
  }
  if(meta?.match?.requested_address_type==='auto'&&meta.match.status==='MATCHED'){
   const meaning=meta.match.matched_address_types?.length>1?'Property site and owner mailing address':meta.match.input_address_type==='mailing'?'Owner mailing address':'Property site address';
   const div=document.createElement('div');text(div,'small','Address matched as');text(div,'strong',meaning+' · detected from county records');el('summary').append(div);
  }
  renderSections(document,el('sections'),fieldStatus?displayFieldAvailability(record,fieldStatus):record,meta?.section_status||{});renderValidation(document,el('sections'),meta?.validation||{});
 }
 const sourceRows=meta?.sources||data.sources||[];
 const sourceGroup=document.createElement('details');sourceGroup.className='section';text(sourceGroup,'summary','Sources and retrieval details ('+sourceRows.length+')');
 for(const source of sourceRows){
  const div=document.createElement('div');div.className='section';const presentation=sourcePresentation(source);
  text(div,'h3',source.id+' · '+presentation.label);if(presentation.note&&presentation.note!==presentation.label)text(div,'p',presentation.note);
  const a=text(div,'a',source.url||'Source URL unavailable');try{const url=new URL(source.url);if(['https:','http:'].includes(url.protocol)){a.href=url.href;a.target='_blank';a.rel='noopener';}}catch{}
  text(div,'p',source.method+' · '+(source.http_status||'browser capture'));sourceGroup.append(div);
 }
 if(sourceRows.length)el('sources').append(sourceGroup);
 if(!record&&!data.error)renderParcelData(data);
 el('download').disabled=false;
}
function renderParcelData(data){
 const roll=data.mode==='live_retrieval_annual_roll',collector=data.mode==='live_retrieval_collector';
 if(data.status==='partial'){el('status').textContent='Partial records · see source gaps';el('status').className='status warn';}
 text(el('sections'),'p',roll?'Annual assessment roll only. No current collector balance, payments or historical clearance is established.':collector?'County collector records and original bill. Assessment data was not requested; historical clearance is not established.':'County parcel records. The returned source coverage and any missing fields are shown below.');
 const latest=data.taxes?.history?.[0],doc=data.documents?.[0];
 for(const [label,value] of [['Property',data.property?.address||data.collector_identity?.address],['Parcel',data.property?.parcel_id||data.collector_identity?.parcel_id],['Latest bill year',doc?.fields?.tax_year||latest?.year],['Bill balance',data.taxes?.summary?.balance_due],['Document status',data.document_status]]){
  if(value===undefined||value===null)continue;const cell=document.createElement('div');text(cell,'small',label);text(cell,'strong',String(value));el('summary').append(cell);
 }
 const metadata=new Set(['request_id','status','mode','cached','input','sources','duration_ms','execution']);
 const main=new Set(['property','assessment','taxes','documents','document_status']);
 const more=document.createElement('details');more.className='section';text(more,'summary','Coverage, notes and field provenance');
 for(const [name,value] of Object.entries(data)){
  if(metadata.has(name))continue;const panel=document.createElement('div');panel.className='section';text(panel,'h3',name==='document_status'?'Document status':name.charAt(0).toUpperCase()+name.slice(1).replace(/_/g,' '));
  if(name==='assessment'&&collector)text(panel,'p','Not requested in collector-only mode. Use the separate annual assessment-roll lookup for assessment data.');
  else if(roll&&['taxes','documents'].includes(name))text(panel,'p','Not requested in annual-roll mode. This source provides assessment data only.');
  else if(name==='taxes'&&value?.annual_bill&&data.documents?.some(d=>d.tax_details)){
   const {annual_bill,...account}=value;renderValue(document,panel,account);text(panel,'p','Original bill amounts and authority rows are shown under Documents.');
  }else renderValue(document,panel,value);
  (main.has(name)?el('sections'):more).append(panel);
 }
 if(more.children.length>1)el('sections').append(more);
 el('error').textContent=(data.errors||[]).map(e=>e.message||e.code).filter(Boolean).join('; ');
}

async function runClientLookup(order,{expectedFolio,endpoint='/api/v2/property/lookup'}={}){
 if(!beginLookup('client'))return;
 el('status').textContent=order.source_mode==='state_roll'?'Fetching the requested annual assessment roll…':order.source_mode==='collector'?'Fetching fresh county collector records and the original bill…':'Fetching fresh assessor and tax collector records…';
 if(expectedFolio){el('result-title').textContent='Selected property · '+order.address;el('selected-property-context').hidden=false;el('selected-property-context').textContent='Checking selected folio '+expectedFolio+' against fresh county records.';}
 el('result-panel').scrollIntoView?.({behavior:'smooth',block:'start'});
 const start=performance.now(),tick=()=>el('timer').textContent=' · '+((performance.now()-start)/1000).toFixed(1)+' seconds';tick();
 const interval=setInterval(tick,100),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),135000);
 try{
  if(endpoint==='/api/v2/property/lookup'&&['miami-dade-fl','osceola-fl','bradford-fl'].includes(order.county)){
   clearTimeout(timeout);const response=await fetch('/api/v2/property/jobs',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+el('key').value,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(order),cache:'no-store',signal:AbortSignal.timeout(15000)});
   const job=await response.json();if(!response.ok)throw new Error(job.error?.message||'Job submission failed.');
   currentJob=job.id;savedJob.set(JSON.stringify({id:job.id,expectedFolio:expectedFolio||null}));
   await watchJob(job.id,expectedFolio);return;
  }
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+el('key').value},body:JSON.stringify(order),cache:'no-store',signal:controller.signal});
  const data=await response.json();renderClientData(data,response,expectedFolio);
 }catch(error){
  el('status').textContent='Request failed';el('status').className='status warn';
  el('error').textContent=error.name==='AbortError'?'The lookup reached its deadline; no substitute data is shown.':error.message||'API connection failed.';
 }finally{clearTimeout(timeout);clearInterval(interval);tick();finishLookup('client');}
}
const linkedJob=typeof location.search==='string'?new URLSearchParams(location.search).get('job'):null;if(linkedJob&&/^[a-f0-9-]{36}$/.test(linkedJob))savedJob.set(JSON.stringify({id:linkedJob}));
const jobActions=document.createElement('div');jobActions.className='note';
const cancelJob=document.createElement('button');cancelJob.type='button';cancelJob.textContent='Cancel lookup';cancelJob.hidden=true;
const resumeJob=document.createElement('button');resumeJob.type='button';resumeJob.textContent='Resume lookup';resumeJob.hidden=true;
const restoreJob=document.createElement('button');restoreJob.type='button';restoreJob.textContent='Restore saved lookup';
restoreJob.hidden=!savedJob.get();jobActions.append(cancelJob,resumeJob,restoreJob);el('status').insertAdjacentElement('afterend',jobActions);
const jobHeaders=()=>({'Content-Type':'application/json',Authorization:'Bearer '+el('key').value});
async function watchJob(id,expectedFolio,restoreInput=false){
 watchingJob=true;cancelJob.hidden=false;resumeJob.hidden=true;restoreJob.hidden=true;let delay=2000;
 try{while(watchingJob){
  let response,job;
  try{response=await fetch('/api/v2/property/jobs/'+id,{headers:jobHeaders(),cache:'no-store',signal:AbortSignal.timeout(15000)});job=await response.json();}
  catch{el('status').textContent='Connection interrupted · lookup continues on the server';await new Promise(r=>setTimeout(r,delay));delay=Math.min(30000,delay*2);continue;}
  if(!response.ok){el('error').textContent=job.error?.message||'Job could not be loaded.';restoreJob.hidden=false;break;}
  delay=2000;currentJob=id;if(restoreInput&&job.input){if(!countyProfiles.get(job.input.county)?.lookup_modes.includes('address')){el('error').textContent='This saved lookup belongs to a county currently unavailable in the POC.';cancelJob.hidden=true;resumeJob.hidden=true;break;}setForm(job.input);restoreInput=false;}
  if(job.result){for(const key of ['sections','sources','summary'])el(key).replaceChildren();renderClientData(job.result,response,expectedFolio,job.field_status);}
  if(job.result?.ExtractionMetadata?.match?.status!=='ADDRESS_REVIEW_REQUIRED'){const labels={queued:'Waiting to start',running:'Fetching county records',retry_scheduled:'Waiting for county retry',needs_review:'Review needed',completed:'Verified retrieval complete',completed_with_gaps:'Available records retrieved · gaps shown',failed:'Retrieval could not finish',cancelled:'Lookup cancelled'},stages={resolve_property:'Finding the property',appraiser:'Reading assessment records',collector_history:'Reading tax history',documents:'Reading original bills',certificate_deed:'Checking certificates and deeds',validation:'Checking identity and amounts',serialization:'Preparing results'};el('status').textContent=(labels[job.status]||'Lookup in progress')+(['running','queued'].includes(job.status)?' · '+(stages[job.stage]||'Fetching records'):'');}
  el('request-id').textContent='Lookup ID: '+id+' · updated '+new Date(job.updated_at).toLocaleString();
  const notes=[...new Set((job.gaps||[]).map(g=>g.reason.replaceAll('_',' ')+': '+g.action))];
  if(job.next_retry_at)notes.push('Next recovery: '+new Date(job.next_retry_at).toLocaleString());
  el('error').textContent=notes.join(' ');
  if(['completed','completed_with_gaps','failed','cancelled','needs_review'].includes(job.status)){
   cancelJob.hidden=true;resumeJob.hidden=!['completed_with_gaps','failed','needs_review','cancelled'].includes(job.status);
   if(job.status==='completed')savedJob.clear();
   if(job.result){const details=document.createElement('details');details.className='section';text(details,'summary','Field availability and recovery actions');renderValue(document,details,job.field_status);el('sections').append(details);}
   break;
  }
  await new Promise(r=>setTimeout(r,2000));
 }}finally{watchingJob=false;cancelJob.hidden=true;}
}
cancelJob.addEventListener('click',async()=>{if(!currentJob)return;cancelJob.disabled=true;try{const response=await fetch('/api/v2/property/jobs/'+currentJob+'/cancel',{method:'POST',headers:jobHeaders(),body:'{}'});if(!response.ok)el('error').textContent='Cancellation could not be confirmed; the lookup may still be running.';}catch{el('error').textContent='Cancellation could not be confirmed; reconnect to check the lookup.';}finally{cancelJob.disabled=false;}});
resumeJob.addEventListener('click',async()=>{if(activeLookup||!currentJob||!el('key').value)return;const response=await fetch('/api/v2/property/jobs/'+currentJob+'/resume',{method:'POST',headers:jobHeaders(),body:'{}'}).catch(()=>null);if(!response?.ok){el('error').textContent=response?(await response.json()).error?.message:'Could not reconnect.';return;}if(beginLookup('client'))try{await watchJob(currentJob);}finally{finishLookup('client');}});
restoreJob.addEventListener('click',async()=>{if(activeLookup)return;if(!el('key').value){el('error').textContent='Enter your access key to restore the saved lookup.';return;}try{const saved=JSON.parse(savedJob.get());if(saved?.id&&beginLookup('client'))try{await watchJob(saved.id,saved.expectedFolio,true);}finally{finishLookup('client');}}catch{savedJob.clear();el('error').textContent='The saved lookup reference is invalid.';}});

async function openProperty(property){
 if(activeLookup||!neighborsSnapshot)return;
 try{
  const order=selectedPropertyOrder(neighborsSnapshot.data,property,neighborsSnapshot.order);
  setForm(order);el('county-example').textContent='Selected from the neighbour result';
  await runClientLookup(order,{expectedFolio:property.folio});
 }catch(error){el('error').textContent=error.message;}
}
el('neighbors-back').addEventListener('click',()=>{
 if(activeLookup||!neighborsSnapshot)return;
 const saved=neighborsSnapshot;setForm(saved.order);el('neighbors-same-building').checked=saved.order.neighborOptions?.sameBuilding===true;
 el('county-example').textContent='Neighbour search subject';el('result-title').textContent='Neighbouring properties and owner-name matches';
 el('client-result').hidden=true;el('neighbors-view').hidden=false;el('neighbors-map-view').hidden=!saved.data.NeighboringProperties;
 el('selected-property-context').hidden=true;el('neighbors-back').hidden=true;
 el('status').textContent=saved.statusText||'Neighbor results ready';el('status').className=saved.statusClass||'status';
 el('timer').textContent=saved.timerText||'';el('request-id').textContent=saved.requestText||'';el('error').textContent=saved.errorText||'';
 last=saved.data;el('json').textContent=JSON.stringify(last,null,2);el('download').disabled=false;
 el('result-panel').scrollIntoView?.({behavior:'smooth',block:'start'});
});
function clearResults(){
 last=null;el('download').disabled=true;el('json').textContent='Send an order to fetch fresh county records.';
 for(const id of ['sections','sources','summary'])el(id).replaceChildren();
 for(const id of ['error','request-id','timer'])el(id).textContent='';
 el('status').textContent='Ready';el('status').className='status';el('selected-property-context').hidden=true;currentJob=null;resumeJob.hidden=true;restoreJob.hidden=!savedJob.get();
 el('result-title').textContent='Result and source coverage';el('client-result').hidden=false;el('neighbors-view').hidden=true;el('neighbors-map-view').hidden=true;
}
function syncSearch(){
 const profile=countyProfiles.get(el('county').value),mode=selectedMode(),address=mode==='address',busy=Boolean(activeLookup);
 const addressSupported=profile.lookup_modes.includes('address'),parcelEntered=Boolean(el('parcel').value.trim());
 el('address-fields').hidden=false;el('parcel-fields').hidden=!profile.lookup_modes.some(m=>['county','collector'].includes(m));
 for(const id of ['address','owner','order','transaction'])el(id).disabled=busy||!address;
 el('address').required=address;el('owner').required=address;el('order').required=address;
 el('order-fields').hidden=!address;el('lookup-options').hidden=address;
 el('parcel').disabled=busy||!profile.lookup_modes.some(m=>['county','collector'].includes(m));el('parcel').required=!addressSupported;
 el('parcel-label').textContent=addressSupported?'Parcel ID (optional)':'Parcel ID (required)';
 el('parcel-note').textContent=addressSupported?'Leave blank to search by address and owner. Entering a parcel ID uses that exact parcel instead.':'Enter the county parcel identifier. You can confirm the returned address and owners in the result.';
 el('include-pdf').disabled=busy||address;
 const account=mode==='county'&&profile.id==='palm-beach-fl';
 el('account-field').hidden=!account;el('collector-account').disabled=busy||!account;
 const neighbors=neighborsAvailable();el('neighbor-controls').hidden=!neighbors;el('neighbors-check').disabled=busy||!neighbors;el('neighbors-same-building').disabled=busy||!neighbors;
 el('use-example').disabled=busy;el('submit').textContent='Fetch property records →';
 el('workflow-note').textContent=address?(profile.lookup_modes.includes('county')?'Enter the address and owner, or add a parcel ID.':'Enter the property address and owner name.'):parcelEntered?'Searching by parcel ID. Address and owner inputs are not used; confirm both in the returned record.'+' '+(mode==='collector'?'This county provides tax collector records and original bills; assessment data is not included.':'Available assessment, tax and original document records will be shown.'):'A parcel ID is required for '+profile.name+'. Address-and-owner search is not yet available here.'+' '+(mode==='collector'?'Tax collector records and original bills are available; assessment data is not included.':'');
 if(profile.poc_verification==='source_access_limited')el('workflow-note').textContent+=' Tax collector access may require authorized source recovery. If unavailable, assessment results are retained and missing tax fields are shown explicitly.';
 preview();
}
function changeCounty(){
 if(activeLookup)return;
 invalidateNeighbors();clearResults();el('parcel').value='';el('collector-account').value='';el('county-example').textContent='';syncSearch();
}
function useExample(){
 if(activeLookup)return;
 invalidateNeighbors();clearResults();const profile=countyProfiles.get(el('county').value),example=profile.client?.demo_input;
 el('collector-account').value='';
 if(profile.lookup_modes.includes('address')){
  el('parcel').value='';el('address').value=example?.address||'';el('owner').value=example?.ownerName||'';el('neighbors-same-building').checked=example?.includeSameBuilding===true;
 }else{
  el('address').value='';el('owner').value='';el('parcel').value=workflowSample(profile,automaticPocMode(profile))?.parcel_id||'';
 }
 syncSearch();el('county-example').textContent='Example inputs only. Click Fetch property records to retrieve fresh records.';
}
el('county').addEventListener('change',changeCounty);
el('use-example').addEventListener('click',useExample);
for(const id of ['order','address','owner','transaction','parcel','collector-account','include-pdf']){
 const changed=()=>{if(activeLookup)return;invalidateNeighbors();clearResults();el('county-example').textContent='';syncSearch();};
 el(id).addEventListener('input',changed);
 if(['address-type','transaction','include-pdf'].includes(id))el(id).addEventListener('change',changed);
}
el('form').onsubmit=event=>{event.preventDefault();try{const r=request();return runClientLookup(r.body,{endpoint:r.endpoint});}catch(error){el('error').textContent=error.message;el('status').textContent='Property details needed';el('status').className='status warn';}};
el('download').onclick=()=>{
 if(!last)return;const url=URL.createObjectURL(new Blob([JSON.stringify(last,null,2)],{type:'application/json'})),a=document.createElement('a');
 a.href=url;a.download=last.NeighboringProperties?'Zeneral-neighbour-results.json':last.scrapTaxOrderRequest?'Zeneral-client-property-order.json':'Zeneral-parcel-result.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
(async()=>{
 try{
  const responses=await Promise.all(['/api/v1/sources','/api/v2/sources'].map(url=>fetch(url,{cache:'no-store'})));
  if(responses.some(r=>!r.ok))throw Error();const [parcelCatalog,clientCatalog]=await Promise.all(responses.map(r=>r.json()));
  const workflows=pocWorkflows(parcelCatalog,clientCatalog);
  for(const county of workflows){
   countyProfiles.set(county.id,county);const option=document.createElement('option');option.value=county.id;option.textContent=county.name+(county.lookup_modes.includes('collector')?' · tax collector only':'')+(county.poc_verification==='source_access_limited'?' · source recovery required':'');el('county').append(option);
   const searchDetails=county.lookup_modes.includes('address')?(county.lookup_modes.some(m=>['county','collector'].includes(m))?'Address and owner, or parcel ID':'Address and owner'):'Parcel ID required';
   const recordScope=county.lookup_modes.includes('collector')?'Tax collector records and original bills; no assessment lookup':'Assessment, tax records and available original documents';
   const verification=county.poc_verification==='source_access_limited'?'Source recovery required · collector access restricted':'Production sample verified · 13 Oct 2026';
   const tr=document.createElement('tr');for(const value of [county.name,searchDetails,recordScope,verification])text(tr,'td',value);el('coverage').append(tr);
  }
  el('catalog-summary').textContent=workflows.length+' counties available. Search is selected automatically from your input. Source restrictions are shown with each lookup. Verification covers tested samples; unavailable fields and historical coverage remain explicit.';
  if(!workflows.length)throw Error('No available counties');
  el('county').value=countyProfiles.has('bradford-fl')?'bradford-fl':workflows[0].id;el('county').disabled=false;el('submit').disabled=false;changeCounty();
  initNeighbors(document,{
   onStart:()=>{if(!neighborsAvailable()||!beginLookup('neighbors'))return false;invalidateNeighbors();return true;},
   onResult:(data,order)=>{
    neighborsSnapshot={data,order};el('neighbors-map-view').hidden=!data.NeighboringProperties;
    last=data;el('json').textContent=JSON.stringify(data,null,2);el('download').disabled=false;
   },
   onFinish:()=>{
    if(neighborsSnapshot)Object.assign(neighborsSnapshot,{timerText:el('timer').textContent,requestText:el('request-id').textContent,statusText:el('status').textContent,statusClass:el('status').className,errorText:el('error').textContent});
    finishLookup('neighbors');
   },
   onSelectProperty:openProperty,
   onScopeChange:()=>{
    invalidateNeighbors();if(el('neighbors-view').hidden)return;
    last=null;el('download').disabled=true;el('neighbors-map-view').hidden=true;el('status').textContent='Ready for a new neighbour check';
    for(const id of ['error','timer','request-id'])el(id).textContent='';el('json').textContent='Search scope changed. Run a new neighbour check.';
   }
  });
 }catch{el('submit').disabled=true;el('use-example').disabled=true;el('county').disabled=true;el('error').textContent='The available counties could not load. Please reload the page.';}
})();
