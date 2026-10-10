import test from 'node:test';
import assert from 'node:assert/strict';
import {neighborPresentation, ownerCategory, safeSourceUrl, geometryRings, mapLayout, renderNeighbors} from '../public/neighbors-render.mjs';
import {initNeighbors} from '../public/neighbors.js';

// A small DOM fixture exercises emitted semantics/events without a browser or
// dependency. County fixture shapes and names below are synthetic presentation
// cases, not live Miami-Dade results or evidence of property ownership.
class Node {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.textContent = ''; this.className = '';
    this.classList = {toggle: (name, selected) => { const names = new Set(this.className.split(' ').filter(Boolean)); selected ? names.add(name) : names.delete(name); this.className = [...names].join(' '); }};
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; this.textContent = ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'class') this.className = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  emit(name, event = {}) { return this.listeners[name]?.(event); }
  getBoundingClientRect() { return {width: 1000, height: 600}; }
}
const document = {createElement: tag => new Node(tag), createElementNS: (_, tag) => new Node(tag)};
const descendants = node => [node, ...node.children.flatMap(descendants)];
const content = node => descendants(node).map(n => n.textContent).join('\n');
const polygon = (x, y) => ({type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]]});
const fixture = () => ({NeighboringProperties: {
  subject: {folio: 'S', address: '10 Example Lane', owners: ['A & B TRUST'], geometry: polygon(0, 0), matchesRequestedOwner: true},
  properties: [
    {folio: 'A', address: '<img src=x onerror=alert(1)>', owners: ['A & B TRUST'], geometry: polygon(1, 0), spatial_relation: 'SHARED_BOUNDARY', ownership_relation: 'SAME_OWNER_SET', matchesRequestedOwner: true, matchesSubjectOwner: true, provenance: [{url: 'https://county.example/parcel/A'}]},
    {folio: 'B', address: '20 Example Lane', owners: ['COOWNER'], geometry: polygon(0, 1), spatial_relation: 'CORNER_TOUCH', ownership_relation: 'SHARED_OWNER', matchesRequestedOwner: false, matchesSubjectOwner: true},
    {folio: 'C', address: 'Unit 5', unit: '5', owners: ['OTHER'], geometry: polygon(0, 0), spatial_relation: 'SAME_BUILDING', ownership_relation: 'DIFFERENT_OWNER', matchesRequestedOwner: false, matchesSubjectOwner: false, provenance: [{url: 'javascript:alert(1)'}]},
    {folio: 'D', address: '30 Example Lane', owners: [], spatial_relation: 'SHARED_BOUNDARY', ownership_relation: 'OWNER_UNAVAILABLE', matchesRequestedOwner: null, matchesSubjectOwner: null},
  ], hasMatchingOwnerNeighbors: true, coverage: {status: 'PARTIAL', candidate_count: 4, examined_count: 4, returned_count: 4, cap_reached: false}, warnings: ['One owner record unavailable.'],
}, ExtractionMetadata: {sources: [{id: 'parcel-layer', status: 'retrieved', url: 'https://county.example/parcels'}, {id: 'untrusted', url: 'data:text/html,attack'}]}});

test('positive matches distinguish requested-owner and subject-coowner records', () => {
  const view = neighborPresentation(fixture());
  assert.equal(view.matching.length, 2); assert.equal(view.units.length, 1); assert.equal(view.spatial.length, 3);
  assert.equal(ownerCategory(view.properties[0]), 'requested'); assert.equal(ownerCategory(view.properties[1]), 'coowner');
  assert.equal(ownerCategory(view.properties[2]), 'different'); assert.equal(ownerCategory(view.properties[3]), 'unknown');
  assert.match(view.message, /2 returned parcels share an owner name/); assert.equal(view.unknownCount, 1);
});

test('absence conclusion requires complete scope, explicit false and no unknown owners', () => {
  const complete = {properties: [], hasMatchingOwnerNeighbors: false, coverage: {status: 'COMPLETE', cap_reached: false}};
  assert.match(neighborPresentation(complete).message, /completed search scope/);
  for (const result of [{...complete, coverage: {status: 'PARTIAL'}}, {...complete, coverage: {status: 'UNAVAILABLE'}}, {...complete, coverage: {status: 'COMPLETE', cap_reached: true}}, {...complete, hasMatchingOwnerNeighbors: null}, {...complete, properties: [{owners: [], ownership_relation: 'OWNER_UNAVAILABLE'}]}]) assert.match(neighborPresentation(result).message, /not proof of no matches/);
});

test('source anchors allow absolute HTTPS only and reject executable/credential URLs', () => {
  assert.equal(safeSourceUrl('https://county.example/a?folio=1'), 'https://county.example/a?folio=1');
  for (const value of ['javascript:alert(1)', 'data:text/html,attack', 'http://county.example/a', '//county.example/a', '/parcel/a', 'https://user:secret@county.example/a', null, {}]) assert.equal(safeSourceUrl(value), null);
});

test('map uses finite polygon boundaries including holes; no fabricated centroid outlines', () => {
  assert.equal(geometryRings(polygon(0, 0)).length, 1);
  assert.equal(geometryRings({type: 'Point', coordinates: [0, 0]}).length, 0);
  assert.equal(geometryRings({type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, NaN], [0, 0]]]}).length, 0);
  const shape = polygon(0, 0); shape.coordinates.push([[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.2]]);
  const paths = mapLayout([{folio: 'one', geometry: shape}, {folio: 'two', centroid: [1, 1]}]);
  assert.equal(paths.length, 1); assert.equal(paths[0].path.split('M').length - 1, 2); assert.doesNotMatch(paths[0].path, /NaN|Infinity/);
});

test('render preserves source text, separates condo units and supports keyboard selection/filter', () => {
  const parent = new Node('section'); renderNeighbors(document, parent, fixture());
  const nodes = descendants(parent), paths = nodes.filter(n => n.tagName === 'path'), anchors = nodes.filter(n => n.tagName === 'a');
  assert.equal(paths.length, 3, 'subject plus 2 actual adjacent outlines; condo duplicate outline excluded');
  assert.ok(anchors.every(a => a.href.startsWith('https://'))); assert.equal(nodes.filter(n => n.tagName === 'img').length, 0);
  assert.match(content(parent), /<img src=x onerror=alert\(1\)>/); assert.match(content(parent), /not verification of legal identity/);
  assert.match(content(parent), /Other same-building condominium units \(1\)/); assert.match(content(parent), /does not establish individual unit locations/);
  paths[1].emit('keydown', {key: 'Enter', preventDefault() {}}); assert.equal(paths[1].attributes['aria-pressed'], 'true');
  const filter = nodes.find(n => n.tagName === 'input'); filter.checked = true; filter.emit('change');
  assert.match(content(parent), /Owner-name matches \(2\)/); assert.doesNotMatch(content(parent), /Other boundary-sharing parcels/);
  assert.equal(descendants(parent).filter(n => n.tagName === 'path').length, 3);
});

test('init sends default order fields only and never persists access key', async () => {
  const elements = Object.fromEntries(['neighbors-check', 'neighbors-result', 'neighbors-status', 'county', 'order', 'address', 'owner', 'transaction', 'key'].map(id => [id, new Node('div')]));
  Object.assign(elements.county, {value: 'miami-dade-fl'}); Object.assign(elements.order, {value: 'test-order'}); Object.assign(elements.address, {value: '10 Example Lane'}); Object.assign(elements.owner, {value: 'A & B TRUST'}); Object.assign(elements.transaction, {value: 'Purchase'}); Object.assign(elements.key, {value: 'memory-only-key'});
  const doc = {...document, getElementById: id => elements[id]}; const priorFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => { request = {url, options}; return {json: async () => fixture()}; };
  try {
    initNeighbors(doc); await elements['neighbors-check'].emit('click');
    assert.equal(request.url, '/api/v2/property/neighbors'); assert.equal(request.options.headers.Authorization, 'Bearer memory-only-key');
    assert.deepEqual(JSON.parse(request.options.body), {scrap_order_id: 'test-order', address: '10 Example Lane', ownerName: 'A & B TRUST', county: 'miami-dade-fl', transactionType: 'Purchase', state: 'FL', neighborOptions:{sameBuilding:false,adjacency:true,includeCornerTouch:false}});
    assert.doesNotMatch(content(elements['neighbors-result']), /memory-only-key/); assert.equal(elements['neighbors-check'].disabled, false);
    elements.county.value = 'broward-fl'; elements.county.emit('change'); assert.equal(elements['neighbors-check'].disabled, true); assert.match(elements['neighbors-status'].textContent, /Miami-Dade County only/);
  } finally { globalThis.fetch = priorFetch; }
});

test('neighbor progress starts immediately, ticks while pending and stops on success or failure', async()=>{
 for(const failed of [false,true]){
  const ids=['neighbors-check','neighbors-result','neighbors-status','status','timer','request-id','error','county','order','address','owner','transaction','key'];
  const els=Object.fromEntries(ids.map(id=>[id,new Node('div')]));
  for(const [id,value]of Object.entries({county:'miami-dade-fl',order:'O',address:'10 Example Lane',owner:'A & B TRUST',transaction:'REFI',key:'private-test-key'}))els[id].value=value;
  let release,clock=0,tick,stopped=0,started=0,finished=0,result=null;
  const prior=globalThis.fetch;globalThis.fetch=()=>new Promise((resolve,reject)=>{release=()=>failed?reject(new Error('offline transport failure')):resolve({ok:true,json:async()=>fixture(),headers:{get:()=>null}});});
  try{
   initNeighbors({...document,getElementById:id=>els[id]},{now:()=>clock,repeat:fn=>{tick=fn;return 7;},stopRepeat:id=>{assert.equal(id,7);stopped++;},onStart:()=>{started++;return true;},onResult:data=>{result=data;},onFinish:()=>finished++});
   const pending=els['neighbors-check'].emit('click');assert.equal(started,1);assert.equal(els.timer.textContent,' · 0.0 seconds');assert.equal(els['neighbors-check'].disabled,true);assert.match(els.status.textContent,/Checking fresh county/);
   clock=2500;tick();assert.equal(els.timer.textContent,' · 2.5 seconds');release();await pending;
   assert.equal(stopped,1);assert.equal(finished,1);assert.equal(els['neighbors-check'].disabled,false);assert.equal(els.timer.textContent,' · 2.5 seconds');
   if(failed){assert.equal(result,null);assert.match(els.error.textContent,/could not be reached/);assert.equal(els.status.textContent,'Neighbor request failed');}else{assert.ok(result.NeighboringProperties);assert.equal(els.status.textContent,'Neighbor results ready');}
  }finally{globalThis.fetch=prior;}
 }
});

test('shared request owner can reject neighbor start without changing an active result',async()=>{
 const els=Object.fromEntries(['neighbors-check','neighbors-result','neighbors-status','county','order','address','owner','transaction','key'].map(id=>[id,new Node('div')]));
 for(const [id,value]of Object.entries({county:'miami-dade-fl',order:'O',address:'A',owner:'B',transaction:'REFI',key:'private-test-key'}))els[id].value=value;
 els['neighbors-result'].textContent='Prior result';let called=0;const prior=globalThis.fetch;globalThis.fetch=()=>{called++;throw Error('must not dispatch');};
 try{initNeighbors({...document,getElementById:id=>els[id]},{onStart:()=>false});await els['neighbors-check'].emit('click');assert.equal(called,0);assert.equal(els['neighbors-result'].textContent,'Prior result');}finally{globalThis.fetch=prior;}
});

test('owner data precedes consolidated notes; map is the last section or uses the dedicated pre-JSON host',()=>{
 const data=fixture();data.NeighboringProperties.options={sameBuilding:false};data.NeighboringProperties.properties=data.NeighboringProperties.properties.filter(p=>p.spatial_relation!=='SAME_BUILDING');
 const parent=new Node('section'),mapParent=new Node('section');renderNeighbors(document,parent,data,{mapParent});
 const nodes=descendants(parent),summaryIndex=nodes.findIndex(n=>n.textContent==='Search notes and limitations'),ownerIndex=nodes.findIndex(n=>n.textContent.startsWith('Recorded owners:'));
 assert.ok(ownerIndex>=0&&summaryIndex>ownerIndex);assert.equal(nodes.filter(n=>n.tagName==='svg').length,0);assert.equal(descendants(mapParent).filter(n=>n.tagName==='svg').length,1);
 assert.doesNotMatch(content(parent),/Same-building condominium units/);assert.equal(parent.children[1].className,'neighbors-summary');assert.doesNotMatch(parent.children[1].textContent,/PARTIAL|incomplete|unavailable/);
 const combined=new Node('section');renderNeighbors(document,combined,data);assert.equal(combined.children.at(-1).className,'neighbors-map-area');
});

test('same-building option snapshots into the request, locks while pending and invalidates stale scope',async()=>{
 const els=Object.fromEntries(['neighbors-check','neighbors-result','neighbors-status','neighbors-same-building','neighbors-map-result','county','order','address','owner','transaction','key'].map(id=>[id,new Node('div')]));
 for(const [id,value]of Object.entries({county:'miami-dade-fl',order:'O',address:'A',owner:'B',transaction:'REFI',key:'private-test-key'}))els[id].value=value;
 els['neighbors-same-building'].checked=true;let release,request,scopeChanged=0;const prior=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{request=JSON.parse(options.body);await new Promise(r=>release=r);return{ok:true,json:async()=>({...fixture(),NeighboringProperties:{...fixture().NeighboringProperties,options:{sameBuilding:true}}})};};
 try{
  initNeighbors({...document,getElementById:id=>els[id]},{onScopeChange:()=>scopeChanged++});const pending=els['neighbors-check'].emit('click');
  assert.equal(request.neighborOptions.sameBuilding,true);assert.equal(els['neighbors-same-building'].disabled,true);release();await pending;assert.equal(els['neighbors-same-building'].disabled,false);
  els['neighbors-same-building'].checked=false;els['neighbors-same-building'].emit('change');assert.equal(scopeChanged,1);assert.equal(els['neighbors-result'].children.length,0);assert.equal(els['neighbors-map-result'].children.length,0);assert.match(els['neighbors-status'].textContent,/Run a new/);
 }finally{globalThis.fetch=prior;}
});

test('combined scope labels boundary and condo owner matches separately',()=>{
 const data=fixture();data.NeighboringProperties.options={sameBuilding:true};data.NeighboringProperties.properties[2].owners=['A & B TRUST'];data.NeighboringProperties.properties[2].matchesRequestedOwner=true;
 const root=new Node('section');renderNeighbors(document,root,data);const s=content(root);assert.match(s,/3 boundary-sharing parcels returned · 2 parcel owner-name matches/);assert.match(s,/1 same-building unit records returned · 1 unit owner-name matches/);assert.match(s,/Other same-building condominium units/);
});

test('matching owner tiles lead the result, are highlighted and do not duplicate other records',()=>{
 const data=fixture();data.NeighboringProperties.options={sameBuilding:true};data.NeighboringProperties.properties.reverse();
 const root=new Node('section');renderNeighbors(document,root,data);const nodes=descendants(root),cards=nodes.filter(n=>n.tagName==='article');
 assert.equal(cards.length,4);assert.match(cards[0].className,/neighbors-requested neighbors-match/);assert.match(cards[1].className,/neighbors-coowner neighbors-match/);assert.doesNotMatch(cards[2].className,/neighbors-match/);assert.doesNotMatch(cards[3].className,/neighbors-match/);
 assert.ok(nodes.indexOf(cards[0])<nodes.findIndex(n=>n.textContent==='Subject parcel'));assert.match(content(cards[0]),/OWNER NAME MATCH/);assert.match(content(cards[1]),/CO-OWNER NAME MATCH/);
 const headings=nodes.filter(n=>n.tagName==='h3').map(n=>n.textContent);assert.equal(headings[0],'Owner-name matches (2)');
});

test('matching tile opens only its own details while source links and nonmatches remain independent',()=>{
 const root=new Node('section'),opened=[];renderNeighbors(document,root,fixture(),{onPropertyOpen:p=>opened.push(p.folio)});
 const cards=descendants(root).filter(n=>n.tagName==='article');
 descendants(cards[0]).find(n=>n.tagName==='button').emit('click');assert.deepEqual(opened,['A']);
 cards[0].emit('click',{target:{closest:()=>true}});assert.deepEqual(opened,['A'],'source and button bubbling must not dispatch twice');
 cards[0].emit('click',{target:{closest:()=>false}});assert.deepEqual(opened,['A','A']);
 descendants(cards[2]).find(n=>n.tagName==='button').emit('click');assert.deepEqual(opened,['A','A']);
});
