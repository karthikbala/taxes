import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractNeighborProperties,validateNeighborInput,searchMiamiBuilding,searchMiamiOwnerIndex,compareNeighborOwners,ownerComparisonNames} from '../lib/client/neighbors.mjs';
const fixture=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const seedSearch=fixture('./fixtures/client/miami-address-search-source.json');
const seed=fixture('./fixtures/client/miami-property-source.json');
const index=fixture('./fixtures/neighbors/miami-building-address-page1-source.json');
const unit402=fixture('./fixtures/neighbors/miami-unit-0132310520020-source.json');
const unit403=fixture('./fixtures/neighbors/miami-unit-0132310520030-source.json');
const judeIndex=fixture('./fixtures/neighbors/miami-owner-jude-source.json'),noahIndex=fixture('./fixtures/neighbors/miami-owner-noah-source.json');
const input={scrap_order_id:'neighbor-offline',address:'555 NE 15 ST UNIT 401',ownerName:'JUDE PATRICK JACOB',county:'Miami-Dade',transactionType:'REFI',state:'FL',neighborOptions:{adjacency:false}};
const siblingRows=index.MinimumPropertyInfos.filter(row=>['0132310520020','0132310520030'].includes(row.Strap.replaceAll('-','')));
const completeIndex={...index,MinimumPropertyInfos:siblingRows,Total:2};
function harness({building=completeIndex,details={},failId=null}={}){
 const calls=[];let active=0,maxActive=0;
 const fetcher=async(url,options)=>{const q=new URL(url).searchParams;calls.push({url,signal:options.signal});let data;
  if(q.get('Operation')==='GetAddress')data=q.get('myUnit')?seedSearch:building;
  else if(q.get('Operation')==='GetOwners')data=q.get('ownerName')==='JUDE PATRICK JACOB'?judeIndex:noahIndex;
  else {const id=q.get('folioNumber');if(id===failId)return new Response('blocked',{status:403});active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,1));active--;data=details[id]||{'0132310520010':seed,'0132310520020':unit402,'0132310520030':unit403}[id];}
  return new Response(JSON.stringify(data),{status:200});
 };
 return {fetcher,calls,maxActive:()=>maxActive};
}

test('source-derived sibling units require their published parent and preserve owner names',async()=>{
 const h=harness(),out=await extractNeighborProperties(input,h.fetcher,{requestId:'same-request'}),n=out.NeighboringProperties;
 assert.equal(n.status,'COMPLETE');assert.equal(out.ExtractionMetadata.request_id,'same-request');assert.equal(n.subject.folio,'0132310520010');assert.equal(n.subject.parent_folio,'0132310520001');
 assert.deepEqual(n.subject.owners,seed.OwnerInfos.map(row=>row.Name));assert.deepEqual(n.properties.map(row=>row.unit),['402','403']);
 assert.deepEqual(n.properties[0].owners,unit402.OwnerInfos.map(row=>row.Name));assert.equal(n.properties[0].spatial_relation,'SAME_BUILDING');assert.equal(n.properties[0].geometry,null);
 assert.equal(n.hasMatchingOwnerNeighbors,false);assert.ok(n.properties.every(row=>row.matchesSubjectOwner===false));assert.ok(n.properties[0].provenance.owners.sha256.match(/^[a-f0-9]{64}$/));
 assert.ok(h.calls.every(row=>new URL(row.url).hostname==='apps.miamidadepa.gov'));assert.equal(h.maxActive(),2);
 assert.equal(new URL(h.calls.find(row=>new URL(row.url).searchParams.get('myUnit')==='').url).searchParams.get('myAddress'),'555 NE 15 ST');
});

test('full county owner set is authoritative despite requested owner mismatch',async()=>{
 const out=await extractNeighborProperties({...input,ownerName:'OTHER OWNER'},harness().fetcher);
 assert.equal(out.ExtractionMetadata.match.status,'OWNER_MISMATCH');assert.equal(out.NeighboringProperties.subject.matchesRequestedOwner,false);assert.equal(out.NeighboringProperties.subject.owners.length,2);assert.ok(out.NeighboringProperties.warnings.some(v=>v.includes('ownership differs')));
});

test('owner comparison separates requested owner, shared co-owner and complete owner set',()=>{
 let actual=compareNeighborOwners('JUDE PATRICK JACOB',seed.OwnerInfos.map(row=>row.Name),['NOAH ELIJAH JACOB']);
 assert.equal(actual.matchesRequestedOwner,false);assert.equal(actual.matchesSubjectOwner,true);assert.equal(actual.ownership_relation,'SHARED_OWNER');assert.deepEqual(actual.matching_owner_names,['NOAH ELIJAH JACOB']);
 actual=compareNeighborOwners('JACOB PATRICK JUDE',seed.OwnerInfos.map(row=>row.Name),seed.OwnerInfos.map(row=>row.Name).reverse());assert.equal(actual.ownership_relation,'SAME_OWNER_SET');assert.equal(actual.matchesRequestedOwner,true);
 assert.equal(compareNeighborOwners('MCME 701', ['MCME 701 LLC'],['701 MCME LLC']).matchesRequestedOwner,false);
 assert.equal(compareNeighborOwners('JOHN DOE',['JOHN DOE TRUST'],['JOHN DOE']).matchesSubjectOwner,false);
 assert.equal(compareNeighborOwners('MCME 701 LLC',['MCME 701 LLC'],['MCME 701 INC']).matchesSubjectOwner,false);
});

test('corporate suffix display continuation cannot become a shared generic owner',()=>{
 const raw=['TRINITY EPISCOPAL CATHEDRAL','INC'],other=['OTHER COMPANY','INC'],out=compareNeighborOwners('TRINITY EPISCOPAL CATHEDRAL INC',raw,other);
 assert.equal(out.matchesSubjectOwner,false);assert.equal(out.ownership_relation,'DIFFERENT_OWNER');assert.deepEqual(out.matching_owner_names,[]);assert.deepEqual(raw,['TRINITY EPISCOPAL CATHEDRAL','INC']);
 const same=compareNeighborOwners('TRINITY EPISCOPAL CATHEDRAL INC',raw,['TRINITY EPISCOPAL CATHEDRAL INC']);assert.equal(same.matchesSubjectOwner,true);assert.equal(same.matchesRequestedOwner,true);assert.equal(same.ownership_relation,'SAME_OWNER_SET');
 assert.equal(compareNeighborOwners('OTHER COMPANY INC',other,['OTHER COMPANY LLC']).matchesSubjectOwner,false);
});

test('unpaired generic entity markers leave ownership comparison unknown',()=>{
 const out=compareNeighborOwners('INC',['TRINITY EPISCOPAL CATHEDRAL','INC'],['INC']);assert.equal(out.matchesSubjectOwner,null);assert.equal(out.matchesRequestedOwner,null);assert.equal(out.ownership_relation,'OWNER_UNAVAILABLE');assert.deepEqual(out.comparison_names,[]);
 assert.equal(ownerComparisonNames(['TRUST']).complete,false);assert.equal(ownerComparisonNames(['LLC']).provenance.unpaired_generic_markers.length,1);
});

test('individual coowners remain separate while entity suffix provenance records continuation grouping',()=>{
 const individuals=seed.OwnerInfos.map(row=>row.Name),unchanged=ownerComparisonNames(individuals);assert.deepEqual(unchanged.comparison_names,individuals);assert.equal(unchanged.provenance.grouped.length,0);
 const corporate=ownerComparisonNames(['TRINITY EPISCOPAL CATHEDRAL','INC']);assert.deepEqual(corporate.comparison_names,['TRINITY EPISCOPAL CATHEDRAL INC']);assert.deepEqual(corporate.provenance.grouped[0].source_indices,[0,1]);
});

test('a proven shared owner remains true even if the capped scope is partial',async()=>{
 const modified=structuredClone(unit402);modified.OwnerInfos=[seed.OwnerInfos[1]];
 const out=await extractNeighborProperties({...input,neighborOptions:{adjacency:false,maxCandidates:1}},harness({details:{'0132310520020':modified}}).fetcher);
 assert.equal(out.NeighboringProperties.status,'PARTIAL');assert.equal(out.NeighboringProperties.hasMatchingOwnerNeighbors,true);assert.equal(out.NeighboringProperties.coverage.cap_reached,true);
 assert.equal(out.NeighboringProperties.properties[0].matchesRequestedOwner,false);
});

test('candidate cap cannot turn unexamined owners into false',async()=>{
 const out=await extractNeighborProperties({...input,neighborOptions:{adjacency:false,maxCandidates:1}},harness().fetcher);
 assert.equal(out.NeighboringProperties.hasMatchingOwnerNeighbors,null);assert.equal(out.NeighboringProperties.coverage.examined_count,1);assert.equal(out.NeighboringProperties.coverage.candidate_count,2);
});

test('capped detail work prioritizes indexed requested-name matches without trusting index ownership',async()=>{
 const building=structuredClone(completeIndex);building.MinimumPropertyInfos[1].Owner1=input.ownerName;
 const h=harness({building}),out=await extractNeighborProperties({...input,neighborOptions:{adjacency:false,maxCandidates:1}},h.fetcher);
 assert.equal(out.NeighboringProperties.properties[0].folio,'0132310520030');
 assert.deepEqual(out.NeighboringProperties.properties[0].owners,unit403.OwnerInfos.map(row=>row.Name));
 assert.equal(out.NeighboringProperties.properties[0].matchesRequestedOwner,false);assert.equal(out.NeighboringProperties.hasRequestedOwnerNeighbors,null);
});

test('missing candidate owner names remain nullable',async()=>{
 const blank=structuredClone(unit402);blank.OwnerInfos=[];
 const out=await extractNeighborProperties(input,harness({details:{'0132310520020':blank}}).fetcher);
 assert.equal(out.NeighboringProperties.hasMatchingOwnerNeighbors,null);assert.equal(out.NeighboringProperties.properties[0].matchesSubjectOwner,null);assert.equal(out.NeighboringProperties.coverage.owner_unavailable_count,1);
});

test('blocked one detail preserves independently verified siblings and prevents negative aggregate',async()=>{
 const out=await extractNeighborProperties(input,harness({failId:'0132310520020'}).fetcher);
 assert.equal(out.NeighboringProperties.status,'PARTIAL');assert.equal(out.NeighboringProperties.properties.length,1);assert.equal(out.NeighboringProperties.properties[0].folio,'0132310520030');assert.equal(out.NeighboringProperties.hasMatchingOwnerNeighbors,null);assert.equal(out.ExtractionMetadata.errors[0].code,'source_blocked');
});

test('same address with a different published parent is excluded',async()=>{
 const wrong=structuredClone(unit402);wrong.PropertyInfo.ParentFolio='01-3231-052-9999';
 const out=await extractNeighborProperties(input,harness({details:{'0132310520020':wrong}}).fetcher);
 assert.deepEqual(out.NeighboringProperties.properties.map(row=>row.folio),['0132310520030']);assert.equal(out.NeighboringProperties.coverage.excluded_count,1);
});

test('detail folio disagreement is explicit partial failure',async()=>{
 const out=await extractNeighborProperties(input,harness({details:{'0132310520020':unit403}}).fetcher);
 assert.equal(out.ExtractionMetadata.errors[0].code,'neighbor_identity_mismatch');assert.equal(out.NeighboringProperties.hasMatchingOwnerNeighbors,null);
});

test('unavailable published condo parent cannot establish negative same-building ownership',async()=>{
 const subject=structuredClone(seed);delete subject.PropertyInfo.ParentFolio;
 const out=await extractNeighborProperties(input,harness({details:{'0132310520010':subject}}).fetcher);
 assert.equal(out.NeighboringProperties.coverage.same_building.status,'UNAVAILABLE');assert.equal(out.NeighboringProperties.hasMatchingOwnerNeighbors,null);
 const sibling=structuredClone(unit402);delete sibling.PropertyInfo.ParentFolio;
 const missing=await extractNeighborProperties(input,harness({details:{'0132310520020':sibling}}).fetcher);
 assert.equal(missing.ExtractionMetadata.errors[0].code,'neighbor_parent_unavailable');assert.equal(missing.NeighboringProperties.hasMatchingOwnerNeighbors,null);
});

test('non-condominium parent folio alone never establishes same-building scope',async()=>{
 const land=structuredClone(seed);land.PropertyInfo.DORDescription='COMMERCIAL LAND';land.PropertyInfo.DORCode='1000';
 const h=harness({details:{'0132310520010':land}}),out=await extractNeighborProperties(input,h.fetcher);
 assert.equal(out.NeighboringProperties.coverage.same_building.status,'NOT_APPLICABLE');assert.equal(h.calls.length,2);
});

test('same-building detail must confirm normalized subject street independently',async()=>{
 const moved=structuredClone(unit402);moved.SiteAddress[0].StreetNumber=777;
 const out=await extractNeighborProperties(input,harness({details:{'0132310520020':moved}}).fetcher);
 assert.equal(out.ExtractionMetadata.errors[0].code,'neighbor_address_mismatch');assert.equal(out.NeighboringProperties.hasMatchingOwnerNeighbors,null);
});

test('fresh owner indexes preserve exact-name scope; abbreviated broad hits are not legal-owner matches',async()=>{
 const calls=[],out=await searchMiamiOwnerIndex({ownerNames:seed.OwnerInfos.map(row=>row.Name),subjectFolio:'0132310520010',parentFolio:'0132310520001',candidateFolios:['0622280393200','0132310520020'],get:async url=>{calls.push(url);return new URL(url).searchParams.get('ownerName')===seed.OwnerInfos[0].Name?judeIndex:noahIndex;}});
 assert.equal(out.status,'COMPLETE');assert.equal(out.hasObservedMatchingOwnerNeighbor,false);assert.deepEqual(out.indexCandidateFolios,[]);assert.equal(out.queries[0].nonexact_name_rows,1);assert.equal(calls.length,2);
 assert.deepEqual(Object.fromEntries(new URL(calls[0]).searchParams),{Operation:'GetOwners',clientAppName:'PropertySearch',from:'1',ownerName:'JUDE PATRICK JACOB',to:'200'});
});

test('owner index known-seed and complete-pagination validation controls trust',async()=>{
 const missing={...noahIndex,MinimumPropertyInfos:[],Total:0};
 let out=await searchMiamiOwnerIndex({ownerNames:['NOAH ELIJAH JACOB'],subjectFolio:'0132310520010',candidateFolios:[],get:async()=>missing});assert.equal(out.status,'NOT_USED');assert.equal(out.hasObservedMatchingOwnerNeighbor,null);assert.equal(out.queries[0].seed_verified,false);
 out=await searchMiamiOwnerIndex({ownerNames:['NOAH ELIJAH JACOB'],subjectFolio:'0132310520010',candidateFolios:[],get:async()=>({...noahIndex,Total:201})});assert.equal(out.status,'NOT_USED');assert.equal(out.queries[0].seed_verified,true);assert.equal(out.hasObservedMatchingOwnerNeighbor,null);
 out=await searchMiamiOwnerIndex({ownerNames:['NOAH ELIJAH JACOB'],subjectFolio:'0132310520010',candidateFolios:[],get:async()=>({...noahIndex,Count:2})});assert.equal(out.status,'NOT_USED');assert.equal(out.hasObservedMatchingOwnerNeighbor,null);
});

test('owner index stable Total pagination and bounded cap use source-derived rows without broad-match promotion',async()=>{
 // Synthetic pagination scenario assembled from retained official rows. It is
 // an offline contract failure/success case, not a live GetOwners response.
 const first={...index,Count:0,Total:201},last={...judeIndex,Total:201,Count:0,MinimumPropertyInfos:[judeIndex.MinimumPropertyInfos[0]]},calls=[];
 const args={ownerNames:['JUDE PATRICK JACOB'],subjectFolio:'0132310520010',candidateFolios:['0622280393200']};
 const out=await searchMiamiOwnerIndex({...args,get:async url=>{calls.push(url);return calls.length===1?first:last;}});
 assert.equal(out.status,'COMPLETE');assert.equal(out.queries[0].index_rows,201);assert.equal(out.queries[0].pages[1].from,201);assert.equal(out.hasObservedMatchingOwnerNeighbor,false);
 const capped=await searchMiamiOwnerIndex({...args,maxRows:200,get:async()=>first});assert.equal(capped.status,'NOT_USED');assert.equal(capped.hasObservedMatchingOwnerNeighbor,null);
});

test('owner index shortlists only guide detail order and never override authoritative names or negative cap rule',async()=>{
 const ownerIndex=structuredClone(noahIndex),hint={...siblingRows[1],Owner1:'NOAH ELIJAH JACOB'};ownerIndex.MinimumPropertyInfos.push(hint);ownerIndex.Total=2;
 const h=harness(),fetcher=async(url,options)=>new URL(url).searchParams.get('Operation')==='GetOwners'?new Response(JSON.stringify(ownerIndex)):h.fetcher(url,options);
 const out=await extractNeighborProperties({...input,neighborOptions:{adjacency:false,maxCandidates:1}},fetcher);
 assert.equal(out.NeighboringProperties.properties[0].folio,'0132310520030');assert.equal(out.NeighboringProperties.properties[0].matchesSubjectOwner,false);assert.equal(out.NeighboringProperties.hasMatchingOwnerNeighbors,null);
 assert.equal(out.NeighboringProperties.coverage.owner_index.hasObservedMatchingOwnerNeighbor,true);
});

test('seed and published parent folios never appear as siblings',async()=>{
 const rows=index.MinimumPropertyInfos.slice(0,3),out=await extractNeighborProperties(input,harness({building:{...index,MinimumPropertyInfos:rows,Total:rows.length}}).fetcher);
 assert.deepEqual(out.NeighboringProperties.properties.map(row=>row.folio),['0132310520020']);
 assert.equal(out.NeighboringProperties.coverage.same_building.self_excluded_count,1);assert.equal(out.NeighboringProperties.coverage.same_building.parent_reference_excluded_count,1);
});

test('source-derived 200 row page paginates by Total and remains partial on missing next page',async()=>{
 const calls=[],out=await searchMiamiBuilding({address:input.address,parentFolio:'0132310520001',subjectFolio:'0132310520010',get:async url=>{calls.push(url);return calls.length===1?index:{Completed:false,MinimumPropertyInfos:[],Total:381};}});
 assert.equal(calls.length,2);assert.equal(new URL(calls[1]).searchParams.get('from'),'201');assert.equal(new URL(calls[1]).searchParams.get('to'),'400');assert.equal(out.coverage.complete,false);assert.equal(out.coverage.index_rows,200);assert.equal(out.candidates.length,198);
});

test('duplicate rows and Total changes cannot establish complete index coverage',async()=>{
 let out=await searchMiamiBuilding({address:input.address,parentFolio:'0132310520001',subjectFolio:'0132310520010',get:async()=>({...completeIndex,MinimumPropertyInfos:[siblingRows[0],siblingRows[0]]})});assert.equal(out.coverage.complete,false);
 let count=0;out=await searchMiamiBuilding({address:input.address,parentFolio:'0132310520001',subjectFolio:'0132310520010',get:async()=>++count===1?index:{Completed:true,Total:380,MinimumPropertyInfos:[]}});assert.equal(out.coverage.complete,false);
});

test('options are bounded and stripped before strict existing client input validation',()=>{
 assert.equal(validateNeighborInput(input).order.county,'miami-dade-fl');assert.equal(validateNeighborInput(input).options.maxCandidates,50);
 for(const neighborOptions of [{maxCandidates:101},{maxCandidates:0},{sameBuilding:'true'},{sourceUrl:'https://example.org'},{sameBuilding:false,adjacency:false},[]])assert.throws(()=>validateNeighborInput({...input,neighborOptions}),e=>e.code==='invalid_input');
 assert.throws(()=>validateNeighborInput({...input,county:'Bradford'}),e=>e.code==='unsupported_neighbor_county');assert.throws(()=>validateNeighborInput({...input,folio:'0132310520010'}),e=>e.code==='invalid_input');
});

test('abort propagates through native deadline transport without fixture substitution',async()=>{
 const ctl=new AbortController();ctl.abort();let calls=0;
 const out=await extractNeighborProperties(input,async()=>{calls++;throw new Error('unexpected');},{signal:ctl.signal});assert.equal(calls,0);assert.equal(out.NeighboringProperties.subject,null);assert.equal(out.NeighboringProperties.hasMatchingOwnerNeighbors,null);assert.equal(out.ExtractionMetadata.errors[0].code,'lookup_deadline');
});
