import test from 'node:test';
import assert from 'node:assert/strict';
import {Script,runInNewContext} from 'node:vm';
import {miamiDeedUrl,miamiDeedCaptureCode,normalizeMiamiDeedFolio,summarizeDeedCapture} from '../lib/client/miami-deed-probe.mjs';

const html='<html><body><h1>Miami-Dade Tax Deed Cases</h1><form action="/public/cases/List?token=SECRET" method="post"><input type="hidden" name="__RequestVerificationToken" value="SECRET"><label for="parcel">Parcel</label><input id="parcel" name="parcel" value="PRIVATE"><select id="status" name="status"><option value="1">Active</option><option value="SECRET">Closed</option></select><button>Search</button></form><a href="/public/cases/View/123?token=SECRET#SECRET">View case</a><a href="https://outside.example/">Other site</a></body></html>';
const capture=(body=html,http_status=200)=>({html:body,url:miamiDeedUrl,http_status});

test('fixed discovery code compiles and captures actual blocked HTTP response without arbitrary caller code',async()=>{
 assert.throws(()=>miamiDeedCaptureCode('https://outside.example'),{code:'invalid_deed_folio'});const code=miamiDeedCaptureCode();new Script('(async()=>{'+code+'})');
 assert.ok(code.includes(JSON.stringify(miamiDeedUrl)));assert.ok(code.includes('timeout:22000'));assert.ok(!code.includes('outside.example'));assert.ok(!code.includes('prompt:'));
 const messages=[];const page={goto:async(url,options)=>{assert.equal(url,miamiDeedUrl);assert.equal(options.waitUntil,'domcontentloaded');return{status:()=>403,headers:()=>({'content-type':'text/html'})};},content:async()=>'<h1>Access denied</h1>',url:()=>miamiDeedUrl,evaluate:async()=>({inputs:[],selects:[],forms:[],links:[]})};
 await runInNewContext('(async()=>{'+code+'})()',{page,console:{log:s=>messages.push(s)}});
 const result=JSON.parse(messages[0].slice('INVISIA_RESULT='.length));assert.equal(result.http_status,403);assert.equal(result.html,'<h1>Access denied</h1>');assert.equal(summarizeDeedCapture(result).status,'BLOCKED');
});

test('public discovery summarizes controls without values, hidden tokens or clearance claims',()=>{
 const r=summarizeDeedCapture(capture());assert.equal(r.status,'DISCOVERY_ONLY');assert.equal(r.record_verified,false);assert.equal(r.coverage,'UNAVAILABLE');assert.equal(r.parcel_identity,null);assert.equal(r.case_identity,null);assert.match(r.note,/no parcel, tax-deed case or historical clearance is verified/);
 assert.deepEqual(r.controls.selects[0].options,['Active','Closed']);assert.equal(r.controls.inputs[0].label,'Parcel');assert.deepEqual(r.controls.forms,[{method:'POST',action:'https://miamidade.realtdm.com/public/cases/List'}]);assert.equal(r.controls.links.length,1);assert.equal(r.controls.links[0].href,'https://miamidade.realtdm.com/public/cases/View/123');assert.ok(!JSON.stringify(r).includes('SECRET'));assert.ok(!JSON.stringify(r).includes('PRIVATE'));assert.ok(!('html'in r));
});

test('challenge, login, blank and wrong-origin captures cannot imply source-record verification',()=>{
 for(const status of [403,429])assert.equal(summarizeDeedCapture(capture(html,status)).status,'BLOCKED');
 assert.equal(summarizeDeedCapture(capture('<h1>Just a moment</h1>')).status,'BLOCKED');
 assert.equal(summarizeDeedCapture(capture('<h1>Login</h1><input type="password">')).status,'LOGIN_REQUIRED');
 assert.equal(summarizeDeedCapture({...capture(),url:'https://miamidade.realtdm.com/Account/Login?token=SECRET'}).status,'LOGIN_REQUIRED');
 const blank=summarizeDeedCapture(capture(''));assert.equal(blank.status,'DISCOVERY_ONLY');assert.equal(blank.record_verified,false);assert.deepEqual(blank.controls,{inputs:[],selects:[],forms:[],links:[]});
 assert.throws(()=>summarizeDeedCapture({...capture(),url:'https://outside.example/'}),{code:'source_url_rejected'});
 assert.throws(()=>summarizeDeedCapture(capture('x'.repeat(1000000))),{code:'managed_source_incomplete'});
 assert.throws(()=>summarizeDeedCapture({}),{code:'managed_source_incomplete'});
});

test('capture preserves navigation failure as unverified discovery and rejects byte-size overflow',async()=>{
 const code=miamiDeedCaptureCode();const messages=[];const page={goto:async()=>{throw new Error('timeout');},content:async()=>'',url:()=>miamiDeedUrl,evaluate:async()=>({})};
 await runInNewContext('(async()=>{'+code+'})()',{page,console:{log:s=>messages.push(s)}});
 const result=JSON.parse(messages[0].slice('INVISIA_RESULT='.length));assert.equal(result.http_status,null);assert.equal(result.navigation_error,'NAVIGATION_INCOMPLETE');assert.equal(summarizeDeedCapture(result).navigation_incomplete,true);
 await assert.rejects(()=>runInNewContext('(async()=>{'+code+'})()',{page:{...page,content:async()=>'é'.repeat(500000)},console:{log(){}}}),/SOURCE_BODY_LIMIT/);
});


test('optional folio accepts only exact numeric identities and formats the reviewed field',()=>{
 assert.equal(normalizeMiamiDeedFolio('0132310520010'),'01-3231-052-0010');assert.equal(normalizeMiamiDeedFolio('01-3231-052-0010'),'01-3231-052-0010');
 for(const value of ['123','1-3231-052-0010','0132310520010;alert(1)',{},1332310520010])assert.throws(()=>miamiDeedCaptureCode(value),{code:'invalid_deed_folio'});
 assert.equal(normalizeMiamiDeedFolio(),null);
});

async function searchCodeResult({counts=1,waitError=false,initialStatus=200,xhrStatus=200,document=false}={}){
 const messages=[],calls=[];let listener;const response={status:()=>initialStatus,headers:()=>({'content-type':'text/html'})};
 const page={goto:async()=>response,on:(_,fn)=>{listener=fn;},off:()=>{listener=null;},locator:selector=>{if(selector.includes('[data-original='))return {waitFor:async options=>{assert.equal(options.state,'attached');calls.push(['response-ready']);}};assert.equal(selector,'#filterParcelNumber');return{count:async()=>counts,fill:async(value,options)=>{calls.push(['fill',value]);assert.equal(options.timeout,4000);}};},getByRole:(role,options)=>{assert.equal(role,'button');assert.equal(options.name,'Process Search');assert.equal(options.exact,true);return{count:async()=>1,click:async()=>{calls.push(['click']);listener({url:()=>miamiDeedUrl+'?token=SECRET',request:()=>({resourceType:()=>document?'document':'xhr',method:()=> 'POST',postData:()=> 'filterParcelNumber=01-3231-052-0010&filterCaseStatus=&filterPartyName=&filterCaseNumber=&filterAppNumber=&filterCertNumber=&filterPropAddress=&filterSaleDateStart=&filterSaleDateStop=&secret=SECRET'}),status:()=>xhrStatus});}};},waitForNavigation:async options=>{assert.equal(options.waitUntil,'domcontentloaded');assert.equal(options.timeout,15000);if(waitError)throw new Error('timeout');},content:async()=>html,url:()=>miamiDeedUrl,evaluate:async()=>({})};
 await runInNewContext('(async()=>{'+miamiDeedCaptureCode('0132310520010')+'})()',{page,URL,URLSearchParams,console:{log:s=>messages.push(s)}});
 return {result:JSON.parse(messages[0].slice('INVISIA_RESULT='.length)),calls};
}

test('deterministic search fills once, clicks once, records AJAX status and surfaces wait/control failures',async()=>{
 const {result,calls}=await searchCodeResult();assert.deepEqual(calls,[['fill','01-3231-052-0010'],['click'],['response-ready']]);assert.equal(result.search_applied,true);assert.equal(result.requested_folio,'01-3231-052-0010');assert.equal(result.search_error,null);assert.equal(result.search_responses[0].http_status,200);assert.ok(!JSON.stringify(result.search_responses).includes('SECRET'));
 assert.equal((await searchCodeResult({waitError:true})).result.search_error,'SEARCH_WAIT_INCOMPLETE');
 const ambiguous=await searchCodeResult({counts:2});assert.equal(ambiguous.result.search_error,'SEARCH_CONTROLS_MISSING_OR_AMBIGUOUS');assert.deepEqual(ambiguous.calls,[]);
 const denied=await searchCodeResult({initialStatus:403});assert.equal(denied.result.search_error,'INITIAL_SOURCE_NOT_READY');assert.deepEqual(denied.calls,[]);
 const ajaxDenied=(await searchCodeResult({xhrStatus:429})).result;assert.equal(ajaxDenied.search_error,'SEARCH_HTTP_ERROR');assert.equal(summarizeDeedCapture(ajaxDenied).status,'BLOCKED');
});

test('search evidence retains public tables and pagination but input echoes never establish record identity',()=>{
 // Adversarial HTML scaffolding uses the reviewed portal selectors; it is not a live-case claim.
 const tableHtml=html+'<div><button id="filterCaseStatusDropdown">Case Status</button><div class="dropdown-menu" style="display:none"><label>Active</label><label>Closed</label></div></div><table><thead><tr><th>Case Number</th><th>Parcel</th></tr></thead><tbody><tr><td>CASE-123</td><td>01-3231-052-9999</td></tr></tbody></table><div class="pagination">Showing 1 of 20<a href="?page=2&amp;token=SECRET">Next</a></div>';
 const c={...capture(tableHtml),requested_folio:'0132310520010',search_applied:true};const r=summarizeDeedCapture(c);
 assert.deepEqual(r.search_evidence.tables[0],{headers:['Case Number','Parcel'],rows:[['CASE-123','01-3231-052-9999']]});assert.deepEqual(r.search_evidence.case_status_labels,['Active','Closed']);assert.match(r.search_evidence.pagination[0].text,/Showing 1 of 20/);assert.ok(!JSON.stringify(r).includes('SECRET'));assert.ok(!JSON.stringify(r).includes('PRIVATE'));
 assert.equal(r.status,'DISCOVERY_ONLY');assert.equal(r.record_verified,false);assert.equal(r.parcel_identity,null);assert.equal(r.case_identity,null);assert.equal(r.coverage,'UNAVAILABLE');
 assert.equal(summarizeDeedCapture({...c,search_applied:false}).search_evidence.visible_text,undefined);
 const bounded=summarizeDeedCapture({...c,html:'<body>'+('visible '.repeat(14000))+'</body>'});assert.equal(bounded.search_evidence.visible_text.length,100000);
});

test('capture records only allowed search POST criteria, never tokens or unrelated form values',async()=>{
 const {result}=await searchCodeResult({document:true});assert.equal(result.search_submission.parcel,'01-3231-052-0010');assert.equal(result.search_submission.http_status,200);assert.deepEqual(result.search_submission.other_filters,Array(7).fill(''));assert.ok(!JSON.stringify(result.search_submission).includes('SECRET'));
});
