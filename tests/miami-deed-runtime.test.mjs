import test from 'node:test';import assert from 'node:assert/strict';
import {createSQLiteDB} from '../server/sqlite.mjs';import {createApp} from '../server/app.mjs';import {makeManagedBrowser} from '../lib/live/managed-browser.mjs';import {phaseBudgetId} from '../lib/live/browser-budget.mjs';import {miamiDeedUrl} from '../lib/client/miami-deed-probe.mjs';
const path='https://local.test/api/v2/diagnostics/miami-tax-deed';
async function fixture(){const db=createSQLiteDB(':memory:');await db.prepare('INSERT INTO scrape_budgets VALUES(?,?,?,?)').bind(phaseBudgetId,5000,1800,0).run();return db;}
test('deed discovery requires auth and rejects caller URLs before paid dispatch',async()=>{
 const db=await fixture(),old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No dispatch expected');};
 try{const env={DB:db,INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'offline',INVISIA_POC_API_KEY:'offline-key'},app=createApp({env,logSink:()=>{}});
 assert.equal((await app(new Request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}))).status,401);
 assert.equal((await app(new Request(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer offline-key'},body:JSON.stringify({url:'https://example.com'})}))).status,400);
 await assert.rejects(makeManagedBrowser(env)({url:miamiDeedUrl,county:'polk-fl',includePdf:false,profile:'miami-deed-discovery'}),e=>e.code==='source_url_rejected');assert.equal(calls,0);
 }finally{globalThis.fetch=old;db.close();}
});
test('blocked source capture remains unverified and reconciles the existing shared ledger',async()=>{
 const db=await fixture(),old=globalThis.fetch;let deleted=false;
 globalThis.fetch=async(url,options)=>{
  if(String(url).endsWith('/team/credit-usage'))return Response.json({data:{remainingCredits:100}});
  if(options.method==='DELETE'){deleted=true;return Response.json({success:true,creditsBilled:2});}
  if(String(url).endsWith('/execute')){const code=JSON.parse(options.body).code;assert.ok(code.includes(miamiDeedUrl));return Response.json({success:true,exitCode:0,stdout:'INVISIA_RESULT='+JSON.stringify({html:'<html><body>403 Forbidden</body></html>',url:miamiDeedUrl,http_status:403,pdf:null})});}
  return Response.json({success:true,id:'offline-session'});
 };
 try{const app=createApp({env:{DB:db,INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'offline',INVISIA_POC_API_KEY:'offline-key'},logSink:()=>{}});
 const response=await app(new Request(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer offline-key'},body:'{}'}));const result=await response.json();
 assert.equal(result.source.status,'BLOCKED');assert.equal(result.source.record_verified,false);assert.equal(result.source.coverage,'UNAVAILABLE');assert.equal(result.source.parcel_identity,null);assert.equal(result.source.html,undefined);assert.equal(deleted,true);
 const budget=await db.prepare('SELECT * FROM scrape_budgets').first();assert.equal(budget.spent_milli_usd,1840);assert.equal(budget.reserved_milli_usd,0);
 }finally{globalThis.fetch=old;db.close();}
});

test('authenticated diagnostic requests share the application staging capture limit',async()=>{
 const db=await fixture(),old=globalThis.fetch;let sessions=0;
 globalThis.fetch=async(url,options={})=>{
  if(String(url).endsWith('/team/credit-usage'))return Response.json({data:{remainingCredits:100}});
  if(options.method==='DELETE')return Response.json({success:true,creditsBilled:2});
  if(String(url).endsWith('/execute'))return Response.json({success:true,exitCode:0,stdout:'INVISIA_RESULT='+JSON.stringify({html:'Access denied',url:miamiDeedUrl,http_status:403,pdf:null})});
  sessions++;return Response.json({success:true,id:'offline-session'});
 };
 try{const app=createApp({env:{DB:db,TAXES_DEPLOYMENT_ENV:'staging',INVISIA_BROWSER_LEDGER_BYPASS:'1',INVISIA_BROWSER_STAGING_MAX_CAPTURES:'1',INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'offline',INVISIA_POC_API_KEY:'offline-key'},logSink:()=>{}});
 const request=()=>new Request(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer offline-key'},body:'{}'});
 assert.equal((await app(request())).status,200);const denied=await app(request());assert.equal((await denied.json()).error.code,'staging_capture_limit');assert.equal(sessions,1);
 }finally{globalThis.fetch=old;db.close();}
});
