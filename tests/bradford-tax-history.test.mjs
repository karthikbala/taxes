import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
import{parseBradfordHistorySearch,parseBradfordHistoricalBill,lookupBradfordTaxHistory}from'../lib/client/bradford-tax-history.mjs';
import{serializeClientRecord}from'../lib/client/contract.mjs';
const file=name=>readFile(new URL('./fixtures/client/bradford-history-'+name,import.meta.url),'utf8');
const data=JSON.parse(await file('fletcher-all-years.json')),parcel='00420-0-00200';
const html2013=await file('fletcher-2013-zero.html'),html2018=await file('fletcher-2018-zero.html');
const rows=parseBradfordHistorySearch(data,parcel),row2013=rows.find(r=>r.TAXYEAR==='2013'),row2018=rows.find(r=>r.TAXYEAR==='2018');
test('official All Years search exposes thirteen Fletcher records back to 2013, not only seven current delinquent years',()=>{
 assert.equal(rows.length,13);assert.equal(rows[0].TAXYEAR,'2025');assert.equal(rows.at(-1).TAXYEAR,'2013');
 const mutate=f=>{const d=JSON.parse(data.result);f(d.FLTax);return{...data,result:JSON.stringify(d)};};
 for(const bad of [mutate(d=>d.ResultsInfo.TotalRowCount='14'),mutate(d=>d.ResultsInfo.Skip='50'),mutate(d=>d.ResultsList[0].PROPERTYNO='99999-0-00000'),mutate(d=>d.ResultsList[0].TAXYEAR='bad'),mutate(d=>d.ResultsList[0]=d.ResultsList[1])])assert.throws(()=>parseBradfordHistorySearch(bad,parcel));
 assert.throws(()=>parseBradfordHistorySearch(data,parcel,{maximum:12}),e=>e.code==='history_search_incomplete');
});
test('archived certificate zero balances do not fabricate payment or lifecycle closure',()=>{
 const r=parseBradfordHistoricalBill(html2013,parcel,row2013);assert.equal(r.amountDue,'$0.00');assert.equal(r.paidAmount,null);assert.equal(r.paidDate,null);assert.equal(r.certificate.number,'74');assert.equal(r.certificate.status,'UNKNOWN');assert.equal(r.includedInCurrentLiabilityTotal,false);
 for(const bad of [html2013.replace('R 96300 2013','R 96300 2014'),html2013.replaceAll(parcel,'99999-0-00000'),html2013.replaceAll('FLETCHER CARRIE','UNRELATED OWNER')])assert.throws(()=>parseBradfordHistoricalBill(bad,parcel,row2013),e=>e.code==='collector_identity_mismatch');
});
test('previous owners and certificate face amounts are retained without substituting them for current debt',async()=>{
 const html=await file('boyd-2020-previous-owner.html'),row={TAXBILLNO:'1356600',TAXYEAR:'2020',NAME:'HALL MICHAEL K'};
 const r=parseBradfordHistoricalBill(html,'05632-0-00000',row);assert.equal(r.sourceOwner,'HALL MICHAEL K');assert.equal(r.amountDue,'$0.00');assert.equal(r.certificate.faceAmount,'$599.68');assert.equal(r.certificate.status,'UNKNOWN');assert.equal(r.paidDate,null);
});
function stub({failBills=false}={}){
 const two={...data,result:JSON.stringify({FLTax:{ResultsInfo:{Rows:'50',Skip:'0',TotalRowCount:'2'},ResultsList:[row2013,row2018]}})},calls=[];
 return{calls,request:async(url,options)=>{calls.push({url,options});let response;
  if(url.includes('/SearchSelect'))response=new Response('<select name="Years"><option value="">All Years</option></select>',{headers:{'set-cookie':'county-session=test-only; Path=/'}});
  else if(url.endsWith('/Search')){assert.equal(new URLSearchParams(options.body).get('Years'),'');assert.match(options.headers.Cookie,/county-session=test-only/);response=Response.json(two);}
  else if(url.endsWith('/TaxBill')){const y=new URLSearchParams(options.body).get('taxyear');response=failBills?new Response('blocked',{status:403}):new Response(y==='2013'?html2013:html2018);}
  else throw Error('Unexpected source');Object.defineProperty(response,'url',{value:url});return response;
 }};
}
test('bounded original retrieval verifies search scope, source hashes and years without claiming clearance',async()=>{
 const s=stub(),r=await lookupBradfordTaxHistory({parcel,request:s.request});assert.equal(r.records.length,2);assert.equal(r.coverage.status,'COMPLETE_PUBLIC_QUERY');assert.equal(r.coverage.originalRecordsRetrieved,2);assert.equal(r.coverage.historicalClearanceEstablished,false);assert.equal(r.coverage.allHolderCertificateHistoryComplete,false);assert.equal(r.errors.length,0);assert.ok(r.records.every(x=>x.documentStatus==='EXTRACTED'&&/^[a-f0-9]{64}$/.test(x.sourceSha256)));
});
test('unavailable originals retain discovered identities without invented amounts',async()=>{
 const s=stub({failBills:true}),r=await lookupBradfordTaxHistory({parcel,request:s.request});assert.equal(r.coverage.status,'PARTIAL');assert.equal(r.records.length,2);assert.equal(r.coverage.originalRecordsRetrieved,0);assert.ok(r.records.every(x=>x.amountDue===undefined&&x.documentStatus==='UNAVAILABLE'));assert.equal(r.errors.length,2);
});
test('optional historical records survive serialization while latest-year account history stays unchanged',()=>{
 const record=parseBradfordHistoricalBill(html2013,parcel,row2013),input={scrap_order_id:'history-test',address:'8130 SW 50TH PATH',ownerName:'FLETCHER CARRIE',county:'bradford-fl',transactionType:'REFI'};
 const result=serializeClientRecord(input,{sections:{AccountHistory:[{billYear:'2025',billType:'Annual',amountDue:'$124.47'},{billYear:'2019',billType:'Annual',amountDue:'$103.91'}],HistoricalTaxRecords:[record],PublishedTaxHistory:[{billYear:'2025',paidAmount:'$1.00'},{billYear:'2012',paidAmount:'$2.00'}],HistoricalTaxCoverage:{historicalClearanceEstablished:false}},section_status:{HistoricalTaxRecords:'EXTRACTED',HistoricalTaxCoverage:'EXTRACTED'}});
 assert.equal(result.scrapTaxOrderRequest.PublishedTaxHistory.length,2);assert.equal(result.scrapTaxOrderRequest.PublishedTaxHistory[1].billYear,'2012');assert.equal(result.scrapTaxOrderRequest.AccountHistory.length,1);assert.equal(result.scrapTaxOrderRequest.AccountHistory[0].billYear,'2025');assert.equal(result.scrapTaxOrderRequest.HistoricalTaxRecords[0].billYear,'2013');assert.equal(result.scrapTaxOrderRequest.HistoricalTaxRecords[0].paidDate,null);assert.equal(result.scrapTaxOrderRequest.HistoricalTaxCoverage.historicalClearanceEstablished,false);assert.equal(result.ExtractionMetadata.section_status.HistoricalTaxRecords.status,'EXTRACTED');
});
