import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createSQLiteDB} from '../server/sqlite.mjs';
import {createJobStore} from '../server/job-store.mjs';
import {createJobRunner} from '../server/job-runner.mjs';
import {createApp} from '../server/app.mjs';
import {createReliableTransport,retryTime} from '../lib/reliability/transport.mjs';
import {explainResult} from '../lib/reliability/gaps.mjs';
const input={scrap_order_id:'offline',address:'100 TEST ST',ownerName:'TEST OWNER',county:'miami-dade-fl',transactionType:'REFI',state:'FL'};
const result=(errors=[])=>({scrapTaxOrderRequest:{matchStatus:'MATCHED',PropertyInformation:{ParcelNumber:'123',ownerOccupied:null},TaxAmounts:{totalTax:'$10.00',totalDiscountable:null}},ExtractionMetadata:{status:errors.length?'partial':'succeeded',match:{status:'MATCHED'},errors,provenance:{'PropertyInformation.ownerOccupied':{method:'inspected_source',reason:'No explicit source occupancy field'},'TaxAmounts.totalDiscountable':{method:'inspected_collector_html',reason:'No printed subtotal'}},section_status:{}}});
const req=(path,body,headers={})=>new Request('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer test-key','Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
const fixture=()=>{const db=createSQLiteDB(':memory:');return {db,store:createJobStore(db)};};
test('additive schema preserves existing ledger and idempotency is input-bound',()=>{
 const {db,store}=fixture();try{
  const first=store.create(input,'same','fixture');assert.equal(store.create({...input},'same').job.id,first.job.id);assert.throws(()=>store.create({...input,address:'OTHER'},'same'),e=>e.http===409);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM scrape_budgets').get().n,0);
  assert.throws(()=>store.create(input,'bad\nkey'),e=>e.http===400);
 }finally{db.close();}
});
test('artifact bytes survive database reopen, are job-isolated and detect corruption',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'retrieval-job-'));let db;
 try{db=createSQLiteDB(join(dir,'state.sqlite'));let store=createJobStore(db);const a=store.create(input,'a').job,b=store.create(input,'b').job;const artifact=store.artifact(a.id,'key','http',Buffer.from('source'),{status:200});assert.equal(store.cached(b.id,'key'),null);db.close();db=createSQLiteDB(join(dir,'state.sqlite'));store=createJobStore(db);assert.equal(Buffer.from(store.cached(a.id,'key').bytes).toString(),'source');assert.equal(store.readArtifact(b.id,artifact.id),null);db.sqlite.prepare('UPDATE retrieval_artifacts SET bytes=? WHERE id=?').run(Buffer.from('corrupted'),artifact.id);assert.throws(()=>store.cached(a.id,'key'),e=>e.code==='artifact_integrity_failed');}finally{db?.close();await rm(dir,{recursive:true,force:true});}
});
test('binary document ingress is job-bound, one-use, hash-checked and private',async()=>{
 const {db,store}=fixture(),app=createApp({env:{DB:db,INVISIA_POC_API_KEY:'test-key',TAXES_JOBS_ENABLED:'1'},lookupClient:async()=>result(),logSink:()=>{}});
 try{
  const job=store.create(input,'upload').job;store.claim('test');const bytes=Buffer.from('%PDF-public offline test bytes'),hash=createHash('sha256').update(bytes).digest('hex'),ticket=store.uploadTicket(job.id,bytes.length,hash),path=`/api/v2/property/jobs/${job.id}/artifact-ingest/${ticket.id}`;
  const upload=token=>new Request('http://localhost'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/pdf'},body:bytes});
  assert.equal((await app(upload('wrong'))).status,401);assert.equal((await app(upload(ticket.token))).status,201);assert.equal((await app(upload(ticket.token))).status,401);
  const artifact=store.artifacts(job.id)[0];assert.equal((await app(req(`/api/v2/property/jobs/${job.id}/artifacts/${artifact.id}`,undefined,{Authorization:''}))).status,401);
  const downloaded=await app(req(`/api/v2/property/jobs/${job.id}/artifacts/${artifact.id}`));assert.equal(downloaded.status,200);assert.equal(downloaded.headers.get('content-type'),'application/octet-stream');assert.equal(Buffer.from(await downloaded.arrayBuffer()).toString(),bytes.toString());
 }finally{await app.shutdown();db.close();}
});
test('expired worker leases recover checkpoints; uncertain paid dispatches require review',()=>{
 let time=1000;const db=createSQLiteDB(':memory:'),store=createJobStore(db,{now:()=>time});try{
  const a=store.create(input,'a').job,b=store.create(input,'b').job;store.claim('dead');store.checkpoint(a.id,'collector_history',result());store.claim('dead');store.session(b.id,'browser',{id:'lease',status:'reserved'});time+=120001;assert.equal(store.recover(),2);assert.equal(store.get(a.id).status,'queued');assert(store.get(a.id).result);assert.equal(store.get(b.id).status,'needs_review');assert.throws(()=>store.resume(b.id),e=>e.code==='cleanup_pending');
 }finally{db.close();}
});
test('durable API authenticates, validates, returns 202 and protects artifacts',async()=>{
 const {db}=fixture(),app=createApp({env:{DB:db,INVISIA_POC_API_KEY:'test-key'},lookupClient:async()=>result(),logSink:()=>{}});
 try{
  assert.equal((await app(req('/api/v2/property/jobs',input,{Authorization:''}))).status,401);
  assert.equal((await app(req('/api/v2/property/jobs',{...input,source_url:'https://evil.example'}))).status,400);
  assert.equal((await app(req('/api/v2/property/jobs',{...input,county:'martin-fl'}))).status,422);
  const created=await app(req('/api/v2/property/jobs',input,{'Idempotency-Key':'api'}));assert.equal(created.status,202);const job=await created.json();assert.equal(created.headers.get('location'),job.links.self);
  assert.equal((await app(req('/api/v2/property/jobs',input,{'Idempotency-Key':'api'}))).status,200);
  assert.equal((await app(req('/api/v2/property/jobs',{...input,address:'DIFFERENT'},{'Idempotency-Key':'api'}))).status,409);
  assert.equal((await app(req(job.links.self,undefined,{Authorization:''}))).status,401);
  assert.equal((await app(req(job.links.self+'/records-request'))).status,200);
  assert.equal((await app(req('/api/v2/operations/retrieval',undefined,{Authorization:''}))).status,401);
 }finally{await app.shutdown();db.close();}
});
test('runner delivers progressive verified checkpoints and missing-field reasons',async()=>{
 const {db,store}=fixture(),runner=createJobRunner({env:{DB:db},store,autoStart:false,logSink:()=>{},lookup:async(_i,_f,runtime)=>{runtime.checkpoint('collector_lookup',result());return result();}});
 try{const job=runner.create(input,'progress').job;await runner.tick();await runner.idle();const done=runner.get(job.id);assert.equal(done.status,'completed_with_gaps');assert(done.checkpoints.collector_history);assert.equal(done.field_status['TaxAmounts.totalDiscountable'].reason,'NOT_PUBLISHED');assert.equal(done.field_status['PropertyInformation.ownerOccupied'].reason,'NOT_PUBLISHED');assert.equal(done.result_version,4);}finally{await runner.stop();db.close();}
});
test('transient sources schedule bounded recovery; identity and budget errors never auto-retry',async()=>{
 for(const [code,status]of [['source_timeout_or_network_error','retry_scheduled'],['document_identity_mismatch','needs_review'],['browser_budget_exhausted','needs_review']]){
  const {db,store}=fixture(),runner=createJobRunner({env:{DB:db},store,autoStart:false,logSink:()=>{},lookup:async()=>result([{source_id:'collector',code}])});
  try{const job=runner.create(input,code).job;await runner.tick();await runner.idle();assert.equal(runner.get(job.id).status,status);assert.equal(Boolean(runner.get(job.id).next_retry_at),status==='retry_scheduled');}finally{await runner.stop();db.close();}
 }
});
test('failed initial property retrieval remains retryable rather than becoming an identity conflict',()=>{
 const data=result([{source_id:'miami_assessment',code:'source_timeout_or_network_error'}]);data.ExtractionMetadata.match.status='SEARCH_INCOMPLETE';assert(!explainResult(data).gaps.some(g=>g.reason==='IDENTITY_REVIEW'));
});
test('one runner owns the SQLite queue; retention excludes unresolved spend and active jobs',()=>{
 let time=1000;const db=createSQLiteDB(':memory:'),store=createJobStore(db,{now:()=>time});try{
  assert.equal(store.runner('a'),true);assert.equal(store.runner('b'),false);time+=120001;assert.equal(store.runner('b'),true);
  const safe=store.create(input,'safe').job,uncertain=store.create(input,'uncertain').job;store.claim('b');store.settle(safe.id,'completed_with_gaps');store.claim('b');store.session(uncertain.id,'browser',{id:'unknown',status:'outcome_unknown'});store.settle(uncertain.id,'needs_review');time+=91*86400000;assert.equal(store.purge(),1);assert.equal(store.get(safe.id),undefined);assert.equal(store.get(uncertain.id).status,'needs_review');
 }finally{db.close();}
});
test('corrected input invalidates old artifacts; repeated input is not silently substituted',()=>{
 const {db,store}=fixture();try{const job=store.create(input,'edit').job;store.artifact(job.id,'source','http',Buffer.from('old property'));store.claim('worker');store.settle(job.id,'needs_review');store.resume(job.id,{...input,address:'200 TEST ST'});assert.equal(store.cached(job.id,'source'),null);assert.equal(store.artifacts(job.id).length,1);assert.equal(store.get(job.id).input.address,'200 TEST ST');}finally{db.close();}
});
test('cancellation waits for backend cleanup and prevents a late success overwrite',async()=>{
 const {db,store}=fixture();let finish,started;const ready=new Promise(r=>started=r),cleanup=new Promise(r=>finish=r);
 const runner=createJobRunner({env:{DB:db},store,autoStart:false,logSink:()=>{},lookup:async(_i,_f,{signal})=>{started();await new Promise(r=>signal.addEventListener('abort',r,{once:true}));await cleanup;return result();}});
 try{const job=runner.create(input,'cancel').job;await runner.tick();await ready;runner.cancel(job.id);assert.throws(()=>runner.resume(job.id),e=>e.code==='cleanup_pending');finish();await runner.idle();assert.equal(runner.get(job.id).status,'cancelled');assert.equal(store.get(job.id).lease_owner,null);}finally{finish();await runner.stop();db.close();}
});
test('shutdown leaves a resumable job and never waits for the browser connection',async()=>{
 const {db,store}=fixture();let started;const ready=new Promise(r=>started=r);const runner=createJobRunner({env:{DB:db},store,autoStart:false,logSink:()=>{},lookup:async(_i,_f,{signal})=>{started();await new Promise(r=>signal.addEventListener('abort',r,{once:true}));return result();}});
 try{const job=runner.create(input,'shutdown').job;await runner.tick();await ready;await runner.stop();assert.equal(store.get(job.id).status,'queued');assert.equal(store.get(job.id).lease_owner,null);}finally{await runner.stop();db.close();}
});
test('job replay reuses its own artifacts; new jobs retrieve fresh data',async()=>{
 const {db,store}=fixture();let calls=0;const transport=createReliableTransport({store,fetcher:async()=>{calls++;return new Response('fresh',{headers:{'Content-Type':'text/html'}});},sleep:async()=>{}});
 try{const a=store.create(input,'a').job,b=store.create(input,'b').job;const ctl=new AbortController();assert.equal(await (await transport(a,ctl.signal)('https://apps.miamidadepa.gov/test')).text(),'fresh');await transport(a,ctl.signal)('https://apps.miamidadepa.gov/test');await transport(b,ctl.signal)('https://apps.miamidadepa.gov/test');assert.equal(calls,2);}finally{db.close();}
});
test('incomplete-stage pages refresh across attempts and retain old evidence without replaying it',async()=>{
 const {db,store}=fixture();let calls=0;const transport=createReliableTransport({store,fetcher:async()=>new Response('page-version-'+(++calls)),sleep:async()=>{}});
 try{const first=store.create(input,'pagination').job;await transport(first)('https://apps.miamidadepa.gov/page');store.claim('a');store.settle(first.id,'retry_scheduled',{nextRetry:0});const second=store.claim('a');assert.equal(await(await transport(second)('https://apps.miamidadepa.gov/page')).text(),'page-version-2');assert.equal(store.artifacts(first.id).length,2);assert.equal(await(await transport(second)('https://apps.miamidadepa.gov/page')).text(),'page-version-2');assert.equal(calls,2);}finally{db.close();}
});
test('redirects are checked before dispatch; county cookies stay only in live memory',async()=>{
 const {db,store}=fixture();let calls=0;const job=store.create(input,'redirect').job;
 try{const transport=createReliableTransport({store,fetcher:async()=>{calls++;return new Response('',{status:302,headers:{Location:'https://evil.example/private'}});}});await assert.rejects(()=>transport(job)('https://county-taxes.net/test'),e=>e.code==='source_url_rejected');assert.equal(calls,1);
 const live=createReliableTransport({store,fetcher:async()=>new Response('session',{headers:{'Set-Cookie':'private=value'}})});const response=await live(job)('https://county-taxes.net/session');assert(response.headers.get('set-cookie'));assert.equal(store.artifacts(job.id).length,0);
 }finally{db.close();}
});
test('429 honours long Retry-After without sleeping; circuit breaks repeated transient failures',async()=>{
 const {db,store}=fixture();const job=store.create(input,'rate').job;let sleeps=0;
 try{const transport=createReliableTransport({store,fetcher:async()=>new Response('',{status:429,headers:{'Retry-After':'3600'}}),sleep:async()=>{sleeps++;}});await assert.rejects(()=>transport(job)('https://county-taxes.net/test'),e=>e.code==='source_rate_limited'&&e.retryAt>Date.now());assert.equal(sleeps,0);
 for(let i=0;i<5;i++)store.hostResult('county-taxes.net',true);await assert.rejects(()=>transport(job)('https://county-taxes.net/test'),e=>e.code==='circuit_open');assert(retryTime('Wed, 01 Jan 2031 00:00:00 GMT')>Date.now());
 }finally{db.close();}
});
test('no fallback interpretation turns zero, missing data or a conflict into another value',()=>{
 const data=result([{source_id:'receipt_pdf',code:'source_values_disagree'}]);data.scrapTaxOrderRequest.TaxAmounts.totalTax='$0.00';data.ExtractionMetadata.provenance['TaxAmounts.totalTax']={source_id:'receipt_pdf',method:'printed_value'};const {gaps,fields}=explainResult(data);assert.equal(fields['TaxAmounts.totalTax'].status,'VERIFIED');assert.equal(gaps[0].reason,'VALIDATION_CONFLICT');assert.equal(fields['TaxAmounts.totalDiscountable'].reason,'NOT_PUBLISHED');
});
test('explicit certificate-notice omission is distinct from an unsupported layout',()=>{
 const data=result();delete data.ExtractionMetadata.provenance['TaxAmounts.totalDiscountable'];data.ExtractionMetadata.section_status.TaxAmounts={status:'UNAVAILABLE',note:'Annual tax totals are not printed on this certificate notice.'};assert.equal(explainResult(data).fields['TaxAmounts.totalDiscountable'].reason,'NOT_PUBLISHED');
});

test('operator review is evidence-bound and cannot overwrite verified amounts',async()=>{
 const {db,store}=fixture(),runner=createJobRunner({env:{DB:db},store,autoStart:false,logSink:()=>{},lookup:async()=>result()});
 try{const job=runner.create(input,'review').job;await runner.tick();await runner.idle();const artifact=store.artifact(job.id,'source','http',Buffer.from('original source'),{url:'https://county-taxes.net/record'});
 const reviewed=runner.review(job.id,{artifact_id:artifact.id,source_url:'https://county-taxes.net/record',note:'Original source inspected; requested subtotal is not published.'});assert.equal(reviewed.review.changes_verified_values,false);assert.equal(runner.get(job.id).result.scrapTaxOrderRequest.TaxAmounts.totalTax,'$10.00');assert.throws(()=>runner.review(job.id,{artifact_id:artifact.id,source_url:'https://evil.example',note:'Untrusted'}),e=>e.code==='source_url_rejected');
 }finally{await runner.stop();db.close();}
});
