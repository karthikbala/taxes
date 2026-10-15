import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {capabilities,validateInput} from '../lib/live/router.mjs';
import {clientCapabilities} from '../lib/client/profiles.mjs';
import {validateClientInput} from '../lib/client/contract.mjs';
import {pocWorkflows,pocRequest,automaticPocMode,automaticPocRequest,workflowSample,supportsNeighbors} from '../public/poc-workflows.mjs';
import {renderValue,renderSections,renderValidation,resultBadge,resultRequestId} from '../public/poc-render.mjs';
import {sourcePresentation} from '../public/source-status.mjs';

const workflows=pocWorkflows(capabilities,clientCapabilities);
test('POC admits all twenty phase counties and retains two existing additional workflows',()=>{
 assert.equal(workflows.length,22);assert.equal(workflows.filter(c=>[1,2].includes(c.phase)).length,20);
 assert.equal(workflows.filter(c=>c.lookup_modes.includes('address')).length,3);
 assert.equal(workflows.some(c=>c.lookup_modes.includes('state_roll')),false);
 assert.equal(capabilities.counties.length,68,'the separate API directory remains intact');
 for(const c of workflows)for(const mode of c.lookup_modes){
  const r=pocRequest(c,mode,{order:'offline-order',address:'100 TEST ST',owner:'TEST OWNER',transaction:'REFI',parcel:c.sample.parcel_id,includePdf:true});
  if(mode==='address')assert.equal(validateClientInput(r.body).county,c.id);
  else assert.equal(validateInput(r.body).county,c.id);
 }
 for(const id of ['alachua-fl','orange-fl','duval-fl'])assert.throws(()=>pocRequest({id,lookup_modes:['county','address','state_roll']},'county',{}));
 assert.throws(()=>pocRequest(workflows[0],'state_roll',{}));
});
test('collector account is confined to Palm Beach and neighbours are confined to Miami address search',()=>{
 const palm=workflows.find(c=>c.id==='palm-beach-fl'),bradford=workflows.find(c=>c.id==='bradford-fl');
 assert.equal(pocRequest(palm,'county',{parcel:palm.sample.parcel_id,account:' 12345 ',includePdf:false}).body.collector_account_id,'12345');
 assert.equal('collector_account_id' in pocRequest(bradford,'county',{parcel:bradford.sample.parcel_id,account:'12345'}).body,false);
 for(const c of workflows)for(const mode of c.lookup_modes)assert.equal(supportsNeighbors(c,mode),c.id==='miami-dade-fl'&&mode==='address');
});

// Execute the actual page controller with isolated DOM and API transports.
// Returned rows below are explicit test scaffolding, never extraction evidence.
class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.text='';}
 append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);if(this.tag==='select'&&this.children.length===1)this.value=node.value;}}
 replaceChildren(...nodes){this.children=[];this.text='';if(this.tag==='select')this.value='';for(const n of nodes)this.append(n);}
 set textContent(v){this.text=String(v);this.children=[];}
 get textContent(){return this.text+this.children.map(c=>c.textContent).join('\n');}
 insertAdjacentElement(_where,node){this.parentElement?.append(node);}
 setAttribute(){}
 addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
 async change(value){this.value=value;for(const fn of this.listeners.change||[])await fn();}
 async input(value){this.value=value;for(const fn of this.listeners.input||[])await fn();}
 async click(){for(const fn of this.listeners.click||[])await fn();}
 scrollIntoView(){}
}
async function harness(clientResponse,{savedInput,linkedJob,savedApi='v2',jobGaps=[]}={}){
 const html=readFileSync(new URL('../public/poc.html',import.meta.url),'utf8'),elements=new Map();
 for(const match of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g))elements.set(match[2],new Element(match[1]));
 elements.get('status').parentElement=new Element();
 const storage=new Map();
 elements.get('order').value='test-order';elements.get('transaction').value='REFI';elements.get('include-pdf').checked=true;elements.get('key').value='offline-page-key';
 const document={getElementById:id=>elements.get(id),createElement:tag=>new Element(tag)},calls=[];
 let neighbors;
 const source=readFileSync(new URL('../public/poc.js',import.meta.url),'utf8').replace(/^import .*?;\s*$/gm,'');
 const context={document,pocWorkflows,pocRequest,automaticPocMode,automaticPocRequest,workflowSample,supportsNeighbors,renderValue,renderSections,renderValidation,resultBadge,resultRequestId,sourcePresentation,
  initNeighbors:(_doc,handlers)=>{neighbors=handlers;},selectedPropertyOrder:()=>{},selectedParcelCheck:()=>{},
  performance:{now:()=>0},setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},AbortController,AbortSignal,URL,URLSearchParams,Blob,crypto:{randomUUID:()=> 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  location:{origin:'http://127.0.0.1:3000',search:linkedJob?'?job='+linkedJob+'&api='+savedApi:''},fetch:async(url,options)=>{
   if(!options?.method&&/^\/api\/v[23]\/property\/jobs\//.test(url))return Response.json({id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',input:savedInput,status:clientResponse?.ExtractionMetadata?.match?.status==='ADDRESS_REVIEW_REQUIRED'?'needs_review':'completed_with_gaps',stage:'serialization',updated_at:new Date().toISOString(),gaps:jobGaps,field_status:{},result:clientResponse||{scrapTaxOrderRequest:{PropertyInformation:{PropertyAddress:'TEST ADDRESS',ParcelNumber:'test-folio'},matchStatus:'MATCHED'},ExtractionMetadata:{request_id:'offline-address-request',section_status:{PropertyInformation:'PARTIAL'}}}});
   if(!options?.method)return Response.json(url.includes('/v1/')?capabilities:clientCapabilities);
   calls.push({url,options,body:JSON.parse(options.body)});
   if(['/api/v2/property/jobs','/api/v3/property/jobs'].includes(url))return Response.json({id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'},{status:202});
   if(clientResponse&&url.includes('/v2/'))return Response.json(clientResponse);
   if(url.includes('/v2/'))return Response.json({status:'partial',errorMessage:'NA',scrapTaxOrderRequest:{PropertyInformation:{PropertyAddress:'TEST ADDRESS',ParcelNumber:'test-folio'},matchStatus:'MATCHED'},ExtractionMetadata:{request_id:'offline-address-request',section_status:{PropertyInformation:'PARTIAL'}}});
   return Response.json({status:'partial',mode:JSON.parse(options.body).source_mode==='state_roll'?'live_retrieval_annual_roll':'live',request_id:'offline-page-request',property:{parcel_id:JSON.parse(options.body).parcel_id,owner:'<img src=x onerror=alert(1)>',address:'TEST ADDRESS'},assessment:{year:2025,assessed_total:'0'},taxes:{summary:{balance_due:null}},documents:[],document_status:'unavailable',errors:[{code:'source_blocked',message:'Test blocked collector'}],sources:[{id:'assessment_county',status:'verified',url:'https://example.gov/record',method:'GET'}],coverage:{collector:'unavailable'},field_provenance:{assessment:'assessment_county'}},{headers:{'X-Request-ID':'offline-page-request'}});
  }
 };
 vm.runInNewContext(source,context);
 for(let i=0;i<10&&!neighbors;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(neighbors,'page initialized');
 return {elements,calls,neighbors};
}
const submit=e=>e.get('form').onsubmit({preventDefault(){}});
const buttonsIn=root=>{const out=[];const walk=n=>{if(n.tag==='button')out.push(n);for(const c of n.children)walk(c);};walk(root);return out;};

test('automatic routing honors explicit parcels, county admission and collector scope without a roll fallback',()=>{
 const fields={order:'test',address:'6557 SE CR 21B',owner:'BAKER BOYD D REVOC TRUST',transaction:'REFI',parcel:'',includePdf:true};
 const bradford=workflows.find(c=>c.id==='bradford-fl');
 assert.equal(automaticPocMode(bradford,fields),'address');
 const r=automaticPocRequest(bradford,{...fields,parcel:' 06203-C-01400 '});assert.equal(r.endpoint,'/api/v3/property/jobs');assert.equal(r.body.parcel_id,'06203-C-01400');assert.equal('address' in r.body,false);assert.equal('ownerName' in r.body,false);
 const baker=workflows.find(c=>c.id==='baker-fl');assert.equal(automaticPocRequest(baker,{...fields,parcel:baker.sample.parcel_id}).body.source_mode,'collector');
 assert.throws(()=>automaticPocRequest(baker,fields),/Enter a parcel ID/);
 assert.throws(()=>automaticPocRequest(bradford,{...fields,owner:''}),/address and owner/);
 for(const id of ['alachua-fl','orange-fl'])assert.throws(()=>automaticPocRequest({id,lookup_modes:['county','address','state_roll']},fields),/available county/);
});

test('common form has no search-method selector and starts without an unintended sample property',async()=>{
 const {elements:e,calls}=await harness();const html=readFileSync(new URL('../public/poc.html',import.meta.url),'utf8');
 assert.equal(e.has('lookup-mode'),false);assert.doesNotMatch(html,/Search method/);assert.equal(e.get('county').value,'bradford-fl');
 for(const id of ['address','owner','parcel'])assert.equal(e.get(id).value,'');
 assert.equal(e.get('address-fields').hidden,false);assert.equal(e.get('parcel-fields').hidden,false);assert.equal(e.get('parcel').disabled,false);assert.equal(e.get('parcel').required,false);assert.equal(e.get('address').required,true);assert.equal(e.get('owner').required,true);assert.equal(calls.length,0);
 await submit(e);assert.equal(calls.length,0);assert.match(e.get('error').textContent,/address and owner/);
});

test('actual common form submits every admitted native parcel route with auth and renders original response scope',async()=>{
 const {elements:e,calls}=await harness();
 for(const profile of workflows.filter(c=>c.lookup_modes.some(m=>['county','collector'].includes(m)))){
  await e.get('county').change(profile.id);await e.get('parcel').input(' '+profile.sample.parcel_id+' ');
  assert.equal(e.get('parcel').disabled,false);assert.equal(e.get('address').disabled,true);assert.equal(e.get('owner').required,false);assert.equal(e.get('neighbor-controls').hidden,true);
  await submit(e);const call=calls.at(-1);assert.equal(call.url,[1,2].includes(profile.phase)?'/api/v3/property/jobs':'/api/v1/property/lookup');assert.equal(call.options.headers.Authorization,'Bearer offline-page-key');assert.equal(call.body.county,profile.id);assert.equal(call.body.parcel_id,profile.sample.parcel_id);if(![1,2].includes(profile.phase)){assert.equal(call.body.source_mode,profile.id==='baker-fl'?'collector':'county');assert.equal(call.body.include_pdf,true);}else assert.equal('source_mode' in call.body,false);assert.equal('address' in call.body,false);assert.equal('ownerName' in call.body,false);
  assert.match(e.get('sections').textContent,/TEST ADDRESS/);if(![1,2].includes(profile.phase))assert.match(e.get('request-id').textContent,/offline-page-request/);assert.equal(e.get('download').disabled,false);
 }
 assert.equal(calls.length,22);
});

test('address-only counties request a parcel before dispatch and keep address and owner visibly out of the parcel request',async()=>{
 const {elements:e,calls}=await harness();
 for(const profile of workflows.filter(c=>!c.lookup_modes.includes('address'))){
  await e.get('county').change(profile.id);assert.equal(e.get('parcel').required,true);assert.equal(e.get('address').disabled,true);assert.equal(e.get('address-fields').hidden,false);assert.equal(e.get('parcel-fields').hidden,false);
  await submit(e);assert.equal(calls.length,0);assert.match(e.get('error').textContent,/Enter a parcel ID/);assert.match(e.get('workflow-note').textContent,/not yet available/);
 }
});

test('Bradford uses detailed address jobs automatically and clearing a parcel restores automatic address-role detection',async()=>{
 const {elements:e,calls}=await harness();await e.get('address').input('8130 SW 50TH PATH');await e.get('owner').input('FLETCHER CARRIE');
 await e.get('parcel').input('00420-0-00200');assert.match(e.get('workflow-note').textContent,/Address and owner inputs are not used/);
 await e.get('parcel').input('');assert.equal(e.get('address').value,'8130 SW 50TH PATH');
 await submit(e);const call=calls.at(-1);assert.equal(call.url,'/api/v2/property/jobs');assert.equal('addressType' in call.body,false);assert.equal(call.body.address,'8130 SW 50TH PATH');assert.equal(call.body.ownerName,'FLETCHER CARRIE');assert.equal('parcel_id' in call.body,false);assert.equal(call.body.scrap_order_id,'test-order');assert.match(e.get('request-id').textContent,/Lookup ID: aaaaaaaa/);
});

test('county changes preserve entered address and owner, clear county-specific parcel/account, reset mailing and clear stale results',async()=>{
 const {elements:e,calls}=await harness();await e.get('address').input('6557 SE CR 21B');await e.get('owner').input('BAKER BOYD D REVOC TRUST');await submit(e);assert.equal(calls.length,1);
 await e.get('parcel').input('05632-0-00000');e.get('collector-account').value='12345';
 await e.get('county').change('palm-beach-fl');assert.equal(e.get('parcel').value,'');assert.equal(e.get('collector-account').value,'');assert.equal(e.get('account-field').hidden,false);assert.equal(e.get('download').disabled,true);assert.equal(e.get('sections').children.length,0);
 await e.get('county').change('bradford-fl');assert.equal(e.get('address').value,'6557 SE CR 21B');assert.equal(e.get('owner').value,'BAKER BOYD D REVOC TRUST');assert.equal(e.get('address').disabled,false);assert.equal(e.get('parcel').value,'');assert.equal(calls.length,1);
 assert.equal(e.get('county').children.flatMap(g=>g.children).length,22);assert(e.get('county').children.flatMap(g=>g.children).every(o=>!['alachua-fl','orange-fl'].includes(o.value)));
});

test('examples are explicit input-only actions and never dispatch or retain a different county account',async()=>{
 const {elements:e,calls}=await harness();await e.get('use-example').click();assert.equal(e.get('address').value,'14500 S HWY 301');assert.equal(e.get('owner').value,'WALMART STORES EAST, LP');assert.equal(e.get('parcel').value,'');
 await e.get('county').change('baker-fl');assert.equal(e.get('parcel').value,'');await e.get('use-example').click();assert.equal(e.get('address').value,'');assert.equal(e.get('owner').value,'');assert.equal(e.get('parcel').value,workflows.find(c=>c.id==='baker-fl').sample.parcel_id);assert.match(e.get('workflow-note').textContent,/assessment data is not included/);assert.equal(calls.length,0);
});

test('optional collector account and document preference remain scoped to their supported request',async()=>{
 const {elements:e,calls}=await harness();await e.get('county').change('palm-beach-fl');await e.get('parcel').input('00414726000005030');await e.get('collector-account').input(' 12345 ');e.get('include-pdf').checked=false;
 await submit(e);assert.equal(calls.at(-1).body.collector_account_id,'12345');assert.equal('include_pdf' in calls.at(-1).body,false);
 await e.get('county').change('union-fl');await e.get('parcel').input(workflows.find(c=>c.id==='union-fl').sample.parcel_id);assert.equal(e.get('account-field').hidden,true);assert.equal(e.get('collector-account').disabled,true);await submit(e);assert.equal('collector_account_id' in calls.at(-1).body,false);
});

test('available county table explains input requirements and collector-only scope without internal modes',async()=>{
 const {elements:e}=await harness(),rows=e.get('coverage').children;assert.equal(rows.length,22);assert.match(e.get('catalog-summary').textContent,/Search is selected automatically/);
 const baker=rows.find(r=>r.children[0].textContent==='Baker County, Florida');assert.equal(baker.children[1].textContent,'Parcel ID required');assert.match(baker.children[2].textContent,/no assessment lookup/);
 const bradford=rows.find(r=>r.children[0].textContent==='Bradford County, Florida');assert.equal(bradford.children[1].textContent,'Address and owner, or parcel ID');assert(!e.get('coverage').textContent.includes('annual roll'));
});

test('mailing review preserves distinct properties and an explicit parcel choice fills the common form without submitting',async()=>{
 const candidates=[{parcel_id:'05194-0-00000',address:'SE 11TH AVE, STARKE',mailing_address:'8280 SE SWEET BAY DR; HOBE SOUND',owners:['CALLAHAN JAMES R & CHARLOTTE'],owner_matches_requested:true},{parcel_id:'05379-0-00000',address:'SE 11TH AVE, STARKE',owners:['CALLAHAN JAMES R & CHARLOTTE G'],owner_matches_requested:false}];
 const {elements:e,calls}=await harness({status:'error',errorMessage:'Confirm the parcel',ExtractionMetadata:{match:{status:'ADDRESS_REVIEW_REQUIRED',candidates},sources:[]}});
 await e.get('use-example').click();await submit(e);assert.match(e.get('status').textContent,/confirmation needed/);assert.match(e.get('sections').textContent,/SE 11TH AVE/);assert.equal(calls.length,1);
 const buttons=buttonsIn(e.get('sections'));assert.equal(buttons.length,2);await buttons[1].click();assert.equal(e.get('parcel').value,'05379-0-00000');assert.equal(e.get('address').value,'');assert.equal(e.get('owner').value,'');assert.equal(calls.length,1);
 await submit(e);assert.equal(calls.at(-1).url,'/api/v3/property/jobs');assert.equal(calls.at(-1).body.parcel_id,'05379-0-00000');
});

test('verified physical-site selection uses its actual county and parcel without silently assigning the requested owner',async()=>{
 const site={county:'union-fl',county_name:'Union',parcel_id:'24-06-18-00-000-0059-0',address:'8130 SW 50TH PATH, LAKE BUTLER',owners:['FLETCHER CARRIE A'],owner_matches_requested:false,address_match_type:'site'};
 const {elements:e,calls}=await harness({status:'error',ExtractionMetadata:{match:{status:'ADDRESS_REVIEW_REQUIRED',candidates:[],site_candidates:[site]},sources:[]}});
 await e.get('use-example').click();await submit(e);assert.match(e.get('sections').textContent,/Do not attribute/);const buttons=buttonsIn(e.get('sections'));await buttons[0].click();assert.equal(e.get('county').value,'union-fl');assert.equal(e.get('parcel').value,site.parcel_id);assert.equal(e.get('owner').value,'');assert.equal(calls.length,1);await submit(e);assert.equal(calls.at(-1).body.county,'union-fl');assert.equal(calls.at(-1).body.parcel_id,site.parcel_id);
});

test('restored Bradford address jobs clear a stale parcel and retain the original mailing meaning',async()=>{
 const savedInput={county:'bradford-fl',address:'8130 SW 50TH PATH',ownerName:'FLETCHER CARRIE',addressType:'mailing',transactionType:'REFI',scrap_order_id:'saved'},id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
 const {elements:e,calls}=await harness(undefined,{savedInput,linkedJob:id});await e.get('parcel').input('OTHER-PARCEL');await buttonsIn(e.get('status').parentElement).find(b=>b.textContent==='Restore saved lookup').click();
 assert.equal(e.get('parcel').value,'');assert.equal(e.get('address').value,savedInput.address);assert.equal(e.get('owner').value,savedInput.ownerName);assert.equal(calls.length,0);
});

test('restoring an excluded county cannot reactivate it through a saved job',async()=>{
 const savedInput={county:'polk-fl',address:'100 TEST ST',ownerName:'TEST OWNER',transactionType:'REFI',scrap_order_id:'saved'},id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
 const {elements:e,calls}=await harness(undefined,{savedInput,linkedJob:id});await buttonsIn(e.get('status').parentElement).find(b=>b.textContent==='Restore saved lookup').click();assert.equal(e.get('county').value,'bradford-fl');assert.match(e.get('error').textContent,/currently unavailable/);assert.equal(calls.length,0);
});


test('Miami and Osceola retain address jobs and admit parcel jobs with scoped neighbour controls',async()=>{
 const {elements:e,calls}=await harness();
 for(const [county,address,owner]of [['miami-dade-fl','20 NE 10 ST','LEGACY MWC TRUSTEE LLC'],['osceola-fl','3250 VINELAND RD','WAL-MART STORES EAST LP']]){
  const profile=workflows.find(c=>c.id===county);assert.equal(profile.poc_verification,'sample_verified');
  await e.get('county').change(county);await e.get('address').input(address);await e.get('owner').input(owner);
  assert.equal(e.get('parcel').required,false);
  assert.equal(e.get('neighbor-controls').hidden,county!=='miami-dade-fl');
  await submit(e);assert.equal(calls.at(-1).url,'/api/v2/property/jobs');assert.equal(calls.at(-1).body.county,county);assert.equal(calls.at(-1).body.address,address);assert.equal(calls.at(-1).body.ownerName,owner);assert.equal('addressType' in calls.at(-1).body,false);
  assert.equal(e.get('parcel').disabled,false);assert.equal(automaticPocRequest(profile,{parcel:profile.sample.parcel_id}).endpoint,'/api/v3/property/jobs');
  await e.get('parcel').input('');assert.equal(e.get('address').value,address);assert.equal(e.get('neighbor-controls').hidden,county!=='miami-dade-fl');
 }
 const rows=e.get('coverage').children;
 for(const county of ['Miami-Dade County, Florida','Osceola County, Florida']){const row=rows.find(r=>r.children[0].textContent===county);assert.match(row.children[3].textContent,/Historical sample evidence/);}
 assert.equal(workflows.filter(c=>c.poc_verification==='sample_verified').length,11);
});

test('restoring either requested county retains its exact address and collector access gaps',async()=>{
 for(const county of ['miami-dade-fl','osceola-fl']){
  const savedInput={county,address:'20 TEST ST',ownerName:'TEST OWNER',transactionType:'REFI',scrap_order_id:'saved'};
  const result={status:'partial',errorMessage:'Collector access restricted',scrapTaxOrderRequest:{PropertyInformation:{PropertyAddress:savedInput.address,ParcelNumber:'verified-source-parcel'},matchStatus:'MATCHED'},ExtractionMetadata:{errors:[{code:'managed_browser_unavailable'}],section_status:{PropertyInformation:'PARTIAL'}}};
  const {elements:e,calls}=await harness(result,{savedInput,linkedJob:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',jobGaps:[{reason:'ACCESS_RESTRICTED',action:'Collector access restricted'}]});
  await buttonsIn(e.get('status').parentElement).find(b=>b.textContent==='Restore saved lookup').click();
  assert.equal(e.get('county').value,county);assert.equal(e.get('parcel').value,'');assert.equal(e.get('address').value,savedInput.address);assert.equal(e.get('owner').value,savedInput.ownerName);assert.match(e.get('error').textContent,/Collector access restricted/);assert.equal(calls.length,0);
 }
});

 test('automatic address ambiguity retains verified review candidates without dispatching a second lookup',async()=>{
 const candidates=[{parcel_id:'05194-0-00000',address:'SE 11TH AVE',owners:['CALLAHAN JAMES R & CHARLOTTE'],owner_matches_requested:true,verified_address_match:true,address_match_type:'mailing_only'},{parcel_id:'05379-0-00000',address:'8280 SE SWEET BAY DR',owners:['CALLAHAN JAMES R & CHARLOTTE'],owner_matches_requested:true,verified_address_match:true,address_match_type:'site'}];
 const {elements:e,calls}=await harness({status:'error',ExtractionMetadata:{match:{status:'AMBIGUOUS',requested_address_type:'auto',candidates},sources:[]}});await e.get('use-example').click();await submit(e);assert.match(e.get('sections').textContent,/More than one property matches/);assert.equal(buttonsIn(e.get('sections')).length,2);assert.equal(calls.length,1);await buttonsIn(e.get('sections'))[0].click();assert.equal(e.get('parcel').value,'05194-0-00000');assert.equal(calls.length,1);
 });
 test('automatic mailing matches display the detected address role',async()=>{
 const {elements:e}=await harness({status:'partial',scrapTaxOrderRequest:{matchStatus:'MATCHED',PropertyInformation:{ParcelNumber:'00420-0-00200',PropertyAddress:'SW 180TH PL'}},ExtractionMetadata:{match:{status:'MATCHED',requested_address_type:'auto',input_address_type:'mailing',matched_address_types:['mailing']},sources:[],section_status:{PropertyInformation:'EXTRACTED'}}});await e.get('use-example').click();await submit(e);assert.match(e.get('summary').textContent,/Owner mailing address.*detected from county records/);assert.equal(e.has('address-type'),false);
 });

 test('twenty-county parcel result renders full client sections and additional native county fields',async()=>{
 const result={schema_version:'3.0',status:'partial',scrapTaxOrderRequest:{PropertyInformation:{ParcelNumber:'232724008500000660',PropertyAddress:'TEST PROPERTY',OwnerName:'TEST OWNER'},AssessmentInformation:{AssessedValue:'433287'},TaxAmounts:{totalTax:'123.45'},TotalMillage:{value:'13.85430',units:'mills'},PaymentDetails:{currentBalance:'0.00'},Documents:[]},ExtractionMetadata:{status:'partial',sources:[],errors:[]},legacy:{assessment:{taxable_school:'179113'},taxes:{payments:[{paid_by:'SOURCE PAYER',receipt_number:'RECEIPT-1'}]},documents:[]}};
 const {elements:e,calls}=await harness(result);await e.get('county').change('polk-fl');await e.get('parcel').input('232724008500000660');await submit(e);assert.equal(calls[0].url,'/api/v3/property/jobs');for(const value of ['TEST PROPERTY','TEST OWNER','123.45','13.85430','mills','SOURCE PAYER','RECEIPT-1'])assert(e.get('sections').textContent.includes(value),value+' must remain visible');assert.match(e.get('sections').textContent,/Additional county assessment/);
 });
 test('saved v3 parcel lookup restores its county and exact identifier without dispatching new work',async()=>{
 const savedInput={county:'hillsborough-fl',parcel_id:'1829244ZI000078000000A'},id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';const {elements:e,calls}=await harness(undefined,{savedInput,linkedJob:id,savedApi:'v3'});await buttonsIn(e.get('status').parentElement).find(b=>b.textContent==='Restore saved lookup').click();assert.equal(e.get('county').value,savedInput.county);assert.equal(e.get('parcel').value,savedInput.parcel_id);assert.equal(e.get('owner').value,'');assert.equal(calls.length,0);
 });
