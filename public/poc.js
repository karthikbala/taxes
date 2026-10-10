import {initNeighbors} from './neighbors.js';
import {sourcePresentation} from './source-status.mjs';
import {renderSections,renderValidation,resultBadge,resultRequestId} from './poc-render.mjs';
import {selectedPropertyOrder,selectedParcelCheck} from './property-drilldown.mjs';

const el=id=>document.getElementById(id),countyProfiles=new Map();
let last=null,activeLookup=null,neighborsSnapshot=null;
const text=(parent,tag,value)=>{const n=document.createElement(tag);n.textContent=value;parent.append(n);return n;};
const input=()=>({scrap_order_id:el('order').value,address:el('address').value,ownerName:el('owner').value,county:el('county').value,transactionType:el('transaction').value,state:'FL'});
const preview=()=>el('request').textContent=JSON.stringify(input(),null,2)+'\n\ncurl -X POST '+location.origin+'/api/v2/property/lookup \\\n-H "Authorization: Bearer $POC_ACCESS_KEY" \\\n-H "Content-Type: application/json" \\\n--data '+JSON.stringify(input());
const setForm=order=>{for(const [id,key]of [['order','scrap_order_id'],['address','address'],['owner','ownerName'],['county','county'],['transaction','transactionType']])el(id).value=order[key];preview();};
const invalidateNeighbors=()=>{neighborsSnapshot=null;el('neighbors-back').hidden=true;};
function beginLookup(mode){
 if(activeLookup)return false;
 activeLookup=mode;last=null;
 for(const id of ['submit','neighbors-check','county','neighbors-same-building','download'])el(id).disabled=true;
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
 activeLookup=null;el('submit').disabled=false;el('county').disabled=false;
 el('neighbors-check').disabled=el('county').value!=='miami-dade-fl';el('neighbors-same-building').disabled=el('county').value!=='miami-dade-fl';
 el('neighbors-back').disabled=false;el('result-panel').setAttribute('aria-busy','false');
}
function renderClientData(data,response,expectedFolio){
 last=data;el('json').textContent=JSON.stringify(data,null,2);
 const meta=data.ExtractionMetadata,record=data.scrapTaxOrderRequest,badge=resultBadge(data,response.ok);
 el('status').textContent=badge.label;el('status').className=badge.className;
 const requestId=resultRequestId(data,response.headers.get('x-request-id'));
 el('request-id').textContent=requestId?'Request ID: '+requestId:'';
 el('error').textContent=data.error?.message||(data.errorMessage!=='NA'?data.errorMessage:'')||'';
 let canDisplay=true;
 if(expectedFolio){
  const check=selectedParcelCheck(data,expectedFolio);
  el('selected-property-context').textContent=check.message;el('selected-property-context').hidden=false;
  if(!check.verified){canDisplay=false;el('status').textContent='Selected property not verified';el('status').className='status warn';el('error').textContent=[check.message,el('error').textContent].filter(Boolean).join(' ');}
 }
 if(record&&canDisplay){
  for(const [label,value]of [['Property',record.PropertyInformation?.PropertyAddress??'Unavailable'],['Parcel',record.PropertyInformation?.ParcelNumber??'Unavailable'],['Match',record.matchStatus],['Latest annual bill',record.BillDetails?.taxYear??'Unavailable'],['Historical coverage',record.DelinquencyInformation?.coverage??'Unavailable']]){
   const div=document.createElement('div');text(div,'small',label);text(div,'strong',String(value));el('summary').append(div);
  }
  renderSections(document,el('sections'),record,meta?.section_status||{});renderValidation(document,el('sections'),meta?.validation||{});
 }
 for(const source of meta?.sources||[]){
  const div=document.createElement('div');div.className='section';const presentation=sourcePresentation(source);
  text(div,'h3',source.id+' · '+presentation.label);if(presentation.note&&presentation.note!==presentation.label)text(div,'p',presentation.note);
  const a=text(div,'a',source.url);a.href=source.url;a.target='_blank';a.rel='noopener';
  text(div,'p',source.method+' · '+(source.http_status||'browser capture'));el('sources').append(div);
 }
 el('download').disabled=false;
}
async function runClientLookup(order,{expectedFolio}={}){
 if(!beginLookup('client'))return;
 el('status').textContent='Fetching fresh assessor and tax collector records…';
 if(expectedFolio){el('result-title').textContent='Selected property · '+order.address;el('selected-property-context').hidden=false;el('selected-property-context').textContent='Checking selected folio '+expectedFolio+' against fresh county records.';}
 el('result-panel').scrollIntoView?.({behavior:'smooth',block:'start'});
 const start=performance.now(),tick=()=>el('timer').textContent=' · '+((performance.now()-start)/1000).toFixed(1)+' seconds';tick();
 const interval=setInterval(tick,100),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),135000);
 try{
  const response=await fetch('/api/v2/property/lookup',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+el('key').value},body:JSON.stringify(order),cache:'no-store',signal:controller.signal});
  const data=await response.json();renderClientData(data,response,expectedFolio);
 }catch(error){
  el('status').textContent='Request failed';el('status').className='status warn';
  el('error').textContent=error.name==='AbortError'?'The lookup reached its deadline; no substitute data is shown.':'API connection failed.';
 }finally{clearTimeout(timeout);clearInterval(interval);tick();finishLookup('client');}
}
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
const applyExample=()=>{
 invalidateNeighbors();const example=countyProfiles.get(el('county').value)?.demo_input;
 if(example){el('address').value=example.address;el('owner').value=example.ownerName;el('county-example').textContent=example.origin;el('neighbors-same-building').checked=example.includeSameBuilding===true;}
 preview();
};
el('county').addEventListener('change',applyExample);
for(const id of ['order','address','owner','county','transaction'])el(id).addEventListener('input',preview);
el('form').onsubmit=event=>{event.preventDefault();return runClientLookup(input());};
el('download').onclick=()=>{
 if(!last)return;const url=URL.createObjectURL(new Blob([JSON.stringify(last,null,2)],{type:'application/json'})),a=document.createElement('a');
 a.href=url;a.download=last.NeighboringProperties?'Zeneral-neighbour-results.json':'Zeneral-client-property-order.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
(async()=>{
 try{
  const response=await fetch('/api/v2/sources',{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();
  for(const county of data.counties){
   countyProfiles.set(county.id,county);const option=document.createElement('option');option.value=county.id;option.textContent=county.name+(county.address_lookup_enabled?'':' · pending');option.disabled=!county.address_lookup_enabled;el('county').append(option);
   const tr=document.createElement('tr');for(const value of [county.name,county.client_contract_status,county.address_lookup_enabled?'Implemented; acceptance status above':'Pending',county.source_pair_status])text(tr,'td',value);el('coverage').append(tr);
  }
  el('county').value='miami-dade-fl';applyExample();
  initNeighbors(document,{
   onStart:()=>{if(!beginLookup('neighbors'))return false;invalidateNeighbors();return true;},
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
 }catch{el('submit').disabled=true;el('error').textContent='The county contract could not load.';}
})();
