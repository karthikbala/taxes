import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {captureOsceolaAppraiser,resolveCapturedOsceola,osceolaSearchUrl,osceolaQueryUrl,osceolaQueryCode} from '../lib/client/osceola-recovery.mjs';
import {clientLookup} from '../lib/client/engine.mjs';
import {makeManagedBrowser} from '../lib/live/managed-browser.mjs';
import {createSQLiteDB} from '../server/sqlite.mjs';
const input={address:'3250 VINELAND RD',ownerName:'WAL-MART STORES EAST LP'};
const names={ParcelMarket:'osceola-market-2026-10-08.json',PropertyValues:'osceola-certified-values-2026-10-08.json',sales:'osceola-sales-2026-10-08.json',Lnd_c:'osceola-lnd_c-2026-10-08.json',Bld:'osceola-bld-2026-10-08.json',xfob:'osceola-xfob-2026-10-08.json'};
const read=name=>readFileSync(new URL('./fixtures/client/'+name,import.meta.url),'utf8');
const tables=Object.fromEntries(Object.entries(names).map(([key,name])=>[key,read(name)]));
function executeFixture({mutate=r=>r,truncate=false}={}){
 const calls=[];
 return {calls,execute:async({code})=>{
  let result;
  const page={goto:async url=>{assert.equal(url,osceolaSearchUrl);},url:()=>osceolaSearchUrl,waitForFunction:async()=>{},evaluate:async(_fn,url)=>{calls.push(url);return mutate({url,http_status:200,body:tables[new URL(url).pathname.split('/').at(-1)],fetched_at:'2026-10-08T00:00:00Z'});}};
  await runInNewContext('(async()=>{'+code+'})()',{page,console:{log:line=>result=line}});
  return {success:true,exitCode:0,stdout:result,truncated:truncate};
 }};
}
test('one appraiser session captures all six fresh native datasets and the collector join queries and reuses authoritative resolver checks',async()=>{
 const f=executeFixture(),capture=await captureOsceolaAppraiser(input,f.execute);
 assert.equal(f.calls.length,8);assert.equal(capture.osceola_responses.length,8);
 assert.ok(!f.calls[0].includes('022528285000010010'));
 const match=await resolveCapturedOsceola(input,capture);assert.equal(match.status,'MATCHED');assert.equal(match.parcel_id,'022528285000010010');assert.equal(match.raw.extras.value.length,17);
 const wrong=structuredClone(capture);wrong.osceola_responses[1].body=wrong.osceola_responses[1].body.replaceAll('022528285000010010','022528285000010020');
 await assert.rejects(resolveCapturedOsceola(input,wrong),e=>e.code==='identity_mismatch');
});
test('recovery stops at incomplete search and never selects a first parcel',async()=>{
 const f=executeFixture({mutate:r=>({...r,body:JSON.stringify({...JSON.parse(r.body),'@odata.count':2})})});
 const capture=await captureOsceolaAppraiser(input,f.execute);assert.equal(f.calls.length,1);assert.equal((await resolveCapturedOsceola(input,capture)).status,'SEARCH_INCOMPLETE');
 const ambiguous=executeFixture({mutate:r=>{if(!r.url.includes('/ParcelMarket?'))return r;const d=JSON.parse(r.body);d.value.push({...d.value[0],strap:'022528285000010020',dsp_strap:'02-25-28-2850-0001-0020'});d['@odata.count']=2;return {...r,body:JSON.stringify(d)};}});
 assert.equal((await resolveCapturedOsceola(input,await captureOsceolaAppraiser(input,ambiguous.execute))).status,'AMBIGUOUS');assert.equal(ambiguous.calls.length,1);
});
test('blocked, redirected, oversized, truncated and canceled browser captures fail closed',async()=>{
 for(const mutate of [r=>({...r,http_status:403}),r=>({...r,url:'https://example.com/data'}),r=>({...r,body:'x'.repeat(160001)})])await assert.rejects(captureOsceolaAppraiser(input,executeFixture({mutate}).execute));
 await assert.rejects(captureOsceolaAppraiser(input,executeFixture({truncate:true}).execute),e=>e.code==='managed_source_incomplete');
 let calls=0;const c=new AbortController();c.abort();await assert.rejects(captureOsceolaAppraiser(input,async()=>{calls++;},{signal:c.signal}),e=>e.code==='lookup_cancelled');assert.equal(calls,0);
 for(const url of ['http://search.property-appraiser.org/api/v1/ParcelMarket','https://example.com/api/v1/ParcelMarket','https://search.property-appraiser.org/api/v1/Unknown','https://search.property-appraiser.org/api/v1/ParcelMarket?callback=x'])assert.throws(()=>osceolaQueryUrl(url),e=>e.code==='source_url_rejected');
});
test('captured native continuations are consumed with the original filter and missing pages remain incomplete',async()=>{
 const f=executeFixture();let page=0;
 const execute=async args=>{
  const result=await f.execute(args);if(!args.code.includes('/ParcelMarket?'))return result;
  const r=JSON.parse(result.stdout.slice('INVISIA_OSCEOLA='.length)),data=JSON.parse(r.body),next=new URL(r.url);next.searchParams.set('$skip','1');
  r.body=JSON.stringify(page++===0?{...data,value:[], '@odata.nextLink':next.href}:{value:data.value});return {...result,stdout:'INVISIA_OSCEOLA='+JSON.stringify(r)};
 };
 const capture=await captureOsceolaAppraiser(input,execute);assert.equal(f.calls.length,9);assert.equal((await resolveCapturedOsceola(input,capture)).status,'MATCHED');
 const missing=structuredClone(capture);missing.osceola_responses.splice(1,1);await assert.rejects(resolveCapturedOsceola(input,missing),e=>e.code==='managed_source_incomplete');
});
test('query code streams with a body ceiling and uses browser credentials only on the native source',async()=>{
 const url='https://search.property-appraiser.org/api/v1/ParcelMarket?$count=true';let output;
 const response=new Response(tables.ParcelMarket);Object.defineProperty(response,'url',{value:url});
 const page={evaluate:async(fn,arg)=>fn(arg)};
 await runInNewContext('(async()=>{'+osceolaQueryCode(url)+'})()',{page,fetch:async(u,init)=>{assert.equal(u,url);assert.equal(init.credentials,'include');return response;},AbortSignal,TextDecoder,Date,console:{log:v=>output=v}});
 assert.equal(JSON.parse(output.slice('INVISIA_OSCEOLA='.length)).body,tables.ParcelMarket);
});
test('client retries only challenged Osceola appraiser reads and retains direct failure provenance',async()=>{
 const capture=await captureOsceolaAppraiser(input,executeFixture().execute);let recoveries=0;
 const result=await clientLookup({scrap_order_id:'OFFLINE-RECOVERY',county:'Osceola',transactionType:'REFI',...input},async()=>new Response('challenge',{status:403}),{log:()=>{},managedBrowser:async args=>{if(args.profile!=='osceola-appraiser')throw Error('No collector fixture');recoveries++;assert.equal(args.url,osceolaSearchUrl);return capture;}});
 assert.equal(recoveries,1);assert.equal(result.scrapTaxOrderRequest.matchStatus,'MATCHED');assert.equal(result.scrapTaxOrderRequest.AssessmentInformation.Year,'2026');
 assert(result.ExtractionMetadata.sources.some(s=>s.id==='osceola_address_search_direct'&&s.http_status===403));
 const source=result.ExtractionMetadata.sources.find(s=>s.id==='osceola_address_search');assert.equal(source.method,'BROWSER');assert.equal(source.status,'verified');assert.match(source.sha256,/^[a-f0-9]{64}$/);
 let called=false;await clientLookup({scrap_order_id:'OFFLINE-RECOVERY',county:'Osceola',transactionType:'REFI',...input},async()=>new Response('gone',{status:404}),{log:()=>{},managedBrowser:async()=>{called=true;}});assert.equal(called,false);
});
test('managed appraiser session uses the existing shared ledger and closes after all source queries',async()=>{
 const db=createSQLiteDB(':memory:'),old=globalThis.fetch,f=executeFixture();let creates=0,closes=0;
 await db.prepare('INSERT INTO scrape_budgets VALUES(?,?,?,?)').bind('florida-phase1-2026-10-07',5000,1800,0).run();
 globalThis.fetch=async(url,options)=>{if(options.method==='DELETE'){closes++;return Response.json({success:true,creditsBilled:2});}if(String(url).endsWith('/execute'))return Response.json(await f.execute(JSON.parse(options.body)));creates++;return Response.json({success:true,id:'offline-osceola'});};
 try{
  const browser=makeManagedBrowser({DB:db,INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'offline'});
  const capture=await browser({url:osceolaSearchUrl,county:'osceola-fl',profile:'osceola-appraiser',includePdf:false,input});assert.equal((await resolveCapturedOsceola(input,capture)).status,'MATCHED');assert.equal(creates,1);assert.equal(closes,1);
  const budget=await db.prepare('SELECT * FROM scrape_budgets').first();assert.equal(budget.spent_milli_usd,1840);assert.equal(budget.reserved_milli_usd,0);
  await assert.rejects(browser({url:osceolaSearchUrl,county:'miami-dade-fl',profile:'osceola-appraiser',includePdf:false,input}),e=>e.code==='source_url_rejected');
 }finally{globalThis.fetch=old;db.close();}
});
test('recovered appraiser data joins the independent collector account, original PDF and HTML amounts',async()=>{
 const appraiser=await captureOsceolaAppraiser(input,executeFixture().execute);
 const token='b3NjZW9sYTpyZWFsX2VzdGF0ZTpwYXJlbnRzOmVkYmI0ZTZhLWU1MDktMTFlYi05MzgxLTAwNTA1NjgxODQyMA==',root='https://county-taxes.net/iframe-taxsys/osceola.county-taxes.com/govhub/property-tax/'+token,bill=root+'/bills/e766d457-a479-11f0-b243-0050568184a7';
 let captures=0;
 const fetcher=async target=>{
  const u=new URL(target);
  if(u.hostname==='config.grantstreet.com')return Response.json(JSON.parse(read('miami-collector-config-sanitized.json').replaceAll('miamidade','osceola')));
  if(u.hostname.includes('algolia')){const data=JSON.parse(read('miami-collector-search-source.json')),hit=data.results[0].hits[0];hit.external_id='R022528-285000010010';hit.objectID='/Taxsys-GovHub/v0/items/'+atob(token);hit.custom_parameters={alternate_keys:[]};hit.child_groups=[];data.results[0].hits=[hit];data.results[0].nbHits=1;return Response.json(data);}
  return new Response('challenge',{status:403});
 };
 const result=await clientLookup({scrap_order_id:'OFFLINE-RECOVERY-FULL',county:'Osceola',transactionType:'REFI',...input},fetcher,{log:()=>{},managedBrowser:async args=>{
  captures++;if(args.profile==='osceola-appraiser')return appraiser;
  if(args.profile==='osceola-liability-reports')return JSON.parse(read('osceola-liability-empty-2026-10-12.json'));
  return {url:root,html:readFileSync(new URL('./fixtures/phase-two/osceola-rendered.html',import.meta.url),'utf8'),bill_url:bill,bill_html:read('besil-osceola-bill-excerpt.html'),pdf:{url:bill+'/print',base64:readFileSync(new URL('./fixtures/phase-two/osceola-original.pdf',import.meta.url)).toString('base64')}};
 }});
 const r=result.scrapTaxOrderRequest;assert.equal(captures,3);assert.equal(r.matchStatus,'MATCHED');assert.equal(result.ExtractionMetadata.validation.parcel_join,'matched');assert.deepEqual(result.ExtractionMetadata.errors,[]);
 assert.equal(r.DelinquencyInformation.certificateSearch.status,'INSPECTED_EMPTY');assert.equal(r.DelinquencyInformation.taxDeedSearch.status,'INSPECTED_EMPTY');assert.equal(r.DelinquencyInformation.coverageDetails.independentTaxDeedSearch,'UNAVAILABLE');assert(result.ExtractionMetadata.provenance['DelinquencyInformation.certificateSearch'].pages[0].query_sha256);
 assert.equal(r.TaxInformation.accountNumber,'R022528-285000010010');assert.equal(r.BillDetails.taxYear,'2025');assert.equal(r.TaxAmounts.totalDiscountable,'$285,389.65');assert.equal(r.TaxAmounts.totalTax,'$285,389.65');assert.equal(r.AdValoremMillage.length,11);assert.equal(r.NonAdValorem.length,1);assert.equal(r.SalesInformation.length,3);
});
