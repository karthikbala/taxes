import test from 'node:test';
import assert from 'node:assert/strict';
import{readFile}from'node:fs/promises';
import{floridaLookup,validateFlorida}from'../lib/live/florida.mjs';
import{pocWorkflows,pocRequest}from'../public/poc-workflows.mjs';
import{capabilities}from'../lib/live/router.mjs';
import{clientCapabilities}from'../lib/client/profiles.mjs';
const fixture=n=>readFile(new URL('./fixtures/collector-only/'+n,import.meta.url),'utf8');
test('Baker collector-only retrieves exact native taxes and original HTML with no assessor/annual-roll request',async()=>{
 const calls=[],result=await floridaLookup({county:'baker-fl',parcel_id:'322S22004900760075',source_mode:'collector',include_pdf:true},async(url,opts)=>{
  calls.push(url);assert.equal(new URL(url).origin,'https://www.bakertaxcollector.com');
  if(url.includes('/SearchSelect'))return new Response('<select name="Years"><option value="2025">2025</option></select>');
  if(url.endsWith('/Search')){assert.equal(new URLSearchParams(opts.body).get('propertynumber'),'322S22004900760075');return new Response(await fixture('baker-search.json'));}
  if(url.endsWith('/TaxBill'))return new Response(await fixture('baker-bill.html'));throw Error('Unexpected request');
 });
 assert.equal(result.status,'succeeded');assert.equal(result.mode,'live_retrieval_collector');assert.equal(result.errors.length,0);assert.equal(result.assessment,null);assert.equal(result.coverage.county_assessment,'not_requested');assert.equal(result.join,undefined);assert.equal(result.field_provenance.property,'tax_collector');assert.equal(result.property.parcel_id,'322S22004900760075');assert.equal(result.taxes.summary.balance_due,'0.00');assert.equal(result.taxes.history[0].paid_amount,'2021.42');assert.equal(result.taxes.history[0].payment_date,'12/10/2025');assert.equal(result.document_status,'parsed');assert.equal(result.documents[0].format,'HTML');assert.equal(result.documents[0].fields.combined_taxes_and_assessments,'2083.94');assert(result.documents[0].tax_details.AdValoremMillage.length);assert.equal(calls.length,3);assert.equal(result.execution.max_parallel_requests,1);
});
test('collector-only mode cannot silently enable unsupported counties or change annual-roll scope',async()=>{
 assert.throws(()=>validateFlorida({county:'alachua-fl',parcel_id:'1',source_mode:'collector'}),e=>e.code==='collector_adapter_not_enabled');
 const profile=pocWorkflows(capabilities,clientCapabilities).find(c=>c.id==='baker-fl');assert.deepEqual(profile.lookup_modes,['collector']);
 const r=pocRequest(profile,'collector',{parcel:'322S22004900760075',includePdf:true});assert.equal(r.body.source_mode,'collector');assert.equal(r.body.include_pdf,true);
 assert.throws(()=>pocRequest(profile,'state_roll',{parcel:'322S22004900760075',includePdf:true}));
 const roll=validateFlorida({county:'baker-fl',parcel_id:'322S22004900760075',source_mode:'state_roll',include_pdf:true});assert.equal(roll.source_mode,'state_roll');
});
test('collector-only refuses a different parcel instead of returning an unrelated bill',async()=>{
 const r=await floridaLookup({county:'baker-fl',parcel_id:'322S22004900760076',source_mode:'collector',include_pdf:true},async url=>new Response(url.includes('/SearchSelect')?'<select name="Years"><option value="2025">2025</option></select>':await fixture('baker-search.json')));
 assert.equal(r.taxes,null);assert.equal(r.documents.length,0);assert(r.errors.some(e=>e.code==='collector_not_found'));
});
