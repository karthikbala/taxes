// This worker exercises only its in-process HTTP bridge; the runner still blocks remote hosts.
process.env.INVISIA_TEST_ALLOW_LOOPBACK='1';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
const env={INVISIA_POC_API_KEY:'offline-test-key'};
const order={scrap_order_id:'offline-1',address:'100 TEST ST',ownerName:'TEST OWNER',county:'martin-fl',transactionType:'REFI'};
const req=(path,body,extra={})=>new Request('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+env.INVISIA_POC_API_KEY,'Content-Type':'application/json',...extra.headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),...extra});
const logs=[];let calls=0;const app=createApp({env,fetcher:async()=>{calls++;throw new Error('Unexpected network request');},logSink:row=>logs.push(row)});
test('lookup authenticates before parsing or any source access',async()=>{const r=await app(req('/api/v2/property/lookup','bad',{headers:{'Content-Type':'application/json'}}));assert.equal(r.status,401);assert.equal(calls,0);assert.equal((await r.json()).request_id,r.headers.get('x-request-id'));});
test('pending county retains client order and explicit gap with no paid or network calls',async()=>{const r=await app(req('/api/v2/property/lookup',order));assert.equal(r.status,200);const j=await r.json();assert.equal(j.scrapTaxOrderRequest.orderId,order.scrap_order_id);assert.equal(j.ExtractionMetadata.request_id,r.headers.get('x-request-id'));assert(j.ExtractionMetadata.errors.some(e=>e.code==='county_address_contract_pending'));assert.equal(calls,0);assert(logs.some(e=>e.request_id===r.headers.get('x-request-id')));});
test('body limit, malformed JSON, contract, and method gates',async()=>{assert.equal((await app(req('/api/v2/property/lookup','x'.repeat(8193)))).status,413);assert.equal((await app(req('/api/v2/property/lookup','{'))).status,400);assert.equal((await app(req('/api/v2/property/lookup',{...order,source_url:'https://example.com'}))).status,400);assert.equal((await app(req('/api/v2/property/lookup'))).status,405);assert.equal((await app(req('/api/v1/property/lookup',{} ,{headers:{}}))).status,401);});
test('liveness, sources and authenticated unconfigured readiness are offline',async()=>{const live=await app(req('/healthz'));assert.deepEqual(await live.json(),{status:'ok'});for(const version of ['v1','v2'])assert.equal((await app(req(`/api/${version}/sources`))).status,200);const r=await app(req('/api/v2/health'));assert.equal(r.status,200);assert.equal((await r.json()).managed_source_access.ready,false);assert.equal(calls,0);assert.equal(r.headers.get('access-control-allow-origin'),null);});
test('pre-aborted lookup does not claim success',async()=>{const ctl=new AbortController();ctl.abort();const r=await app(req('/api/v2/property/lookup',order,{signal:ctl.signal}));assert.equal(r.status,499);});
test('static serving rejects hidden files, unknown types and symlink escapes',async()=>{const dir=await mkdtemp(join(tmpdir(),'taxes-static-'));try{await mkdir(join(dir,'public'));await writeFile(join(dir,'public/style.css'),'body{}');await writeFile(join(dir,'.env'),'PRIVATE');await symlink(join(dir,'.env'),join(dir,'public/escape.css'));const local=createApp({env,staticRoot:join(dir,'public'),logSink:()=>{}});assert.equal((await local(req('/style.css'))).status,200);for(const path of ['/.env','/%2e%2e%2f.env','/escape.css','/private.mjs','/%5c.env'])assert.equal((await local(req(path))).status,404);const r=await local(new Request('http://localhost/style.css',{method:'HEAD'}));assert.equal(await r.text(),'');}finally{await rm(dir,{recursive:true,force:true});}});
test('all public pages come from trusted JSON literals',async()=>{for(const path of ['/','/live','/poc']){const r=await app(req(path));assert.equal(r.status,200);assert.match(await r.text(),/^<!doctype html>/i);}});

test('deadline aborts the direct source request and returns coherent request ID',async()=>{let aborted=false;const local=createApp({env,deadlineMs:15,logSink:()=>{},fetcher:async(_url,{signal})=>new Promise((_,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true});})});const r=await local(req('/api/v2/property/lookup',{...order,county:'miami-dade-fl'}));assert.equal(r.status,504);assert.equal((await r.json()).request_id,r.headers.get('x-request-id'));assert.equal(aborted,true);});
test('live UI includes memory-only key and authenticated v1 lookup script',async()=>{const page=await (await app(req('/live'))).text();assert.match(page,/id="selfhost-key"/);const js=await (await app(req('/live.js'))).text();assert.match(js,/'Authorization':'Bearer '\+el\('selfhost-key'\)\.value/);assert(!js.includes('localStorage'));});
test('HTTP bridge serves liveness and preserves oversized-body response',async()=>{const {createServerHTTP}=await import('../server/index.mjs');const server=await createServerHTTP({env:{...env,DB:{prepare(){throw new Error('No database use expected');}}},logSink:()=>{}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;try{assert.equal((await fetch(base+'/healthz')).status,200);const r=await fetch(base+'/api/v2/property/lookup',{method:'POST',headers:{Authorization:'Bearer '+env.INVISIA_POC_API_KEY,'Content-Type':'application/json'},body:'x'.repeat(8193)});assert.equal(r.status,413);assert.equal((await r.json()).request_id,r.headers.get('x-request-id'));}finally{await new Promise(resolve=>server.close(resolve));}});
test('production startup refuses missing key',async()=>{const {createServerHTTP}=await import('../server/index.mjs');await assert.rejects(createServerHTTP({env:{NODE_ENV:'production'}}),/INVISIA_POC_API_KEY/);});

test('disconnect aborts an in-flight source request without waiting for deadline',async()=>{const ctl=new AbortController();let observed=false,started;const ready=new Promise(resolve=>started=resolve);const local=createApp({env,logSink:()=>{},fetcher:async(_u,{signal})=>new Promise((_,reject)=>{started();signal.addEventListener('abort',()=>{observed=true;reject(new DOMException('Aborted','AbortError'));},{once:true});})});const pending=local(req('/api/v2/property/lookup',{...order,county:'miami-dade-fl'},{signal:ctl.signal}));await ready;ctl.abort();const r=await pending;assert.equal(r.status,499);assert.equal(observed,true);});

test('POC module chain and explorer font are served with correct browser MIME types',async()=>{const page=await app(req('/poc'));const html=await page.text();assert.match(html,/<script type="module" src="\/poc\.js"/);assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);const script=await app(req('/poc.js'));assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/^text\/javascript/);const js=await script.text();const imports=[...js.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m=>new URL(m[1],'http://localhost/poc.js').pathname);assert.deepEqual(imports,['/neighbors.js','/source-status.mjs','/poc-render.mjs','/property-drilldown.mjs','/poc-workflows.mjs']);for(const path of imports){const response=await app(req(path));assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^text\/javascript/);assert.match(await response.text(),path==='/poc-render.mjs'?/export function renderSections/:path==='/neighbors.js'?/export function initNeighbors/:path==='/property-drilldown.mjs'?/export function selectedPropertyOrder/:path==='/poc-workflows.mjs'?/export function pocWorkflows/:/export function sourcePresentation/);}const font=await app(req('/assets/DM-Sans.ttf'));assert.equal(font.status,200);assert.equal(font.headers.get('content-type'),'font/ttf');assert.equal(calls,0);});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
test('app remains busy after deadline/disconnect response until backend cleanup settles',async()=>{
 for(const mode of ['deadline','disconnect']){
  const started=deferred(),cleanup=deferred(),ctl=new AbortController();let settled=false;
  const local=createApp({env,deadlineMs:mode==='deadline'?10:120000,logSink:()=>{},lookupClient:async(_input,_fetcher,{signal})=>{
   started.resolve();await new Promise(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',resolve,{once:true});});await cleanup.promise;settled=true;throw new Error('Fixture backend rejected after cleanup');
  }});
  const pending=local(req('/api/v2/property/lookup',order,{signal:ctl.signal}));await started.promise;if(mode==='disconnect')ctl.abort();
  const response=await pending;assert.equal(response.status,mode==='deadline'?504:499);assert.equal(settled,false);
  let idle=false;const drained=local.waitForIdle().then(()=>idle=true);await new Promise(resolve=>setImmediate(resolve));assert.equal(idle,false);
  cleanup.resolve();await drained;assert.equal(settled,true);assert.equal(idle,true);
 }
});
test('HTTP shutdown retains owned database while detached lookup reconciles',async()=>{
 const {createServerHTTP}=await import('../server/index.mjs');const cleanup=deferred();let closed=false,reconciled=false;
 const database={close(){closed=true;},prepare(){assert.equal(closed,false,'database must remain open for reconciliation');return {async run(){reconciled=true;}};}};
 const server=await createServerHTTP({env,dbFactory:()=>database,deadlineMs:10,logSink:()=>{},lookupClient:async(_input,_fetcher,{signal})=>{
  await new Promise(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',resolve,{once:true});});
  await cleanup.promise;await database.prepare('fixture reconciliation').run();throw new Error('Fixture backend rejected after reconciliation');
 }});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/v2/property/lookup',{method:'POST',headers:{Authorization:'Bearer '+env.INVISIA_POC_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(order)});
  assert.equal(response.status,504);await response.text();assert.equal(closed,false);assert.equal(reconciled,false);
  await new Promise(resolve=>server.close(resolve));let complete=false;server.shutdownComplete.then(()=>complete=true);await new Promise(resolve=>setImmediate(resolve));assert.equal(complete,false);assert.equal(closed,false);
  cleanup.resolve();await server.shutdownComplete;assert.equal(reconciled,true);assert.equal(closed,true);
 }finally{cleanup.resolve();if(server.listening)await new Promise(resolve=>server.close(resolve));await server.shutdownComplete;}
});

test('CLI starts the HTTP server when the release directory is a symlink',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'taxes-release-'));
 let child,timer;
 try{
  await symlink(fileURLToPath(new URL('../',import.meta.url)),join(dir,'current'),'dir');
  const {createServer}=await import('node:net'),probe=createServer();
  await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;
  await new Promise(resolve=>probe.close(resolve));
  child=spawn(process.execPath,['--import',fileURLToPath(new URL('../scripts/test.mjs',import.meta.url)),join(dir,'current/server/index.mjs')],{
   env:{...process.env,INVISIA_OFFLINE_TEST_WORKER:'1',NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),TAXES_DB_PATH:join(dir,'test.sqlite'),INVISIA_POC_API_KEY:'offline-symlink-test-key',INVISIA_BROWSER_ENABLED:'0',INVISIA_BROWSER_API_KEY:''},stdio:['ignore','pipe','pipe']
  });
  await new Promise((resolve,reject)=>{
   let output='',errors='';
   timer=setTimeout(()=>reject(new Error('Linked release did not start within 10 seconds.')),10000);
   child.stdout.on('data',data=>{output+=data;if(output.includes('selfhost_listening'))resolve();});
   child.stderr.on('data',data=>{errors+=data;});
   child.once('error',reject);child.once('exit',code=>reject(new Error('Linked release exited before startup: '+code+' '+errors)));
  });
  clearTimeout(timer);
  const response=await fetch('http://127.0.0.1:'+port+'/healthz');
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'ok'});
 }finally{
  clearTimeout(timer);
  if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}
  await rm(dir,{recursive:true,force:true});
 }
});
