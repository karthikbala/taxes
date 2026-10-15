import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {parseClientVisualGovBill} from '../lib/client/visualgov.mjs';import {parseVisualGov} from '../lib/live/visualgov.mjs';import {parseHtmlTaxBill} from '../lib/live/html-bill.mjs';import {classifyDelinquency} from '../lib/client/delinquency.mjs';
import{serializeClientRecord}from'../lib/client/contract.mjs';import{explainResult}from'../lib/reliability/gaps.mjs';
const html=await readFile(new URL('./fixtures/client/bradford-delinquent-05194-20261013.html',import.meta.url),'utf8'),id='05194-0-00000',row={TAXBILLNO:'1336500',TAXYEAR:'2025'};
test('Bradford exact client certificate notice returns both delinquent years and collectible amounts',()=>{
 const r=parseClientVisualGovBill(html,id,2025),d=classifyDelinquency({...r.history,county:'bradford-fl',asOf:'2026-10-13'});
 assert.equal(r.history.reportedDelinquentTotal,'$216.55');assert.equal(d.hasActiveDelinquency,true);assert.equal(d.delinquentYears.length,2);assert.equal(d.currentYearDue,'$130.33');assert.equal(d.knownPriorYearsDue,'$86.22');assert.equal(d.totalPriorYearsDue,null);
 assert.equal(r.BillDetails.certificate.number,'1116');assert.equal(r.BillDetails.certificate.faceAmount,'$115.42');assert.equal(r.BillDetails.certificate.interestAmount,'$8.66');assert.equal(r.BillDetails.certificate.fees,'$6.25');
 assert.equal(r.BillDetails.paidDate,null);assert.equal(r.BillDetails.paidAmount,null);assert.equal(r.TaxAmounts.totalTax,null);assert.equal(r.TaxAmounts.totalDiscountable,null);
 const native=parseVisualGov(html,id,row);assert.equal(native.taxes.history[0].balance_due,'130.33');assert.equal(native.taxes.summary.reported_delinquent_total,'$216.55');
 assert.equal(parseHtmlTaxBill(html,id,2025,'1336500').doc_type,'certificate_notice');
});
test('Bradford certificate notice rejects wrong identity, corrupted amounts and duplicate liabilities',()=>{
 assert.throws(()=>parseClientVisualGovBill(html,'05194-0-00001',2025));assert.throws(()=>parseClientVisualGovBill(html,id,2024));assert.throws(()=>parseVisualGov(html,id,{...row,TAXBILLNO:'999999'}));
 assert.throws(()=>parseClientVisualGovBill(html.replace('$216.55','$216.56'),id,2025),e=>e.code==='source_values_disagree');
 assert.throws(()=>parseClientVisualGovBill(html.replace('value="1328300"','value="9999999"'),id,2025),e=>e.code==='collector_identity_mismatch');
});
test('Bradford paid bill retains requested totals and receipt fields and sums all fractional rates in exact mills',async()=>{
 const h=await readFile(new URL('./fixtures/phase-two/bradford-bill.html',import.meta.url),'utf8'),r=parseClientVisualGovBill(h,'04708-0-00200',2025);
 assert.equal(r.TaxAmounts.totalTax,'$201,605.05');assert.equal(r.BillDetails.paidAmount,'$193,540.85');assert.equal(r.BillDetails.paidDate,'11/18/2025');assert.equal(r.TaxAmounts.totalDiscountable,null);
 const sum=r.AdValoremMillage.reduce((s,r)=>s+BigInt(r.millage.replace(/^(?:0)?\./,'').padEnd(8,'0')),0n);const mills=sum*1000n;assert.equal(r.ParcelDetails.totalMillageRate,`${mills/100000000n}.${String(mills%100000000n).padStart(8,'0')}`);assert.equal(r.ParcelDetails.totalMillageRateUnit,'mills');assert.equal(r.AdValoremMillage.length,5);
});

test('Fletcher blank certificate status retains seven reconciled unpaid years without inventing status',async()=>{
 const h=await readFile(new URL('./fixtures/client/bradford-fletcher-certificate.html',import.meta.url),'utf8');const r=parseClientVisualGovBill(h,'00420-0-00200',2025);
 assert.equal(r.BillDetails.certificate.status,'UNKNOWN');assert.equal(r.BillDetails.certificate.statusRaw,null);assert.equal(r.BillDetails.certificate.number,'50');assert.equal(r.TaxInformation.amountDue,'$124.47');assert.equal(r.BillDetails.paidDate,null);assert.ok(r.AccountHistory.length>=7);assert.equal(r.validation.delinquentTotalReconciliation,'MATCHED');
 assert.throws(()=>parseClientVisualGovBill(h.replace('id="ctl00_ContentPlaceHolder1_lblCertificateStatus"></span>','id="ctl00_ContentPlaceHolder1_lblCertificateStatus">UNRECOGNIZED</span>'),'00420-0-00200',2025),e=>e.code==='collector_layout_changed');
 assert.throws(()=>parseClientVisualGovBill(h.replace('$124.47','$124.48'),'00420-0-00200',2025),e=>e.code==='source_values_disagree');
});
test('both client certificate examples keep annual breakdown, summed mills and receipt fields unavailable',async()=>{
 const fletcher=await readFile(new URL('./fixtures/client/bradford-fletcher-certificate.html',import.meta.url),'utf8');
 for(const [source,parcel,certificate] of [[html,id,'1116'],[fletcher,'00420-0-00200','50']]){
  const r=parseClientVisualGovBill(source,parcel,2025);
  assert.equal(r.BillDetails.certificate.number,certificate);
  for(const name of ['adValorem','nonAdValorem','totalTax','totalDiscountable'])assert.equal(r.TaxAmounts[name],null,parcel+' '+name);
  assert.equal(r.ParcelDetails.totalMillageRate,null);assert.deepEqual(r.AdValoremMillage,[]);assert.deepEqual(r.NonAdValorem,[]);
  assert.equal(r.BillDetails.paidDate,null);assert.equal(r.BillDetails.paidAmount,null);assert.equal(r.BillDetails.receiptNumber,null);
 }
});
test('client delivery distinguishes certificate-source omissions from failed extraction or an empty paid history',()=>{
 const source=parseClientVisualGovBill(html,id,2025),{section_status,provenance,validation,notes,history,...sections}=source,input={scrap_order_id:'client-fields',county:'bradford-fl',address:'8280 SE SWEET BAY DR',addressType:'mailing',ownerName:'CALLAHAN JAMES R & CHARLOTTE',transactionType:'REFI',state:'FL'};
 const result=serializeClientRecord(input,{sections,section_status,provenance,validation,match:{status:'MATCHED',parcel_id:id},delinquency:classifyDelinquency({...history,county:'bradford-fl',asOf:'2026-10-13'})}),fields=explainResult(result).fields;
 for(const path of ['BillDetails.paidDate','BillDetails.paidAmount','TaxAmounts.adValorem','TaxAmounts.nonAdValorem','TaxAmounts.totalTax','ParcelDetails.totalMillageRate','ParcelDetails.millageRateUnit','AdValoremMillage','NonAdValorem','PaymentDetails.PaymentSchedule'])assert.equal(fields[path].reason,'NOT_PUBLISHED',path);
 assert.equal(result.scrapTaxOrderRequest.ParcelDetails.totalMillageRate,null);assert.equal(result.scrapTaxOrderRequest.ParcelDetails.millageRateUnit,null);assert.equal(result.scrapTaxOrderRequest.DelinquencyInformation.knownTotalDue,'$216.55');assert.equal(fields.AdValoremMillage.status,'UNAVAILABLE');
 const uninspected=explainResult({scrapTaxOrderRequest:{AdValoremMillage:[]},ExtractionMetadata:{section_status:{AdValoremMillage:'UNAVAILABLE'},errors:[]}});assert.equal(uninspected.fields.AdValoremMillage.reason,'LAYOUT_UNSUPPORTED');
});
