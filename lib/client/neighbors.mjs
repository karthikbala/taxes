import {validateClientInput} from './contract.mjs';
import {createClientTransport} from './engine.mjs';
import {miamiEndpoint, resolveMiami, normalizeMiamiAddress, normalizeMiamiOwner, ownerMatchesMiami} from './miami.mjs';
import {discoverMiamiGeometryNeighbors} from './neighbors-geo.mjs';

const folio = value => String(value ?? '').replace(/[^0-9]/g, '');
const validFolio = value => /^\d{13}$/.test(value);
const invalid = message => Object.assign(new Error(message), {code:'invalid_input', http:400});
const parse = value => { try {return typeof value==='string'?JSON.parse(value):value;} catch {throw Object.assign(new Error('County neighbor response was not JSON.'),{code:'layout_changed'});} };
const nameKey = name => normalizeMiamiOwner(name).split(/\s+/).sort().join(' ');
const names = raw => [...new Set((Array.isArray(raw?.OwnerInfos)?raw.OwnerInfos:[]).map(row=>typeof row?.Name==='string'?row.Name.trim():'').filter(Boolean))];
const detailUrl = id => miamiEndpoint+'?'+new URLSearchParams({Operation:'GetPropertySearchByFolio',clientAppName:'PropertySearch',folioNumber:id});
const sourceAddress = row => [row?.StreetNumber,row?.HouseNumberSuffix,row?.StreetPrefix,row?.StreetName,row?.StreetSuffix,row?.StreetSuffixDirection].filter(v=>v!==null&&v!==undefined&&String(v).trim()).join(' ');
const site = raw => {const row=raw?.SiteAddress?.[0];return {address:row?sourceAddress(row):null,unit:row?.Unit==null?null:String(row.Unit).trim()||null};};
const isCondo = raw => /CONDO/i.test(raw?.PropertyInfo?.DORDescription||'') || /^04\d{2}$/.test(String(raw?.PropertyInfo?.DORCode||''));
const genericOwnerMarker = value => /^(INC|LLC|LTD|TRUST|ESTATE)$/.test(normalizeMiamiOwner(value));

export function ownerComparisonNames(ownerNames) {
 const comparison_names=[],grouped=[],unpaired_generic_markers=[];
 for(const [index,name] of ownerNames.entries()){
  if(genericOwnerMarker(name)){
   if(comparison_names.length&&!genericOwnerMarker(comparison_names.at(-1))){const preceding=comparison_names.pop(),combined=preceding+' '+normalizeMiamiOwner(name);comparison_names.push(combined);grouped.push({source_indices:[index-1,index],source_values:[preceding,name],comparison_name:combined});}
   else unpaired_generic_markers.push({source_index:index,source_value:name});
  }else if(typeof name==='string'&&name.trim())comparison_names.push(name.trim());
 }
 return {comparison_names,complete:comparison_names.length>0&&unpaired_generic_markers.length===0,provenance:{method:'county_owner_display_continuation',source_path:'OwnerInfos[].Name',grouped,unpaired_generic_markers,note:'Standalone entity suffix display lines are attached to the preceding owner name for comparison only; raw county owner lines remain unchanged. Unpaired generic markers cannot establish ownership identity.'}};
}

export function validateNeighborInput(input) {
 if (!input || typeof input!=='object' || Array.isArray(input)) throw invalid('Supply a JSON object.');
 const {neighborOptions,...client}=input;
 const order=validateClientInput(client);
 // The established neighbor workflow starts from a property site and compares
 // county owners even when the requested name differs. Keep that default;
 // explicit API address-role overrides remain explicit.
 order.addressType=client.addressType||'site';
 if(order.county!=='miami-dade-fl') throw Object.assign(new Error('Neighbor discovery is currently supported for Miami-Dade only.'),{code:'unsupported_neighbor_county',http:422});
 if(neighborOptions!==undefined&&(!neighborOptions||typeof neighborOptions!=='object'||Array.isArray(neighborOptions)))throw invalid('neighborOptions must be an object.');
 const given=neighborOptions||{}, allowed=new Set(['sameBuilding','adjacency','includeCornerTouch','maxCandidates']);
 if(Object.keys(given).some(key=>!allowed.has(key)))throw invalid('Only sameBuilding, adjacency, includeCornerTouch and maxCandidates neighbor options are accepted.');
 for(const key of ['sameBuilding','adjacency','includeCornerTouch'])if(given[key]!==undefined&&typeof given[key]!=='boolean')throw invalid(key+' must be a boolean.');
 if(given.maxCandidates!==undefined&&(!Number.isInteger(given.maxCandidates)||given.maxCandidates<1||given.maxCandidates>100))throw invalid('maxCandidates must be an integer from 1 to 100.');
 const options={sameBuilding:false,adjacency:true,includeCornerTouch:false,maxCandidates:50,...given};
 if(!options.sameBuilding&&!options.adjacency)throw invalid('Select at least one neighbor scope.');
 return {order,options};
}

export function compareNeighborOwners(requestedOwner, subjectOwners, candidateOwners) {
 const subject=ownerComparisonNames(subjectOwners),candidate=ownerComparisonNames(candidateOwners),shared=candidate.comparison_names.filter(name=>subject.comparison_names.some(other=>ownerMatchesMiami(name,[other]))),complete=subject.complete&&candidate.complete;
 const sameSet=complete&&new Set(subject.comparison_names.map(nameKey)).size===new Set(candidate.comparison_names.map(nameKey)).size&&subject.comparison_names.every(name=>ownerMatchesMiami(name,candidate.comparison_names));
 const requestedProven=!genericOwnerMarker(requestedOwner)&&ownerMatchesMiami(requestedOwner,candidate.comparison_names);
 return {comparison_names:candidate.comparison_names,owner_comparison_complete:candidate.complete,owner_comparison_provenance:candidate.provenance,ownership_relation:sameSet?'SAME_OWNER_SET':shared.length?'SHARED_OWNER':complete?'DIFFERENT_OWNER':'OWNER_UNAVAILABLE',matching_owner_names:shared,matchesRequestedOwner:requestedProven?true:candidate.complete&&!genericOwnerMarker(requestedOwner)?false:null,matchesSubjectOwner:shared.length?true:complete?false:null,owner_comparison_note:'Published name-token comparison with entity display continuation grouping only; matching names do not establish legal identity.'};
}

export async function searchMiamiBuilding({address,parentFolio,subjectFolio,get,maxRows=2000}) {
 const street=normalizeMiamiAddress(address).street, rows=[],seen=new Set(),pages=[];
 let total=null,complete=false,reason=null;
 for(let from=1;from<=maxRows;from+=200){
  const url=miamiEndpoint+'?'+new URLSearchParams({Operation:'GetAddress',clientAppName:'PropertySearch',myUnit:'',from:String(from),myAddress:street,to:String(from+199)});
  let data;try{data=parse(await get(url,'miami_neighbors_building_search'));}catch(error){reason=error.code||'source_error';break;}
  const page=data?.MinimumPropertyInfos;
  if(data?.Completed!==true||!Array.isArray(page)||!Number.isInteger(data.Total)||data.Total<0||(total!==null&&data.Total!==total)||(data.Count!==undefined&&data.Count!==page.length)||page.length>200){reason='building_search_incomplete';break;}
  total=data.Total;pages.push({from,to:from+199,row_count:page.length,url});
  let invalidRow=false;
  for(const row of page){const id=folio(row.Strap);if(!validFolio(id)||seen.has(id)){invalidRow=true;continue;}seen.add(id);rows.push({...row,folio:id});}
  if(invalidRow){reason='building_index_identity_or_duplicate';break;}
  if(rows.length===total){if(data.HasMore===true||data.HasNextPage===true){reason='building_search_more_flag';break;}complete=true;break;}
  if(rows.length>total||page.length===0||page.length<200){reason='building_search_incomplete';break;}
 }
 if(!complete&&!reason)reason='building_index_cap';
 // Index rows are candidates only. Every returned sibling requires published detail ParentFolio verification.
 const candidates=rows.filter(row=>row.folio!==subjectFolio&&row.folio!==parentFolio&&normalizeMiamiAddress(row.SiteAddress,row.SiteUnit).street===street).map(row=>({folio:row.folio,spatial_relation:'SAME_BUILDING',index:row,provenance:{source_id:'miami_neighbors_building_search',source_path:'MinimumPropertyInfos',method:'address_index_candidate_only'}}));
 return {candidates,coverage:{status:complete?'COMPLETE':'PARTIAL',complete,index_total:total,index_rows:rows.length,candidate_count:candidates.length,self_excluded_count:rows.filter(row=>row.folio===subjectFolio).length,parent_reference_excluded_count:rows.filter(row=>row.folio===parentFolio).length,pages,reason}};
}

// This optional index assists prioritization. Its absence of exact names is never
// promoted to a negative finding about authoritative neighboring parcel owners.
export async function searchMiamiOwnerIndex({ownerNames,subjectFolio,parentFolio,candidateFolios,get,maxRows=1000}) {
 const queries=[],strictFolios=new Set();
 const queriedNames=[...new Set(ownerNames)].slice(0,2);
 for(const owner_name of queriedNames){
  const rows=[],seen=new Set(),pages=[];let total=null,complete=false,reason=null;
  for(let from=1;from<=maxRows;from+=200){
   const url=miamiEndpoint+'?'+new URLSearchParams({Operation:'GetOwners',clientAppName:'PropertySearch',from:String(from),ownerName:owner_name,to:String(from+199)});
   let data;try{data=parse(await get(url,'miami_neighbors_owner_index'));}catch(error){reason=error.code||'source_error';break;}
   const page=data?.MinimumPropertyInfos;
   // Fresh GetOwners returns Count:0 for nonempty pages; Total and actual rows
   // establish cardinality. Preserve that native sentinel rather than treating it
   // as a row count. A nonzero contradictory count still prevents trust.
   if(data?.Completed!==true||!Array.isArray(page)||!Number.isInteger(data.Total)||data.Total<0||(total!==null&&data.Total!==total)||(data.Count!==undefined&&data.Count!==0&&data.Count!==page.length)||page.length>200){reason='owner_index_incomplete';break;}
   total=data.Total;pages.push({from,to:from+199,row_count:page.length,source_count:data.Count??null,url});let invalidRow=false;
   for(const row of page){const id=folio(row.Strap);if(!validFolio(id)||seen.has(id)){invalidRow=true;continue;}seen.add(id);rows.push({...row,folio:id});}
   if(invalidRow){reason='owner_index_identity_or_duplicate';break;}
   if(rows.length===total){if(data.HasMore===true||data.HasNextPage===true){reason='owner_index_more_flag';break;}complete=true;break;}
   if(rows.length>total||page.length===0||page.length<200){reason='owner_index_incomplete';break;}
  }
  const exact=rows.filter(row=>!genericOwnerMarker(owner_name)&&ownerMatchesMiami(owner_name,ownerComparisonNames([row.Owner1,row.Owner2,row.Owner3].filter(Boolean)).comparison_names));
  const seed_verified=exact.some(row=>row.folio===subjectFolio),trusted=complete&&seed_verified;
  if(!seed_verified)reason='known_seed_missing_or_owner_not_exact';
  const ids=trusted?[...new Set(exact.map(row=>row.folio).filter(id=>id!==subjectFolio&&id!==parentFolio))]:[];
  for(const id of ids)strictFolios.add(id);
  queries.push({owner_name,status:trusted?'COMPLETE':'NOT_USED',complete,seed_verified,index_total:total,index_rows:rows.length,exact_name_rows:exact.length,indexCandidateFolios:ids,nonexact_name_rows:rows.length-exact.length,pages,reason:reason||(!complete?'owner_index_cap':null)});
 }
 const indexCandidateFolios=[...strictFolios],scope=new Set(candidateFolios),scopeCandidateFolios=indexCandidateFolios.filter(id=>scope.has(id));
 const complete=queries.length>0&&queries.every(row=>row.status==='COMPLETE')&&queriedNames.length===ownerNames.length;
 return {status:complete?'COMPLETE':queries.some(row=>row.status==='COMPLETE')?'PARTIAL':'NOT_USED',complete,queried_names:queriedNames,queries,indexCandidateFolios,scopeCandidateFolios,hasObservedMatchingOwnerNeighbor:scopeCandidateFolios.length?true:complete?false:null,note:'Exact published name-token matches in the native owner index, intersected with discovered neighbor candidates; index-only observation does not prove full neighbor ownership or legal identity.'};
}

export async function extractNeighborProperties(input,fetcher=fetch,runtime={}) {
 const {order,options}=validateNeighborInput(input),start=Date.now(),request_id=runtime.requestId||crypto.randomUUID();
 const transport=createClientTransport(fetcher,{deadline:start+120000,signal:runtime.signal,log:runtime.log});
 const warnings=[],errors=[],properties=[];
 let match={status:'SEARCH_INCOMPLETE',candidates:[]},subject=null,building={coverage:{status:'NOT_REQUESTED',complete:true},candidates:[]},geo={coverage:{status:'NOT_REQUESTED',complete:true},candidates:[]},ownerIndex={status:'NOT_NEEDED',complete:null,indexCandidateFolios:[],scopeCandidateFolios:[]},examined=0,ownerUnavailable=0,excluded=0,capReached=false,eligibleCount=0;
 const fail=(error,source_id)=>errors.push({source_id,code:error.code||'source_error',message:error.message||'County source unavailable.'});
 const finish=()=>{
  const scopeComplete=!!subject&&building.coverage.complete===true&&geo.coverage.complete===true&&!errors.length&&!capReached;
  const ownerComplete=scopeComplete&&subject.owner_comparison_complete===true&&ownerUnavailable===0;
  const proven=properties.some(row=>row.matchesSubjectOwner===true);
  const requestedProven=properties.some(row=>row.matchesRequestedOwner===true);
  const status=!subject?'UNAVAILABLE':scopeComplete&&ownerComplete?'COMPLETE':'PARTIAL';
  const coverage={status,candidate_count:eligibleCount,discovered_candidate_count:new Set([...building.candidates,...geo.candidates].map(row=>row.folio)).size,unclassified_geometry_count:geo.candidates.filter(row=>row.spatial_relation==='UNKNOWN').length,examined_count:examined,returned_count:properties.length,excluded_count:excluded,owner_unavailable_count:ownerUnavailable,cap_reached:capReached,max_candidates:options.maxCandidates,same_building:building.coverage,adjacency:geo.coverage,ownership_complete:ownerComplete,owner_index:ownerIndex};
  const result={scrap_order_id:order.scrap_order_id,address:order.address,ownerName:order.ownerName,county:order.countyName,state:'FL',status:status==='COMPLETE'?'succeeded':subject?'partial':'error',errorMessage:errors.length?errors.map(row=>row.message).join('; '):!subject?`Property resolution: ${match.status}`:'NA',NeighboringProperties:{status,subject,properties,hasMatchingOwnerNeighbors:proven?true:ownerComplete?false:null,hasRequestedOwnerNeighbors:requestedProven?true:ownerComplete?false:null,coverage,options,warnings:[...new Set(warnings)],note:'Neighbor ownership is based on current published county owner names. Matching names are not proof of legal identity; this search does not establish statewide ownership or tax clearance.'},ExtractionMetadata:{contractVersion:'2.0-neighbors',request_id,collected_at:new Date(start).toISOString(),duration_ms:Date.now()-start,county_id:order.county,status,match:{...match,raw:undefined},sources:transport.sources,errors,validation:{subject_folio_and_unit:!!subject,owner_match:subject?.matchesRequestedOwner??null,all_candidates_examined:scopeComplete},provenance:{owners:{source_id:'miami_assessment',source_path:'OwnerInfos[].Name'},parent_folio:{source_id:'miami_assessment',source_path:'PropertyInfo.ParentFolio'}}}};
  return result;
 };
 try{match=await resolveMiami(order,transport.get);if(!match.raw||!match.parcel_id)return finish();
  const raw=match.raw,id=match.parcel_id,parent=folio(raw.PropertyInfo.ParentFolio),owners=names(raw);
  const comparison=ownerComparisonNames(owners);
  subject={folio:id,...site(raw),owners,comparison_names:comparison.comparison_names,owner_comparison_complete:comparison.complete,owner_comparison_provenance:comparison.provenance,parent_folio:validFolio(parent)&&parent!==id?parent:null,matchesRequestedOwner:comparison.complete&&!genericOwnerMarker(order.ownerName)?ownerMatchesMiami(order.ownerName,comparison.comparison_names):null,geometry:null,centroid:null};
  warnings.push(...(match.notes||[]));if(!owners.length)warnings.push('Subject owner names are unavailable; a negative shared-owner conclusion is unavailable.');
 }catch(error){fail(error,'miami_assessment');return finish();}
 if(options.sameBuilding){
  if(isCondo(match.raw)&&subject.parent_folio){building=await searchMiamiBuilding({address:subject.address,parentFolio:subject.parent_folio,subjectFolio:subject.folio,get:transport.get});if(!building.coverage.complete)warnings.push('Building address index is incomplete; unobserved units may exist.');}
  else if(isCondo(match.raw))building={candidates:[],coverage:{status:'UNAVAILABLE',complete:false,reason:'Condominium detail has no usable published parent folio; same-building relationships cannot be verified.'}};
  else building={candidates:[],coverage:{status:'NOT_APPLICABLE',complete:true,reason:'No distinct published parent folio; same-building scope applies to published condominium siblings only.'}};
 }
 if(options.adjacency){try{
  geo=await discoverMiamiGeometryNeighbors({folio:subject.folio,parentFolio:subject.parent_folio,parentReference:{source_id:'miami_assessment',source_path:'PropertyInfo.ParentFolio',source_value:match.raw.PropertyInfo.ParentFolio},get:transport.get,options});
  subject.geometry=geo.subjectGeometry??null;subject.centroid=geo.subjectCentroid??null;subject.geometry_anchor_folio=geo.anchor_folio??subject.folio;subject.geometry_anchor_kind=geo.anchor_kind??'SUBJECT';warnings.push(...(geo.warnings||[]));errors.push(...(geo.errors||[]).map(error=>typeof error==='string'?{source_id:'miami_neighbors_geometry',code:'geometry_incomplete',message:error}:error));
 }catch(error){fail(error,'miami_neighbors_geometry');geo={candidates:[],coverage:{status:'UNAVAILABLE',complete:false}};}}
 const all=new Map();
 for(const candidate of [...geo.candidates,...building.candidates]){
  const id=folio(candidate.folio);if(!validFolio(id)||id===subject.folio||id===subject.parent_folio){excluded++;continue;}
  const relation=candidate.spatial_relation;
  if(!['ABUTTING','SHARED_BOUNDARY','SAME_BUILDING',...(options.includeCornerTouch?['CORNER_TOUCH']:[])].includes(relation)){excluded++;continue;}
  if(!all.has(id)||relation==='SAME_BUILDING')all.set(id,{...candidate,folio:id,...(all.has(id)?{alternative_spatial:all.get(id)}:{})});
 }
 eligibleCount=all.size;
 if(all.size>options.maxCandidates&&subject.comparison_names.length){const ownerNames=[...subject.comparison_names].sort((a,b)=>Number(ownerMatchesMiami(order.ownerName,[b]))-Number(ownerMatchesMiami(order.ownerName,[a])));ownerIndex=await searchMiamiOwnerIndex({ownerNames,subjectFolio:subject.folio,parentFolio:subject.parent_folio,candidateFolios:[...all.keys()],get:transport.get});}
 const ownerIndexFolios=new Set(ownerIndex.scopeCandidateFolios);
 const priority=candidate=>{const indexed=ownerComparisonNames([candidate.index?.Owner1,candidate.index?.Owner2,candidate.index?.Owner3].filter(Boolean)).comparison_names;return ownerIndexFolios.has(candidate.folio)?3:!genericOwnerMarker(order.ownerName)&&ownerMatchesMiami(order.ownerName,indexed)?2:subject.comparison_names.some(name=>ownerMatchesMiami(name,indexed))?1:0;};
 const candidates=[...all.values()].sort((a,b)=>priority(b)-priority(a)),limited=candidates.slice(0,options.maxCandidates);capReached=candidates.length>limited.length;
 if(capReached)warnings.push('Candidate detail cap reached; remaining county candidates were not examined. No negative ownership conclusion is available.');
 let next=0;
 async function worker(){while(next<limited.length){const candidate=limited[next++];examined++;
  try{const raw=parse(await transport.get(detailUrl(candidate.folio),'miami_neighbors_detail'));
   if(raw?.Completed!==true||folio(raw?.PropertyInfo?.FolioNumber)!==candidate.folio)throw Object.assign(new Error('Neighbor detail was incomplete or returned a different folio.'),{code:'neighbor_identity_mismatch'});
   let verifiedSpatial=candidate;
   if(candidate.spatial_relation==='SAME_BUILDING'&&!validFolio(folio(raw.PropertyInfo.ParentFolio)))throw Object.assign(new Error('County sibling detail has no usable published parent folio; its same-building relationship is unavailable.'),{code:'neighbor_parent_unavailable'});
   if(candidate.spatial_relation==='SAME_BUILDING'&&folio(raw.PropertyInfo.ParentFolio)!==subject.parent_folio){if(candidate.alternative_spatial)verifiedSpatial=candidate.alternative_spatial;else{excluded++;continue;}}
   if(verifiedSpatial.spatial_relation==='SAME_BUILDING'&&!(raw.SiteAddress||[]).some(row=>normalizeMiamiAddress(sourceAddress(row),row.Unit).street===normalizeMiamiAddress(subject.address).street))throw Object.assign(new Error('County sibling detail does not confirm the subject street; same-building scope is unavailable.'),{code:'neighbor_address_mismatch'});
   const candidateOwners=names(raw);if(!ownerComparisonNames(candidateOwners).complete)ownerUnavailable++;
   const source=transport.sources.filter(row=>row.id==='miami_neighbors_detail'&&new URL(row.url).searchParams.get('folioNumber')===candidate.folio).at(-1);
   properties.push({folio:candidate.folio,...site(raw),owners:candidateOwners,geometry:verifiedSpatial.spatial_relation==='SAME_BUILDING'?null:verifiedSpatial.geometry??null,centroid:verifiedSpatial.centroid??null,spatial_relation:verifiedSpatial.spatial_relation,...compareNeighborOwners(order.ownerName,subject.owners,candidateOwners),provenance:{spatial:verifiedSpatial.provenance??verifiedSpatial.evidence??null,owners:{source_id:'miami_neighbors_detail',source_path:'OwnerInfos[].Name',source_url:source?.url,sha256:source?.sha256},parent_folio:{source_id:'miami_neighbors_detail',source_path:'PropertyInfo.ParentFolio',source_value:raw.PropertyInfo.ParentFolio??null},source_url:source?.url}});
  }catch(error){fail(error,'miami_neighbors_detail');}
 }}
 await Promise.all([worker(),worker()]);properties.sort((a,b)=>a.folio.localeCompare(b.folio));return finish();
}
export const neighborLookup=extractNeighborProperties;
