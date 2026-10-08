import test from 'node:test';
import assert from 'node:assert/strict';
import {markCollectorRecovered} from '../lib/live/source-status.mjs';
import {sourcePresentation} from '../public/source-status.mjs';

const recoveredLabel='Direct access blocked — recovered through browser';

test('verified browser recovery preserves the failed direct HTTP attempt and provenance',()=>{
 const direct={id:'collector_identity',status:'failed',error_code:'source_blocked',http_status:403,url:'https://county-taxes.net/account/123',method:'GET',duration_ms:42,fetched_at:'2026-10-08T10:00:00.000Z'};
 const browser={id:'tax_collector_browser',status:'verified',method:'BROWSER',sha256:'browser-source-hash'};
 const original={...direct};
 const sources=[direct,browser];
 markCollectorRecovered(sources);
 assert.deepEqual(direct,{...original,status:'recovered',attempt_status:'failed',recovery_source_id:'tax_collector_browser',note:recoveredLabel});
 assert.deepEqual(browser,{id:'tax_collector_browser',status:'verified',method:'BROWSER',sha256:'browser-source-hash'});
 assert.deepEqual(sourcePresentation(direct),{label:recoveredLabel,note:recoveredLabel});
});

test('identity mismatch, other direct failures, and unrelated blocked sources remain failed',()=>{
 const sources=[
  {id:'collector_identity',status:'failed',error_code:'collector_identity_mismatch',http_status:200},
  {id:'collector_identity',status:'failed',error_code:'source_unavailable',http_status:503},
  {id:'assessment_html',status:'failed',error_code:'source_blocked',http_status:403},
  {id:'collector_identity',status:'verified',error_code:'source_blocked',http_status:200},
  {id:'tax_collector_browser',status:'verified',method:'BROWSER'},
 ];
 const before=structuredClone(sources);
 markCollectorRecovered(sources);
 assert.deepEqual(sources,before);
});

test('blocked collector attempt remains failed without a verified browser source',()=>{
 for(const browser of [null,{id:'tax_collector_browser',status:'retrieved',method:'BROWSER'},{id:'tax_collector_browser',status:'failed',error_code:'collector_identity_mismatch'}]){
  const sources=[{id:'collector_identity',status:'failed',error_code:'source_blocked',http_status:403},...(browser?[browser]:[])];
  const before=structuredClone(sources);
  markCollectorRecovered(sources);
  assert.deepEqual(sources,before);
 }
});

test('presentation keeps genuine failures and their notes unchanged',()=>{
 const failed={id:'collector_identity',status:'failed',error_code:'collector_identity_mismatch',note:'Collector returned a different account'};
 const before={...failed};
 assert.deepEqual(sourcePresentation(failed),{label:'failed',note:'Collector returned a different account'});
 assert.deepEqual(failed,before);
 assert.deepEqual(sourcePresentation({status:'failed',error_code:'source_blocked'}),{label:'failed',note:null});
 assert.deepEqual(sourcePresentation({status:'verified'}),{label:'verified',note:null});
});
