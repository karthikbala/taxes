import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseMiamiDeedSearch,historicalCoverage,searchMiamiDeeds} from '../lib/client/historical-clearance.mjs';
import {miamiDeedUrl} from '../lib/client/miami-deed-probe.mjs';
const html=fs.readFileSync(new URL('./fixtures/client/miami-deed-empty-source.html',import.meta.url),'utf8');
const folio='0132310670130',formatted='01-3231-067-0130';
// The HTML is a source excerpt. Submission metadata below is explicit offline
// scaffolding; only a new live capture can prove the actual outgoing POST.
const capture=()=>({html,url:miamiDeedUrl,http_status:200,search_applied:true,requested_folio:folio,search_submission:{http_status:200,parcel:formatted,status:'',other_filters:Array(7).fill(''),page:null}});
test('exact unrestricted submitted and server-echoed Clerk query establishes scoped empty only',()=>{
 const r=parseMiamiDeedSearch(capture(),folio);assert.equal(r.status,'INSPECTED_EMPTY');assert.equal(r.query_verified,true);assert.equal(r.case_count,0);assert.equal(r.coverage,'COMPLETE_PUBLIC_QUERY');assert.equal(r.historicalClearanceEstablished,false);assert.match(r.note,/does not establish full certificate history/);assert.ok(!JSON.stringify(r).includes('<input'));
});
test('input echo alone, wrong folio, narrowed status/date filters or failed POST never establish empty',()=>{
 const changes=[{search_submission:null},{search_applied:false},{search_error:'SEARCH_WAIT_INCOMPLETE'},{search_submission:{...capture().search_submission,parcel:'01-3231-067-0131'}},{search_submission:{...capture().search_submission,status:'192'}},{search_submission:{...capture().search_submission,other_filters:['','','','','','2026-01-01','']}},{search_submission:{...capture().search_submission,http_status:403}},{html:html.replace(/data-original="01-3231-067-0130"/,'data-original="01-3231-067-0131"')},{html:html.replace('id="filterCaseStatus" value=""','id="filterCaseStatus" value="192"')}];
 for(const change of changes){const r=parseMiamiDeedSearch({...capture(),...change},folio);assert.equal(r.status,'SEARCH_INCOMPLETE');assert.equal(r.case_count,null);assert.equal(r.query_verified,false);}
});
test('blocked, login and incomplete navigation remain unavailable; pages and case rows prevent negative result',()=>{
 assert.equal(parseMiamiDeedSearch({...capture(),http_status:403},folio).status,'BLOCKED');
 assert.equal(parseMiamiDeedSearch({...capture(),html:'Please log in to continue'},folio).status,'LOGIN_REQUIRED');
 assert.equal(parseMiamiDeedSearch({...capture(),navigation_error:'NAVIGATION_INCOMPLETE'},folio).status,'FAILED');
 for(const suffix of ['<div class="pagination">Next</div>','<table><tbody><tr><td>01-3231-067-0131</td></tr></tbody></table>','<a href="/public/cases/View/123">Case</a>']){const r=parseMiamiDeedSearch({...capture(),html:html+suffix},folio);assert.equal(r.status,'SEARCH_INCOMPLETE');assert.equal(r.case_count,null);}
});
test('complete annual rows and no public deed cases cannot claim full historical clearance',()=>{
 const r=historicalCoverage({coverage:'COMPLETE',unavailableYears:[],hasActiveDelinquency:false},parseMiamiDeedSearch(capture(),folio),'COMPLETE');assert.equal(r.historicalClearanceEstablished,false);assert.equal(r.independentCertificateSearch,'NOT_IMPLEMENTED');assert.equal(r.independentTaxDeedSearch,'INSPECTED_EMPTY');
});
test('blocked direct source uses fixed exact-folio managed search; unavailable source keeps null count',async()=>{
 let calls=0;const get=async()=>{throw Object.assign(Error('blocked'),{code:'source_blocked'});};
 const r=await searchMiamiDeeds({folio,get,managedBrowser:async args=>{calls++;assert.equal(args.url,miamiDeedUrl);assert.equal(args.folio,folio);assert.equal(args.includePdf,false);return capture();}});assert.equal(calls,1);assert.equal(r.result.status,'INSPECTED_EMPTY');
 const denied=await searchMiamiDeeds({folio,get});assert.equal(denied.status,'BLOCKED');assert.equal(denied.case_count,null);
});
