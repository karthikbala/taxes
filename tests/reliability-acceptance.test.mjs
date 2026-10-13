import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAcceptance} from '../scripts/accept-reliability.mjs';
test('acceptance refuses placeholders, incomplete county samples and stale approvals',()=>{
 const origin='https://staging.example',approval={origin,max_jobs:36,approved_by:'offline operator',expires_at:'2031-01-01T00:00:00Z'};
 assert.throws(()=>validateAcceptance({cases:[]},approval,origin),/36/);
 const cases=['miami-dade-fl','osceola-fl','bradford-fl'].flatMap(county=>Array.from({length:12},(_,i)=>({id:county+'-'+i,input:{county},status:'pending'})));
 assert.throws(()=>validateAcceptance({cases},approval,origin),/independent/);
 for(const c of cases)Object.assign(c,{status:'independently_verified',verified_by:'offline fixture only',verified_at:'2026-10-13',source_urls:['https://source.example/record'],expected:[{path:'value',value:0}]});
 assert.doesNotThrow(()=>validateAcceptance({cases},approval,origin));assert.throws(()=>validateAcceptance({cases},{...approval,expires_at:'2000-01-01'},origin),/approval/);
});
