import test from 'node:test';
import assert from 'node:assert/strict';
import {stagingLedgerBypass} from '../lib/live/browser-policy.mjs';
import {managedPreflight} from '../lib/client/access.mjs';
import {makeManagedBrowser} from '../lib/live/managed-browser.mjs';
import {createSQLiteDB} from '../server/sqlite.mjs';

test('staging override permits one capture without creating or replacing a ledger; production remains guarded',async()=>{
 const db=createSQLiteDB(':memory:'),old=globalThis.fetch;
 const env={DB:db,TAXES_DEPLOYMENT_ENV:'staging',INVISIA_BROWSER_LEDGER_BYPASS:'1',INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'test-only'};
 let creates=0,closed=0;
 globalThis.fetch=async(url,init)=>{
  if(String(url).endsWith('/credit-usage'))return Response.json({success:true,data:{remainingCredits:10}});
  if(init.method==='DELETE'){closed++;return Response.json({success:true,creditsBilled:2});}
  if(String(url).endsWith('/execute'))return Response.json({success:true,exitCode:0,stdout:'INVISIA_RESULT='+JSON.stringify({html:'<h1>Account # offline</h1>',url:'https://county-taxes.net/iframe-taxsys/offline',pdf:null})});
  creates++;return Response.json({success:true,id:'offline-session'});
 };
 try{
  assert.equal(stagingLedgerBypass({...env,TAXES_DEPLOYMENT_ENV:'production'}),false);
  assert.equal(stagingLedgerBypass({...env,INVISIA_BROWSER_LEDGER_BYPASS:'0'}),false);
  assert.equal((await managedPreflight({...env,TAXES_DEPLOYMENT_ENV:'production'})).ready,false);
  assert.equal((await managedPreflight(env)).reason,'operator_authorized_staging_bypass');
  const browser=makeManagedBrowser(env),args={url:'https://county-taxes.net/fl-miamidade/property-tax/EXAMPLE',county:'miami-dade-fl',includePdf:false};
  await browser(args);
  await assert.rejects(browser(args),e=>e.code==='staging_capture_limit');
  assert.equal(creates,1);assert.equal(closed,1);
  assert.equal(await db.prepare('SELECT * FROM scrape_budgets').first(),null);
  assert.equal(await db.prepare('SELECT * FROM browser_runs').first(),null);
 }finally{globalThis.fetch=old;db.close();}
});

test('original PDF transfers below output and request limits, with cleanup after one rate-limit retry',async()=>{
 const db=createSQLiteDB(':memory:'),old=globalThis.fetch;
 const bytes=Buffer.alloc(1521372,37);bytes.write('%PDF-1.6');const sha256=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');const sourceUrl='https://county-taxes.net/iframe-taxsys/offline';let executions=0,closed=0,retried=false;
 globalThis.fetch=async(url,init)=>{
  if(init.method==='DELETE'){closed++;return Response.json({success:true,creditsBilled:3});}
  if(String(url).endsWith('/execute')){
   executions++;const {code}=JSON.parse(init.body);
   if(code.includes('INVISIA_PDF=')){
    if(!retried){retried=true;return new Response('',{status:429,headers:{'Retry-After':'0'}});}
    const match=code.match(/offset:(\d+),count:(\d+)/);assert(match);const offset=Number(match[1]),count=Number(match[2]);const stdout='INVISIA_PDF='+bytes.subarray(offset,offset+count).toString('base64');assert(stdout.length+1<256*1024);return Response.json({success:true,exitCode:0,stdout});
   }
   return Response.json({success:true,exitCode:0,stdout:'INVISIA_RESULT='+JSON.stringify({html:'source',url:sourceUrl,pdf:{url:sourceUrl+'/print',size:bytes.length,sha256}})});
  }
  return Response.json({success:true,id:'offline-pdf-session'});
 };
 try{
  const browser=makeManagedBrowser({DB:db,TAXES_DEPLOYMENT_ENV:'staging',INVISIA_BROWSER_LEDGER_BYPASS:'1',INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'test-only'});
  const result=await browser({url:'https://county-taxes.net/fl-miamidade/property-tax/EXAMPLE',county:'miami-dade-fl',includePdf:true,deadline:Date.now()+20000});
  assert.equal(executions,10);assert.equal(closed,1);assert.deepEqual(Buffer.from(result.pdf.base64,'base64'),bytes);
 }finally{globalThis.fetch=old;db.close();}
});

test('collector capture waits for account history rather than the separate amount-due footer',async()=>{
 const {captureCode}=await import('../lib/live/managed-browser.mjs');let historyReady=false,output;
 const sourceUrl='https://county-taxes.net/iframe-taxsys/offline';
 const frame={url:()=>sourceUrl,locator:selector=>{if(selector==='table.bills tfoot')throw Error('Two matching footers');const locator={first:()=>locator,count:async()=>0,waitFor:async()=>{if(selector.includes('#bill-history'))historyReady=true;}};return locator;},content:async()=>{assert.equal(historyReady,true);return '<h1>Verified account</h1><div id="bill-history">Full published history</div>';}};
 const page={goto:async()=>{},frames:()=>[frame],url:()=>sourceUrl};const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('page','console',captureCode('https://county-taxes.net/fl-miamidade/property-tax/EXAMPLE',false))(page,{log:value=>{output=value;}});
 assert(JSON.parse(output.slice('INVISIA_RESULT='.length)).html.includes('Full published history'));
});

test('a transient session-start rate limit is retried once before capture and cleanup',async()=>{
 const db=createSQLiteDB(':memory:'),old=globalThis.fetch;let creates=0,executions=0,closed=0;
 globalThis.fetch=async(url,init)=>{
  if(init.method==='DELETE'){closed++;return Response.json({success:true,creditsBilled:2});}
  if(String(url).endsWith('/execute')){executions++;return Response.json({success:true,exitCode:0,stdout:'INVISIA_RESULT='+JSON.stringify({html:'verified source',url:'https://county-taxes.net/iframe-taxsys/offline',pdf:null})});}
  creates++;return creates===1?new Response('',{status:429,headers:{'Retry-After':'0'}}):Response.json({success:true,id:'offline-start-retry'});
 };
 try{
  const browser=makeManagedBrowser({DB:db,TAXES_DEPLOYMENT_ENV:'staging',INVISIA_BROWSER_LEDGER_BYPASS:'1',INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'test-only'});
  const result=await browser({url:'https://county-taxes.net/fl-miamidade/property-tax/EXAMPLE',county:'miami-dade-fl',includePdf:false,deadline:Date.now()+20000});
  assert.equal(result.html,'verified source');assert.equal(creates,2);assert.equal(executions,1);assert.equal(closed,1);
 }finally{globalThis.fetch=old;db.close();}
});
