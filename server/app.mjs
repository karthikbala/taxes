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
export function createApp({env={},fetcher=fetch,staticRoot=resolve(projectRoot,'public'),logSink,deadlineMs=120000,lookupClient=clientLookup,lookupLegacy=legacyLookup}={}){
 const managedBrowser=makeManagedBrowser(env);const pages=new Map(),pending=new Set();
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
   if(path==='/api/v2/property/lookup'||path==='/api/v1/property/lookup'){
    if(request.method!=='POST')return method('POST');if(!await authorized(request,env))return error('unauthorized',401,'Bearer access key required.');
    if(request.signal.aborted)return error('request_aborted',499,'Request canceled.');
    const input=await inputJSON(request),ctl=new AbortController();const abort=()=>ctl.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)ctl.abort();
    let timer;const canceled=new Promise((_,reject)=>{const stopped=()=>reject(problem(request.signal.aborted?'request_aborted':'lookup_deadline',request.signal.aborted?499:504,'Lookup canceled or deadline reached.'));ctl.signal.addEventListener('abort',stopped,{once:true});if(ctl.signal.aborted)stopped();timer=setTimeout(()=>ctl.abort(),deadlineMs);});
    // Legacy engine callers also receive cancellation through the injected fetch boundary.
    const boundedFetch=(u,options={})=>fetcher(u,{...options,signal:options.signal?AbortSignal.any([ctl.signal,options.signal]):ctl.signal});
    let preflight;const guardedBrowser=managedBrowser?async args=>{if(ctl.signal.aborted)throw problem('request_aborted',499,'Request canceled.');preflight??=await managedPreflight(env);if(!preflight.ready)throw problem('managed_access_not_ready',503,'Managed source entitlement or authorized budget was not verified.');if(ctl.signal.aborted)throw problem('request_aborted',499,'Request canceled.');return managedBrowser({...args,signal:ctl.signal,deadline:Math.min(args.deadline??Infinity,start+deadlineMs)});}:null;
    try{const runtime={requestId,signal:ctl.signal,managedBrowser:guardedBrowser,log};const backend=track(Promise.resolve().then(()=>path.includes('/v2/')?lookupClient(input,boundedFetch,runtime):lookupLegacy(input,boundedFetch,runtime)));const result=await Promise.race([backend,canceled]);if(path.includes('/v1/')){result.request_id=requestId;return json(result,result.status==='not_found'?404:result.status==='blocked'?503:result.status==='error'?502:200);}return json(result);}
    finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);}
   }
   if(path==='/api/v2/diagnostics/miami-tax-deed'){
    if(request.method!=='POST')return method('POST');if(!await authorized(request,env))return error('unauthorized',401,'Bearer access key required.');
    const input=await inputJSON(request);if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length)return error('invalid_input',400,'This fixed source-access probe accepts an empty JSON object only.');
    const backend=track(discoverMiamiDeed(env,{signal:request.signal,requestId}));return json(await backend);
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
 return app;
}
