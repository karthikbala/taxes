process.env.INVISIA_TEST_ALLOW_LOOPBACK='1';
import {createJobRunner} from '../server/job-runner.mjs';
import {createJobStore} from '../server/job-store.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {browserLedgerBypass,operatorLedgerBypass} from '../lib/live/browser-policy.mjs';
import {makeManagedBrowser} from '../lib/live/managed-browser.mjs';
import {managedPreflight} from '../lib/client/access.mjs';
import {createSQLiteDB} from '../server/sqlite.mjs';
import {createServerHTTP} from '../server/index.mjs';
const env={TAXES_DEPLOYMENT_ENV:'production',INVISIA_BROWSER_OPERATOR_OVERRIDE:'1',INVISIA_BROWSER_OPERATOR_COUNTIES:'miami-dade-fl,osceola-fl',INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'offline-only',INVISIA_POC_API_KEY:'offline-only'};
test('production override requires its own explicit flag and a county scope',()=>{
 assert.equal(operatorLedgerBypass(env),true);assert.equal(browserLedgerBypass({...env,INVISIA_BROWSER_OPERATOR_OVERRIDE:'0'}),false);assert.equal(browserLedgerBypass({...env,INVISIA_BROWSER_OPERATOR_COUNTIES:''}),false);assert.equal(browserLedgerBypass({TAXES_DEPLOYMENT_ENV:'production',INVISIA_BROWSER_LEDGER_BYPASS:'1'}),false);
});
test('production override retains entitlement checks, exact source gates, and auditable billing without creating a ledger',async()=>{
 const db=createSQLiteDB(':memory:'),old=globalThis.fetch;let calls=0;const receipts=[];
 globalThis.fetch=async(url,init)=>{calls++;if(String(url).endsWith('/credit-usage'))return Response.json({success:true,data:{remainingCredits:100}});if(init.method==='DELETE')return Response.json({success:true,creditsBilled:3});if(String(url).endsWith('/execute'))return Response.json({success:true,exitCode:0,stdout:'INVISIA_RESULT='+JSON.stringify({html:'native county record',url:'https://county-taxes.net/iframe-taxsys/offline',pdf:null})});return Response.json({success:true,id:'offline-production-session'});};
 try{
  assert.equal((await managedPreflight({...env,DB:db})).reason,'operator_authorized_production_override');
  const browser=makeManagedBrowser({...env,DB:db});await browser({url:'https://county-taxes.net/fl-miamidade/property-tax/EXAMPLE',county:'miami-dade-fl',includePdf:false,sessionObserver:e=>{if(e.receipt)receipts.push(e.receipt);}});
  assert.equal(receipts.length,1);assert.equal(receipts[0].credits_billed,3);assert.equal(receipts[0].cleanup_confirmed,true);
  const before=calls;await assert.rejects(browser({url:'https://county-taxes.net/fl-lee/property-tax/EXAMPLE',county:'lee-fl',includePdf:false}),e=>e.code==='operator_recovery_scope');assert.equal(calls,before);
  assert.equal(await db.prepare('SELECT * FROM scrape_budgets').first(),null);assert.equal(await db.prepare('SELECT * FROM browser_runs').first(),null);
 }finally{globalThis.fetch=old;db.close();}
});
test('unknown production billing is retained as unknown and startup preserves the explicit override',async()=>{
 const db=createSQLiteDB(':memory:'),old=globalThis.fetch;let receipt;
 globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/credit-usage'))return Response.json({success:true,data:{remainingCredits:100}});if(init.method==='DELETE')throw Error('Cleanup unconfirmed');if(String(url).endsWith('/execute'))return Response.json({success:true,exitCode:0,stdout:'INVISIA_RESULT='+JSON.stringify({html:'native county record',url:'https://county-taxes.net/iframe-taxsys/offline',pdf:null})});return Response.json({success:true,id:'offline-unknown-session'});};
 try{
  await makeManagedBrowser({...env,DB:db})({url:'https://county-taxes.net/fl-miamidade/property-tax/EXAMPLE',county:'miami-dade-fl',includePdf:false,sessionObserver:e=>{if(e.receipt)receipt=e.receipt;}});assert.equal(receipt.credits_billed,null);assert.equal(receipt.cleanup_confirmed,false);
  const app=await createServerHTTP({env:{...env,DB:db,TAXES_JOBS_ENABLED:'0'},logSink:()=>{}});await new Promise(r=>app.listen(0,'127.0.0.1',r));try{const health=await (await old('http://127.0.0.1:'+app.address().port+'/api/v2/health',{headers:{Authorization:'Bearer offline-only'}})).json();assert.equal(health.managed_source_access.reason,'operator_authorized_production_override');}finally{app.close();await app.shutdownComplete;}
 }finally{globalThis.fetch=old;db.close();}
});

test('durable jobs persist operator receipts and reconcile a later provider cleanup without minting a ledger',async()=>{
 const db=createSQLiteDB(':memory:'),store=createJobStore(db),old=globalThis.fetch;let closed=false;
 globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/credit-usage'))return Response.json({success:true,data:{remainingCredits:100}});if(init.method==='DELETE')throw Error('First cleanup unconfirmed');if(String(url).endsWith('/execute'))return Response.json({success:true,exitCode:0,stdout:'INVISIA_RESULT='+JSON.stringify({html:'native record',url:'https://county-taxes.net/iframe-taxsys/offline',pdf:null})});return Response.json({success:true,id:'offline-durable-session'});};
 const runtime={...env,DB:db},runner=createJobRunner({env:runtime,store,autoStart:false,logSink:()=>{},fetcher:async()=>{closed=true;return Response.json({success:true,creditsBilled:4});},managedBrowser:makeManagedBrowser(runtime),lookup:async(_input,_get,runtime)=>{await runtime.managedBrowser({url:'https://county-taxes.net/fl-miamidade/property-tax/EXAMPLE',county:'miami-dade-fl',includePdf:false});return {scrapTaxOrderRequest:{matchStatus:'MATCHED',PropertyInformation:{ParcelNumber:'123'}},ExtractionMetadata:{match:{status:'MATCHED'},errors:[]}};}});
 try{const j=runner.create({scrap_order_id:'override-receipt',county:'miami-dade-fl',address:'100 TEST ST',ownerName:'TEST OWNER',transactionType:'REFI'},'override-receipt').job;await runner.tick();await runner.idle();const session=store.sessions(j.id)[0];assert.equal(session.status,'outcome_unknown');assert.equal(JSON.parse(Buffer.from(store.cached(j.id,'provider_receipt:'+session.id).bytes)).credits_billed,null);await runner.cleanupOrphans();assert.equal(closed,true);assert.equal(store.sessions(j.id)[0].status,'reconciled');assert.equal(JSON.parse(Buffer.from(store.cached(j.id,'provider_receipt:'+session.id).bytes)).credits_billed,4);assert.equal(await db.prepare('SELECT * FROM scrape_budgets').first(),null);assert.equal(await db.prepare('SELECT * FROM browser_runs').first(),null);
 }finally{await runner.stop();globalThis.fetch=old;db.close();}
});
