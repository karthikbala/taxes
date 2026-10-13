import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {Script} from 'node:vm';
import {parseMartin,martinCollectorKey,parseOsceola,parseHernando,parseDeSoto,parsePinellas,pinellasInternal} from '../lib/live/phase-two-office.mjs';
import {parseVisualGov,resolveVisualGov} from '../lib/live/visualgov.mjs';import {phaseTwo} from '../lib/live/phase-two.mjs';import {assessmentCaptureCode} from '../lib/live/managed-browser.mjs';
const html=async n=>readFile(new URL('./fixtures/phase-two/'+n,import.meta.url),'utf8');const json=async n=>JSON.parse(await html(n));
test('ten additional workflows include distinct collector/document families',()=>{assert.equal(Object.keys(phaseTwo).length,10);assert.equal(Object.values(phaseTwo).filter(a=>a.documents==='html_bill').length,3);assert.equal(phaseTwo['martin-fl'].collector_key,'collector_parcel_id');});
test('Martin fresh PIN query and actual source cross-reference prove collector key',async()=>{const d=await json('martin-pin-exact.json'),r=parseMartin(d,'03-38-41-000-000-00114-1');assert.equal(r.assessment.assessed_total,'15918680');assert.equal(r.assessment.year,2026);assert.equal(martinCollectorKey(await html('martin-detail.html'),r.property.parcel_id,r.property.account_id),'03-38-41-000-000-00114-10000');assert.throws(()=>parseMartin(d,'03-38-41-000-000-00115-1'));assert.throws(()=>parseMartin({...d,total:2},r.property.parcel_id));assert.throws(()=>parseMartin({total:0,records:[]},r.property.parcel_id),e=>e.code==='not_found');});
test('Osceola preserves independently reported certified2026 and working2027',async()=>{const m=await json('osceola-exact-market.json'),v=await json('osceola-exact-values.json'),r=parseOsceola(m,v,'21-25-29-1881-0001-0030');assert.equal(r.assessment.year,2026);assert.equal(r.assessment.assessed_total,'25079200');assert.equal(r.working_assessment.year,2027);assert.equal(r.working_assessment.assessed_total,'24872300');assert.throws(()=>parseOsceola(m,{value:[...v.value,...v.value]},r.property.parcel_id));assert.throws(()=>parseOsceola({value:[]},v,r.property.parcel_id),e=>e.code==='not_found');});
test('Hernando office-owned GIS retains certified basis, no inferred collector tax',async()=>{const d=await json('hernando-gis-exact.json'),r=parseHernando(d,'R31 423 18 0000 0040 0000');assert.equal(r.assessment.assessed_total,'97200');assert.equal(r.assessment.taxable_non_school,'0');assert.equal(r.assessment.year,2026);assert.equal(r.source_record_date,'2026-10-05T00:00:00.000Z');assert.equal(r.taxes,undefined);assert.throws(()=>parseHernando({features:[]},r.property.parcel_id),e=>e.code==='not_found');const wrong=structuredClone(d);wrong.features[0].attributes.COUNTY='OTHER';assert.throws(()=>parseHernando(wrong,r.property.parcel_id));});
for(const [name,file,id,value,year] of [['DeSoto','desoto-native-detail.html','30-37-25-0168-00F0-0010','650000',2026],['Suwannee','suwannee-retail-detail.html','12-02S-13E-04955-002000','5913732',2027],['Columbia','columbia-exact-detail.html','35-3S-16-02519-001','9096544',2026],['Bradford','bradford-retail-detail.html','04708-0-00200','10002023',2026],['Union','union-exact-detail.html','30-05-20-09-000-0180-0','664287',2026]])test(name+' native labelled values reject wrong identity and source blanks',async()=>{const h=await html(file),r=parseDeSoto(h,id);assert.equal(r.assessment.assessed_total,value);assert.equal(r.assessment.year,year);assert.ok(r.property.owner);assert.ok(r.property.address);if(name==='Union'){assert.equal(r.assessment.land,'117876');assert.equal(r.assessment.building,'530393');}if(name==='DeSoto')assert.equal(r.assessment.building,'650000');assert.throws(()=>parseDeSoto(h,'WRONG'));assert.throws(()=>parseDeSoto('',id),e=>e.code==='not_found');assert.throws(()=>parseDeSoto(h.replace(/Assessed/g,'Removed'),id));});
test('Pinellas display and internal keys use source permutation and exact returned parcel',async()=>{const h=await html('pinellas-rendered.html'),r=parsePinellas(h,'01-30-14-01117-000-0001');assert.equal(pinellasInternal(r.property.parcel_id),'143001011170000001');assert.equal(r.assessment.year,2026);assert.equal(r.assessment.assessed_total,'0');assert.equal(r.assessment.year_status,'Final');assert.throws(()=>parsePinellas(h,'01-30-14-01117-000-0002'));new Script('(async()=>{'+assessmentCaptureCode('https://www.pcpao.gov/property-details?s=143001011170000001')+'})');});
test('VisualGov requires complete exact source resolver and original HTML bill identity',async()=>{const d=await json('desoto-exact_search.html'),r=resolveVisualGov(d,'30-37-25-0168-00F0-0010',2025),b=parseVisualGov(await html('desoto-bill.html'),'30-37-25-0168-00F0-0010',r);assert.equal(b.taxes.summary.balance_due,'0.00');assert.equal(b.taxes.history.find(h=>h.year===2022).paid_amount,'13573.41');assert.equal(b.taxes.history.find(h=>h.year===2025).payment_date,null);const bill=await html('desoto-bill.html');assert.throws(()=>parseVisualGov(bill,'wrong',r));assert.throws(()=>resolveVisualGov(d,'WRONG',2025));const negative=await json('desoto-negative-search.json');assert.throws(()=>resolveVisualGov(negative.body,'00-00-00-0000-0000-0000',2025),e=>e.code==='collector_not_found');});

for(const [client,id,amount]of [['bradford','04708-0-00200','193540.85'],['union','30-05-20-09-000-0180-0','12943.97']])test(client+' HTML bill variation preserves exact payment without duplicate headings',async()=>{const row=resolveVisualGov(await json(client+'-exact_search.html'),id,2025),r=parseVisualGov(await html(client+'-bill.html'),id,row);assert.equal(r.taxes.history[0].paid_amount,amount);assert.equal(r.taxes.summary.balance_due,'0.00');assert.equal(new Set(r.taxes.history.map(h=>h.year)).size,r.taxes.history.length);});
import {parseTaxsysIdentity} from '../lib/live/taxsys.mjs';import {parseTaxBillPdf} from '../lib/live/pdf-text.mjs';
test('Osceola collector R account independently links to exact native assessor PIN',async()=>{const h=await html('osceola-rendered.html'),i=parseTaxsysIdentity(h,'R022528285000010010');assert.equal(i.appraiser_parcel_id,'022528285000010010');assert.ok(i.address.includes('3250 VINELAND RD'));assert.throws(()=>parseTaxsysIdentity(h,'R022528285000010011'));const p=await parseTaxBillPdf(new Uint8Array(await readFile(new URL('./fixtures/phase-two/osceola-original.pdf',import.meta.url))),'R022528285000010010',2025);assert.equal(p.fields.amount_paid,'273974.06');});
test('Martin issuer-specific printed TOTAL includes explicit zero without fabricated payment',async()=>{const b=new Uint8Array(await readFile(new URL('./fixtures/phase-two/martin-original.pdf',import.meta.url))),p=await parseTaxBillPdf(b,'0338410000000011410000',2025);assert.equal(p.fields.combined_taxes_and_assessments,'0.00');assert.equal(p.fields.amount_paid,undefined);assert.equal(p.field_provenance.combined_taxes_and_assessments.page,2);await assert.rejects(()=>parseTaxBillPdf(b,'WRONG',2025));});
import {resolveTaxsys} from '../lib/live/taxsys.mjs';
test('Osceola prefix resolves one fresh parent; absent prefix and wrong county reject',async()=>{const hit=await json('osceola-search.json'),d={results:[{hits:[hit],nbHits:1}]},r=resolveTaxsys(d,'R022528285000010010','osceola');assert.equal(r.external_id,'R022528-285000010010');assert.throws(()=>resolveTaxsys(d,'022528285000010010','osceola'));assert.throws(()=>resolveTaxsys(d,'R022528285000010010','martin'));});
import {makeManagedBrowser} from '../lib/live/managed-browser.mjs';
test('managed source allowlist rejects arbitrary sites, paths and extra assessor query fields before charging',async()=>{const browser=makeManagedBrowser({DB:{},INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'TEST_ONLY'});for(const url of ['http://www.pcpao.gov/property-details?s=143001011170000001','https://www.pcpao.gov/admin?s=143001011170000001','https://www.pcpao.gov/property-details?s=143001011170000001&redirect=https://example.com','https://www.ccappraiser.com/Show_parcel.asp?acct=412306353004','https://example.com/'])await assert.rejects(()=>browser({url,county:'pinellas-fl',includePdf:false}),e=>e.code==='source_url_rejected');});
test('PDF transfer failure preserves fresh collector HTML and closes the charged browser session',async()=>{const saved=globalThis.fetch;let closed=false;const db={prepare:sql=>({bind:(...args)=>({sql,args,first:async()=>({limit_milli_usd:5000,spent_milli_usd:40,reserved_milli_usd:0})})}),batch:async statements=>statements.map(()=>({meta:{changes:1}}))};globalThis.fetch=async(url,options)=>{if(options.method==='DELETE'){closed=true;return Response.json({success:true,creditsBilled:2});}if(url.endsWith('/execute')){const req=JSON.parse(options.body);if(req.code.includes('INVISIA_PDF='))return new Response('',{status:502});return Response.json({success:true,exitCode:0,stdout:'INVISIA_RESULT='+JSON.stringify({html:'<h1>Source record retained</h1>',url:'https://county-taxes.net/iframe-taxsys/osceola.county-taxes.com/govhub/property-tax/EXAMPLE',pdf:{url:'https://county-taxes.net/print',size:10}})});}return Response.json({success:true,id:'TEST_SESSION'});};try{const b=makeManagedBrowser({DB:db,INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'TEST_ONLY'}),r=await b({url:'https://county-taxes.net/osceola/property-tax/EXAMPLE',county:'osceola-fl',includePdf:true});assert.ok(r.html.includes('Source record retained'));assert.equal(r.pdf,undefined);assert.ok(r.pdf_error);assert.ok(closed);}finally{globalThis.fetch=saved;}});

import {columbiaCollectorReference,lookupPhaseTwoOffice} from '../lib/live/phase-two-office.mjs';
import {phenixLookup} from '../lib/live/phenix.mjs';
test('Columbia collector account requires the official full assessor parcel and explicit tax link',async()=>{
 const h=await html('columbia-collector-reference.html'),id='35-3S-16-02519-001';
 assert.equal(columbiaCollectorReference(h,id),'R02519-001');
 assert.throws(()=>columbiaCollectorReference(h,'36-3S-16-02519-001'),e=>e.code==='identity_mismatch');
 assert.throws(()=>columbiaCollectorReference(h.replace('https://columbia.floridatax.us','https://example.com'),id),e=>e.code==='collector_identity_missing');
 assert.throws(()=>columbiaCollectorReference(h.replace('R02519-001','P02519-001'),id),e=>e.code==='collector_identity_missing');
 assert.throws(()=>columbiaCollectorReference(h+h.match(/<a[\s\S]*?<\/a>/)[0].replace('R02519-001','R02519-002'),id),e=>e.code==='collector_identity_missing');
});
test('Columbia uses an echoed parcel cross-reference and retains assessment on cross-reference failure',async()=>{
 const county={id:'columbia-fl'},params={parcel_id:'35-3S-16-02519-001'},calls=[];
 const get=async(url,source)=>{calls.push({url,source});return html(source==='assessment_county'?'columbia-exact-detail.html':'columbia-collector-reference.html');};
 const r=await lookupPhaseTwoOffice(county,params,get,()=>{});
 assert.equal(r.property.collector_parcel_id,'R02519-001');assert.equal(r.assessment.assessed_total,'9096544');
 assert.equal(calls[1].url,'https://search.ccpafl.com/parcel/02519001163S35');
 const rejected=await lookupPhaseTwoOffice(county,params,async(url,source)=>source==='assessment_county'?html('columbia-exact-detail.html'):'<h1 class="title-heading">Parcel WRONG</h1>',()=>{});
 assert.equal(rejected.assessment.assessed_total,'9096544');assert.equal(rejected.property.collector_parcel_id,undefined);assert.equal(rejected.collector_reference_error.code,'identity_mismatch');
});
test('Columbia collector searches its explicit formatted account rather than the full assessor parcel',async()=>{
 let query;
 await assert.rejects(()=>phenixLookup({client:'columbia',expectedId:'R02519-001',verify:()=>{},includePdf:false,get:async(url,source,headers,opts)=>{
  if(source==='collector_session')return '<input type="hidden" name="__VIEWSTATE" value="TEST_ONLY">';
  query=new URLSearchParams(opts.body).get('ctl00$MainContent$txtSearchCriteria');return '<span id="MainContent_lblSearchCount">No Records Found</span>';
 }}),e=>e.code==='collector_not_found');
 assert.equal(query,'R02519-001');assert.equal(phaseTwo['columbia-fl'].collector_key,'collector_parcel_id');
});

import {pinellasCollectorReference} from '../lib/live/phase-two-office.mjs';
test('Pinellas current assessor publishes its exact full-parcel Phenix g cross-reference',async()=>{
 const h=await html('pinellas-current-assessor.html'),id='01-30-14-01117-000-0001',url='https://pinellas.floridatax.us/PropertyDetail?g=013014011170000001';
 assert.equal(pinellasCollectorReference(h,id),url);
 assert.throws(()=>pinellasCollectorReference(h,'01-30-14-01117-000-0002'),e=>e.code==='identity_mismatch');
 assert.throws(()=>pinellasCollectorReference(h.replaceAll('g=013014011170000001','g=013014011170000002'),id),e=>e.code==='collector_identity_missing');
 assert.throws(()=>pinellasCollectorReference(h.replaceAll('https://pinellas.floridatax.us','https://example.com'),id),e=>e.code==='collector_identity_missing');
 const parsed=await lookupPhaseTwoOffice({id:'pinellas-fl'},{parcel_id:id},async()=>h,()=>{});
 assert.equal(parsed.property.collector_reference_url,url);assert.equal(parsed.assessment.assessed_total,'0');
 assert.equal(phaseTwo['pinellas-fl'].collector_key,'parcel_id');
});
test('Pinellas follows authoritative g link to separate R account, bill year and print action',async()=>{
 const h=await html('pinellas-g-collector.html'),id='01-30-14-01117-000-0001',url='https://pinellas.floridatax.us/PropertyDetail?g=013014011170000001',calls=[];
 const r=await phenixLookup({client:'pinellas',expectedId:id,parcelReference:url,includePdf:true,verify:()=>{},get:async u=>{calls.push(u);return h;}});
 assert.deepEqual(calls,[url]);assert.equal(r.identity.parcel_id,'R3998');assert.equal(r.identity.appraiser_parcel_id,id);
 assert.equal(r.taxes.summary.balance_due,'0.00');assert.equal(r.taxes.history[0].year,2025);
 assert.equal(r.taxes.history[0].bill_number,'319274');assert.equal(r.taxes.history[0].payment_date,null);
 assert.equal(r.print_request.url,'https://pinellas.floridatax.us/PropertyDetail?p=R3998&y=2025');
 await assert.rejects(()=>phenixLookup({client:'pinellas',expectedId:id,includePdf:false,get:async()=>{throw Error('Must not fetch');}}),e=>e.code==='collector_dependency_failed');
 await assert.rejects(()=>phenixLookup({client:'pinellas',expectedId:id,parcelReference:url+'0',get:async()=>{throw Error('Must not fetch');}}),e=>e.code==='collector_identity_mismatch');
 await assert.rejects(()=>phenixLookup({client:'pinellas',expectedId:id,parcelReference:url,verify:()=>{},get:async()=>h.replaceAll('PropertyDetail?p=R3998','PropertyDetail?p=R3999')}),e=>e.code==='collector_identity_mismatch');
});

import {floridaLookup} from '../lib/live/florida.mjs';
test('Pinellas parcel API joins the published account and zero-tax original PDF without parcel-account substitution',async()=>{
 const calls=[],id='01-30-14-01117-000-0001';
 const r=await floridaLookup({state:'FL',county:'pinellas-fl',parcel_id:id,source_mode:'county',include_pdf:true},async(url,opts)=>{
  calls.push({url,method:opts.method||'GET'});
  if(url.startsWith('https://www.pcpao.gov/property-details?'))return new Response(await html('pinellas-current-assessor.html'));
  if(url==='https://pinellas.floridatax.us/PropertyDetail?g=013014011170000001')return new Response(await html('pinellas-g-collector.html'));
  if(url==='https://pinellas.floridatax.us/PropertyDetail?p=R3998&y=2025'&&opts.method==='POST')return new Response(await readFile(new URL('./fixtures/phase-two/pinellas-original-zero.pdf',import.meta.url)));
  throw Error('Unexpected source request: '+url);
 });
 assert.equal(r.status,'succeeded');assert.deepEqual(r.errors,[]);assert.equal(r.document_status,'parsed');
 assert.equal(r.join.assessment_value,id);assert.equal(r.join.collector_value,id);assert.equal(r.join.collector_account_id,'R3998');
 assert.equal(r.documents[0].fields.combined_taxes_and_assessments,'0.00');assert.equal(r.taxes.summary.balance_due,'0.00');
 assert.ok(calls.every(c=>!c.url.includes('AccountSearch')));
});
