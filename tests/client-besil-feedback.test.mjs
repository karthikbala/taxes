import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {load} from 'cheerio';
import {normalizeMiamiAddress, addressMatches, matchMiamiCandidates, resolveMiami} from '../lib/client/miami.mjs';
import {matchOsceolaCandidates} from '../lib/client/osceola.mjs';
import {matchBradfordCandidates} from '../lib/client/bradford.mjs';
import {parseClientTaxHistory} from '../lib/client/bill.mjs';
import {parseTaxsysHistory} from '../lib/live/taxsys.mjs';
import {parseTaxsysBillAmounts} from '../lib/client/collector-amounts.mjs';
import {parseClientVisualGovBill} from '../lib/client/visualgov.mjs';
import {classifyDelinquency} from '../lib/client/delinquency.mjs';
import {serializeClientRecord} from '../lib/client/contract.mjs';
const read = name => readFileSync(new URL('./fixtures/client/'+name,import.meta.url),'utf8');
const history = read('besil-miami-512-history-excerpt.html');
const bill = read('besil-miami-512-bill-excerpt.html');
const folio = '01-3231-067-0130';
const input = {scrap_order_id:'BESIL-REGRESSION',county:'Miami-Dade',transactionType:'REFI',address:'1900 N Bayshore, Unit 512',ownerName:'ALLEN HASBUN'};

test('Bayshore comma notation retains exact unit, and missing suffix retains number and directions',()=>{
 const wanted=normalizeMiamiAddress(input.address);
 assert.equal(wanted.unit,'512');assert.equal(wanted.street,'1900 N BAYSHORE');
 assert.ok(addressMatches(wanted,normalizeMiamiAddress('1900 N BAYSHORE DR','512')));
 for(const address of ['1901 N BAYSHORE DR UNIT 512','1900 S BAYSHORE DR UNIT 512','1900 N BAYSHORE DR UNIT 513','1900 N BAYSHORE DR'])assert.equal(addressMatches(wanted,normalizeMiamiAddress(address)),false,address);
 assert.equal(addressMatches(normalizeMiamiAddress('1900 N BAYSHORE DR','512'),normalizeMiamiAddress('1900 N BAYSHORE AVE','512')),false);
 assert.equal(normalizeMiamiAddress('1900 N BAYSHORE DR, UNIT 512','513').conflict,true);
 assert.equal(normalizeMiamiAddress('1900 N BAYSHORE DR, Miami, FL 33132').unit,'');
 assert.equal(addressMatches(normalizeMiamiAddress('100 BAYSHORE N'),normalizeMiamiAddress('100 BAYSHORE DR N')),true);
 assert.equal(addressMatches(normalizeMiamiAddress('100 BAYSHORE'),normalizeMiamiAddress('100 BAYSHORE DR N')),false);
});

test('omitted suffix candidates resolve across counties without concealing ambiguity or incomplete pages',()=>{
 const miami=JSON.parse(read('besil-miami-512-search.json'));
 assert.equal(matchMiamiCandidates(input,miami).parcel_id,'0132310670130');
 const collision=structuredClone(miami);collision.Total=2;collision.MinimumPropertyInfos.push({...collision.MinimumPropertyInfos[0],SiteAddress:'1900 N BAYSHORE AVE',Strap:'01-3231-067-0140'});
 assert.equal(matchMiamiCandidates(input,collision).status,'AMBIGUOUS');
 assert.equal(matchMiamiCandidates(input,{...miami,Total:2}).status,'SEARCH_INCOMPLETE');
 const osceola=JSON.parse(read('osceola-market-2026-10-08.json'));
 assert.equal(matchOsceolaCandidates({address:'3250 VINELAND',ownerName:'WAL-MART STORES EAST LP'},osceola).status,'MATCHED');
 assert.equal(matchOsceolaCandidates({address:'3250 VINELAND AVE',ownerName:'WAL-MART STORES EAST LP'},osceola).status,'NOT_FOUND');
 // Explicit mutation of the recorded Bradford result to exercise suffix collisions.
 const bradford=read('bradford-appraiser-address-search.html').replace(/14500 S\s+HWY 301/g,'14500 S MAIN DR');
 assert.equal(matchBradfordCandidates({address:'14500 S MAIN',ownerName:'WALMART STORES EAST, LP'},bradford).status,'MATCHED');
});

test('source-derived Bayshore history excludes payable duplicates/year headings and reads issued certificate',()=>{
 const parsed=parseClientTaxHistory(history);
 assert.equal(parsed.summary.accountNumber,folio);assert.equal(parsed.summary.amountDue,'$4,085.87');
 assert.equal(parsed.history.length,3);assert.equal(parsed.latestAnnual.billYear,'2025');
 assert.equal(parsed.latestAnnual.certificate.status,'Issued');assert.equal(parsed.latestAnnual.certificate.date,'06/01/2026');
 assert.equal(parsed.latestAnnual.certificate.faceAmount,'$3,885.35');
 const legacy=parseTaxsysHistory(history,history);
 assert.equal(legacy.summary.balance_due,'4085.87');assert.equal(legacy.history.length,2);
 const delinquency=classifyDelinquency({...parsed,county:'miami-dade-fl',asOf:'2026-10-10'});
 assert.equal(delinquency.hasActiveDelinquency,true);assert.equal(delinquency.currentYearDue,'$4,085.87');
 assert.equal(delinquency.delinquentYears.length,1);assert.equal(delinquency.delinquentYears[0].code,'OPEN_CERTIFICATE');
 assert.equal(delinquency.delinquentYears[0].amountDue,'$4,085.87');
 assert.equal(delinquency.totalPriorYearsDue,null);assert.equal(delinquency.coverage,'PARTIAL');
 const output=serializeClientRecord(input,{match:{status:'MATCHED'},sections:{AccountHistory:parsed.history},delinquency});
 assert.equal(output.scrapTaxOrderRequest.DelinquencyInformation.delinquentYears[0].certificate.certificateNumber,'3299');
 assert.equal(output.scrapTaxOrderRequest.DelinquencyInformation.delinquentYears[0].amountDue,'$4,085.87');
});

test('Issued needs a positive current quote; missing and zero amounts cannot assert collectible delinquency',()=>{
 for(const amountDue of [null,'$0.00']){
  const r=classifyDelinquency({history:[{billYear:'2025',billType:'Annual',amountDue,status:'Unpaid',certificate:{status:'Issued',faceAmount:'$3,885.35'}}],coverage:'PARTIAL',asOf:'2026-10-10'});
  assert.equal(r.hasActiveDelinquency,null);assert.equal(r.delinquentYears.length,0);
 }
 const closed=classifyDelinquency({...parseClientTaxHistory(history.replace('Issued','Redeemed').replaceAll('$4,085.87','$0.00')),asOf:'2026-10-10'});
 assert.equal(closed.delinquentYears.length,0);
});

test('web bill discountable subtotal is captured only under matching account, annual year and amount block',()=>{
 const result=parseTaxsysBillAmounts(bill,folio,2025);
 assert.equal(result.value,'$3,477.20');assert.equal(result.proof.source_label,'Total Discountable:');assert.equal(result.proof.source_year,'2025');
 assert.throws(()=>parseTaxsysBillAmounts(bill,'0132310670140',2025),{code:'collector_identity_mismatch'});
 assert.throws(()=>parseTaxsysBillAmounts(bill,folio,2024),{code:'collector_identity_mismatch'});
 assert.throws(()=>parseTaxsysBillAmounts(bill.replace('2025 Tax Amounts','2024 Tax Amounts'),folio,2025),{code:'document_layout_changed'});
 assert.throws(()=>parseTaxsysBillAmounts(bill.replace('Annual bill','First installment'),folio,2025),{code:'collector_identity_mismatch'});
 const $=load(bill);$('.label').filter((_,e)=>$(e).text().trim()==='Total Discountable:').siblings('.value').text('$0.00');
 assert.equal(parseTaxsysBillAmounts($.html(),folio,2025).value,'$0.00');
 const absent=bill.replace('Total Discountable:','Discount saved:');
 assert.equal(parseTaxsysBillAmounts(absent,folio,2025).value,null);
 const duplicate=load(bill);const row=duplicate('.label').filter((_,e)=>duplicate(e).text().trim()==='Total Discountable:').parent().clone();row.find('.value').text('$1.00');duplicate('.bill-details').append(row);
 assert.throws(()=>parseTaxsysBillAmounts(duplicate.html(),folio,2025),{code:'source_values_disagree'});
});

test('Bradford explicitly labelled subtotal preserves zero and never copies receipt or combined taxes',()=>{
 const html=read('bradford-collector-bill-2026-10-06.html');
 const absent=parseClientVisualGovBill(html,'04708-0-00200',2025);assert.equal(absent.TaxAmounts.totalDiscountable,null);
 // Adversarial label additions, not new Bradford live-source acceptance evidence.
 const $=load(html);$('body').append('<table><tr><td>Total Discountable:</td><td>$0.00</td></tr></table>');
 const zero=parseClientVisualGovBill($.html(),'04708-0-00200',2025);assert.equal(zero.TaxAmounts.totalDiscountable,'$0.00');assert.equal(zero.section_status.TaxAmounts,'PRESENT');
 $('body').append('<table><tr><td>Total Discountable Amount:</td><td>$10.00</td></tr></table>');
 assert.throws(()=>parseClientVisualGovBill($.html(),'04708-0-00200',2025),{code:'source_values_disagree'});
});

// Complete owner-index fallback must not hide an incomplete address page.
test('suffix-free native failures use complete owner-index evidence, then verify detail street and unit',async()=>{
 const calls=[];
 const get=async url=>{const u=new URL(url);calls.push(u.searchParams.get('Operation'));if(u.searchParams.get('Operation')==='GetAddress')return {Completed:false,Total:0,MinimumPropertyInfos:[]};if(u.searchParams.get('Operation')==='GetOwners')return JSON.parse(read('besil-miami-512-search.json'));return JSON.parse(read('besil-miami-512-property.json'));};
 const result=await resolveMiami(input,get);assert.equal(result.status,'MATCHED');assert.equal(result.parcel_id,'0132310670130');assert.deepEqual(calls,['GetAddress','GetAddress','GetOwners','GetPropertySearchByFolio']);
 const incomplete=await resolveMiami(input,async url=>new URL(url).searchParams.get('Operation')==='GetOwners'?{Completed:true,Total:201,MinimumPropertyInfos:JSON.parse(read('besil-miami-512-search.json')).MinimumPropertyInfos}:{Completed:false,Total:0,MinimumPropertyInfos:[]});
 assert.equal(incomplete.status,'SEARCH_INCOMPLETE');assert.equal(incomplete.parcel_id,undefined);
});

test('source-derived Osceola web bill retains authoritative R-account identity and published discountable subtotal',()=>{
 const html=read('besil-osceola-bill-excerpt.html');
 assert.equal(parseTaxsysBillAmounts(html,'R022528-285000010010',2025).value,'$285,389.65');
 assert.throws(()=>parseTaxsysBillAmounts(html,'022528285000010010',2025),{code:'collector_identity_mismatch'});
});

import {clientLookup} from '../lib/client/engine.mjs';
import {createApp} from '../server/app.mjs';
import {renderSections} from '../public/poc-render.mjs';
const root='https://county-taxes.net/iframe-taxsys/miamidade.county-taxes.com/govhub/property-tax/bWlhbWlkYWRlOnJlYWxfZXN0YXRlOnBhcmVudHM6ZjNmMGJmOWItZTUwOS0xMWViLWE2MzItMDA1MDU2ODE0OWU5';
const billUrl=root+'/bills/38df3a95-a6dc-11f0-aafd-00505681fc7a';
function feedbackFetcher(html=bill){
 return async url=>{
  const u=new URL(url);
  if(['GetAddress','GetOwners'].includes(u.searchParams.get('Operation')))return Response.json(JSON.parse(read('besil-miami-512-search.json')));
  if(u.searchParams.get('Operation')==='GetPropertySearchByFolio')return Response.json(JSON.parse(read('besil-miami-512-property.json')));
  if(u.hostname==='config.grantstreet.com')return Response.json(JSON.parse(read('miami-collector-config-sanitized.json')));
  if(u.hostname.includes('algolia')){
   // The known public account URI provides its exact source object identity;
   // wrapping it in the recorded search schema is explicit integration scaffolding.
   const data=JSON.parse(read('miami-collector-search-source.json')),hit=data.results[0].hits[0];
   hit.external_id=folio;hit.objectID='/Taxsys-GovHub/v0/items/'+atob(root.split('/').at(-1));hit.custom_parameters={alternate_keys:[]};hit.child_groups=[];data.results[0].hits=[hit];data.results[0].nbHits=1;
   return Response.json(data);
  }
  if(url===billUrl)return new Response(html);
  return new Response('Source challenge',{status:403});
 };
}
const capture = async()=>({html:history,url:root,bill_html:bill,bill_url:billUrl,pdf_error:'Original source PDF not included in this excerpt test.'});
class TextNode {
 constructor(){this.children=[];this.text='';}
 set textContent(value){this.text=String(value);this.children=[];}
 get textContent(){return this.text+this.children.map(n=>n.textContent).join('\n');}
 append(...nodes){this.children.push(...nodes);}
}

test('Bayshore source excerpts compose through engine → client JSON → rendered amounts with partial history exposed',async()=>{
 for(const managed of [capture,async()=>({html:history,url:root,pdf_error:'Original source PDF not included in this excerpt test.'})]){
  const d=await clientLookup(input,feedbackFetcher(),{managedBrowser:managed,log:()=>{}}),r=d.scrapTaxOrderRequest;
  assert.equal(r.matchStatus,'MATCHED');assert.equal(r.PropertyInformation.ParcelNumber,folio);
  assert.equal(r.TaxInformation.amountDue,'$4,085.87');assert.equal(r.TaxInformation.type,'DELINQUENT');
  assert.equal(r.TaxAmounts.totalDiscountable,'$3,477.20');
  assert.equal(r.DelinquencyInformation.delinquentYears[0].amountDue,'$4,085.87');
  assert.equal(r.DelinquencyInformation.delinquentYears.length,1);assert.equal(r.DelinquencyInformation.coverage,'PARTIAL');
  assert.equal(d.ExtractionMetadata.validation.parcel_join,'matched');
  assert.equal(d.ExtractionMetadata.provenance['TaxAmounts.totalDiscountable'].source_url,billUrl);
  assert.match(d.ExtractionMetadata.provenance['TaxAmounts.totalDiscountable'].sha256,/^[0-9a-f]{64}$/);
  assert.ok(!/unavailable/i.test(d.ExtractionMetadata.section_status.TaxAmounts.note));
  const dom=new TextNode();renderSections({createElement:()=>new TextNode()},dom,r,d.ExtractionMetadata.section_status);
  assert.match(dom.textContent,/\$4,085\.87/);assert.match(dom.textContent,/\$3,477\.20/);assert.match(dom.textContent,/PARTIAL/);
 }
});

test('wrong-account supplemental HTML cannot supply discountable values to a valid source match',async()=>{
 const d=await clientLookup(input,feedbackFetcher(bill.replaceAll(folio,'01-3231-067-0140')),{managedBrowser:async()=>({html:history,url:root,pdf_error:'Original source PDF not included in this excerpt test.'}),log:()=>{}});
 assert.equal(d.scrapTaxOrderRequest.TaxAmounts.totalDiscountable,null);
 assert.equal(d.scrapTaxOrderRequest.DelinquencyInformation.delinquentYears[0].amountDue,'$4,085.87');
 assert.ok(d.ExtractionMetadata.errors.some(e=>e.source_id==='collector_bill_html'&&e.code==='collector_identity_mismatch'));
});

test('authenticated API delivers verified Bayshore amounts and rejects unauthorized source access',async()=>{
 let calls=0;
 const app=createApp({env:{INVISIA_POC_API_KEY:'offline-besil-test-key'},fetcher:feedbackFetcher(),logSink:()=>{},lookupClient:async(order,fetcher,runtime)=>{
  calls++;return clientLookup(order,fetcher,{...runtime,managedBrowser:capture});
 }});
 const request=authorized=>new Request('http://localhost/api/v2/property/lookup',{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer offline-besil-test-key'}:{})},body:JSON.stringify(input)});
 assert.equal((await app(request(false))).status,401);assert.equal(calls,0);
 const response=await app(request(true)),data=await response.json();
 assert.equal(response.status,200);assert.equal(calls,1);
 assert.equal(data.ExtractionMetadata.request_id,response.headers.get('x-request-id'));
 assert.equal(data.scrapTaxOrderRequest.TaxAmounts.totalDiscountable,'$3,477.20');
 assert.equal(data.scrapTaxOrderRequest.DelinquencyInformation.delinquentYears[0].amountDue,'$4,085.87');
 const dom=new TextNode();renderSections({createElement:()=>new TextNode()},dom,data.scrapTaxOrderRequest,data.ExtractionMetadata.section_status);
 assert.match(dom.textContent,/\$4,085\.87/);assert.match(dom.textContent,/\$3,477\.20/);
});

test('Osceola capture supplements the original PDF with verified HTML subtotal through the complete engine',async()=>{
 const account='R022528-285000010010',token='b3NjZW9sYTpyZWFsX2VzdGF0ZTpwYXJlbnRzOmVkYmI0ZTZhLWU1MDktMTFlYi05MzgxLTAwNTA1NjgxODQyMA==';
 const collectorRoot='https://county-taxes.net/iframe-taxsys/osceola.county-taxes.com/govhub/property-tax/'+token;
 const url=collectorRoot+'/bills/e766d457-a479-11f0-b243-0050568184a7';
 const names={parcelmarket:'osceola-market-2026-10-08.json',propertyvalues:'osceola-certified-values-2026-10-08.json',sales:'osceola-sales-2026-10-08.json',lnd_c:'osceola-lnd_c-2026-10-08.json',bld:'osceola-bld-2026-10-08.json',xfob:'osceola-xfob-2026-10-08.json'};
 const fetcher=async target=>{
  const u=new URL(target),file=names[u.pathname.split('/').at(-1).toLowerCase()];
  if(u.hostname==='search.property-appraiser.org'&&file)return Response.json(JSON.parse(read(file)));
  if(u.hostname==='config.grantstreet.com')return Response.json(JSON.parse(read('miami-collector-config-sanitized.json').replaceAll('miamidade','osceola')));
  if(u.hostname.includes('algolia')){
   const data=JSON.parse(read('miami-collector-search-source.json')),hit=data.results[0].hits[0];
   hit.external_id=account;hit.objectID='/Taxsys-GovHub/v0/items/'+atob(token);hit.custom_parameters={alternate_keys:[]};hit.child_groups=[];data.results[0].hits=[hit];data.results[0].nbHits=1;return Response.json(data);
  }
  return new Response('Source challenge',{status:403});
 };
 const html=readFileSync(new URL('./fixtures/phase-two/osceola-rendered.html',import.meta.url),'utf8');
 const pdf=readFileSync(new URL('./fixtures/phase-two/osceola-original.pdf',import.meta.url)).toString('base64');
 const d=await clientLookup({scrap_order_id:'BESIL-OSCEOLA',county:'Osceola',address:'3250 VINELAND',ownerName:'WAL-MART STORES EAST LP',transactionType:'REFI'},fetcher,{log:()=>{},managedBrowser:async()=>({html,url:collectorRoot,bill_html:read('besil-osceola-bill-excerpt.html'),bill_url:url,pdf:{url:url+'/print',base64:pdf}})});
 assert.equal(d.scrapTaxOrderRequest.matchStatus,'MATCHED');
 assert.equal(d.ExtractionMetadata.validation.parcel_join,'matched');
 assert.equal(d.scrapTaxOrderRequest.TaxAmounts.totalDiscountable,'$285,389.65');
 assert.equal(d.scrapTaxOrderRequest.TaxAmounts.totalTax,'$285,389.65');
 assert.equal(d.ExtractionMetadata.section_status.TaxAmounts.status,'EXTRACTED');
 assert.equal(d.ExtractionMetadata.provenance['TaxAmounts.totalDiscountable'].account_number,account);
 assert.ok(!d.ExtractionMetadata.errors.some(e=>e.source_id==='collector_bill_html'));
});

import {runInNewContext} from 'node:vm';
import {captureCode} from '../lib/live/managed-browser.mjs';
test('deterministic browser capture selects the annual history row and retrieves sibling HTML once',async()=>{
 const $=load(history),requests=[],output=[];
 const locator=(selector,node)=>{
  const found=node?$(node).find(selector):$(selector);
  return {waitFor:async()=>{},innerText:async()=>found.text(),count:async()=>found.length,first:()=>locatorNode(found.first()),all:async()=>found.toArray().map(e=>locatorNode($(e)))};
 };
 const locatorNode=node=>({waitFor:async()=>{},locator:s=>locator(s,node),innerText:async()=>node.text(),first:()=>locatorNode(node.first()),count:async()=>node.length,getAttribute:async name=>node.attr(name)});
 const frame={url:()=>root,content:async()=>history,locator:s=>locator(s),evaluate:async(_fn,url)=>{requests.push(url);return url.endsWith('/print')?{size:42}:bill;}};
 const page={goto:async()=>{},frames:()=>[frame],waitForTimeout:async()=>{}};
 await runInNewContext('(async()=>{'+captureCode('https://county-taxes.net/fl-miamidade/property-tax/EXAMPLE',true,true)+'})()',{page,URL,console:{log:value=>output.push(value)}});
 const captured=JSON.parse(output[0].slice('INVISIA_RESULT='.length));
 assert.equal(captured.html,history);assert.equal(captured.bill_html,bill);assert.equal(captured.bill_url,billUrl);
 assert.equal(captured.pdf.url,billUrl+'/print');assert.deepEqual(requests,[billUrl,billUrl+'/print']);
});
