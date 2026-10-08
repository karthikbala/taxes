import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveOsceola,matchOsceolaCandidates,enrichOsceola,osceolaHeaders} from '../lib/client/osceola.mjs';
const fixture=name=>JSON.parse(readFileSync(new URL('./fixtures/client/'+name,import.meta.url)));
const historicalMarket=fixture('osceola-market-reference.json'),historicalValues=fixture('osceola-values-reference.json');
const input={address:'3250 VINELAND RD',ownerName:'WAL-MART STORES EAST LP',county:'osceola-fl'};
// Count telemetry below is mocked, not claimed as part of the historical capture.
const market={...historicalMarket,'@odata.count':historicalMarket.value.length};
const values={...historicalValues,'@odata.count':historicalValues.value.length};
const copy=value=>structuredClone(value);
const mock=(m=market,v=values)=>{const calls=[];return {calls,get:async(url,id,headers)=>{calls.push({url,id,headers});const table=new URL(url).pathname.split('/').at(-1);if(!['ParcelMarket','PropertyValues'].includes(table))throw Object.assign(new Error('Historical fixture did not capture section'),{code:'source_section_not_captured'});return JSON.stringify(table==='PropertyValues'?v:m);}};};

test('documented native address filter discovers identity before values; no folio seed',async()=>{
  const {get,calls}=mock();const result=await resolveOsceola(input,get);
  assert.equal(result.status,'MATCHED');assert.equal(result.parcel_id,'022528285000010010');assert.equal(calls.length,6);
  const search=new URL(calls[0].url);assert.equal(search.searchParams.get('$filter'),"contains(SitusAll,'3250 VINELAND RD')");assert.equal(search.searchParams.get('$count'),'true');assert.ok(!calls[0].url.includes('022528285000010010'));
  assert.equal(new URL(calls[1].url).searchParams.get('$filter'),"strap eq '"+historicalMarket.value[0].strap.trim()+"'");
  assert.deepEqual(calls[0].headers,osceolaHeaders);assert.equal(search.searchParams.get('$top'),'100');
});

const freshRaw={market:fixture('osceola-market-2026-10-08.json'),values:fixture('osceola-certified-values-2026-10-08.json'),sales:fixture('osceola-sales-2026-10-08.json'),land:fixture('osceola-lnd_c-2026-10-08.json'),buildings:fixture('osceola-bld-2026-10-08.json'),extras:fixture('osceola-xfob-2026-10-08.json')};
const freshTables={ParcelMarket:freshRaw.market,PropertyValues:freshRaw.values,sales:freshRaw.sales,Lnd_c:freshRaw.land,Bld:freshRaw.buildings,xfob:freshRaw.extras};
test('current2026-10-08 native captured address and rich sections share exact identity',async()=>{
  const calls=[];const result=await resolveOsceola(input,async(url,id,headers)=>{calls.push({url,id,headers});return copy(freshTables[new URL(url).pathname.split('/').at(-1)]);});
  assert.equal(result.status,'MATCHED');assert.equal(result.parcel_id,'022528285000010010');assert.equal(calls.length,6);
  assert.ok(calls.every(call=>call.headers===osceolaHeaders));assert.ok(!calls[0].url.includes(result.parcel_id));
  const mapped=enrichOsceola(result.raw,result.parcel_id);
  assert.equal(mapped.AssessmentHistory.filter(row=>row.Status==='CERTIFIED').length,5);
  assert.equal(mapped.AssessmentInformation.Year,'2026');assert.equal(mapped.AssessmentInformation.AssessedValue,'$13,641,900');
  assert.equal(mapped.AssessmentHistory[0].Year,'2027');
  assert.equal(mapped.SalesInformation.length,3);assert.equal(mapped.SalesInformation[0].Price,'$7,162,700');assert.equal(mapped.SalesInformation[0].Grantees,'WAL-AMRT STORES EAST LP');
  assert.equal(mapped.LandBuildingExtraFeatures.Land[0].Units,'24.549');assert.equal(mapped.PropertyInformation.LotAreaAcres,'24.551');
  assert.equal(mapped.LandBuildingExtraFeatures.Buildings[0].Description,'DISCOUNT STORE');assert.equal(mapped.LandBuildingExtraFeatures.Buildings[0].Bedrooms,null);
  assert.equal(mapped.LandBuildingExtraFeatures.ExtraFeatures.length,17);assert.equal(mapped.section_status.SalesInformation.status,'EXTRACTED');
  assert.equal(mapped.provenance['SalesInformation.0.Price'].source_path,'sales.value.0.price');
  assert.equal(mapped.provenance['AssessmentInformation.AssessedValue'].source_path,'values.value.0.soh_val');
});
test('OData continuations are fully consumed before address uniqueness is decided',async()=>{
  const other={...market.value[0],strap:'022528285000010020',Owners:input.ownerName};let searches=0;
  const result=await resolveOsceola(input,async(url)=>{
    searches++;const u=new URL(url);
    if(u.searchParams.has('$skip'))return {value:[other]};
    const next=new URL(url);next.searchParams.set('$skip','1');
    return {'@odata.count':2,value:market.value,'@odata.nextLink':next.href};
  });
  assert.equal(searches,2);assert.equal(result.status,'AMBIGUOUS');assert.equal(result.parcel_id,undefined);
});
test('unsafe continuation and a repeated page cannot be used to claim completeness',async()=>{
  for(const next of ['https://example.org/api/v1/ParcelMarket?$filter=x',osceolaEndpointForTest()+'PropertyValues?$filter=x']){
    let requests=0;const result=await resolveOsceola(input,async()=>{requests++;return {...market,'@odata.count':2,'@odata.nextLink':next};});
    assert.equal(result.status,'SEARCH_INCOMPLETE');assert.equal(requests,1);
  }
  let requests=0;const result=await resolveOsceola(input,async url=>{requests++;return {...market,'@odata.count':2,'@odata.nextLink':url};});
  assert.equal(result.status,'SEARCH_INCOMPLETE');assert.equal(requests,1);
});
function osceolaEndpointForTest(){return 'https://search.property-appraiser.org/api/v1/';}
test('certified displayed assessed uses soh rather than uncapped asd; duplicate years reject',()=>{
  const raw=copy(freshRaw);raw.values.value[0].asd_val=15000000;
  const result=enrichOsceola(raw,'022528285000010010');assert.equal(result.AssessmentInformation.AssessedValue,'$13,641,900');assert.equal(result.AssessmentInformation.UncappedAssessedValue,'$15,000,000');
  raw.values.value.push(copy(raw.values.value[0]));assert.throws(()=>enrichOsceola(raw,'022528285000010010'),e=>e.code==='layout_changed');
});
test('detail access failure remains explicit and cross-parcel components reject',async()=>{
  const result=await resolveOsceola(input,async(url)=>{const key=new URL(url).pathname.split('/').at(-1);if(key==='sales')throw Object.assign(new Error('403'),{code:'source_blocked'});return copy(freshTables[key]);});
  const mapped=enrichOsceola(result.raw,result.parcel_id);assert.equal(mapped.section_status.SalesInformation.status,'UNAVAILABLE');assert.ok(mapped.notes.some(note=>note.includes('source_blocked')));
  const wrong=copy(freshRaw);wrong.buildings.value[0].Strap='022528285000010020';assert.throws(()=>enrichOsceola(wrong,'022528285000010010'),e=>e.code==='identity_mismatch');
});
test('native parcel contamination, duplicate market row and inconsistent displayed identity reject',()=>{
  const contaminated=copy(market);contaminated.value[0].strap='ABC'+inputParcel();assert.equal(matchOsceolaCandidates(input,contaminated).status,'SEARCH_INCOMPLETE');
  const duplicate=copy(market);duplicate.value.push(copy(duplicate.value[0]));duplicate['@odata.count']=2;assert.equal(matchOsceolaCandidates(input,duplicate).status,'SEARCH_INCOMPLETE');
  const inconsistent=copy(freshRaw);inconsistent.market.value[0].dsp_strap='02-25-28-2850-0001-0020';assert.throws(()=>enrichOsceola(inconsistent,inputParcel()),e=>e.code==='identity_mismatch');
});
function inputParcel(){return '022528285000010010';}
test('owner token order is ignored and legal entity markers survive',async()=>{
  assert.equal((await resolveOsceola({...input,ownerName:'LP EAST STORES WAL-MART'},mock().get)).status,'MATCHED');
  const result=await resolveOsceola({...input,ownerName:'WAL-MART STORES EAST'},mock().get);assert.equal(result.status,'OWNER_MISMATCH');assert.equal(result.parcel_id,'022528285000010010');assert.ok(result.raw.values);
});
test('explicit unit must match and alternate situs lines are exact address candidates',()=>{
  assert.equal(matchOsceolaCandidates({...input,unit:'401'},market).status,'NOT_FOUND');
  assert.equal(matchOsceolaCandidates({...input,address:'3252 VINELAND RD'},market).status,'MATCHED');
  assert.equal(matchOsceolaCandidates({...input,address:'325 VINELAND RD'},market).status,'NOT_FOUND');
  assert.equal(matchOsceolaCandidates({...input,address:'3250 VINELAND RD UNIT401',unit:'402'},market).status,'SEARCH_INCOMPLETE');
});
test('missing count, continuation and mismatched count stop before uniqueness/detail',async()=>{
  for(const data of [historicalMarket,{...market,'@odata.nextLink':'next'},{...market,'@odata.count':2}]){const {get,calls}=mock(data);assert.equal((await resolveOsceola(input,get)).status,'SEARCH_INCOMPLETE');assert.equal(calls.length,1);}
  const result=await resolveOsceola(input,mock(market,{...values,'@odata.count':5}).get);assert.equal(result.status,'SEARCH_INCOMPLETE');assert.equal(result.parcel_id,undefined);
});
test('multiple exact folios need one unique owner match',()=>{
  const data=copy(market);data.value.push({...data.value[0],strap:'022528285000010020',Owners:'ANOTHER OWNER LP'});data['@odata.count']=2;
  assert.equal(matchOsceolaCandidates(input,data).parcel_id,'022528285000010010');
  assert.equal(matchOsceolaCandidates({...input,ownerName:'NO MATCH'},data).status,'AMBIGUOUS');
  data.value[1].Owners=input.ownerName;assert.equal(matchOsceolaCandidates(input,data).status,'AMBIGUOUS');
});
test('county values identity is independent and source403 has no saved fallback',async()=>{
  const wrong=copy(values);wrong.value[0].strap='022528285000010020';
  await assert.rejects(resolveOsceola(input,mock(market,wrong).get),e=>e.code==='identity_mismatch');
  let calls=0;await assert.rejects(resolveOsceola(input,async()=>{calls++;throw Object.assign(new Error('403'),{code:'source_blocked'});}),e=>e.code==='source_blocked');assert.equal(calls,1);
});
test('certified2026 and working2027 are independent source years and values',()=>{
  const result=enrichOsceola({market:historicalMarket,values:historicalValues},'022528285000010010');
  assert.equal(result.AssessmentInformation.Year,'2026');assert.equal(result.AssessmentInformation.Status,'CERTIFIED');assert.equal(result.AssessmentInformation.MarketValue,'$13,641,900');
  const working=result.AssessmentHistory.find(row=>row.Status==='WORKING');assert.equal(working.Year,'2027');assert.equal(working.MarketValue,'$13,485,800');
  assert.equal(result.AssessmentHistory.filter(row=>row.Status==='CERTIFIED').length,4);
  assert.equal(result.PropertyInformation.PrimaryLandUse,'1311 DEPT. STORES-IMP');assert.equal(result.PropertyInformation.LivingArea,'213543 Sq.Ft');assert.equal(result.PropertyInformation.LivingUnits,'0');assert.equal(result.PropertyInformation.LotSize,null);
  assert.equal(result.FullLegalDescription.length,1);assert.ok(result.FullLegalDescription[0].includes('& NE COR'));assert.ok(!result.FullLegalDescription[0].includes('&amp;'));
});
test('authority-specific blanks and uninspected sales/benefits/components are not fabricated',()=>{
  const result=enrichOsceola({market:historicalMarket,values:historicalValues},'022528285000010010');
  assert.equal(result.TaxableValueInformation['2026'].Reported.ExemptionValue,'$0');assert.equal(result.TaxableValueInformation['2026'].Reported.TaxableValue,'$13,641,900');
  assert.deepEqual(result.TaxableValueInformation['2026'].County,{ExemptionValue:null,TaxableValue:null});
  for(const key of ['BenefitsInformation','BenefitsNote','SalesInformation','LandBuildingExtraFeatures'])assert.equal(result.section_status[key].status,'UNAVAILABLE');
  assert.equal(result.PropertyInformation.ownerOccupied,null);assert.equal(result.provenance['AssessmentInformation.Year'].source_value,2026);assert.equal(result.provenance['AssessmentHistory.0.Year'].source_value,2027);
  assert.throws(()=>enrichOsceola({market:historicalMarket,values:historicalValues},'022528285000010020'),e=>e.code==='identity_mismatch');
});
