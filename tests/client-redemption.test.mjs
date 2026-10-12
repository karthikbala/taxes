import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getDocumentProxy,extractTextItems} from 'unpdf';
import {parseClientBillPdf} from '../lib/client/bill.mjs';
import {parseRedemption} from '../lib/live/redemption.mjs';

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
