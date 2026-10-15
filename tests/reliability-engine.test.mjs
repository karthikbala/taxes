import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSQLiteDB} from '../server/sqlite.mjs';
import {createJobRunner} from '../server/job-runner.mjs';
import {resolveTaxsys,taxsysUrls} from '../lib/live/taxsys.mjs';
const fixture=async name=>readFile(new URL('./fixtures/client/'+name,import.meta.url));
test('actual county engine completes a durable Miami job through reviewed config/search hosts and original PDF',async()=>{
 const search=JSON.parse(await fixture('miami-collector-search-source.json')),config=JSON.parse(await fixture('miami-collector-config-sanitized.json')),property=JSON.parse(await fixture('miami-property-source.json')),addresses=JSON.parse(await fixture('miami-address-search-source.json'));
 const account=resolveTaxsys(search,'0132310520010','miamidade'),urls=taxsysUrls('fl-miamidade','miamidade',account.token),pdfUrl=urls.iframe+'/bills/REFERENCE-2025/print',pdf=await fixture('miami-annual-reference.pdf');
 // Explicit offline history scaffolding joined to a dated original source PDF; never a runtime fallback.
 const html=`<h1>Real Estate Account #01-3231-052-0010</h1><div class="owner">JUDE PATRICK JACOB</div><div class="bills"><div class="paid">Your account is paid in full. There is nothing due at this time.</div><div class="last-payment">Your most recent payment was made on <time>11/25/2025</time> for $3,007.15.</div></div><table class="bills"><tbody><tr class="regular"><th class="description"><a href="${pdfUrl.replace('/print','')}">2025 Annual Bill</a></th><td class="balance">$0.00</td><td class="status"><span class="label">Paid</span><span translate="no">$3,007.15</span></td><td class="as-of"><time>11/25/2025</time></td><td class="message">Receipt #EEX-26-000928</td><td><a href="${pdfUrl}">Print (PDF)</a></td></tr></tbody><tfoot><tr><th>Total amount due</th><td class="balance">$0.00</td></tr></tfoot></table>`;
 const calls=[];const fetcher=async value=>{const u=new URL(value);calls.push(u.host);if(['GetAddress','GetOwners'].includes(u.searchParams.get('Operation')))return Response.json(addresses);if(u.searchParams.get('Operation')==='GetPropertySearchByFolio')return Response.json(property);if(u.hostname==='config.grantstreet.com')return Response.json(config);if(u.hostname.endsWith('.algolia.net'))return Response.json(search);if(u.href===pdfUrl.replace('/print',''))return new Response('<h1>Real Estate Account #01-3231-052-0010</h1><div id="bill">2025 Annual bill</div><div class="bill-details"><div class="header">2025 Tax Amounts</div><div class="label">Total Discountable</div><div class="value">$3,132.45</div></div>',{headers:{'Content-Type':'text/html'}});if(u.href===pdfUrl)return new Response(pdf,{headers:{'Content-Type':'application/pdf'}});if(u.hostname==='county-taxes.net')return new Response(html,{headers:{'Content-Type':'text/html'}});return new Response('Access denied',{status:403});};
 const db=createSQLiteDB(':memory:'),runner=createJobRunner({env:{DB:db},fetcher,autoStart:false,logSink:()=>{}});
 try{
  const job=runner.create({scrap_order_id:'engine-offline',address:'555 NE15ST UNIT401',ownerName:'JUDE PATRICK JACOB',county:'miami-dade-fl',transactionType:'REFI'},'engine-offline','direct_only').job;
  await runner.tick();await runner.idle();const done=runner.get(job.id),record=done.result.scrapTaxOrderRequest;
  assert.equal(record.matchStatus,'MATCHED');assert.equal(record.PropertyInformation.ParcelNumber,'01-3231-052-0010');assert.equal(record.TaxAmounts.totalTax,'$3,132.45');assert.equal(record.BillDetails.paidAmount,'$3,007.15');assert.equal(done.status,'completed_with_gaps',JSON.stringify(done.gaps));assert(calls.includes('config.grantstreet.com'));assert(calls.includes('0lwzo52ls2-dsn.algolia.net'));assert(done.artifacts.some(a=>a.metadata.content_type==='application/pdf'));assert(!done.gaps.some(g=>g.code==='source_url_rejected'));
 }finally{await runner.stop();db.close();}
});
