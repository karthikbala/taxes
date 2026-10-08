import test from 'node:test';
import assert from 'node:assert/strict';
import {Script,runInNewContext} from 'node:vm';
import {miamiDeedUrl,miamiDeedCaptureCode,summarizeDeedCapture} from '../lib/client/miami-deed-probe.mjs';

const html='<html><body><h1>Miami-Dade Tax Deed Cases</h1><form action="/public/cases/List?token=SECRET" method="post"><input type="hidden" name="__RequestVerificationToken" value="SECRET"><label for="parcel">Parcel</label><input id="parcel" name="parcel" value="PRIVATE"><select id="status" name="status"><option value="1">Active</option><option value="SECRET">Closed</option></select><button>Search</button></form><a href="/public/cases/View/123?token=SECRET#SECRET">View case</a><a href="https://outside.example/">Other site</a></body></html>';
const capture=(body=html,http_status=200)=>({html:body,url:miamiDeedUrl,http_status});

test('fixed discovery code compiles and captures actual blocked HTTP response without arbitrary caller code',async()=>{
 const code=miamiDeedCaptureCode('https://outside.example');new Script('(async()=>{'+code+'})');
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
