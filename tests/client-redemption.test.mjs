import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getDocumentProxy,extractTextItems} from 'unpdf';
import {parseClientBillPdf} from '../lib/client/bill.mjs';
import {parseRedemption} from '../lib/live/redemption.mjs';
import {readManagedPdf} from '../lib/live/managed-pdf.mjs';

const bytes=new Uint8Array(await readFile(new URL('./fixtures/client/miami-512-redemption-source.pdf',import.meta.url)));
test('source redemption PDF keeps fees, quote and certificate separate from annual tax and paid amounts',async()=>{
 const x=await parseClientBillPdf(bytes,'01-3231-067-0130',2025);
 assert.equal(x.BillDetails.documentType,'Delinquent Tax Certificate Redemption');assert.equal(x.BillDetails.redemption.amountDue,'$4,085.87');assert.equal(x.BillDetails.redemption.certificateNumber,'3299');assert.equal(x.BillDetails.redemption.faceAmount,'$3,885.35');assert.equal(x.BillDetails.redemption.charges.length,7);
 assert.equal(x.BillDetails.paidAmount,null);assert.equal(x.TaxAmounts.totalTax,null);assert.equal(x.TaxAmounts.adValorem,null);
 assert.deepEqual(x.PaymentDetails.PaymentSchedule,[{ifReceivedBy:'Oct 30, 2026',pleasePay:'$4,085.87'}]);assert.equal(x.validation.redemptionChargesReconciliation,'MATCHED');assert.equal(x.provenance['BillDetails.redemption.amountDue'].source_id,'receipt_pdf');
});
test('redemption PDF rejects a different parcel or bill year',async()=>{
 await assert.rejects(parseClientBillPdf(bytes,'01-3231-067-9999',2025),e=>e.code==='document_identity_mismatch');
 await assert.rejects(parseClientBillPdf(bytes,'01-3231-067-0130',2024),e=>e.code==='document_identity_mismatch');
});
test('missing charges and discrepant quote fail closed',async()=>{
 const pdf=await getDocumentProxy(bytes.slice());let items;
 try{const data=await extractTextItems(pdf);items=data.items.flatMap((page,i)=>page.filter(t=>t.str.trim()).map(t=>({...t,page:i+1})));}finally{await pdf.loadingTask.destroy();}
 assert.throws(()=>parseRedemption(items.filter(i=>i.str!=='Auction Listing Fee')),e=>e.code==='document_layout_changed');
 assert.throws(()=>parseRedemption(items.map(i=>i.str==='3,477.20'?{...i,str:'3,477.21'}:i)),e=>e.code==='document_values_disagree');
});
test('existing annual tax PDF remains an annual bill',async()=>{
 const original=new Uint8Array(await readFile(new URL('./fixtures/client/miami-annual-reference.pdf',import.meta.url)));
 const x=await parseClientBillPdf(original,'01-3231-052-0010',2025);assert.equal(x.BillDetails.redemption,undefined);assert.equal(x.TaxAmounts.totalTax,'$3,132.45');
});
test('redemption repeated certificate fields must agree across the bill and remittance stub',async()=>{
 const pdf=await getDocumentProxy(bytes.slice());let items;try{const data=await extractTextItems(pdf);items=data.items.flatMap((page,i)=>page.filter(t=>t.str.trim()).map(t=>({...t,page:i+1})));}finally{await pdf.loadingTask.destroy();}
 assert.equal(parseRedemption([...items].reverse()).amount_due,'4085.87');
 for(const [pattern,replacement]of [[/^Cert #3299$/,'Cert #3300'],[/^Face: \$3,885.35$/,'Face: $3,885.36'],[/^Rate: 0.25%$/,'Rate: 1.25%']]){
  let changed=false;const mutated=items.map(i=>pattern.test(i.str)&&i.y<200&&!changed?(changed=true,{...i,str:replacement}):i);assert(changed);assert.throws(()=>parseRedemption(mutated),e=>e.code==='document_values_disagree');
 }
 const label=items.find(i=>i.str==='Tax Due'),value=items.find(i=>Math.abs(i.y-label.y)<3&&i.x>label.x+label.width&&/^\d[\d,]*\.\d{2}$/.test(i.str));assert(value);
 assert.throws(()=>parseRedemption([...items,{...value,str:'1.00',x:value.x+40}]),e=>e.code==='document_values_disagree');
});
test('the exact client original survives silently clipped transfer and is parsed with its identity and quote intact',async()=>{
 const sha256=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');let calls=0;
 const base64=await readManagedPdf({sourceUrl:'https://county-taxes.net/iframe-taxsys/offline',size:bytes.length,sha256},async({code})=>{
  const [,offset,count]=code.match(/offset:(\d+),count:(\d+)/);let stdout='INVISIA_PDF='+Buffer.from(bytes.subarray(Number(offset),Number(offset)+Number(count))).toString('base64');if(++calls===1)stdout=stdout.slice(0,100011);return{success:true,exitCode:0,stdout};
 });
 const transferred=new Uint8Array(Buffer.from(base64,'base64'));assert.deepEqual(transferred,bytes);assert(calls>1);
 const result=await parseClientBillPdf(transferred,'01-3231-067-0130',2025);assert.equal(result.BillDetails.redemption.amountDue,'$4,085.87');assert.equal(result.BillDetails.redemption.certificateNumber,'3299');assert.equal(result.validation.redemptionChargesReconciliation,'MATCHED');
});
