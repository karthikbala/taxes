import {parcelLookup,parcelWorkflow} from '../lib/reliability/parcel.mjs';
import {createCountyTracking} from './county-tracking.mjs';
import {makeScrapedoClerk} from '../lib/client/osceola-clerk.mjs';
import {extractNeighborProperties} from '../lib/client/neighbors.mjs';
import {debitScrapedoProbe} from '../lib/client/external-probe-budget.mjs';
import {discoverMiamiDeed} from '../lib/client/deed-discovery.mjs';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {clientLookup} from '../lib/client/engine.mjs';
import {clientCapabilities} from '../lib/client/profiles.mjs';
import {authorized,managedPreflight} from '../lib/client/access.mjs';
import {createLookupLogger} from '../lib/client/logging.mjs';
import {lookup as legacyLookup,capabilities} from '../lib/live/router.mjs';
import {makeManagedBrowser} from '../lib/live/managed-browser.mjs';
import {readPage,projectRoot,selfhostLiveScript} from '../scripts/build-selfhost.mjs';
import {createJobRunner} from './job-runner.mjs';
import {semaphore} from '../lib/reliability/transport.mjs';
import {makeLocalBrowser} from './local-browser.mjs';
import {readBounded} from '../lib/live/engine.mjs';
const BODY_LIMIT=8192;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.pdf':'application/pdf','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf'};
const problem=(code,http,message)=>Object.assign(new Error(message||code),{code,http});
async function inputJSON(request){
  const length=request.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>BODY_LIMIT))throw problem('payload_too_large',413,'Request body exceeds 8 KiB.');
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))throw problem('unsupported_media_type',415,'Use application/json.');
  const reader=request.body?.getReader();let bytes=0,parts=[];
  if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>BODY_LIMIT){await reader.cancel();throw problem('payload_too_large',413,'Request body exceeds 8 KiB.');}parts.push(value);}}finally{reader.releaseLock();}
  const all=new Uint8Array(bytes);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}catch{throw problem('invalid_json',400,'Supply valid JSON.');}
}
export function createApp({env={},fetcher=fetch,staticRoot=resolve(projectRoot,'public'),logSink,deadlineMs=120000,lookupClient=clientLookup,lookupLegacy=legacyLookup,lookupNeighbors=extractNeighborProperties,lookupParcel=parcelLookup}={}){
 const provider=makeManagedBrowser(env),paid=semaphore();
 const managedBrowser=provider?args=>paid(()=>provider(args),args.signal):null,clerkProvider=makeScrapedoClerk(env),scrapedoClerk=clerkProvider?args=>paid(()=>clerkProvider(args),args.signal):null;const pages=new Map(),pending=new Set();
 const jobs=env.TAXES_JOBS_ENABLED==='0'?null:createJobRunner({env,fetcher,lookup:lookupClient,lookupParcel,managedBrowser,localBrowser:makeLocalBrowser(env),scrapedoClerk,logSink});
 const tracking=jobs?createCountyTracking(env.DB,jobs.store):null;
 const track=promise=>{const task=Promise.resolve(promise);pending.add(task);task.finally(()=>pending.delete(task)).catch(()=>{});return task;};
 async function handle(request){
  const requestId=randomUUID(),start=Date.now();const log=createLookupLogger(requestId,logSink);
  const headers={'Cache-Control':'no-store','X-Request-ID':requestId,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"};
  log('client_api_started');
  const json=(value,status=200,extra={})=>{log('client_api_completed',{http_status:status,status:value.ExtractionMetadata?.status||value.status,duration_ms:Date.now()-start,error_code:value.error?.code});return Response.json(value,{status,headers:{...headers,...extra}});};
  const error=(code,status,message)=>json({status:'error',request_id:requestId,error:{code,message}},status);
  const method=(allowed='GET, HEAD')=>json({request_id:requestId,error:{code:'method_not_allowed',message:'Method not allowed.'}},405,{Allow:allowed});
  try{
   const url=new URL(request.url),path=url.pathname;
   if(path==='/healthz')return ['GET','HEAD'].includes(request.method)?new Response(request.method==='HEAD'?null:JSON.stringify({status:'ok'}),{headers:{...headers,'Content-Type':mime['.json']}}):method();
   if(path==='/api/v2/health'){
    if(request.method!=='GET')return method('GET');if(!await authorized(request,env))return error('unauthorized',401,'Bearer access key required.');
    return json({api:'ready',managed_source_access:await managedPreflight(env)});
   }
   if(path==='/api/v2/sources'||path==='/api/v1/sources'){if(request.method!=='GET')return method('GET');return json(path.includes('/v2/')?clientCapabilities:capabilities);}
   if(path==='/api/v3/operations/counties'){
    if(!await authorized(request,env))return error('unauthorized',401,'Bearer access key required.');
    if(request.method!=='GET')return method('GET');if(!tracking)return error('jobs_unavailable',503,'Durable tracking requires SQLite.');return json(tracking.status(env.TAXES_SOURCE_REVISION||'working-tree'));
   }
   if(path==='/api/v3/property/jobs'||path.startsWith('/api/v3/property/jobs/')){
    if(!await authorized(request,env))return error('unauthorized',401,'Bearer access key required.');if(!jobs)return error('jobs_unavailable',503,'Durable parcel jobs require SQLite.');
    if(path==='/api/v3/property/jobs'){if(request.method!=='POST')return method('POST');const created=jobs.createParcel(await inputJSON(request),request.headers.get('idempotency-key'),request.headers.get('x-retrieval-access')||'configured');return json(created.job,created.reused?200:202,{Location:created.job.links.self});}
    const match=path.match(/^\/api\/v3\/property\/jobs\/([a-f0-9-]{36})(?:\/(cancel|resume|artifacts)(?:\/([a-f0-9-]{36}))?)?$/);
    if(!match)return error('not_found',404,'Job endpoint not found.');const [,id,action,artifact]=match;
    if(jobs.store.get(id)?.input.__workflow!==parcelWorkflow)return error('job_not_found',404,'Parcel job not found.');
    if(action==='cancel'){if(request.method!=='POST')return method('POST');return json(jobs.cancel(id));}
    if(action==='resume'){if(request.method!=='POST')return method('POST');const body=await inputJSON(request);if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='input'))return error('invalid_input',400,'Resume accepts an empty object or corrected input.');return json(jobs.resume(id,body.input?{...body.input,__workflow:parcelWorkflow}:undefined),202);}
    if(action==='artifacts'){if(request.method!=='GET')return method('GET');const item=artifact&&jobs.readArtifact(id,artifact);if(!item)return error('not_found',404,'Artifact not found.');return new Response(item.bytes,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+item.id+'"','X-Content-SHA256':item.sha256}});}
    if(request.method!=='GET')return method('GET');return json(jobs.get(id));
   }
   if(path==='/api/v2/property/jobs'||path.startsWith('/api/v2/property/jobs/')||path==='/api/v2/operations/retrieval'){
    const upload=path.match(/^\/api\/v2\/property\/jobs\/([a-f0-9-]{36})\/artifact-ingest\/([a-f0-9-]{36})$/);
    if(upload){
     if(request.method!=='POST')return method('POST');
     const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
     if(!jobs?.store.checkUpload(upload[1],upload[2],token))return error('unauthorized',401,'Upload ticket is invalid or expired.');
     const bytes=await readBounded(request,25*1024*1024),artifact=jobs.store.acceptUpload(upload[1],upload[2],token,bytes);return json({id:artifact.id,sha256:artifact.sha256},201);
    }
    if(!await authorized(request,env))return error('unauthorized',401,'Bearer access key required.');
    if(!jobs)return error('jobs_unavailable',503,'Durable jobs require the standalone SQLite runtime.');
    if(path==='/api/v2/operations/retrieval')return request.method==='GET'?json(jobs.metrics()):method('GET');
    if(path==='/api/v2/property/jobs'){
     if(request.method!=='POST')return method('POST');
     const created=jobs.create(await inputJSON(request),request.headers.get('idempotency-key'),request.headers.get('x-retrieval-access')||'configured');return json(created.job,created.reused?200:202,{Location:created.job.links.self});
    }
    const match=path.match(/^\/api\/v2\/property\/jobs\/([a-f0-9-]{36})(?:\/(cancel|resume|review|records-request|artifacts)(?:\/([a-f0-9-]{36}))?)?$/);
    if(!match)return error('not_found',404,'Job endpoint not found.');const [,id,action,artifact]=match;
    if(action==='cancel'){if(request.method!=='POST')return method('POST');return json(jobs.cancel(id));}
    if(action==='resume'){if(request.method!=='POST')return method('POST');const input=await inputJSON(request);if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='input'))return error('invalid_input',400,'Resume accepts an empty object or corrected input.');return json(jobs.resume(id,input.input),202);}
    if(action==='review'){if(request.method!=='POST')return method('POST');return json(jobs.review(id,await inputJSON(request)),201);}
    if(action==='records-request'){if(request.method!=='GET')return method('GET');return json(jobs.recordsRequest(id));}
    if(action==='artifacts'){
     if(request.method!=='GET')return method('GET');if(!artifact)return error('not_found',404,'Artifact not found.');
     const item=jobs.readArtifact(id,artifact);if(!item)return error('not_found',404,'Artifact not found.');
     return new Response(item.bytes,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+item.id+'"','X-Content-SHA256':item.sha256}});
    }
    if(request.method!=='GET')return method('GET');return json(jobs.get(id));
   }
   if(path==='/api/v2/property/lookup'||path==='/api/v1/property/lookup'||path==='/api/v2/property/neighbors'){
    if(request.method!=='POST')return method('POST');if(!await authorized(request,env))return error('unauthorized',401,'Bearer access key required.');
    if(request.signal.aborted)return error('request_aborted',499,'Request canceled.');
    const input=await inputJSON(request),ctl=new AbortController();const abort=()=>ctl.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)ctl.abort();
    let timer;const canceled=new Promise((_,reject)=>{const stopped=()=>reject(problem(request.signal.aborted?'request_aborted':'lookup_deadline',request.signal.aborted?499:504,'Lookup canceled or deadline reached.'));ctl.signal.addEventListener('abort',stopped,{once:true});if(ctl.signal.aborted)stopped();timer=setTimeout(()=>ctl.abort(),deadlineMs);});
    // Legacy engine callers also receive cancellation through the injected fetch boundary.
    const boundedFetch=(u,options={})=>fetcher(u,{...options,signal:options.signal?AbortSignal.any([ctl.signal,options.signal]):ctl.signal});
    let preflight;const guardedBrowser=managedBrowser?async args=>{if(ctl.signal.aborted)throw problem('request_aborted',499,'Request canceled.');preflight??=await managedPreflight(env);if(!preflight.ready)throw problem('managed_access_not_ready',503,'Managed source entitlement or authorized budget was not verified.');if(ctl.signal.aborted)throw problem('request_aborted',499,'Request canceled.');return managedBrowser({...args,signal:ctl.signal,deadline:Math.min(args.deadline??Infinity,start+deadlineMs)});}:null;
    try{const runtime={requestId,signal:ctl.signal,managedBrowser:guardedBrowser,scrapedoClerk,log};const backend=track(Promise.resolve().then(()=>path==='/api/v2/property/neighbors'?lookupNeighbors(input,boundedFetch,runtime):path.includes('/v2/')?lookupClient(input,boundedFetch,runtime):lookupLegacy(input,boundedFetch,runtime)));const result=await Promise.race([backend,canceled]);if(path.includes('/v1/')){result.request_id=requestId;return json(result,result.status==='not_found'?404:result.status==='blocked'?503:result.status==='error'?502:200);}return json(result);}
    finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);}
   }
   if(path==='/api/v2/diagnostics/miami-tax-deed'){
    if(request.method!=='POST')return method('POST');if(!await authorized(request,env))return error('unauthorized',401,'Bearer access key required.');
    const input=await inputJSON(request);if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>k!=='folio'))return error('invalid_input',400,'Fixed source probe accepts only an optional Miami folio.');
    const backend=track(discoverMiamiDeed(env,{signal:request.signal,requestId,folio:input.folio,managedBrowser}));return json(await backend);
   }
   if(path==='/api/v2/diagnostics/miami-external-test-budget'){
    if(request.method!=='POST')return method('POST');if(!await authorized(request,env))return error('unauthorized',401,'Bearer access key required.');
    const input=await inputJSON(request);if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length)return error('invalid_input',400,'Fixed external source test accepts an empty object only.');
    return json(await track(debitScrapedoProbe(env)));
   }
   if(path.startsWith('/api/'))return error('not_found',404,'Endpoint not found.');
   if(!['GET','HEAD'].includes(request.method))return method();
   const name={'/':'index.html','/live':'live.html','/live/':'live.html','/poc':'poc.html','/poc/':'poc.html'}[path];
   if(name){if(!pages.has(name))pages.set(name,readPage(name));return new Response(request.method==='HEAD'?null:await pages.get(name),{headers:{...headers,'Content-Type':mime['.html']}});}
   const staticPath=path==='/florida'||path==='/florida/'?'/florida.html':path;
   let decoded;try{decoded=decodeURIComponent(staticPath);}catch{return error('not_found',404,'File not found.');}
   if(decoded.includes('\\')||decoded.includes('\0')||decoded.split('/').some(p=>p.startsWith('.')||p==='..'))return error('not_found',404,'File not found.');
   if(!mime[extname(decoded).toLowerCase()])return error('not_found',404,'File not found.');
   const root=await realpath(staticRoot),file=await realpath(resolve(root,'.'+decoded));if(!file.startsWith(root+sep)||file.slice(root.length+1).split(sep).some(p=>p.startsWith('.'))||!mime[extname(file).toLowerCase()]||!(await stat(file)).isFile())return error('not_found',404,'File not found.');
   const content=request.method==='HEAD'?null:path==='/live.js'?selfhostLiveScript(await readFile(file,'utf8')):await readFile(file);
   return new Response(content,{headers:{...headers,'Content-Type':mime[extname(file).toLowerCase()]}});
  }catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')return error('not_found',404,'File not found.');log('http_request_failed',{error_code:e.code||'internal_error',duration_ms:Date.now()-start});return error(e.code||'internal_error',e.http||502,e.http?e.message:'Source lookup or server operation failed.');}
 }
 const app=request=>track(handle(request));
 app.waitForIdle=async()=>{while(pending.size)await Promise.allSettled([...pending]);};
 app.shutdown=async()=>{await jobs?.stop();await app.waitForIdle();};
 return app;
}
