import {renderNeighbors} from './neighbors-render.mjs';

export function initNeighbors(document, {onStart=()=>true, onResult=()=>{}, onFinish=()=>{}, now=()=>performance.now(), repeat=setInterval, stopRepeat=clearInterval}={}) {
  const el=id=>document.getElementById(id), button=el('neighbors-check'), result=el('neighbors-result'), status=el('neighbors-status');
  if(!button||!result||!status)return;
  let pending=false, requestVersion=0, activeController=null;
  const sharedStatus=message=>{status.textContent=message;if(el('status'))el('status').textContent=message;};
  const enabled=()=>{
    const supported=el('county')?.value==='miami-dade-fl';
    button.disabled=pending||!supported;
    if(!pending)status.textContent=supported?'Check adjacent parcels and same-building units for owner-name matches.':'Neighbor checks are currently available for Miami-Dade County only.';
  };
  el('county')?.addEventListener('change',()=>{requestVersion++;activeController?.abort();result.replaceChildren();enabled();});
  const Observer=document.defaultView?.MutationObserver;
  if(Observer&&el('county'))new Observer(enabled).observe(el('county'),{childList:true});
  enabled();
  button.addEventListener('click',async()=>{
    if(pending||el('county')?.value!=='miami-dade-fl')return;
    const order={scrap_order_id:el('order').value,address:el('address').value,ownerName:el('owner').value,county:el('county').value,transactionType:el('transaction').value,state:'FL'};
    if(!order.address.trim()||!order.ownerName.trim()||!el('key').value.trim()){sharedStatus('Enter the property address, owner name and API access key before checking neighbors.');return;}
    if(onStart()===false)return;
    pending=true;button.disabled=true;button.textContent='Checking neighbours…';result.replaceChildren();
    sharedStatus('Checking fresh county neighbour records…');status.textContent='Resolving the property and checking parcel boundaries and owner records. This can take up to two minutes.';
    const start=now(),tick=()=>{if(el('timer'))el('timer').textContent=' · '+((now()-start)/1000).toFixed(1)+' seconds';};tick();
    const interval=repeat(tick,100),version=requestVersion,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),135000);activeController=controller;
    try{
      const response=await fetch('/api/v2/property/neighbors',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+el('key').value},body:JSON.stringify(order),cache:'no-store',signal:controller.signal});
      const data=await response.json();if(version!==requestVersion)return;
      onResult(data);
      const requestId=data.ExtractionMetadata?.request_id||response.headers?.get('x-request-id');if(el('request-id'))el('request-id').textContent=requestId?'Request ID: '+requestId:'';
      if(data.NeighboringProperties){
        const view=renderNeighbors(document,result,data);
        sharedStatus(response.ok===false?'Neighbor check unavailable':'Neighbor results ready');
        status.textContent=view.complete?'County neighbour search completed.':'Returned records are ready. See the search coverage and limits below.';
      }else{sharedStatus('Neighbor check unavailable');status.textContent=data.error?.message||data.errorMessage||'Neighbor results unavailable. No absence of owner matches is claimed.';if(el('error'))el('error').textContent=status.textContent;}
    }catch(error){
      if(version!==requestVersion)return;
      sharedStatus('Neighbor request failed');if(el('status'))el('status').className='status warn';
      status.textContent=error.name==='AbortError'?'The neighbor check reached its deadline. Results are unavailable; no absence of owner matches is claimed.':'The neighbor API could not be reached. Results are unavailable; no absence of owner matches is claimed.';
      if(el('error'))el('error').textContent=status.textContent;
    }finally{
      clearTimeout(timeout);stopRepeat(interval);tick();pending=false;activeController=null;button.textContent='Check neighbouring properties →';
      onFinish();if(version!==requestVersion)enabled();else button.disabled=el('county')?.value!=='miami-dade-fl';
    }
  });
}
