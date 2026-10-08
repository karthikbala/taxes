import test from 'node:test';
import assert from 'node:assert/strict';
import {createLookupLogger,lookupLogSummary} from '../lib/client/logging.mjs';
import {clientLookup,createClientTransport} from '../lib/client/engine.mjs';
test('logs correlate diagnostics without retaining credentials, addresses or source values',()=>{
 const rows=[],log=createLookupLogger('request-123',row=>rows.push(row));
 log('source_attempt',{source_id:'miami_address_search',attempt:2,http_status:503,url:'https://county/?owner=PRIVATE',address:'PRIVATE',authorization:'SECRET',body:'SECRET',status:'retry',validation:{tax_total:'matched'}});
 assert.equal(rows[0].request_id,'request-123');assert.equal(rows[0].attempt,2);assert.equal(rows[0].http_status,503);
 assert.equal(JSON.stringify(rows).includes('SECRET'),false);assert.equal(JSON.stringify(rows).includes('PRIVATE'),false);assert.deepEqual(rows[0].validation,{tax_total:'matched'});
 assert.doesNotThrow(()=>createLookupLogger('id',()=>{throw Error('sink offline');})('completed'));
});
test('summary reports coverage and counts without logging property data',()=>{
 const out=lookupLogSummary({scrapTaxOrderRequest:{matchStatus:'MATCHED',PropertyInformation:{Owners:['PRIVATE']},AdValoremMillage:[{},{}]},ExtractionMetadata:{county_id:'miami-dade-fl',status:'partial',sources:[{}],errors:[],section_status:{AccountHistory:{status:'PARTIAL'}},validation:{total:'matched'},duration_ms:31}});
 assert.equal(out.tax_line_count,2);assert.equal(out.status,'partial');assert.equal(out.source_count,1);assert.equal(JSON.stringify(out).includes('PRIVATE'),false);
});
test('source retry logging records the failed and recovered attempt with one request ID',async()=>{
 const rows=[],log=createLookupLogger('correlation-001',row=>rows.push(row));let calls=0;
 const t=createClientTransport(async()=>++calls===1?new Response('temporary',{status:503}):Response.json({found:true}),{log});
 assert.equal(await t.get('https://apps.miamidadepa.gov/PApublicServiceProxy/PaServicesProxy.ashx?Operation=GetAddress','miami_address_search'),'{"found":true}');
 const attempts=rows.filter(x=>x.event==='source_attempt');assert.deepEqual(attempts.map(x=>[x.attempt,x.http_status,x.status]),[[1,503,'retry'],[2,200,'received']]);
 assert.ok(rows.every(x=>x.request_id==='correlation-001'));assert.equal(rows.at(-1).source_id,'miami_address_search');
});
test('partial unavailable lookup preserves request ID and logs a terminal summary without source calls',async()=>{
 const rows=[],log=createLookupLogger('debug-002',row=>rows.push(row));
 const out=await clientLookup({scrap_order_id:'PRIVATE_ORDER',address:'PRIVATE_ADDRESS',ownerName:'PRIVATE_OWNER',county:'Polk',transactionType:'REFI'},async()=>{throw Error('unexpected source call');},{requestId:'debug-002',log});
 assert.equal(out.ExtractionMetadata.request_id,'debug-002');assert.equal(rows[0].event,'client_lookup_started');assert.equal(rows.at(-1).event,'client_lookup_completed');assert.ok(rows.at(-1).error_count>0);assert.equal(JSON.stringify(rows).includes('PRIVATE_'),false);
});
