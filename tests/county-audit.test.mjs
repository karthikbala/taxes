import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkDeliveredRecord,auditTasks,auditRequest} from '../scripts/audit-counties.mjs';
import {floridaCounties} from '../lib/live/florida-counties.mjs';
import {floridaLookup} from '../lib/live/florida.mjs';
const samples=JSON.parse(await readFile(new URL('./fixtures/florida/roll-67.json',import.meta.url),'utf8'));
test('Florida fleet selection covers every county and excludes Pennsylvania',()=>{
 const tasks=auditTasks({state:'FL'});
 assert.equal(new Set(tasks.map(t=>t.profile.id)).size,67);
 assert.equal(tasks.filter(t=>t.mode==='state_roll').length,67);
 assert.ok(tasks.every(t=>t.profile.state==='FL'));
 assert.ok(auditTasks().some(t=>t.profile.state==='PA'));
 assert.throws(()=>auditTasks({state:'XX'}));
 assert.equal(auditTasks({state:'FL',only:['bradford-fl:county']}).length,1);
});
test('missing source identifiers cannot verify a collector join',()=>{
 const r=checkDeliveredRecord({status:'partial',property:{parcel_id:'123'},input:{parcel_id:'123'},join:{}},{sample:{parcel_id:'123'}},'county');
 assert.equal(r.checks.find(c=>c.name==='collector_join').status,'UNCONFIRMED');
});
test('every county annual-roll request is confined to one authoritative roll request, even with PDF requested',async()=>{
 for(const sample of samples){
  const county=floridaCounties.find(c=>c.dor_code===sample.countyCode),calls=[],raw={features:[{attributes:sample.attributes}]};
  const r=await floridaLookup({county:county.id,parcel_id:sample.parcelId,source_mode:'state_roll',include_pdf:true},async url=>{calls.push(url);assert.match(url,/Florida_Statewide_Cadastral/);return Response.json(raw);});
  assert.equal(r.status,'succeeded',county.id);assert.equal(calls.length,1);assert.equal(r.taxes,null);assert.equal(r.documents.length,0);assert.equal(r.coverage.collector,'not_requested');assert.equal(r.errors.length,0);assert.equal(r.document_status,'not_requested_annual_roll');
  const checked=checkDeliveredRecord(r,county,'state_roll',[{url:calls[0],body:JSON.stringify(raw)}]);assert.equal(checked.verdict,'ROLL_VALUES_VERIFIED');
 }
});
test('audit rejects wrong county, misreported assessment values and mismatched collector joins',()=>{
 const a=samples[0].attributes,profile=floridaCounties.find(c=>c.dor_code===a.CO_NO);
 const base={status:'succeeded',input:{parcel_id:a.PARCEL_ID},property:{parcel_id:a.PARCEL_ID},assessment:{year:a.ASMNT_YR,assessed_total:String(a.AV_NSD),just_value:String(a.JV),assessed_school:String(a.AV_SD),assessed_non_school:String(a.AV_NSD),taxable_school:String(a.TV_SD),taxable_non_school:String(a.TV_NSD)},errors:[]};
 const capture=attributes=>[{url:'https://services9.arcgis.com/query',body:JSON.stringify({features:[{attributes}]})}];
 assert.equal(checkDeliveredRecord(base,profile,'state_roll',capture(a)).verdict,'ROLL_VALUES_VERIFIED');
 assert.equal(checkDeliveredRecord({...base,assessment:{...base.assessment,assessed_total:'99999999'}},profile,'state_roll',capture(a)).verdict,'FAILED_CHECK');
 assert.equal(checkDeliveredRecord(base,profile,'state_roll',capture({...a,CO_NO:999})).verdict,'FAILED_CHECK');
 assert.equal(checkDeliveredRecord({...base,join:{assessment_value:'111',collector_value:'222'}},profile,'county').verdict,'FAILED_CHECK');
 assert.equal(checkDeliveredRecord({status:'blocked',errors:[{code:'source_blocked'}]},profile,'county').verdict,'UNAVAILABLE');
});
test('official PARCELNO alias is accepted only when source county and returned PARCEL_ID also agree',()=>{
 const a=samples[0].attributes,profile=floridaCounties.find(c=>c.dor_code===a.CO_NO),input='ALT123';
 const r={status:'succeeded',input:{parcel_id:input},property:{parcel_id:a.PARCEL_ID},assessment:{year:a.ASMNT_YR,assessed_total:String(a.AV_NSD),just_value:String(a.JV),assessed_school:String(a.AV_SD),assessed_non_school:String(a.AV_NSD),taxable_school:String(a.TV_SD),taxable_non_school:String(a.TV_NSD)}};
 const captures=[{url:'https://services9.arcgis.com/query',body:JSON.stringify({features:[{attributes:{...a,PARCELNO:input}}]})}];
 assert.equal(checkDeliveredRecord(r,profile,'state_roll',captures).verdict,'ROLL_VALUES_VERIFIED');
 assert.equal(checkDeliveredRecord({...r,property:{parcel_id:'OTHER'}},profile,'state_roll',captures).verdict,'FAILED_CHECK');
});
test('Polk document/date disagreement remains visible and prevents an unqualified success',async()=>{
 const fixture=async name=>readFile(new URL('./fixtures/phase-one/'+name,import.meta.url));
 const fetcher=async(url,options)=>{
  if(url.includes('gis.polk-county.net'))return new Response(await fixture('alternatives-polk-native-tripar-exact.json'));
  if(url.includes('/AccountSearch'))return new Response(await fixture(options?.method==='POST'?'collectors-polk-search-result.html':'collectors-polk-search-form.html'));
  if(url.includes('/PropertyDetail'))return new Response(await fixture(options?.method==='POST'?'collectors-polk-print.pdf':'collectors-polk-detail.html'));
  throw Error('Unexpected source');
 };
 const result=await floridaLookup({county:'polk-fl',parcel_id:'232724008500000660',include_pdf:true},fetcher);
 assert.equal(result.status,'partial');assert(result.errors.some(e=>e.code==='source_values_disagree'));
 assert.equal(result.taxes.history[0].payment_date,'11/26/2025');assert.equal(result.documents[0].fields.payment_date,'11/25/2025');
 assert.equal(result.documents[0].reconciliation.payment_date,'different');assert.equal(result.documents[0].reconciliation.amount_paid,'matched');
});

test('annual roll audit detects dropped or altered original source attributes',()=>{
 const a=samples[0].attributes,profile=floridaCounties.find(c=>c.dor_code===a.CO_NO),source={...a,LND_VAL:123,OWN_ADDR1:'Source mailing address'};
 const params={parcel_id:a.PARCEL_ID},result={status:'succeeded',input:params,property:{parcel_id:a.PARCEL_ID},assessment:{year:a.ASMNT_YR,assessed_total:String(a.AV_NSD),just_value:String(a.JV),assessed_school:String(a.AV_SD),assessed_non_school:String(a.AV_NSD),taxable_school:String(a.TV_SD),taxable_non_school:String(a.TV_NSD),land:'123'},raw_fields:source};
 const capture=[{url:'https://services9.arcgis.com/query',body:JSON.stringify({features:[{attributes:source}]})}];
 assert.equal(checkDeliveredRecord(result,profile,'state_roll',capture).verdict,'ROLL_VALUES_VERIFIED');
 const changed={...source};delete changed.OWN_ADDR1;
 assert.equal(checkDeliveredRecord({...result,raw_fields:changed},profile,'state_roll',capture).verdict,'FAILED_CHECK');
});

test('full API audit requests retain explicit annual-roll scope despite narrower POC admission',()=>{
 const {profile,mode}=auditTasks({only:['baker-fl:state_roll']})[0],r=auditRequest(profile,mode,{parcel:'322S22004900760075',includePdf:true});
 assert.equal(r.endpoint,'/api/v1/property/lookup');assert.deepEqual(r.body,{county:'baker-fl',parcel_id:'322S22004900760075',source_mode:'state_roll',include_pdf:false});
});
