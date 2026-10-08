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
