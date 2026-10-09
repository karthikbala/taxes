// GIS topology is a discovery aid, not a legal boundary survey. No model/provider calls.
export const MIAMI_PARCEL_LAYER = 'https://gisweb.miamidade.gov/arcgis/rest/services/CAD911/MapServer/22';
const SOURCE_ID = 'miami_parcel_gis';
const EARTH_RADIUS = 6371008.8, RAD = Math.PI / 180;
const folio = value => /^\d{13}$/.test(String(value ?? '').replaceAll('-', '')) ? String(value).replaceAll('-', '') : null;
const pointDistance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const edges = ring => ring.slice(0,-1).map((p,i)=>[p,ring[i+1]]);
function pointSegment(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
  return pointDistance(p,[a[0]+t*dx,a[1]+t*dy]);
}
function properIntersection(a,b,c,d) {
  const x=cross(a,b,c),y=cross(a,b,d),u=cross(c,d,a),v=cross(c,d,b);
  return x*y < -1e-12 && u*v < -1e-12;
}
function segmentDistance(a,b,c,d) {
  if(properIntersection(a,b,c,d))return 0;
  return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
function strictInside(p,ring,tolerance) {
  if(edges(ring).some(([a,b])=>pointSegment(p,a,b)<=tolerance))return false;
  let inside=false;
  for(const [a,b] of edges(ring))if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  return inside;
}
function sharedLength(a,b,c,d,tolerance) {
  const length=pointDistance(a,b);if(length<=tolerance)return 0;
  // Both candidate endpoints must lie on the same infinite line; never bridge a street.
  if(Math.abs(cross(a,b,c))/length>tolerance||Math.abs(cross(a,b,d))/length>tolerance)return 0;
  const unit=[(b[0]-a[0])/length,(b[1]-a[1])/length];
  const position=p=>(p[0]-a[0])*unit[0]+(p[1]-a[1])*unit[1];
  return Math.max(0,Math.min(length,Math.max(position(c),position(d)))-Math.max(0,Math.min(position(c),position(d))));
}
function validatedRing(geometry) {
  if(geometry?.type!=='Polygon'||geometry.coordinates?.length!==1)return {error:'Holes and multipart geometry require independent topology support.'};
  const ring=geometry.coordinates[0];
  if(!Array.isArray(ring)||ring.length<4||ring.some(p=>!Array.isArray(p)||p.length<2||!p.slice(0,2).every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90))return {error:'Invalid geographic polygon coordinates.'};
  if(ring.length>500)return {error:'Polygon exceeds the 500 vertex topology work bound.'};
  if(pointDistance(ring[0],ring.at(-1))>1e-10)return {error:'Polygon ring is not closed.'};
  if(new Set(ring.slice(0,-1).map(p=>`${p[0]},${p[1]}`)).size!==ring.length-1)return {error:'Polygon ring repeats a non-closing vertex.'};
  return {ring};
}
function projection(origin) {
  const lonScale=RAD*EARTH_RADIUS*Math.cos(origin[1]*RAD),latScale=RAD*EARTH_RADIUS;
  return {project:p=>[(p[0]-origin[0])*lonScale,(p[1]-origin[1])*latScale],unproject:p=>[origin[0]+p[0]/lonScale,origin[1]+p[1]/latScale],lonScale,latScale};
}
function interiorOverlap(a,b,tolerance) {
  if(a.slice(0,-1).some(p=>strictInside(p,b,tolerance))||b.slice(0,-1).some(p=>strictInside(p,a,tolerance)))return true;
  // Interior probes also detect identical and boundary-aligned containment polygons.
  for(const [ring,other] of [[a,b],[b,a]])for(const [u,v] of edges(ring)) {
    const length=pointDistance(u,v);if(length<=4*tolerance)continue;
    const offset=Math.max(tolerance*2,0.001),mid=[(u[0]+v[0])/2,(u[1]+v[1])/2];
    for(const sign of [-1,1]) {
      const p=[mid[0]+sign*(v[1]-u[1])/length*offset,mid[1]-sign*(v[0]-u[0])/length*offset];
      if(strictInside(p,ring,tolerance)&&strictInside(p,other,tolerance))return true;
    }
  }
  return false;
}
export function classifyParcelRelation(subject,candidate,{toleranceMeters=0.1,minSharedEdgeMeters=0.5,maxSpanMeters=200}={}) {
  if(!(toleranceMeters>0&&toleranceMeters<=0.1&&minSharedEdgeMeters>=0.5&&maxSpanMeters>0&&maxSpanMeters<=200))throw new RangeError('Spatial safeguards cannot be relaxed beyond the reviewed bounds.');
  const a=validatedRing(subject),b=validatedRing(candidate);
  const unknown=reason=>({relation:'UNKNOWN',distance_m:null,shared_edge_m:null,limitations:[reason]});
  if(a.error||b.error)return unknown(a.error||b.error);
  const project=projection(a.ring[0]).project,ar=a.ring.map(project),br=b.ring.map(project);
  if([...ar,...br].some(p=>Math.hypot(...p)>maxSpanMeters))return unknown('Geometry exceeds the 200 metre local projection scope.');
  for(const ring of [ar,br]) {
    const area=edges(ring).reduce((sum,[p,q])=>sum+p[0]*q[1]-q[0]*p[1],0);
    if(Math.abs(area)<0.001)return unknown('Degenerate polygon ring.');
    const es=edges(ring);
    if(es.some(([p,q],i)=>es.some(([u,v],j)=>j>i+1&&!(i===0&&j===es.length-1)&&segmentDistance(p,q,u,v)<1e-7)))return unknown('Self-intersecting or self-touching polygon ring.');
  }
  let distance=Infinity,shared=0,intersection=false;
  for(const [p,q] of edges(ar))for(const [u,v] of edges(br)) {
    distance=Math.min(distance,segmentDistance(p,q,u,v));shared+=sharedLength(p,q,u,v,toleranceMeters);
    intersection ||= properIntersection(p,q,u,v);
  }
  const overlap=intersection||interiorOverlap(ar,br,toleranceMeters);
  const relation=overlap?'OVERLAP':shared>=minSharedEdgeMeters?'ABUTTING':distance<=toleranceMeters?(shared>toleranceMeters?'BOUNDARY_TOUCH':'CORNER_TOUCH'):'NEARBY';
  return {relation,distance_m:overlap?0:distance,shared_edge_m:shared,limitations:[]};
}
function asGeoJSON(raw,spatialReference) {
  const sr=raw?.spatialReference||spatialReference;
  if(!sr||![4326].includes(sr.latestWkid||sr.wkid))return {error:'GIS response did not confirm geographic outSR=4326.'};
  if(!Array.isArray(raw?.rings))return {error:'GIS parcel polygon is unavailable.'};
  return {geometry:{type:'Polygon',coordinates:structuredClone(raw.rings)}};
}
const queryURL=params=>{const url=new URL(`${MIAMI_PARCEL_LAYER}/query`);for(const [key,value]of Object.entries({f:'json',...params}))url.searchParams.set(key,String(value));return url.href;};
function error(code,message){return Object.assign(new Error(message),{code});}
export async function discoverMiamiGeometryNeighbors({folio:subjectFolio,parentFolio,parentReference,get,options={}}) {
  const subject=folio(subjectFolio),parent=folio(parentFolio);
  const maxCandidates=options.maxCandidates??100,pageSize=options.pageSize??50,bufferMeters=options.bufferMeters??5;
  if(!subject||typeof get!=='function')throw error('invalid_gis_input','A verified 13-digit subject folio and transport are required.');
  if(!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>100||!Number.isInteger(pageSize)||pageSize<1||pageSize>100||!(bufferMeters>=0&&bufferMeters<=5))throw error('invalid_gis_bounds','GIS search must remain within 100 candidates and five metres.');
  const result={subject_folio:subject,anchor_folio:null,anchor_kind:null,subjectGeometry:null,subjectCentroid:null,candidates:[],coverage:{status:'UNAVAILABLE',complete:false},sources:[],warnings:['GIS boundary classification is approximate and is not a legal survey.'],errors:[]};
  async function query(params,suffix) {
    const url=queryURL(params),id=`${SOURCE_ID}_${suffix}`,raw=await get(url,id,{},{});
    let data;try{data=typeof raw==='string'?JSON.parse(raw):raw;}catch{throw error('source_response_invalid','GIS returned invalid JSON.');}
    result.sources.push({id,url});
    if(!data||typeof data!=='object'||data.error)throw error('gis_source_error',data?.error?.message||'GIS query failed.');
    return {data,id,url};
  }
  async function anchorLookup(id,suffix) {
    const response=await query({where:`FOLIO='${id}'`,outFields:'*',returnGeometry:true,outSR:4326},suffix),{data}=response;
    if(!Array.isArray(data.features)||data.exceededTransferLimit)return {error:'GIS exact-folio response is incomplete.'};
    if(data.features.some(feature=>folio(feature.attributes?.FOLIO)!==id))throw error('identity_mismatch','GIS exact lookup returned a different folio.');
    if(data.features.length>1)return {error:'GIS returned multiple geometry records for the exact folio.'};
    if(!data.features.length)return {missing:true,response};
    const feature=data.features[0],converted=asGeoJSON(feature.geometry,data.spatialReference);
    return {...converted,feature,response,missing:!feature.geometry};
  }
  let anchor=await anchorLookup(subject,'subject');
  if(anchor.missing&&parent&&parent!==subject) {
    if(parentReference?.source_id&&parentReference?.source_path&&folio(parentReference.source_value)===parent) {
      anchor=await anchorLookup(parent,'parent');result.anchor_kind='PUBLISHED_PARENT';
      result.parent_reference=structuredClone(parentReference);
    }else result.warnings.push('Parent geometry was not queried without a published folio cross-reference.');
  }
  if(anchor.missing){result.coverage.status='GEOMETRY_UNAVAILABLE';return result;}
  if(anchor.error){result.coverage.status='GEOMETRY_UNAVAILABLE';result.errors.push(anchor.error);return result;}
  result.anchor_folio=folio(anchor.feature.attributes.FOLIO);result.anchor_kind||='SUBJECT';
  result.subjectGeometry=anchor.geometry;result.anchor_attributes=structuredClone(anchor.feature.attributes);
  result.provenance={source_id:anchor.response.id,source_url:anchor.response.url,source_path:'features[0].geometry',anchor_folio:result.anchor_folio,outSR:4326};
  const valid=validatedRing(anchor.geometry);
  if(valid.error){result.coverage.status='GEOMETRY_UNSUPPORTED';result.errors.push(valid.error);return result;}
  const validity=classifyParcelRelation(anchor.geometry,anchor.geometry);
  if(validity.relation==='UNKNOWN'){result.coverage.status='GEOMETRY_UNSUPPORTED';result.errors.push(...validity.limitations);return result;}
  const p=projection(valid.ring[0]),ring=valid.ring.map(p.project),xs=ring.map(v=>v[0]),ys=ring.map(v=>v[1]);
  if(Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))>200){result.coverage.status='GEOMETRY_UNSUPPORTED';result.errors.push('Anchor exceeds local projection scope.');return result;}
  const signedArea2=edges(ring).reduce((sum,[a,b])=>sum+a[0]*b[1]-b[0]*a[1],0);
  if(Math.abs(signedArea2)<0.001){result.coverage.status='GEOMETRY_UNSUPPORTED';result.errors.push('Anchor polygon is degenerate.');return result;}
  const center=edges(ring).reduce((sum,[a,b])=>{const weight=a[0]*b[1]-b[0]*a[1];return [sum[0]+(a[0]+b[0])*weight,sum[1]+(a[1]+b[1])*weight];},[0,0]);
  result.subjectCentroid=p.unproject(center.map(value=>value/(3*signedArea2)));
  const lower=p.unproject([Math.min(...xs)-bufferMeters,Math.min(...ys)-bufferMeters]),upper=p.unproject([Math.max(...xs)+bufferMeters,Math.max(...ys)+bufferMeters]);
  const envelope={xmin:lower[0],ymin:lower[1],xmax:upper[0],ymax:upper[1],spatialReference:{wkid:4326}};
  const spatial={where:'1=1',geometry:JSON.stringify(envelope),geometryType:'esriGeometryEnvelope',inSR:4326,spatialRel:'esriSpatialRelIntersects'};
  const idsResponse=await query({...spatial,returnIdsOnly:true},'candidate_ids');
  const countResponse=await query({...spatial,returnCountOnly:true},'candidate_count');
  const ids=idsResponse.data.objectIds, count=countResponse.data.count,oidField=idsResponse.data.objectIdFieldName||'OBJECTID';
  if(!Array.isArray(ids)||ids.some(id=>!Number.isSafeInteger(id))||!Number.isSafeInteger(count)||count<0||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(oidField))throw error('source_response_invalid','GIS candidate identity/count evidence is invalid.');
  const uniqueIds=[...new Set(ids)].sort((a,b)=>a-b),selected=uniqueIds.slice(0,maxCandidates),seen=new Map();
  let complete=count===uniqueIds.length&&ids.length===uniqueIds.length&&!idsResponse.data.exceededTransferLimit&&count<=maxCandidates;
  result.coverage={status:'SEARCH_INCOMPLETE',complete:false,candidate_count:count,requested_object_ids:selected,max_candidates:maxCandidates,buffer_m:bufferMeters};
  for(let offset=0;offset<selected.length;offset+=pageSize) {
    const pageIds=selected.slice(offset,offset+pageSize);
    const response=await query({objectIds:pageIds.join(','),outFields:'*',returnGeometry:true,outSR:4326},`candidate_page_${offset/pageSize+1}`);
    if(!Array.isArray(response.data.features))throw error('source_response_invalid','GIS candidate page has no features array.');
    if(response.data.exceededTransferLimit)complete=false;
    const returnedIds=[];
    for(const feature of response.data.features) {
      const id=feature.attributes?.[oidField],candidateFolio=folio(feature.attributes?.FOLIO);
      if(!pageIds.includes(id))throw error('identity_mismatch','GIS candidate page returned an unrequested object identity.');
      if(returnedIds.includes(id)||seen.has(id)){complete=false;continue;}
      returnedIds.push(id);seen.set(id,feature);
      if(!candidateFolio){complete=false;result.errors.push(`Object ${id} has no valid folio.`);continue;}
      if([subject,parent,result.anchor_folio].includes(candidateFolio))continue;
      const converted=asGeoJSON(feature.geometry,response.data.spatialReference);
      const metrics=converted.error?{relation:'UNKNOWN',distance_m:null,shared_edge_m:null,limitations:[converted.error]}:classifyParcelRelation(anchor.geometry,converted.geometry);
      result.candidates.push({folio:candidateFolio,object_id:id,geometry:converted.geometry||null,attributes:structuredClone(feature.attributes),spatial_relation:metrics.relation,metrics,provenance:{source_id:response.id,source_url:response.url,source_path:`features[${response.data.features.indexOf(feature)}]`,outSR:4326,anchor_folio:result.anchor_folio}});
      if(metrics.relation==='UNKNOWN')complete=false;
    }
    if(returnedIds.length!==pageIds.length)complete=false;
  }
  if(seen.size!==selected.length)complete=false;
  // Distinct GIS object IDs for one folio remain evidence, but never duplicate neighbours.
  const byFolio=new Map();
  for(const candidate of result.candidates) {
    if(byFolio.has(candidate.folio)){complete=false;result.warnings.push(`Duplicate GIS folio ${candidate.folio} requires review.`);continue;}
    byFolio.set(candidate.folio,candidate);
  }
  result.candidates=[...byFolio.values()];result.coverage.complete=complete;
  result.coverage.status=complete?'COMPLETE':'SEARCH_INCOMPLETE';
  result.coverage.returned_object_count=seen.size;
  return result;
}
