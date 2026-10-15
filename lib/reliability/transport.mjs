import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {approvedSource} from './sources.mjs';
import {readBounded} from '../live/engine.mjs';
export const documentLimits={bytes:25*1024*1024,pages:50};
const problem=(code,message,retryAt)=>Object.assign(new Error(message),{code,...(retryAt?{retryAt}:{})});
export function retryTime(value,now=Date.now()){
 if(!value)return null;const n=Number(value),at=Number.isFinite(n)?now+Math.max(0,n)*1000:Date.parse(value);return Number.isFinite(at)?Math.max(now,at):null;
}
export function semaphore(limit=1){let active=0;const waiting=[];return async(fn,signal)=>{
 if(signal?.aborted)throw problem('lookup_cancelled','Lookup cancelled.');
 if(active>=limit)await new Promise((resolve,reject)=>{const item={resolve,reject};const abort=()=>{const i=waiting.indexOf(item);if(i>=0)waiting.splice(i,1);reject(problem('lookup_cancelled','Lookup cancelled.'));};item.resolve=()=>{signal?.removeEventListener('abort',abort);resolve();};signal?.addEventListener('abort',abort,{once:true});waiting.push(item);});else active++;
 try{if(signal?.aborted)throw problem('lookup_cancelled','Lookup cancelled.');return await fn();}finally{const next=waiting.shift();if(next)next.resolve();else active--;}
 };}
export function createReliableTransport({store,fetcher=fetch,now=Date.now,sleep=(ms,signal)=>delay(ms,undefined,{signal}),random=Math.random}){
 const hosts=new Map();
 return function forJob(job,signal){return async(value,options={})=>{
  const original=approvedSource(job.input.county,value),method=options.method||'GET';
  if(!['GET','POST','HEAD'].includes(method))throw problem('source_method_rejected','Unsupported county request method.');
  const key='http:'+createHash('sha256').update(method+' '+original.href+' '+String(options.body||'')).digest('hex');
  const cached=store.cached(job.id,key);
  const completedStage=cached&&store.get(job.id).checkpoints[cached.metadata.stage]?.completed_at;
  const incomplete=store.get(job.id).result?.ExtractionMetadata?.errors?.some(e=>/incomplete|pagination/.test(e.code||''));
  if(cached&&(cached.metadata.attempt===job.attempt||completedStage&&cached.metadata.status!==403&&!incomplete)){const r=new Response(cached.bytes,{status:cached.metadata.status,headers:{'Content-Type':cached.metadata.content_type,'X-Retrieval-Time':new Date(cached.created_at).toISOString()}});Object.defineProperty(r,'url',{value:cached.metadata.url});return r;}
  if(!hosts.has(original.host))hosts.set(original.host,semaphore());
  return hosts.get(original.host)(async()=>{
   const circuit=store.host(original.host);if(circuit.open_until>now())throw problem('circuit_open','County source recovery is paused.',circuit.open_until);
   for(let attempt=0;attempt<3;attempt++){
    const currentCircuit=store.host(original.host);if(currentCircuit.open_until>now())throw problem('circuit_open','County source recovery is paused.',currentCircuit.open_until);
    let timer;const ctl=new AbortController(),combined=options.signal?AbortSignal.any([signal,options.signal,ctl.signal].filter(Boolean)):AbortSignal.any([signal,ctl.signal].filter(Boolean));timer=setTimeout(()=>ctl.abort(),18000);
    let response,bytes,url=original.href,nextMethod=method,body=options.body;
    try{
     for(let redirects=0;redirects<=5;redirects++){
      response=await fetcher(url,{...options,method:nextMethod,body,redirect:'manual',signal:combined});
      if(![301,302,303,307,308].includes(response.status))break;
      const location=response.headers.get('location');await response.body?.cancel();if(!location||redirects===5)throw problem('source_url_rejected','Invalid or excessive source redirects.');
      const next=approvedSource(job.input.county,new URL(location,url));if(next.host!==original.host)throw problem('source_url_rejected','Cross-host redirect requires a reviewed source adapter.');
      url=next.href;if(response.status===303||[301,302].includes(response.status)&&nextMethod==='POST'){nextMethod='GET';body=undefined;}
     }
     bytes=await readBounded(response,documentLimits.bytes);
    }catch(e){
     if(signal?.aborted)throw problem('lookup_cancelled','Lookup cancelled.');
     if(options.signal?.aborted)throw problem('source_timeout_or_network_error','County request deadline reached.');
     if(e.code&&e.code!=='source_timeout_or_network_error')throw e;
     store.hostResult(original.host,true);store.event(job.id,job.stage,'source_retry','source_timeout_or_network_error');
     if(attempt===2)throw problem('source_timeout_or_network_error','County network request failed after bounded attempts.');
     clearTimeout(timer);await sleep(Math.round((2**attempt)*1000*(.5+random())),signal);continue;
    }finally{clearTimeout(timer);}
    const transient=[408,429,500,502,503,504].includes(response.status);
    if(transient){
     store.hostResult(original.host,true);const at=retryTime(response.headers.get('retry-after'),now());
     store.event(job.id,job.stage,'source_retry',response.status===429?'source_rate_limited':'source_unavailable');
     if(attempt===2||at&&at-now()>30000)throw problem(response.status===429?'source_rate_limited':'source_unavailable','County source is temporarily unavailable.',at);
     await sleep(at?Math.max(0,at-now()):Math.round((2**attempt)*1000*(.5+random())),signal);continue;
    }
    store.hostResult(original.host,false);
    const metadata={status:response.status,url,method:nextMethod,content_type:response.headers.get('content-type')||'application/octet-stream',fetched_at:new Date(now()).toISOString(),stage:store.get(job.id).stage,attempt:job.attempt};
    // Persist only reusable source responses, never request headers/cookies or transient failures.
    const sessionBound=(response.headers.getSetCookie?.()||[]).length>0;
    if(!sessionBound&&(response.ok||response.status===403||response.status===404))store.artifact(job.id,key,'http',bytes,metadata);
    // Cookies may pass through memory to the county adapter's session jar; never persist them.
    const liveHeaders=new Headers(response.headers);liveHeaders.set('X-Retrieval-Time',metadata.fetched_at);
    const r=new Response(bytes,{status:response.status,headers:liveHeaders});Object.defineProperty(r,'url',{value:url});return r;
   }
  },signal);
 };};
}
