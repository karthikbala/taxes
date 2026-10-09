import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyParcelRelation,discoverMiamiGeometryNeighbors,MIAMI_PARCEL_LAYER} from '../lib/client/neighbors-geo.mjs';

// Synthetic independently described metre-space parcels at the equator. One degree
// is ~111195.08 metres here; results allow roundoff, not a widened adjacency threshold.
const degree=1/111195.08;
const polygon=points=>({type:'Polygon',coordinates:[points.map(([x,y])=>[x*degree,y*degree])]});
const square=(x,y,size=10)=>polygon([[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]);
const subject=square(0,0),SUBJECT='0132310520010',PARENT='0132310520001';
const feature=(id,parcel,geometry=subject)=>({attributes:{OBJECTID:id,FOLIO:parcel,ADDRESS:'SOURCE ADDRESS'},geometry:{rings:geometry.coordinates}});
const json=features=>({spatialReference:{wkid:4326},features});
const parcel=id=>`013231052${String(id).padStart(4,'0')}`;
const relation=(candidate,options)=>classifyParcelRelation(subject,candidate,options);

test('whole and partial shared edges are abutting with independent lengths',()=>{
  const a=relation(square(10,0)),b=relation(square(10,5));
  assert.equal(a.relation,'ABUTTING');assert.ok(Math.abs(a.shared_edge_m-10)<0.001);
  assert.equal(b.relation,'ABUTTING');assert.ok(Math.abs(b.shared_edge_m-5)<0.001);
  assert.equal(relation(polygon([[10,0],[20,0],[20,10],[10,10],[10,5],[10,0]])).relation,'ABUTTING');
});
test('corner contact is distinct from a shared edge and street gap is nearby',()=>{
  assert.equal(relation(square(10,10)).relation,'CORNER_TOUCH');
  const acrossStreet=relation(square(13,0));assert.equal(acrossStreet.relation,'NEARBY');
  assert.ok(Math.abs(acrossStreet.distance_m-3)<0.001);assert.equal(acrossStreet.shared_edge_m,0);
  assert.equal(relation(square(10.2,0)).relation,'NEARBY');
});
test('interior crossing, containment, identical polygons are overlap, not adjacency',()=>{
  for(const candidate of [square(5,5),square(1,1,2),square(-1,-1,12),square(0,0)])assert.equal(relation(candidate).relation,'OVERLAP');
  assert.equal(relation(polygon([[5,-5],[15,5],[5,15],[-5,5],[5,-5]])).relation,'OVERLAP');
  assert.equal(relation(square(10,0.0)).relation,'ABUTTING');
});
test('ring direction and collinear subdivisions preserve topology',()=>{
  const reversed=structuredClone(subject);reversed.coordinates[0].reverse();
  assert.equal(classifyParcelRelation(reversed,square(10,0)).relation,'ABUTTING');
  const concave=polygon([[10,0],[20,0],[20,10],[15,10],[15,5],[10,5],[10,0]]);
  assert.equal(relation(concave).relation,'ABUTTING');
});
test('unsupported holes/multipart, large scope and invalid rings are unknown',()=>{
  const holes=structuredClone(subject);holes.coordinates.push(square(1,1,1).coordinates[0]);
  for(const candidate of [holes,{type:'MultiPolygon',coordinates:[subject.coordinates]},square(250,0),polygon([[0,0],[10,10],[0,10],[10,0],[0,0]]),{type:'Polygon',coordinates:[[[0,0],[NaN,0],[0,1],[0,0]]]}])assert.equal(relation(candidate).relation,'UNKNOWN');
  assert.throws(()=>relation(subject,{toleranceMeters:1}),RangeError);
  assert.throws(()=>relation(subject,{minSharedEdgeMeters:0.1}),RangeError);
  assert.equal(relation(polygon([[0,0],[10,0],[10,10],[5,5],[0,10],[5,5],[0,0]])).relation,'UNKNOWN');
});

test('fresh 9 October county GIS coordinates distinguish published shared boundary from nearby gap',()=>{
  // Official CAD911/MapServer/22 outSR=4326, retrieved 2026-10-09.
  // Anchor FOLIO 0132310520001 and neighbour 0132310060210 publish the same
  // three boundary vertices in opposite directions. Parcel 0132310100010
  // is separated despite intersecting the bounded discovery envelope.
  const anchor={type:'Polygon',coordinates:[[
    [-80.18596100299999,25.790335361000075],[-80.18596301799994,25.79057307200003],
    [-80.18542568199996,25.790577024000072],[-80.18544243199995,25.789798114000064],
    [-80.18589884899995,25.789781383000047],[-80.18590785699996,25.789781708000078],
    [-80.18591669299997,25.78978333400005],[-80.18592512399994,25.789786218000074],
    [-80.18593293999999,25.789790287000073],[-80.18593993699994,25.78979543500003],
    [-80.18594593199998,25.789801530000034],[-80.18595077399993,25.789808416000028],
    [-80.18595433599995,25.78981591400003],[-80.18595652799996,25.789823830000046],
    [-80.18595729299994,25.78983196200005],[-80.18595862999996,25.790055478000056],
    [-80.18596100299999,25.790335361000075]
  ]]};
  const abutting={type:'Polygon',coordinates:[[
    [-80.18596100299999,25.790335361000075],[-80.18595862999996,25.790055478000056],
    [-80.18600734399996,25.790056528000036],[-80.18660542299995,25.79004203200003],
    [-80.18689571399995,25.790034994000052],[-80.18690551499998,25.790304916000025],
    [-80.18691471399995,25.790558186000055],[-80.18596310599997,25.790587800000026],
    [-80.18596301799994,25.79057307200003],[-80.18596100299999,25.790335361000075]
  ]]};
  const nearby={type:'Polygon',coordinates:[[
    [-80.18600734399996,25.790056528000036],[-80.18599990399997,25.78977309000004],
    [-80.18659182299996,25.78974739100005],[-80.18660542299995,25.79004203200003],
    [-80.18600734399996,25.790056528000036]
  ]]};
  const edge=classifyParcelRelation(anchor,abutting),gap=classifyParcelRelation(anchor,nearby);
  assert.equal(edge.relation,'ABUTTING');assert.ok(edge.shared_edge_m>57&&edge.shared_edge_m<58);
  assert.equal(gap.relation,'NEARBY');assert.ok(gap.distance_m>4&&gap.distance_m<5);assert.equal(gap.shared_edge_m,0);
});

function transport({anchor=feature(1,SUBJECT),features=[feature(1,SUBJECT),feature(2,parcel(2),square(10,0)),feature(3,parcel(3),square(13,0))],ids=features.map(f=>f.attributes.OBJECTID),count=ids.length,mutatePage,subjectMissing=false}={}) {
  const calls=[];
  const get=async(url,id)=>{
    const u=new URL(url),q=u.searchParams;calls.push({url,id});
    assert.equal(u.origin+u.pathname,MIAMI_PARCEL_LAYER+'/query');
    if(q.get('returnIdsOnly')==='true')return JSON.stringify({objectIdFieldName:'OBJECTID',objectIds:ids});
    if(q.get('returnCountOnly')==='true')return JSON.stringify({count});
    if(q.has('where')&&q.get('where')!=='1=1')return JSON.stringify(json(subjectMissing&&q.get('where').includes(SUBJECT)?[]:[anchor]));
    assert.equal(q.get('outSR'),'4326');
    const pageIds=q.get('objectIds').split(',').map(Number),data=json(features.filter(f=>pageIds.includes(f.attributes.OBJECTID)));
    return JSON.stringify(mutatePage?mutatePage(data,pageIds):data);
  };
  return {get,calls};
}
const discover=(mock,extras={})=>discoverMiamiGeometryNeighbors({folio:SUBJECT,get:mock.get,...extras});

test('bounded object-ID pages, exact folio and outSR preserve geometry and field evidence',async()=>{
  const mock=transport(),result=await discover(mock,{options:{pageSize:1}});
  assert.equal(result.coverage.status,'COMPLETE');assert.equal(result.coverage.complete,true);
  assert.deepEqual(result.candidates.map(c=>c.spatial_relation),['ABUTTING','NEARBY']);
  assert.deepEqual(result.subjectGeometry,subject);assert.deepEqual(result.candidates[0].geometry,square(10,0));
  assert.equal(result.candidates[0].attributes.ADDRESS,'SOURCE ADDRESS');
  assert.ok(result.candidates[0].provenance.source_url.includes('outSR=4326'));
  assert.equal(new URL(mock.calls[0].url).searchParams.get('where'),`FOLIO='${SUBJECT}'`);
  assert.equal(new URL(mock.calls[0].url).searchParams.get('outSR'),'4326');
  const spatial=new URL(mock.calls[1].url).searchParams;assert.equal(spatial.get('inSR'),'4326');
  const bounds=JSON.parse(spatial.get('geometry'));assert.ok(Math.abs(bounds.xmin/degree+5)<0.001);
  assert.equal(mock.calls.filter(call=>new URL(call.url).searchParams.has('objectIds')).length,3);
});
test('parent anchor requires a published exact folio cross-reference; subject/parent excluded',async()=>{
  const mock=transport({subjectMissing:true,anchor:feature(1,PARENT),features:[feature(1,PARENT),feature(2,SUBJECT),feature(3,parcel(3),square(10,0))]});
  const result=await discover(mock,{parentFolio:PARENT,parentReference:{source_id:'miami_appraiser',source_path:'PropertyInfo.ParentFolio',source_value:PARENT}});
  assert.equal(result.anchor_kind,'PUBLISHED_PARENT');assert.equal(result.anchor_folio,PARENT);
  assert.deepEqual(result.candidates.map(c=>c.folio),[parcel(3)]);assert.equal(result.coverage.complete,true);
  for(const parentReference of [undefined,{source_id:'x',source_path:'p',source_value:parcel(9)}]) {
    const noEvidence=transport({subjectMissing:true,anchor:feature(1,PARENT)});
    assert.equal((await discover(noEvidence,{parentFolio:PARENT,parentReference})).coverage.status,'GEOMETRY_UNAVAILABLE');
    assert.equal(noEvidence.calls.length,1);
  }
});
test('wrong returned exact folio is rejected, rather than substituted for the subject',async()=>{
  await assert.rejects(discover(transport({anchor:feature(1,parcel(7))})),e=>e.code==='identity_mismatch');
});
test('count mismatch, omitted pages, transfer truncation and repeated object IDs remain incomplete',async()=>{
  const mocks=[transport({count:4}),transport({ids:[1,2,2,3]}),transport({mutatePage:data=>({...data,features:data.features.filter(f=>f.attributes.OBJECTID!==2)})}),transport({mutatePage:data=>({...data,exceededTransferLimit:true})}),transport({mutatePage:data=>({...data,features:[...data.features,data.features[0]]})})];
  for(const mock of mocks){const result=await discover(mock);assert.equal(result.coverage.complete,false);assert.equal(result.coverage.status,'SEARCH_INCOMPLETE');}
});
test('candidate cap preserves bounded partial results and never reports an empty complete search',async()=>{
  const features=Array.from({length:101},(_,i)=>feature(i+1,parcel(i+1),square(10,0)));
  const mock=transport({features}),result=await discover(mock);
  assert.equal(result.coverage.candidate_count,101);assert.equal(result.coverage.complete,false);
  assert.equal(result.coverage.returned_object_count,100);assert.equal(result.candidates.length,99);
  assert.equal(result.coverage.requested_object_ids.length,100);
});
test('wrong candidate object identity is rejected and unconfirmed output projection is unknown',async()=>{
  await assert.rejects(discover(transport({mutatePage:data=>({...data,features:[feature(999,parcel(7))]})})),e=>e.code==='identity_mismatch');
  const result=await discover(transport({mutatePage:data=>({...data,spatialReference:{wkid:102100}})}));
  assert.equal(result.coverage.complete,false);assert.ok(result.candidates.every(c=>c.spatial_relation==='UNKNOWN'&&c.geometry===null));
});
test('distinct objects for one folio are deduplicated with explicit incomplete evidence',async()=>{
  const result=await discover(transport({features:[feature(2,parcel(2),square(10,0)),feature(3,parcel(2),square(10,0))]}));
  assert.equal(result.candidates.length,1);assert.equal(result.coverage.complete,false);
  assert.ok(result.warnings.some(message=>message.includes('Duplicate GIS folio')));
});
test('inspected zero candidates is complete only when IDs and count both establish zero',async()=>{
  const result=await discover(transport({features:[]}));assert.equal(result.coverage.complete,true);assert.deepEqual(result.candidates,[]);
  const wrong=await discover(transport({features:[],count:1}));assert.equal(wrong.coverage.complete,false);
});
test('source errors and malformed evidence fail explicitly without fallback',async()=>{
  await assert.rejects(discoverMiamiGeometryNeighbors({folio:SUBJECT,get:async()=>'{invalid'}),e=>e.code==='source_response_invalid');
  await assert.rejects(discoverMiamiGeometryNeighbors({folio:SUBJECT,get:async()=>JSON.stringify({error:{message:'Unavailable'}})}),e=>e.code==='gis_source_error');
  await assert.rejects(discover(transport(),{options:{maxCandidates:101}}),e=>e.code==='invalid_gis_bounds');
});
