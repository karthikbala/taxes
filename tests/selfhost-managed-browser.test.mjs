import test from 'node:test';
import assert from 'node:assert/strict';
import {createSQLiteDB} from '../server/sqlite.mjs';
import {makeManagedBrowser} from '../lib/live/managed-browser.mjs';
import {phaseBudgetId} from '../lib/live/browser-budget.mjs';
const source='https://county-taxes.net/fl-miamidade/property-tax/EXAMPLE';
async function budget(){const db=createSQLiteDB(':memory:');await db.prepare('INSERT INTO scrape_budgets VALUES(?,?,?,?)').bind(phaseBudgetId,5000,400,0).run();return db;}
test('cancel before paid dispatch does not call provider or lose reserved funds',async()=>{
 const db=await budget(),old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected provider call');};
 try{const ctl=new AbortController();ctl.abort();const browser=makeManagedBrowser({DB:db,INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'test-only'});await assert.rejects(browser({url:source,county:'miami-dade-fl',includePdf:true,signal:ctl.signal}),e=>e.code==='lookup_cancelled');const row=await db.prepare('SELECT * FROM scrape_budgets').first();assert.equal(calls,0);assert.equal(row.spent_milli_usd,400);assert.equal(row.reserved_milli_usd,0);}finally{globalThis.fetch=old;db.close();}
});
test('disconnect cancels source execution but permits independent cleanup and billed reconciliation',async()=>{
 const db=await budget(),old=globalThis.fetch,ctl=new AbortController();let announce;const started=new Promise(r=>announce=r);let cleanup=false;
 globalThis.fetch=async(url,init)=>{if(init.method==='DELETE'){cleanup=true;assert.equal(init.signal.aborted,false);return Response.json({success:true,creditsBilled:4});}if(String(url).endsWith('/execute')){announce();return new Promise((_,reject)=>{const abort=()=>reject(new DOMException('Stopped','AbortError'));if(init.signal.aborted)abort();else init.signal.addEventListener('abort',abort,{once:true});});}return Response.json({success:true,id:'offline-session'});};
 try{const browser=makeManagedBrowser({DB:db,INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'test-only'});const run=browser({url:source,county:'miami-dade-fl',includePdf:true,signal:ctl.signal});await started;ctl.abort();await assert.rejects(run,e=>e.code==='managed_source_incomplete');const row=await db.prepare('SELECT * FROM scrape_budgets').first();assert.equal(cleanup,true);assert.equal(row.reserved_milli_usd,0);assert.equal(row.spent_milli_usd,480);}finally{globalThis.fetch=old;db.close();}
});

test('rate-limited cleanup honors a bounded retry after the lookup deadline and reconciles actual billing',async()=>{
 const db=await budget(),old=globalThis.fetch;let creates=0,executes=0,closes=0;
 globalThis.fetch=async(url,init)=>{
  if(init.method==='DELETE'){closes++;return closes===1?new Response('',{status:429,headers:{'Retry-After':'0'}}):Response.json({success:true,creditsBilled:2});}
  if(String(url).endsWith('/execute')){executes++;return Response.json({success:true,exitCode:0,stdout:'INVISIA_RESULT='+JSON.stringify({html:'<html>county bill</html>',url:source,pdf:null})});}
  creates++;return Response.json({success:true,id:'offline-cleanup-session'});
 };
 try{const browser=makeManagedBrowser({DB:db,INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'test-only'});await browser({url:source,county:'miami-dade-fl',includePdf:false,deadline:Date.now()+200});
  assert.equal(creates,1);assert.equal(executes,1);assert.equal(closes,2);const row=await db.prepare('SELECT * FROM scrape_budgets').first();assert.equal(row.spent_milli_usd,440);assert.equal(row.reserved_milli_usd,0);
 }finally{globalThis.fetch=old;db.close();}
});

test('cleanup does not retry an excessive provider delay or claim an unconfirmed session was free',async()=>{
 const db=await budget(),old=globalThis.fetch;let closes=0;
 globalThis.fetch=async(url,init)=>{
  if(init.method==='DELETE'){closes++;return new Response('',{status:429,headers:{'Retry-After':'120'}});}
  if(String(url).endsWith('/execute'))return Response.json({success:true,exitCode:0,stdout:'INVISIA_RESULT='+JSON.stringify({html:'<html>county bill</html>',url:source,pdf:null})});
  return Response.json({success:true,id:'offline-cleanup-session'});
 };
 try{await makeManagedBrowser({DB:db,INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'test-only'})({url:source,county:'miami-dade-fl',includePdf:false});assert.equal(closes,1);const row=await db.prepare('SELECT * FROM scrape_budgets').first();assert.equal(row.spent_milli_usd,480);assert.equal(row.reserved_milli_usd,0);assert.equal((await db.prepare('SELECT status FROM browser_runs').first()).status,'cleanup_unconfirmed');
 }finally{globalThis.fetch=old;db.close();}
});
