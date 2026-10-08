import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveMiami, matchMiamiCandidates, normalizeMiamiAddress, normalizeMiamiOwner, ownerMatchesMiami, enrichMiami} from '../lib/client/miami.mjs';
const fixture = name => JSON.parse(readFileSync(new URL('./fixtures/client/'+name, import.meta.url)));
const search = fixture('miami-address-search-source.json');
const detail = fixture('miami-property-source.json');
const input = {county:'miami-dade-fl',address:'555 NE15ST UNIT401',ownerName:'JUDE PATRICK JACOB'};
const copy = value => structuredClone(value);
function mockGet(searchData=search, raw=detail) {
  const calls = [];
  const get = async (url,id) => {calls.push({url,id}); return JSON.stringify(new URL(url).searchParams.get('Operation') === 'GetAddress' ? searchData : raw);};
  return {get,calls};
}

test('native address and unit operation discovers the parcel before detail; no parcel input or seed', async () => {
  const {get,calls} = mockGet();
  const result = await resolveMiami(input,get);
  assert.equal(result.status,'MATCHED'); assert.equal(result.parcel_id,'0132310520010');
  assert.equal(calls.length,2);
  assert.deepEqual(Object.fromEntries(new URL(calls[0].url).searchParams),{Operation:'GetAddress',clientAppName:'PropertySearch',myUnit:'401',from:'1',myAddress:'555 NE 15 ST',to:'200'});
  assert.ok(!calls[0].url.includes('0132310520010'));
  assert.equal(new URL(calls[1].url).searchParams.get('folioNumber'),search.MinimumPropertyInfos[0].Strap.replaceAll('-',''));
  assert.deepEqual(result.raw.OwnerInfos.map(row=>row.Name),['JUDE PATRICK JACOB','NOAH ELIJAH JACOB']);
});
test('second owner matches, ownership mismatch continues a unique exact address', async () => {
  assert.equal((await resolveMiami({...input,ownerName:'NOAH ELIJAH JACOB'},mockGet().get)).status,'MATCHED');
  const result = await resolveMiami({...input,ownerName:'OTHER OWNER'},mockGet().get);
  assert.equal(result.status,'OWNER_MISMATCH'); assert.equal(result.parcel_id,'0132310520010'); assert.ok(result.raw.Assessment);
  const missing = copy(detail);missing.OwnerInfos=[];
  assert.equal((await resolveMiami(input,mockGet(search,missing).get)).status,'OWNER_UNAVAILABLE');
});
test('owner word order is ignored with an exact token multiset; entity markers cannot disappear',()=>{
  assert.equal(ownerMatchesMiami('JACOB JUDE PATRICK',['JUDE PATRICK JACOB']),true);
  assert.equal(ownerMatchesMiami('LLC 701 MCME',['MCME 701 LLC']),true);
  assert.equal(ownerMatchesMiami('ESTATE JOHN DOE',['JOHN DOE']),false);
  assert.equal(ownerMatchesMiami('DOE TRUST JOHN',['JOHN DOE TRUST']),true);
  assert.equal(ownerMatchesMiami('DOE DOE JOHN',['JOHN DOE']),false);
  assert.equal(normalizeMiamiOwner('  MCME 701 LLC. '),'MCME 701 LLC');
  assert.equal(ownerMatchesMiami('MCME 701',['MCME 701 LLC']),false);
  assert.equal(ownerMatchesMiami('MCME 701 INC',['MCME 701 LLC']),false);
  assert.equal(ownerMatchesMiami('MCME 701 LLC',['MCME 701 LLC']),true);
});
test('address matching handles compact spelling, ordinals and locality; unit identifiers remain exact',()=>{
  assert.deepEqual(normalizeMiamiAddress('555 NE15ST UNIT401'),{street:'555 NE 15 ST',unit:'401',conflict:false});
  assert.deepEqual(normalizeMiamiAddress('555 NE 15th Street #401, Miami, FL'),{street:'555 NE 15 ST',unit:'401',conflict:false});
  assert.equal(matchMiamiCandidates({...input,address:'555 NE 15 ST UNIT 402'},search).status,'NOT_FOUND');
  assert.equal(matchMiamiCandidates({...input,address:'555 NE 15 ST'},search).status,'NOT_FOUND');
  assert.equal(matchMiamiCandidates({...input,unit:'402'},search).status,'SEARCH_INCOMPLETE');
});
test('partial pagination, incomplete response and ambiguous exact parcels stop before property calls',async()=>{
  for (const mutation of [{Completed:false},{Total:201},{HasMore:true},{Total:null}]) {
    const {get,calls} = mockGet({...search,...mutation});
    assert.equal((await resolveMiami(input,get)).status,'SEARCH_INCOMPLETE');assert.equal(calls.length,1);
  }
  const ambiguous=copy(search);ambiguous.Total=2;ambiguous.MinimumPropertyInfos.push({...ambiguous.MinimumPropertyInfos[0],Strap:'01-3231-052-0020',Owner1:'JUDE PATRICK JACOB'});
  const {get,calls}=mockGet(ambiguous);assert.equal((await resolveMiami(input,get)).status,'AMBIGUOUS');assert.equal(calls.length,1);
});
test('wrong returned detail parcel or unit is rejected even with the requested owner',async()=>{
  const wrongId=copy(detail);wrongId.PropertyInfo.FolioNumber='01-3231-052-0020';
  await assert.rejects(resolveMiami(input,mockGet(search,wrongId).get),error=>error.code==='identity_mismatch');
  const wrongUnit=copy(detail);wrongUnit.SiteAddress[0].Unit='402';
  await assert.rejects(resolveMiami(input,mockGet(search,wrongUnit).get),error=>error.code==='identity_mismatch');
});
test('fresh official assessment source maps all nine client source sections and their years',()=>{
  const result=enrichMiami(detail,'0132310520010');
  const expected=fixture('miami-client-sample.json').scrapTaxOrderRequest;
  for(const key of ['AssessmentInformation','AssessmentHistory','BenefitsInformation','BenefitsNote','TaxableValueInformation','FullLegalDescription','SalesInformation','LandBuildingExtraFeatures']) assert.deepEqual(result[key],expected[key],key);
  assert.deepEqual(result.PropertyInformation.Owners,expected.PropertyInformation.Owners);
  assert.equal(result.PropertyInformation.LotSize,'0 Sq.Ft'); assert.equal(result.PropertyInformation.LivingArea,'450 Sq.Ft');
  assert.equal(result.PropertyInformation.ownerOccupied,null);
  assert.equal(result.section_status.LandBuildingExtraFeatures.status,'EMPTY');
  assert.equal(result.provenance['TaxableValueInformation.2024.SchoolBoard.TaxableValue'].source_value,159160);
  assert.equal(result.provenance['PropertyInformation.LivingArea'].source_path,'PropertyInfo.BuildingActualArea');
});
test('rich commercial source retains every component, override message, sale and jurisdiction year',()=>{
  const raw=JSON.parse(readFileSync(new URL('./fixtures/florida/miami.json',import.meta.url)));
  const result=enrichMiami(raw,'0141380340020');
  const original=[...raw.Land.Landlines,...raw.Building.BuildingInfos,...raw.ExtraFeature.ExtraFeatureInfos];
  assert.equal(Object.values(result.LandBuildingExtraFeatures).flat().length,original.length);
  const land=result.LandBuildingExtraFeatures['2026'].find(row=>row.ComponentType==='Land');
  assert.equal(land.AdjustedUnitPrice,null);
  const sentinel=Object.values(result.provenance).find(row=>row.source_path==='Land.Landlines.0.AdjustedUnitPrice');assert.equal(sentinel.source_value,-1);assert.equal(sentinel.missing_reason,'SOURCE_UNAVAILABLE_SENTINEL');assert.equal(land.Depth,0);assert.equal(land.MuniZoneDescription,null);
  assert.equal(result.AssessmentInformation.BuildingValue,'$108,892,500');
  assert.equal(result.TaxableValueInformation['2024'].SchoolBoard.TaxableValue,'$300,000,000');
  assert.equal(result.SalesInformation.length,raw.SalesInfos.length);
  assert.ok(result.notes.some(note=>note.includes('calculated values for this property have been overridden')));
  assert.equal(result.section_status.LandBuildingExtraFeatures.status,'EXTRACTED');
});
test('zero, absent section, null and native sentinel remain distinguishable without fabricated source blanks',()=>{
  const raw=copy(detail);raw.Assessment.AssessmentInfos[0].LandValue=null;raw.Assessment.AssessmentInfos[0].ExtraFeatureValue=-1;delete raw.Benefit;delete raw.Land;
  const result=enrichMiami(raw,'0132310520010');
  assert.equal(result.AssessmentInformation.LandValue,null);assert.equal(result.AssessmentInformation.BuildingValue,'$0');assert.equal(result.AssessmentInformation.ExtraFeatureValue,null);
  assert.equal(result.BenefitsNote,null);assert.equal(result.section_status.BenefitsInformation.status,'UNAVAILABLE');assert.equal(result.section_status.LandBuildingExtraFeatures.status,'UNAVAILABLE');
  assert.equal(result.provenance['AssessmentHistory.0.ExtraFeatureValue'].source_value,-1);assert.equal(result.provenance['AssessmentHistory.0.ExtraFeatureValue'].missing_reason,'SOURCE_UNAVAILABLE_SENTINEL');
  assert.ok(result.notes.some(note=>note.startsWith('BenefitsInformation:')));
  assert.throws(()=>enrichMiami(detail,'0132310520020'),error=>error.code==='identity_mismatch');
});

test('multiple exact folios narrow only by one structured native owner match',async()=>{
  const data=copy(search);data.Total=2;data.MinimumPropertyInfos.push({...data.MinimumPropertyInfos[0],Strap:'01-3231-052-0020',Owner1:'ANOTHER OWNER',Owner2:'',Owner3:''});
  const result=await resolveMiami({...input,ownerName:'JACOB PATRICK JUDE'},mockGet(data).get);assert.equal(result.status,'MATCHED');assert.equal(result.parcel_id,'0132310520010');assert.equal(result.candidates.length,2);
  assert.equal(matchMiamiCandidates({...input,ownerName:'NO MATCH'},data).status,'AMBIGUOUS');
  data.MinimumPropertyInfos[1].Owner3='JUDE PATRICK JACOB';assert.equal(matchMiamiCandidates(input,data).status,'AMBIGUOUS');
});

test('native area sentinel becomes null with raw provenance while an actual negative sale remains money',()=>{
  const raw=copy(detail);raw.PropertyInfo.BuildingActualArea=-1;raw.SalesInfos[0].SalePrice=-1;
  const result=enrichMiami(raw,'0132310520010');assert.equal(result.PropertyInformation.LivingArea,null);assert.equal(result.provenance['PropertyInformation.LivingArea'].source_value,-1);assert.equal(result.provenance['PropertyInformation.LivingArea'].missing_reason,'SOURCE_UNAVAILABLE_SENTINEL');assert.equal(result.PropertyInformation.LotSize,'0 Sq.Ft');assert.equal(result.SalesInformation[0].Price,'$-1');
});
test('full directional address words resolve without guessing trailing units',()=>{assert.deepEqual(normalizeMiamiAddress('555 NORTHEAST 15 STREET UNIT 401'),normalizeMiamiAddress('555 NE 15 ST UNIT 401'));assert.equal(normalizeMiamiAddress('555 NE 15 ST 401').unit,'');});
