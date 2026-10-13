import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHtmlTaxBill} from '../lib/live/html-bill.mjs';
import {floridaLookup} from '../lib/live/florida.mjs';
import {createApp} from '../server/app.mjs';
const fixture=name=>readFile(new URL('./fixtures/phase-two/'+name,import.meta.url),'utf8');
for(const [client,id] of [['bradford','04708-0-00200'],['desoto','30-37-25-0168-00F0-0010'],['union','30-05-20-09-000-0180-0']]){
 test(client+' delivers original HTML tax bill, printed rows, totals and provenance through authenticated API',async()=>{
  const search=await fixture(client+'-exact_search.html');const rows=JSON.parse(JSON.parse(search).result).FLTax.ResultsList;const row=(Array.isArray(rows)?rows:[rows]).find(r=>Number(r.TAXYEAR)===2025);
  const bill=await fixture(client+'-bill.html'),assessment=await fixture(({bradford:'bradford-retail-detail.html',desoto:'desoto-native-detail.html',union:'union-exact-detail.html'})[client]);const calls=[];
  const fetcher=async(url,options)=>{calls.push(url);
   if(url.includes('/gis/gisSideMenu_3_Details/showDetails/'))return new Response(assessment);
   if(url.includes('/Property/SearchSelect'))return new Response('<select name="Years"><option value="2025">2025</option></select>');
   if(url.endsWith('/Property/Search'))return new Response(search);
   if(url.endsWith('/Property/TaxBill'))return new Response(bill);
   throw new Error('Assessment unavailable in collector-focused fixture');
  };
  const app=createApp({env:{INVISIA_POC_API_KEY:'offline-key',INVISIA_BROWSER_ENABLED:'0'},fetcher,logSink:()=>{}});
  const response=await app(new Request('http://localhost/api/v1/property/lookup',{method:'POST',headers:{Authorization:'Bearer offline-key','Content-Type':'application/json'},body:JSON.stringify({county:client+'-fl',parcel_id:id,include_pdf:true})}));
  const result=await response.json();assert.equal(result.document_status,'parsed');assert.equal(result.documents.length,1);const doc=result.documents[0];assert.equal(doc.format,'HTML');assert.equal(doc.fields.bill_number,String(row.TAXBILLNO));assert.equal(doc.fields.tax_year,2025);assert.equal(doc.reconciliation.bill_number,'matched');assert.equal(doc.reconciliation.amount_paid,'matched');assert.equal(doc.source_method,'POST');assert.match(doc.sha256,/^[a-f0-9]{64}$/);assert.equal(doc.fields.parcel_id,id);assert.equal(doc.section_status.AdValoremMillage,client==='desoto'?'INSPECTED_EMPTY':'PRESENT');assert(doc.field_provenance.combined_taxes_and_assessments.selector);assert.deepEqual(result.taxes.annual_bill.TaxAmounts,doc.tax_details.TaxAmounts);assert.equal(calls.filter(u=>u.endsWith('/Property/TaxBill')).length,1);assert(!result.errors.some(e=>e.code==='document_dependency_failed'));assert(result.assessment);
  assert.throws(()=>parseHtmlTaxBill(bill,'WRONG',2025,row.TAXBILLNO),e=>e.code==='collector_identity_mismatch');
  assert.throws(()=>parseHtmlTaxBill(bill,id,2024,row.TAXBILLNO),e=>e.code==='collector_identity_mismatch');
  assert.throws(()=>parseHtmlTaxBill(bill,id,2025,'999999999'),e=>e.code==='collector_identity_mismatch');
 });
}
test('missing HTML bill is a dependency failure, never a successful no-PDF observation',async()=>{
 const result=await floridaLookup({county:'bradford-fl',parcel_id:'04708-0-00200',include_pdf:true},async()=>{throw Error('Source down')});
 assert.equal(result.document_status,'dependency_failed');assert.equal(result.documents.length,0);assert.equal(result.taxes,null);assert(result.errors.some(e=>e.code==='document_dependency_failed'));
});
test('HTML document parsing failure retains retrieved collector history without claiming parsed document',async()=>{
 const search=await fixture('bradford-exact_search.html'),html=(await fixture('bradford-bill.html')).replace(/(id="ctl00_ContentPlaceHolder1_lblAmountCollected"[^>]*>)[^<]+/, (_match,prefix)=>prefix+'$1.00');
 const assessment=await fixture('bradford-retail-detail.html');
 const result=await floridaLookup({county:'bradford-fl',parcel_id:'04708-0-00200'},async url=>{
  if(url.includes('/gis/gisSideMenu_3_Details/showDetails/'))return new Response(assessment);
  if(url.includes('/SearchSelect'))return new Response('<select name="Years"><option value="2025">2025</option></select>');
  if(url.endsWith('/Search'))return new Response(search);
  if(url.endsWith('/TaxBill'))return new Response(html);throw Error('Unavailable');
 });
 assert.equal(result.documents.length,0);assert(result.taxes);assert.equal(result.document_status,'failed');assert(result.errors.some(e=>e.code==='ambiguous_collector_bill'));
});
