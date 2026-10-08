import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clientLookup} from '../lib/client/engine.mjs';
const read=n=>fs.readFileSync(new URL('./fixtures/client/'+n,import.meta.url));
const json=n=>JSON.parse(read(n));
const quiet=()=>{};
test('Bradford address owner narrowing joins authoritative HTML bill without a manufactured PDF',async()=>{
 const calls=[];
 const get=async url=>{const u=new URL(url);calls.push(u.href);
  if(u.hostname==='www.bradfordappraiser.com'){
   if(/recordSearch_2_Results/i.test(u.pathname))return new Response(read('bradford-appraiser-address-search.html'));
   if(/linkPropCard/i.test(u.pathname))return new Response(read('bradford-appraiser-card.pdf'));
   if(/showDetails/i.test(u.pathname))return new Response(read('bradford-appraiser-detail.html'));
  }
  if(u.hostname==='www.bradfordtaxcollector.com'){
   if(u.pathname==='/Property/SearchSelect')return new Response(read('bradford-collector-entry-reference.html'));
   if(u.pathname==='/Property/Search')return Response.json({success:true,result:JSON.stringify({FLTax:json('bradford-collector-search-2026-10-06.json').FLTax})}); // Recorded result body wrapped in documented transport envelope for offline composition.
   if(u.pathname==='/Property/TaxBill')return new Response(read('bradford-collector-bill-2026-10-06.html'));
  }
  throw Error('Unexpected fixture source '+u.hostname+u.pathname);
 };
 const d=await clientLookup({scrap_order_id:'OFFLINE-BRADFORD',county:'Bradford',address:'14500 S HWY 301',ownerName:'WALMART STORES EAST, LP',transactionType:'PURCHASE'},get,{log:quiet});
 const r=d.scrapTaxOrderRequest;
 assert.equal(r.matchStatus,'MATCHED');assert.equal(r.PropertyInformation.ParcelNumber,'04708-0-00200');
 assert.equal(r.AdValoremMillage.length,5);assert.equal(r.BillDetails.taxYear,'2025');assert.equal(r.AssessmentInformation.Year,'2026');
 assert.equal(r.TaxAmounts.totalTax,'$201,605.05');assert.equal(r.BillDetails.paidAmount,'$193,540.85');assert.equal(r.TaxInformation.amountDue,'$0.00');
 assert.equal(d.ExtractionMetadata.provenance.original_annual_bill.format,'HTML');assert.equal(d.ExtractionMetadata.validation.parcel_join,'matched');
 assert.equal(r.DelinquencyInformation.hasActiveDelinquency,null);assert.equal(r.FullLegalDescription.length>0,true);assert.equal(r.SalesInformation.length,4);
 assert.equal(d.ExtractionMetadata.errors.length,0);assert.equal(calls.some(u=>u.includes('/api/v1/property')),false);
});
test('Osceola native rich sections survive a blocked collector and keep certified/working years distinct',async()=>{
 const names={parcelmarket:'osceola-market-2026-10-08.json',propertyvalues:'osceola-certified-values-2026-10-08.json',sales:'osceola-sales-2026-10-08.json',lnd_c:'osceola-lnd_c-2026-10-08.json',bld:'osceola-bld-2026-10-08.json',xfob:'osceola-xfob-2026-10-08.json'};
 const get=async url=>{const u=new URL(url),name=names[u.pathname.split('/').at(-1).toLowerCase()];return u.hostname==='search.property-appraiser.org'&&name?Response.json(json(name)):new Response('Access challenge',{status:403});};
 const d=await clientLookup({scrap_order_id:'OFFLINE-OSCEOLA',county:'Osceola',address:'3250 VINELAND RD',ownerName:'WAL-MART STORES EAST LP',transactionType:'REFI'},get,{log:quiet});
 const r=d.scrapTaxOrderRequest;
 assert.equal(r.matchStatus,'MATCHED');assert.equal(r.PropertyInformation.ParcelNumber,'02-25-28-2850-0001-0010');assert.equal(r.AssessmentInformation.Year,'2026');
 assert.equal(r.AssessmentInformation.AssessedValue,'$13,641,900');assert.ok(r.AssessmentHistory.some(x=>x.Year==='2027'&&x.Status==='WORKING'));
 assert.equal(r.SalesInformation.length,3);assert.equal(r.BillDetails.taxYear,null);assert.equal(r.DelinquencyInformation.hasActiveDelinquency,null);
 assert.ok(d.ExtractionMetadata.errors.some(e=>e.code==='source_blocked'));assert.equal(d.ExtractionMetadata.section_status.PropertyInformation.status,'EXTRACTED');
});
