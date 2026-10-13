import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {suwanneeCandidates,suwanneeLookup} from '../lib/live/suwannee-reference.mjs';
import {floridaLookup} from '../lib/live/florida.mjs';
const file=n=>readFile(new URL('./fixtures/phase-two/'+n,import.meta.url));
const html=async n=>(await file(n)).toString();
const id='12-02S-13E-04955-002000',owner='WAL-MART STORES EAST LP',property={parcel_id:id,owner,address:'6868 HWY 129, LIVE OAK'};
test('Suwannee search completeness precedes candidate filtering; candidates are not identity proof',async()=>{
 const h=await html('suwannee-address-candidates.html');
 assert.equal(suwanneeCandidates(h,owner)[0].account,'04955002000');assert.equal(suwanneeCandidates(h,owner).length,1);
 assert.throws(()=>suwanneeCandidates(h.replace('of 3 records','of 4 records'),owner),e=>e.code==='search_incomplete');
 assert.throws(()=>suwanneeCandidates(h.replace('Showing records 1-3','Showing records 2-3'),owner),e=>e.code==='search_incomplete');
 assert.throws(()=>suwanneeCandidates(h,'OTHER OWNER'),e=>e.code==='collector_not_found');
 assert.throws(()=>suwanneeCandidates(h.replace('href="PropertyDetail?p=04955002000','href="https://example.com/PropertyDetail?p=04955002000'),owner),e=>e.code==='collector_identity_mismatch');
});
const transport=async(url,source,headers,options)=>source==='collector_session'?'<input type="hidden" name="__VIEWSTATE" value="TEST_ONLY">':source==='collector_search'?html('suwannee-address-candidates.html'):source.endsWith('_pdf')?new Uint8Array(await file('suwannee-reference-original.pdf')):html('suwannee-reference-detail.html');
test('Suwannee original PDF independently prints full parcel AND short account',async()=>{
 const r=await suwanneeLookup({expectedId:id,property,get:transport,verify:()=>{},includePdf:true});
 assert.equal(r.identity.parcel_id,'04955002000');assert.equal(r.identity.appraiser_parcel_id,'1202S13E-04955002000');
 assert.match(r.identity.match_method,/Original collector PDF/);assert.equal(r.identity.parcel_reference.page,1);
 assert.equal(r.taxes.history[0].paid_amount,'96907.94');assert.equal(r.original_document.source_method,'POST');
 const wrong='12-02S-13E-04955-002001';
 await assert.rejects(()=>suwanneeLookup({expectedId:wrong,property:{...property,parcel_id:wrong},get:transport,verify:()=>{}}),e=>e.code==='collector_not_found');
 await assert.rejects(()=>suwanneeLookup({expectedId:id,property,get:async(...args)=>{const value=await transport(...args);return args[1]==='collector_candidate_0'?value.replaceAll('Property Tax Account: <font color="darkblue">04955002000','Property Tax Account: <font color="darkblue">04955002001'):value;},verify:()=>{}}),e=>e.code==='collector_identity_mismatch');
});
test('Suwannee parcel API joins full native parcel to PDF-backed collector account',async()=>{
 const r=await floridaLookup({county:'suwannee-fl',parcel_id:id,source_mode:'county',include_pdf:true},async(url,options)=>{
  if(url.startsWith('https://www.suwanneepa.com/gis/'))return new Response(await html('suwannee-retail-detail.html'));
  if(url.endsWith('/AccountSearch?s=pt'))return new Response(options.method==='POST'?await html('suwannee-address-candidates.html'):'<input type="hidden" name="__VIEWSTATE" value="TEST_ONLY">');
  if(url.includes('/PropertyDetail?'))return new Response(options.method==='POST'?await file('suwannee-reference-original.pdf'):await html('suwannee-reference-detail.html'));
  throw Error('Unexpected source: '+url);
 });
 assert.equal(r.status,'succeeded');assert.deepEqual(r.errors,[]);assert.equal(r.document_status,'parsed');
 assert.equal(r.join.collector_account_id,'04955002000');assert.equal(r.join.collector_value,'1202S13E-04955002000');
 assert.equal(r.documents[0].fields.amount_paid,'96907.94');assert.equal(r.documents[0].source_method,'POST');
 assert.equal(r.documents[0].reconciliation.payment_date,'matched');assert.ok(r.sources.some(s=>s.id==='collector_candidate_0_parcel_reference_pdf'&&s.status==='verified'));
});
