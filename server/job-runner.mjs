import {randomUUID,createHash} from 'node:crypto';
import {validateClientInput} from '../lib/client/contract.mjs';
import {clientLookup} from '../lib/client/engine.mjs';
import {createLookupLogger} from '../lib/client/logging.mjs';
import {managedPreflight} from '../lib/client/access.mjs';
import {sourceProfiles,approvedSource} from '../lib/reliability/sources.mjs';
import {explainResult,gapReason,recoveryAction,isTransient} from '../lib/reliability/gaps.mjs';
import {createReliableTransport,semaphore} from '../lib/reliability/transport.mjs';
import {createJobStore,terminalJobs} from './job-store.mjs';
import {pdfRuntime} from '../lib/reliability/pdf-context.mjs';
import {reconcileBrowser} from '../lib/live/browser-budget.mjs';
const problem=(code,http,message)=>Object.assign(new Error(message),{code,http});
const stageNames={property_resolution:'resolve_property',osceola_appraiser_recovery:'appraiser',collector_lookup:'collector_history',history_parsing:'collector_history',annual_pdf_parsing:'documents',certificate_deed_reports:'certificate_deed',historical_deed_search:'certificate_deed'};
export function createJobRunner({env,fetcher=fetch,lookup=clientLookup,managedBrowser,localBrowser,scrapedoClerk,store=createJobStore(env.DB),logSink,now=Date.now,transport,autoStart=true}={}){
 if(!store)return null;
 const owner=randomUUID(),active=new Map(),paid=semaphore(),navigation=semaphore(),reliable=transport||createReliableTransport({store,fetcher,now});
 let stopped=false,timer,ticking=false,lastPurge=0,lastCleanup=0;
 const logEvent=(id,event,fields)=>createLookupLogger(id,logSink)(event,fields);
 function validate(input){const normalized=validateClientInput(input);if(!sourceProfiles[normalized.county])throw problem('unsupported_job_county',422,'Durable address jobs currently support Miami-Dade, Osceola and Bradford.');return Object.fromEntries(Object.entries(normalized).filter(([key])=>key!=='countyName'));}
 const publicJob=row=>{
  if(!row)throw problem('job_not_found',404,'Job not found.');
  const explanation=row.result?explainResult(row.result):{fields:{}};
  const gaps=row.gaps.map(g=>(explanation.gaps||[]).find(e=>e.code===g.code&&e.source_id===g.source_id)||g);
  return {id:row.id,input:row.input,access_mode:row.access_mode,status:row.status,stage:row.stage,created_at:new Date(row.created_at).toISOString(),updated_at:new Date(row.updated_at).toISOString(),attempt:row.attempt,recovery_cycles:row.recovery_cycles,result_version:row.result_version,next_retry_at:row.next_retry_at?new Date(row.next_retry_at).toISOString():null,checkpoints:row.checkpoints,result:row.result,gaps,field_status:explanation.fields,artifacts:store.artifacts(row.id),attempts:store.attempts(row.id),links:{self:'/api/v2/property/jobs/'+row.id,cancel:'/api/v2/property/jobs/'+row.id+'/cancel',resume:'/api/v2/property/jobs/'+row.id+'/resume'},code_version:row.code_version};
 };
 async function run(job){
  const ctl=new AbortController();active.set(job.id,{ctl,promise:null});
  const log=createLookupLogger(job.id,logSink);
  const timeout=setTimeout(()=>ctl.abort(),600000);
  let retryAt=null;
  const jobFetch=async(...args)=>{try{return await reliable(job,ctl.signal)(...args);}catch(e){if(e.retryAt)retryAt=Math.max(retryAt||0,e.retryAt);throw e;}};
  async function browser(args){
   const serial={...args};delete serial.signal;delete serial.deadline;
   const key='browser:'+createHash('sha256').update(JSON.stringify(serial)).digest('hex'),cached=store.cached(job.id,key);
   if(cached)return {...JSON.parse(Buffer.from(cached.bytes).toString('utf8')),artifact_retrieved_at:new Date(cached.created_at).toISOString()};
   if(store.sessions(job.id).some(s=>s.cache_key===key))throw problem('cleanup_pending',409,'A previous capture was dispatched for this source. Review its outcome before repeating paid work.');
   if(localBrowser){try{const capture=await navigation(()=>localBrowser({...args,signal:ctl.signal}),ctl.signal);if(capture){capture.artifact_retrieved_at=new Date(now()).toISOString();store.artifact(job.id,key,'browser',Buffer.from(JSON.stringify(capture)),{url:args.url,method:'LOCAL_BROWSER'});return capture;}}catch(e){if(ctl.signal.aborted)throw e;store.event(job.id,store.get(job.id).stage,'local_browser_failed',e.code||'local_browser_unavailable');}}
   if(job.access_mode==='direct_only')throw problem('managed_browser_unavailable',503,'This job excludes paid recovery. Verified direct-source sections are retained.');
   if(!managedBrowser)throw problem('managed_browser_unavailable',503,'Managed browser is not configured.');
   return paid(async()=>{
    const ready=await managedPreflight(env);if(!ready.ready)throw problem('managed_access_not_ready',503,'Managed source entitlement or authorized spending was not verified.');
    const intent=randomUUID();store.session(job.id,key,{id:intent,status:'dispatching'});
    let capture;
    try{capture=await managedBrowser({...args,signal:ctl.signal,binaryTransfer:env.TAXES_ARTIFACT_INGEST_ORIGIN?binaryTransfer:undefined,sessionObserver:event=>{store.session(job.id,key,{...event,id:intent});if(event.receipt)store.artifact(job.id,'provider_receipt:'+intent,'provider_receipt',Buffer.from(JSON.stringify(event.receipt)),{policy:event.receipt.policy});}});}
    catch(e){
     const recorded=store.sessions(job.id).find(s=>s.id===intent);
     // These guards reject before reservation/session dispatch in the reviewed
     // provider adapter. Network or unknown outcomes remain unresolved.
     if(recorded?.status==='dispatching'&&!recorded.session_id&&!recorded.lease_id&&['staging_capture_limit','browser_budget_exhausted','browser_budget_unavailable','operator_recovery_scope','source_url_rejected','invalid_deed_folio'].includes(e.code)){
      store.session(job.id,key,{id:intent,status:'reconciled'});store.event(job.id,store.get(job.id).stage,'not_dispatched',e.code);
     }
     throw e;
    }
    capture.artifact_retrieved_at=new Date(now()).toISOString();store.artifact(job.id,key,'browser',Buffer.from(JSON.stringify(capture)),{url:args.url,method:'MANAGED_BROWSER'});return capture;
   },ctl.signal);
  }
  async function binaryTransfer({sourceUrl,size,sha256},execute){
   const origin=new URL(env.TAXES_ARTIFACT_INGEST_ORIGIN);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw problem('source_url_rejected',400,'Artifact ingress must be a reviewed HTTPS origin.');
   const ticket=store.uploadTicket(job.id,size,sha256),url=new URL(`/api/v2/property/jobs/${job.id}/artifact-ingest/${ticket.id}`,origin).href;
   // Binary upload avoids returning document bytes through the provider's stdout limit.
   const code=`await (async()=>{const frame=page.frames().find(f=>f.url()===${JSON.stringify(sourceUrl)})||(page.url()===${JSON.stringify(sourceUrl)}?page:null);if(!frame)throw new Error('DOCUMENT_FRAME_MISSING');const base64=await frame.evaluate(()=>{const bytes=window.__invisiaPdfBytes;if(!(bytes instanceof Uint8Array))throw new Error('DOCUMENT_BYTES_MISSING');let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);});const r=await fetch(${JSON.stringify(url)},{method:'POST',headers:{Authorization:${JSON.stringify('Bearer '+ticket.token)},'Content-Type':'application/pdf'},body:Buffer.from(base64,'base64')});if(!r.ok)throw new Error('DOCUMENT_UPLOAD_FAILED');console.log('INVISIA_UPLOAD_OK');})();`;
   let outcome;try{outcome=await execute({code,language:'node'});}catch{}
   const artifact=store.cached(job.id,'upload:'+ticket.id);if(!artifact||artifact.sha256!==sha256||artifact.bytes.length!==size)throw problem('managed_document_incomplete',502,'Original PDF binary upload did not complete.');
   return Buffer.from(artifact.bytes).toString('base64');
  }
  try{
   const result=await pdfRuntime.run({signal:ctl.signal,onDerived:derived=>store.artifact(job.id,'derived:'+createHash('sha256').update(JSON.stringify(derived)).digest('hex'),'derived_pdf_text',Buffer.from(JSON.stringify(derived)),{derived:true,engine:derived.engine,method:derived.method})},()=>lookup(job.input,jobFetch,{requestId:job.id,signal:ctl.signal,deadline:now()+600000,reliableTransport:true,managedBrowser:browser,scrapedoClerk:scrapedoClerk&&job.access_mode!=='direct_only'?async args=>{
    const key='clerk:'+createHash('sha256').update(String(args.parcel)).digest('hex'),cached=store.cached(job.id,key);if(cached)return JSON.parse(Buffer.from(cached.bytes).toString());
    if(store.sessions(job.id).some(s=>s.cache_key===key))throw problem('cleanup_pending',409,'Review the previous paid Clerk query before repeating it.');
    return paid(async()=>{const id=randomUUID();store.session(job.id,key,{id,status:'dispatching'});try{const capture=await scrapedoClerk(args);store.artifact(job.id,key,'clerk',Buffer.from(JSON.stringify(capture)),{url:capture.source_url});store.session(job.id,key,{id,status:'reconciled'});return capture;}catch(e){store.session(job.id,key,{id,status:'outcome_unknown'});throw e;}},ctl.signal);
   }:null,log:(event,fields)=>{log(event,fields);if(event==='client_stage_started')store.event(job.id,stageNames[fields.stage]||fields.stage,'started');},
   checkpoint:(stage,result)=>store.checkpoint(job.id,stageNames[stage]||stage,result,{completePrevious:true})}));
   if(store.get(job.id).status==='cancelled')return;
   if(stopped){store.settle(job.id,'queued');return;}
   store.checkpoint(job.id,'validation',result);
   const {gaps,fields}=explainResult(result),errors=result.ExtractionMetadata?.errors||[];
   if(store.sessions(job.id).some(s=>!['closed','reconciled'].includes(s.status)))gaps.push({code:'cleanup_pending',reason:'BUDGET_PENDING',action:'Reconcile the recorded provider session and spending before resuming.'});
   const review=gaps.some(g=>['IDENTITY_REVIEW','VALIDATION_CONFLICT','BUDGET_PENDING'].includes(g.reason));
   const retry=!review&&errors.some(e=>isTransient(e.code));
   const missing=Object.values(fields).some(f=>['UNAVAILABLE','PRESENT_UNVERIFIED'].includes(f.status));
   let status=review?'needs_review':retry?'retry_scheduled':gaps.length||missing||result.ExtractionMetadata?.status==='partial'?'completed_with_gaps':'completed';
   let nextRetry=retry?Math.max(now()+[60000,300000,1800000][Math.min(job.recovery_cycles,2)],retryAt||0):null;
   if(retry&&(job.recovery_cycles>=3||nextRetry>job.created_at+86400000)){status='completed_with_gaps';nextRetry=null;gaps.push({code:'recovery_exhausted',reason:'SOURCE_OUTAGE',action:'The 24-hour recovery window or three recovery cycles are exhausted. Start a fresh lookup after source access is restored.'});}
   store.checkpoint(job.id,'serialization',result);store.settle(job.id,status,{result,gaps,nextRetry});log('retrieval_job_settled',{status,stage:'serialization',error_count:errors.length});
  }catch(e){
   if(stopped&&store.get(job.id).status!=='cancelled'){store.settle(job.id,'queued');}
   else if(store.get(job.id).status!=='cancelled'){
    const reason=gapReason(e.code),gaps=[{code:e.code||'job_failed',reason,action:recoveryAction(reason)}],next=Math.max(now()+60000,retryAt||e.retryAt||0);
    const retry=isTransient(e.code)&&job.recovery_cycles<3&&next<=job.created_at+86400000;
    store.settle(job.id,retry?'retry_scheduled':['IDENTITY_REVIEW','VALIDATION_CONFLICT','BUDGET_PENDING'].includes(reason)?'needs_review':'failed',{gaps,nextRetry:retry?next:null,code:e.code});
   }
  }finally{clearTimeout(timeout);store.releaseCancelled(job.id);active.delete(job.id);}
 }
 async function tick(){
  if(stopped||ticking)return;ticking=true;
  try{
   if(!store.runner(owner))return;
   store.renew(owner);store.recover();
   if(now()-lastCleanup>60000){lastCleanup=now();await cleanupOrphans();}
   if(now()-lastPurge>3600000){store.purge();lastPurge=now();}
   while(active.size<2){const job=store.claim(owner);if(!job)break;const promise=run(job);if(active.has(job.id))active.get(job.id).promise=promise;promise.catch(()=>logEvent(job.id,'retrieval_runner_failed',{error_code:'job_cleanup_failed'}));}
  }finally{ticking=false;}
 }
 async function cleanupOrphans(){
  if(!env.INVISIA_BROWSER_API_KEY)return;
  for(const session of store.unresolvedSessions()){
   if(!session.session_id||!session.lease_id)continue;
   try{
    const response=await fetcher('https://api.firecrawl.dev/v2/interact/'+encodeURIComponent(session.session_id),{method:'DELETE',headers:{Authorization:'Bearer '+env.INVISIA_BROWSER_API_KEY},signal:AbortSignal.timeout(20000)});
    if(!response.ok)continue;const receipt=await response.json();if(receipt.success!==true)continue;
    const row=env.DB.sqlite.prepare('SELECT reserved_milli_usd,status FROM browser_runs WHERE id=?').get(session.lease_id);
    if(row?.status==='reserved')await reconcileBrowser(env.DB,{id:session.lease_id,reserve:row.reserved_milli_usd},receipt.creditsBilled,'recovered_cleanup');
    if(!row)store.artifact(session.job_id,'provider_receipt:'+session.id,'provider_receipt',Buffer.from(JSON.stringify({policy:'operator_or_staging_override',session_id:session.session_id,lease_id:session.lease_id,credits_billed:Number.isInteger(receipt.creditsBilled)?receipt.creditsBilled:null,cleanup_confirmed:true,recovered_cleanup:true,recorded_at:new Date(now()).toISOString()})),{recovered_cleanup:true});
    store.session(session.job_id,session.cache_key,{...session,status:'reconciled'});logEvent(session.job_id,'retrieval_session_reconciled',{status:'reconciled'});
   }catch{logEvent(session.job_id,'retrieval_cleanup_pending',{error_code:'cleanup_pending'});}
  }
 }
 if(autoStart){timer=setInterval(()=>{tick().catch(()=>logEvent(owner,'retrieval_runner_failed',{error_code:'runner_tick_failed'}));},1000);timer.unref();queueMicrotask(()=>tick().catch(()=>{}));}
 return {
  store,tick,cleanupOrphans,
  create(input,key,accessMode='configured'){const {job,reused}=store.create(validate(input),key,env.TAXES_SOURCE_REVISION||'working-tree',accessMode);queueMicrotask(()=>{if(autoStart)tick().catch(()=>{});});return {job:publicJob(job),reused};},
  get(id){return publicJob(store.get(id));},
  cancel(id){const job=store.cancel(id);active.get(id)?.ctl.abort();return publicJob(job);},
  resume(id,input){const job=store.resume(id,input?validate(input):undefined);queueMicrotask(()=>{if(autoStart)tick().catch(()=>{});});return publicJob(job);},
  async idle(){while(active.size)await Promise.allSettled([...active.values()].map(x=>x.promise));},
  async stop(){stopped=true;clearInterval(timer);for(const {ctl}of active.values())ctl.abort();while(active.size)await Promise.allSettled([...active.values()].map(x=>x.promise));store.releaseRunner(owner);},
  metrics(){return store.metrics();},readArtifact:(id,artifact)=>store.readArtifact(id,artifact),
  review(id,input){
   const job=store.get(id);if(!job)throw problem('job_not_found',404,'Job not found.');
   if(!terminalJobs.has(job.status))throw problem('job_active',409,'Wait for the current attempt before adding a review.');
   if(!input||Object.keys(input).some(k=>!['artifact_id','source_url','note'].includes(k))||typeof input.note!=='string'||!input.note.trim()||input.note.length>2000||/[\x00-\x1f\x7f]/.test(input.note))throw problem('invalid_review',400,'Review requires an original artifact, official source URL and a note of at most 2000 characters.');
   const original=store.readArtifact(id,input.artifact_id);if(!original||original.kind==='operator_review')throw problem('invalid_review',400,'Select source evidence belonging to this job.');
   const source=approvedSource(job.input.county,input.source_url).href;
   const evidence={reviewed_at:new Date(now()).toISOString(),reviewer:'authenticated_operator',artifact_id:original.id,artifact_sha256:original.sha256,source_url:source,note:input.note.trim(),status:'OPERATOR_NOTE',changes_verified_values:false};
   store.artifact(id,'review:'+randomUUID(),'operator_review',Buffer.from(JSON.stringify(evidence)),evidence);store.event(id,job.stage,'operator_review');return {review:evidence,job:publicJob(store.get(id))};
  },
  recordsRequest(id){const row=store.get(id);if(!row)throw problem('job_not_found',404,'Job not found.');const record=row.result?.scrapTaxOrderRequest;return {sent:false,job_id:id,county:row.input.county,parcel:record?.PropertyInformation?.ParcelNumber||null,body:`Please provide authoritative tax records for ${record?.PropertyInformation?.ParcelNumber||'PARCEL NOT YET VERIFIED'} in ${row.input.county}. Requested property: ${row.input.address}. Please identify unavailable annual years, complete certificate and deed query scope, active/redemption status, source dates and any access restrictions. Confirm the exact parcel/account before fulfilling. Please advise of fees before proceeding.`,gaps:row.gaps};}
 };
}
