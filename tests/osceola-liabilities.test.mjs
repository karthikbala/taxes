import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {load} from 'cheerio';
import {parseOsceolaLiabilityReport,osceolaReportUrl,osceolaLiabilityCaptureCode} from '../lib/client/osceola-liabilities.mjs';
import {historicalCoverage} from '../lib/client/historical-clearance.mjs';
import {makeManagedBrowser} from '../lib/live/managed-browser.mjs';
import {createSQLiteDB} from '../server/sqlite.mjs';
const read=name=>readFileSync(new URL('./fixtures/client/'+name,import.meta.url),'utf8');
const empty=()=>JSON.parse(read('osceola-liability-empty-2026-10-12.json'));
const account=empty().account,positiveAccount='R132731-999204320020';
function positive(){const c=empty(),p=c.reports.certificates.pages[0];c.account=positiveAccount;p.html=read('osceola-certificates-positive-2026-10-12.html');p.count=33;p.row_count=33;p.filters.account_number=positiveAccount+'|';p.submission.query=p.submission.query.replace(account,positiveAccount);return c;}
const parse=(c,kind='certificates')=>parseOsceolaLiabilityReport(c,kind,c.account);
test('source-derived empty queries verify exact account, all statuses, unrestricted years and both native reports',()=>{
 const c=empty();for(const kind of ['certificates','deeds']){const r=parse(c,kind);assert.equal(r.status,'INSPECTED_EMPTY');assert.equal(r.coverage,'COMPLETE_PUBLIC_QUERY');assert.equal(r.record_count,0);assert.equal(r.query_verified,true);assert.equal(r.historicalClearanceEstablished,false);}
 const d={certificateSearch:parse(c),taxDeedSearch:parse(c,'deeds'),clerkTaxDeedSearch:{status:'UNAVAILABLE'}};const coverage=historicalCoverage(d,d.taxDeedSearch,'COMPLETE');assert.equal(coverage.independentTaxDeedSearch,'UNAVAILABLE');assert.equal(coverage.independentCertificateSearch,'INSPECTED_EMPTY');assert.equal(coverage.historicalClearanceEstablished,false);
});
test('33 published certificates retain tax years, holder lifecycles and historical receipts without additive liability amounts',()=>{
 const r=parse(positive());assert.equal(r.record_count,33);assert.equal(r.records.length,33);assert.equal(r.status,'RECORDS_FOUND');assert.equal(r.currentRedemptionQuote,null);assert(r.activeEvidence.length>=14);assert(r.records.some(r=>r.fields['Cert Status']==='Redeemed'));assert(r.records.some(r=>r.fields['Tax Yr']==='2012'&&r.fields['Issued Date']==='6/1/2022'));assert(r.records.some(r=>r.fields['Cert Status']==='Surrendered'&&r.fields['Redemption Amt']==='$285.00'));assert.equal(r.activeEvidence.filter(r=>r.taxYear==='2012').length,1);assert.equal(r.activeEvidence.find(r=>r.taxYear==='2012').accountBalance,'$1,879.22');assert.equal(r.activeEvidence.find(r=>r.taxYear==='2012').currentRedemptionQuote,null);
});
test('prefix queries, restrictive defaults, mismatched submission and unrelated source records fail closed',()=>{
 const changes=[c=>c.reports.certificates.pages[0].filters.tax_year='>2007',c=>c.reports.certificates.pages[0].filters.cert_status='Issued',c=>c.reports.certificates.pages[0].filters.account_number=account,c=>c.reports.certificates.pages[0].submission.query+='tax_year\t2025\t',c=>c.reports.certificates.pages[0].submission.current_inputs='tax_year\t2025',c=>c.reports.certificates.pages[0].submission.query=c.reports.certificates.pages[0].submission.query.replace('|\t','\t'),c=>c.reports.certificates.pages[0].html=c.reports.certificates.pages[0].html.replace('value="R022528-285000010010|"','value="OTHER|"'),c=>c.reports.certificates.pages[0].report_id='1825',c=>c.reports.certificates.pages[0].submission.http_status=403];
 for(const change of changes){const c=empty();change(c);assert.throws(()=>parse(c),e=>e.code==='liability_search_unverified');}
 const c=positive();c.reports.certificates.pages[0].html=c.reports.certificates.pages[0].html.replace('<td class="cell-left"> R132731-999204320020 </td>','<td class="cell-left"> R132731-999204320030 </td>');assert.throws(()=>parse(c),e=>e.code==='liability_search_unverified');
});
test('counted pagination retains partial evidence; repeated/missing/changed pages cannot prove completeness',()=>{
 const c=positive(),p=c.reports.certificates.pages[0],$=load(p.html);$('#report_results__results > tr').slice(10).remove();p.html=$.html();p.row_count=10;assert.equal(parse(c).coverage,'PARTIAL_PUBLIC_QUERY');assert.equal(parse(c).captured_count,10);
 const second=structuredClone(p);second.page=2;second.html=second.html.replace('<strong>1</strong>','<strong>2</strong>');c.reports.certificates.pages.push(second);assert.throws(()=>parse(c),e=>e.code==='liability_search_unverified');
 const wrong=positive();wrong.reports.certificates.pages[0].page=2;assert.throws(()=>parse(wrong));
 const bad=positive();bad.reports.certificates.pages[0].html=bad.reports.certificates.pages[0].html.replace('Tax Yr','Changed');assert.throws(()=>parse(bad));
});
test('fixed browser profile uses existing ledger, rejects wrong county/account and closes on success or truncation',async()=>{
 const db=createSQLiteDB(':memory:'),old=globalThis.fetch;await db.prepare('INSERT INTO scrape_budgets VALUES(?,?,?,?)').bind('florida-phase1-2026-10-07',5000,1800,0).run();let creates=0,closes=0,truncated=false;
 globalThis.fetch=async(url,options)=>{if(options.method==='DELETE'){closes++;return Response.json({success:true,creditsBilled:2});}if(String(url).endsWith('/execute')){assert.equal(JSON.parse(options.body).code,osceolaLiabilityCaptureCode(account));return Response.json({success:true,exitCode:0,truncated,stdout:'INVISIA_RESULT='+JSON.stringify(empty())});}creates++;return Response.json({success:true,id:'offline-reports'});};
 try{const b=makeManagedBrowser({DB:db,INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:'offline'}),args={url:osceolaReportUrl,county:'osceola-fl',profile:'osceola-liability-reports',includePdf:false,account};assert.equal(parse(await b(args)).status,'INSPECTED_EMPTY');assert.equal(creates,1);assert.equal(closes,1);truncated=true;await assert.rejects(b(args),e=>e.code==='managed_source_incomplete');assert.equal(closes,2);assert.equal((await db.prepare('SELECT * FROM scrape_budgets').first()).reserved_milli_usd,0);await assert.rejects(b({...args,county:'miami-dade-fl'}));await assert.rejects(b({...args,account:'bad'}));assert.equal(creates,2);}finally{globalThis.fetch=old;db.close();}
});
test('published deed records preserve closed lifecycles and dates without fabricating certificate or bill-year joins',()=>{
 const c=empty(),p=c.reports.deeds.pages[0];c.account=positiveAccount;p.html=read('osceola-deeds-positive-2026-10-12.html');p.count=2;p.row_count=2;p.filters.account_number=positiveAccount+'|';p.submission.query=p.submission.query.replace(account,positiveAccount);
 const r=parse(c,'deeds');assert.equal(r.status,'RECORDS_FOUND');assert.equal(r.records.length,2);assert.equal(r.records[0].fields['Deed Status'],'Paid Off');assert.equal(r.records[1].fields['Deed Status'],'Canceled');assert.equal(r.records[0].fields['Application Date'],'3/18/2020');assert.equal(r.activeEvidence.length,0);assert.equal(r.currentRedemptionQuote,null);assert.equal(r.historicalClearanceEstablished,false);
 const $=load(p.html);$('#report_results__results tr').first().children('td').eq(4).text('Applied');p.html=$.html();const active=parse(c,'deeds');assert.equal(active.activeEvidence.length,1);assert.equal(active.activeEvidence[0].taxYear,null);assert.equal(active.activeEvidence[0].certificateNumber,null);
});
test('counted native continuation accepts all distinct rows and rejects a changing source total',()=>{
 const c=positive(),p=c.reports.certificates.pages[0],all=load(p.html),rows=all('#report_results__results > tr').toArray().map(el=>all.html(el));
 const first=load(p.html);first('#report_results__results').html(rows.slice(0,10).join(''));p.html=first.html();p.row_count=10;
 const next=structuredClone(p),second=load(p.html);second('#report_results__results').html(rows.slice(10).join(''));second('.pages strong').text('2');next.html=second.html();next.page=2;next.row_count=23;c.reports.certificates.pages.push(next);
 assert.equal(parse(c).coverage,'COMPLETE_PUBLIC_QUERY');assert.equal(parse(c).captured_count,33);next.count=34;assert.throws(()=>parse(c),e=>e.code==='liability_search_unverified');
});
