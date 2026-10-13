import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {capabilities,validateInput} from '../lib/live/router.mjs';
import {clientCapabilities} from '../lib/client/profiles.mjs';
import {validateClientInput} from '../lib/client/contract.mjs';
import {pocWorkflows,pocRequest,catalogWorkflows,catalogRequest,workflowLabels,workflowSample,supportsNeighbors} from '../public/poc-workflows.mjs';
import {renderValue,renderSections,renderValidation,resultBadge,resultRequestId} from '../public/poc-render.mjs';
import {sourcePresentation} from '../public/source-status.mjs';

const workflows=pocWorkflows(capabilities,clientCapabilities);
test('POC exposes only production-verified county extraction and rejects removed modes',()=>{
 assert.deepEqual(workflows.map(c=>c.id),['allegheny-pa','baker-fl','bradford-fl','columbia-fl','desoto-fl','highlands-fl','palm-beach-fl','suwannee-fl','union-fl']);
 assert.equal(workflows.filter(c=>c.lookup_modes.includes('address')).length,1);
 assert.equal(workflows.some(c=>c.lookup_modes.includes('state_roll')),false);
 assert.equal(capabilities.counties.length,68,'the separate API directory remains intact');
 for(const c of workflows)for(const mode of c.lookup_modes){
  const r=pocRequest(c,mode,{order:'offline-order',address:'100 TEST ST',owner:'TEST OWNER',transaction:'REFI',parcel:c.sample.parcel_id,includePdf:true});
  if(mode==='address')assert.equal(validateClientInput(r.body).county,c.id);
  else assert.equal(validateInput(r.body).county,c.id);
 }
 for(const id of ['alachua-fl','miami-dade-fl','osceola-fl','polk-fl','pinellas-fl'])assert.throws(()=>pocRequest({id,lookup_modes:['county','address','state_roll']},'county',{}));
 assert.throws(()=>pocRequest(workflows[0],'state_roll',{}));
});
test('collector account is confined to Palm Beach and neighbours are unavailable for admitted counties',()=>{
 const palm=workflows.find(c=>c.id==='palm-beach-fl'),bradford=workflows.find(c=>c.id==='bradford-fl');
 assert.equal(pocRequest(palm,'county',{parcel:palm.sample.parcel_id,account:' 12345 ',includePdf:false}).body.collector_account_id,'12345');
 assert.equal('collector_account_id' in pocRequest(bradford,'county',{parcel:bradford.sample.parcel_id,account:'12345'}).body,false);
 for(const c of workflows)for(const mode of c.lookup_modes)assert.equal(supportsNeighbors(c,mode),false);
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
 scrollIntoView(){}
}
async function harness(clientResponse){
 const html=readFileSync(new URL('../public/poc.html',import.meta.url),'utf8'),elements=new Map();
 for(const match of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g))elements.set(match[2],new Element(match[1]));
 elements.get('status').parentElement=new Element();
 const storage=new Map();
 elements.get('order').value='test-order';elements.get('transaction').value='REFI';elements.get('include-pdf').checked=true;elements.get('key').value='offline-page-key';
 const document={getElementById:id=>elements.get(id),createElement:tag=>new Element(tag)},calls=[];
 let neighbors;
 const source=readFileSync(new URL('../public/poc.js',import.meta.url),'utf8').replace(/^import .*?;\s*$/gm,'');
 const context={document,pocWorkflows,pocRequest,catalogWorkflows,catalogRequest,workflowLabels,workflowSample,supportsNeighbors,renderValue,renderSections,renderValidation,resultBadge,resultRequestId,sourcePresentation,
  initNeighbors:(_doc,handlers)=>{neighbors=handlers;},selectedPropertyOrder:()=>{},selectedParcelCheck:()=>{},
  performance:{now:()=>0},setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},AbortController,AbortSignal,URL,Blob,crypto:{randomUUID:()=> 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  location:{origin:'http://127.0.0.1:3000'},fetch:async(url,options)=>{
   if(!options?.method&&url.startsWith('/api/v2/property/jobs/'))return Response.json({id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',status:clientResponse?.ExtractionMetadata?.match?.status==='ADDRESS_REVIEW_REQUIRED'?'needs_review':'completed_with_gaps',stage:'serialization',updated_at:new Date().toISOString(),gaps:[],field_status:{},result:clientResponse||{scrapTaxOrderRequest:{PropertyInformation:{PropertyAddress:'TEST ADDRESS',ParcelNumber:'test-folio'},matchStatus:'MATCHED'},ExtractionMetadata:{request_id:'offline-address-request',section_status:{PropertyInformation:'PARTIAL'}}}});
   if(!options?.method)return Response.json(url.includes('/v1/')?capabilities:clientCapabilities);
   calls.push({url,options,body:JSON.parse(options.body)});
   if(url==='/api/v2/property/jobs')return Response.json({id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'},{status:202});
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
test('actual POC controller submits the eight admitted county parcel routes with auth and renders partial records and errors',async()=>{
 const {elements:e,calls}=await harness();
 for(const profile of workflows.filter(c=>c.lookup_modes.includes('county'))){
  await e.get('county').change(profile.id);await e.get('lookup-mode').change('county');
  assert.equal(e.get('parcel').disabled,false);assert.equal(e.get('address').disabled,true);assert.equal(e.get('neighbor-controls').hidden,true);
  assert.equal(e.get('parcel').value,profile.sample.parcel_id);
  await e.get('form').onsubmit({preventDefault(){}});
  const call=calls.at(-1);assert.equal(call.url,'/api/v1/property/lookup');assert.equal(call.options.headers.Authorization,'Bearer offline-page-key');assert.equal(call.body.county,profile.id);assert.equal(call.body.parcel_id,profile.sample.parcel_id);assert.equal('address' in call.body,false);
  assert.match(e.get('sections').textContent,/Test blocked collector|unavailable/);assert.match(e.get('sections').textContent,/TEST ADDRESS/);assert.match(e.get('error').textContent,/Test blocked collector/);assert.match(e.get('request-id').textContent,/offline-page-request/);assert.match(e.get('status').textContent,/Partial records/);assert.equal(e.get('download').disabled,false);
 }
 assert.equal(calls.length,8);
});
test('the verified Bradford address form keeps its v2 order and sample identity',async()=>{
 const {elements:e,calls}=await harness();
 for(const profile of workflows.filter(c=>c.lookup_modes.includes('address'))){
  await e.get('county').change(profile.id);
  assert.equal(e.get('lookup-mode').value,'address');assert.equal(e.get('parcel').disabled,true);
  await e.get('form').onsubmit({preventDefault(){}});
  const call=calls.at(-1);assert.equal(call.url,'/api/v2/property/jobs');assert.equal(call.body.address,profile.client.demo_input.address);assert.equal(call.body.ownerName,profile.client.demo_input.ownerName);assert.equal(call.body.scrap_order_id,'test-order');assert.equal('parcel_id' in call.body,false);assert.match(e.get('request-id').textContent,/Lookup ID: aaaaaaaa/);assert.match(e.get('sections').textContent,/TEST ADDRESS/);
 }
 assert.equal(calls.length,1);
});
test('county switches clear stale results and do not offer annual-roll or blocked counties',async()=>{
 const {elements:e,calls}=await harness();
 assert.equal(e.get('county').value,'bradford-fl');assert.equal(e.get('lookup-mode').value,'address');assert.equal(e.get('neighbor-controls').hidden,true);assert.equal(calls.length,0);
 await e.get('form').onsubmit({preventDefault(){}});assert.equal(calls.length,1);
 await e.get('county').change('palm-beach-fl');assert.equal(e.get('account-field').hidden,false);assert.equal(e.get('lookup-mode').value,'county');assert.equal(e.get('download').disabled,true);assert.equal(e.get('sections').children.length,0);
 await e.get('county').change('bradford-fl');assert.equal(e.get('owner').value,'WALMART STORES EAST, LP');assert.equal(e.get('address').disabled,false);assert.equal(e.get('parcel').disabled,true);assert.equal(calls.length,1);
 assert.equal(e.get('county').children.length,9);
 assert(e.get('county').children.every(o=>!['alachua-fl','miami-dade-fl','osceola-fl','polk-fl'].includes(o.value)));
 assert.equal(e.get('lookup-mode').children.some(o=>o.value==='state_roll'),false);
});

test('workflow table lists only admitted counties and their accurate search scope',async()=>{
 const {elements:e}=await harness();const rows=e.get('coverage').children;
 assert.equal(rows.length,9);assert.match(e.get('catalog-summary').textContent,/9 counties with verified production sample extraction/);
 const baker=rows.find(r=>r.children[0].textContent==='Baker County, Florida');assert.equal(baker.children[2].textContent,'Use parcel ID');assert.match(baker.children[1].textContent,/collector and original bill only/);
 const bradford=rows.find(r=>r.children[0].textContent==='Bradford County, Florida');assert.equal(bradford.children[2].textContent,'Available · source gaps shown');
 assert(!e.get('coverage').textContent.includes('annual roll'));
});

test('mailing review renders distinct sites and only fills a parcel after explicit selection',async()=>{
 const candidates=[{parcel_id:'05194-0-00000',address:'SE 11TH AVE, STARKE',mailing_address:'8280 SE SWEET BAY DR; HOBE SOUND',owners:['CALLAHAN JAMES R & CHARLOTTE'],owner_matches_requested:true},{parcel_id:'05379-0-00000',address:'SE 11TH AVE, STARKE',mailing_address:'8280 SE SWEET BAY DR; HOBE SOUND',owners:['CALLAHAN JAMES R & CHARLOTTE G'],owner_matches_requested:false}];
 const {elements:e,calls}=await harness({status:'error',errorMessage:'Confirm the parcel',ExtractionMetadata:{match:{status:'ADDRESS_REVIEW_REQUIRED',candidates},sources:[]}});
 await e.get('county').change('bradford-fl');await e.get('form').onsubmit({preventDefault(){}});
 assert.match(e.get('status').textContent,/confirmation needed/);assert.match(e.get('sections').textContent,/mailing address/);assert.match(e.get('sections').textContent,/SE 11TH AVE/);assert.equal(calls.length,1);
 const buttons=[];const walk=n=>{if(n.tag==='button')buttons.push(n);for(const child of n.children)walk(child)};walk(e.get('sections'));
 assert.equal(buttons.length,2);await buttons[1].listeners.click[0]();assert.equal(e.get('parcel').value,'05379-0-00000');assert.equal(e.get('lookup-mode').value,'county');assert.equal(calls.length,1);
});

test('verified physical-address option switches to its actual county without submitting or changing owner identity',async()=>{
 const site={county:'union-fl',county_name:'Union',parcel_id:'24-06-18-00-000-0059-0',address:'8130 SW 50TH PATH, LAKE BUTLER',owners:['FLETCHER CARRIE A'],owner_matches_requested:false,address_match_type:'site'};
 const {elements:e,calls}=await harness({status:'error',ExtractionMetadata:{match:{status:'ADDRESS_REVIEW_REQUIRED',candidates:[],site_candidates:[site]},sources:[]}});
 await e.get('county').change('bradford-fl');await e.get('form').onsubmit({preventDefault(){}});assert.match(e.get('sections').textContent,/Union County/);assert.match(e.get('sections').textContent,/Do not attribute/);
 const buttons=[];const walk=n=>{if(n.tag==='button')buttons.push(n);for(const c of n.children)walk(c)};walk(e.get('sections'));assert.equal(buttons.length,1);await buttons[0].listeners.click[0]();assert.equal(e.get('county').value,'union-fl');assert.equal(e.get('parcel').value,site.parcel_id);assert.equal(e.get('lookup-mode').value,'county');assert.equal(calls.length,1);await e.get('form').onsubmit({preventDefault(){}});assert.equal(calls.at(-1).body.county,'union-fl');assert.equal(calls.at(-1).body.parcel_id,site.parcel_id);
});

test('address lookup has no county-specific address-mode control',async()=>{const {elements:e,calls}=await harness();assert.equal(e.has('address-type'),false);assert.equal(e.has('mailing-mode-field'),false);await e.get('form').onsubmit({preventDefault(){}});assert.equal('addressType' in calls[0].body,false);});

test('Bradford automatically submits and displays detected mailing meaning without changing the supplied address',async()=>{
 const result={status:'partial',scrapTaxOrderRequest:{matchStatus:'MATCHED',PropertyInformation:{ParcelNumber:'00420-0-00200',PropertyAddress:'SW 180TH PL, BROOKER',MailingAddress:'8130 SW 50TH PATH'},DelinquencyInformation:{coverage:'PARTIAL'}},ExtractionMetadata:{match:{status:'MATCHED',requested_address_type:'auto',input_address_type:'mailing',matched_address_types:['mailing']},sources:[],section_status:{PropertyInformation:'EXTRACTED'}}};
 const {elements:e,calls}=await harness(result);await e.get('county').change('bradford-fl');e.get('address').value='8130 SW 50TH PATH';e.get('owner').value='FLETCHER CARRIE';
 await e.get('form').onsubmit({preventDefault(){}});
 assert.equal(calls.length,1);assert.equal('addressType' in calls[0].body,false);assert.equal(e.get('address').value,'8130 SW 50TH PATH');
 assert.match(e.get('summary').textContent,/Owner mailing address.*detected from county records/);assert.match(e.get('sections').textContent,/00420-0-00200/);assert.match(e.get('sections').textContent,/SW 180TH PL, BROOKER/);
});

test('automatic role ambiguity shows verified candidates and waits for explicit parcel selection',async()=>{
 const candidates=[{parcel_id:'05194-0-00000',address:'SE 11TH AVE, STARKE',owners:['CALLAHAN JAMES R & CHARLOTTE'],owner_matches_requested:true,verified_address_match:true,address_match_type:'mailing_only'},{parcel_id:'05379-0-00000',address:'8280 SE SWEET BAY DR',owners:['CALLAHAN JAMES R & CHARLOTTE'],owner_matches_requested:true,verified_address_match:true,address_match_type:'site'}];
 const {elements:e,calls}=await harness({status:'error',ExtractionMetadata:{match:{status:'AMBIGUOUS',requested_address_type:'auto',candidates},sources:[]}});
 await e.get('county').change('bradford-fl');await e.get('form').onsubmit({preventDefault(){}});
 assert.match(e.get('status').textContent,/confirmation needed/);assert.match(e.get('sections').textContent,/More than one property matches/);assert.equal(calls.length,1);
 const buttons=[];const walk=n=>{if(n.tag==='button')buttons.push(n);for(const c of n.children)walk(c)};walk(e.get('sections'));
 assert.equal(buttons.length,2);await buttons[0].listeners.click[0]();assert.equal(e.get('parcel').value,'05194-0-00000');assert.equal(calls.length,1,'Choosing a candidate only fills the form');
});

test('all address-capable county API workflows use the same address-and-owner request without mode selection',()=>{
 for(const profile of catalogWorkflows(capabilities,clientCapabilities).filter(p=>p.lookup_modes.includes('address'))){
  const r=catalogRequest(profile,'address',{order:'generic-address',address:'100 TEST ST',owner:'TEST OWNER',transaction:'REFI',addressType:'mailing'});
  assert.equal('addressType' in r.body,false);assert.equal(r.body.county,profile.id);assert.equal(r.body.address,'100 TEST ST');assert.equal(r.body.ownerName,'TEST OWNER');
 }
});
