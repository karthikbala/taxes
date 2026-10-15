import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {besilPlan,selectBesilTests} from '../scripts/test-besil.mjs';
import {checkBesilResult} from '../scripts/check-besil-result.mjs';
import {validateClientInput} from '../lib/client/contract.mjs';
const fixture=id=>JSON.parse(readFileSync(new URL('./fixtures/regression/'+id.toLowerCase()+'-20261013.json',import.meta.url),'utf8')).record;
const result=(id,mutate)=>{const record=fixture(id);mutate(record.scrapTaxOrderRequest,record.ExtractionMetadata,record);return checkBesilResult(id,record);};

test('Besil phase covers exactly the original three counties and nine named cases with dated evidence',()=>{
 assert.deepEqual(Object.keys(besilPlan.counties),['miami-dade-fl','osceola-fl','bradford-fl']);
 assert.deepEqual(besilPlan.cases.map(c=>c.id),['MIA-01','MIA-02','MIA-03','OSC-01','BRA-01','BRA-02','BRA-03','BRA-04','BRA-05']);
 for(const c of besilPlan.cases){assert.equal(validateClientInput(c.input).county,c.input.county);assert.ok(c.identity.parcel&&c.identity.collector_account&&c.identity.owners.length);assert.match(c.baseline.response_sha256,/^[a-f0-9]{64}$/);assert.ok(existsSync(new URL('../'+c.baseline.evidence,import.meta.url)));assert.equal(c.next_live_run,'NOT_RUN');}
 assert.equal(besilPlan.next_live_acceptance_complete,false);
 for(const id of Object.keys(besilPlan.counties)){const files=selectBesilTests(id);assert.ok(files.includes('tests/client-besil-feedback.test.mjs'));assert.ok(files.includes('tests/poc-workflows.test.mjs'));assert.equal(new Set(files).size,files.length);}
 assert.throws(()=>selectBesilTests('union-fl'));assert.throws(()=>checkBesilResult('unknown',{}));
});
for(const id of ['OSC-01','BRA-02','BRA-03','BRA-05'])test('dated '+id+' source-derived subset passes API checks without claiming new live acceptance',()=>{
 const report=checkBesilResult(id,fixture(id));assert.equal(report.status,'API_CHECKS_PASS',JSON.stringify(report));assert.equal(report.live_acceptance_complete,false);
});
test('exact parcel/account/owner, alphabetic parcel segments and unit identity cannot drift',()=>{
 for(const mutation of [q=>{q.PropertyInformation.ParcelNumber='02-25-28-2850-0001-0020';},q=>{q.TaxInformation.accountNumber='022528285000010010';},q=>{q.PropertyInformation.Owners=['OTHER OWNER'];},(_q,m)=>{m.county_id='miami-dade-fl';},(_q,m)=>{m.match.status='AMBIGUOUS';}])assert.equal(result('OSC-01',mutation).status,'API_CHECKS_FAILED');
 const api=JSON.parse(readFileSync(new URL('../docs/evidence/miami-pdf-repair-2026-10-12/portal-verified-v7.json',import.meta.url),'utf8'));
 api.scrapTaxOrderRequest.PropertyInformation.PropertyAddress='1900 N BAYSHORE DR 513, Miami';assert.ok(checkBesilResult('MIA-02',api).failures.includes('Exact unit missing from matched property address.'));
 const lostLetter=result('BRA-03',q=>{q.PropertyInformation.ParcelNumber='06203-0-01400';});assert.equal(lostLetter.status,'API_CHECKS_FAILED');assert.ok(lostLetter.failures.includes('Wrong or missing property parcel.'));
});
test('money, millage conversion and legitimate zeros reconcile independently',()=>{
 assert.equal(fixture('OSC-01').scrapTaxOrderRequest.AdValoremMillage.at(-1).taxesLevied,'$0.00');
 for(const mutate of [q=>{q.TaxAmounts.nonAdValorem='$1.00';},q=>{q.AdValoremMillage.pop();q.AdValoremMillage[0].taxesLevied='$1.00';},q=>{q.AdValoremMillage[0].millage='1.0000';},q=>{q.BillDetails.paidAmount=null;}])assert.equal(result('OSC-01',mutate).status,'API_CHECKS_FAILED');
 assert.equal(result('BRA-02',q=>{q.ParcelDetails.totalMillageRate=q.ParcelDetails.millageRate;}).status,'API_CHECKS_FAILED','fractional rates must convert to mills');
});
test('missing original/hash/year join and source failure cannot pass a saved-result check',()=>{
 for(const mutate of [(_q,m)=>{m.provenance.original_annual_bill.format='HTML';},(_q,m)=>{m.provenance.original_annual_bill.sha256='0'.repeat(64);},(_q,m)=>{m.sources=[];},(_q,m)=>{m.validation.taxYear='MISMATCH';},(_q,m)=>{m.errors=[{code:'source_blocked'}];},q=>{q.TaxAmounts.totalDiscountable=null;}])assert.equal(result('OSC-01',mutate).status,'API_CHECKS_FAILED');
 assert.equal(result('OSC-01',q=>{q.TaxInformation.amountDue=null;}).status,'API_CHECKS_FAILED');
 assert.equal(checkBesilResult('OSC-01',{}).status,'API_CHECKS_FAILED');
 assert.equal(checkBesilResult('OSC-01',{status:'running',result:fixture('OSC-01')}).status,'API_CHECKS_FAILED');
});
test('changed published amounts/counts are review items; old source snapshots never prove live success',()=>{
 const report=result('OSC-01',q=>{q.BillDetails.paidAmount='$273,974.07';});assert.equal(report.status,'REVIEW_REQUIRED');assert.ok(report.review.some(s=>s.includes('paidAmount')));assert.equal(report.live_acceptance_complete,false);
 const missingRow=result('OSC-01',q=>{q.AdValoremMillage.pop();});assert.equal(missingRow.status,'REVIEW_REQUIRED','dropping a zero-tax authority still changes the recorded row count');
 const snapshot=checkBesilResult('OSC-01',{status:'completed_with_gaps',result:fixture('OSC-01')});assert.equal(snapshot.status,'API_CHECKS_PASS');assert.equal(snapshot.live_acceptance_complete,false);
});
test('mailing detection, source omissions and historical zeroes retain their distinctions',()=>{
 assert.equal(result('BRA-05',(_q,m)=>{m.match.input_address_type='site';}).status,'API_CHECKS_FAILED');
 assert.equal(result('BRA-05',q=>{q.DelinquencyInformation.totalPriorYearsDue='$0.00';}).status,'API_CHECKS_FAILED');
 assert.equal(result('BRA-05',q=>{q.DelinquencyInformation.coverageDetails.historicalClearanceEstablished=true;}).status,'API_CHECKS_FAILED');
 assert.equal(result('BRA-05',q=>{q.DelinquencyInformation.knownTotalDue='$814.55';}).status,'API_CHECKS_FAILED','certificate face cannot be added again');
 const fabricated=result('BRA-05',q=>{q.TaxAmounts.totalDiscountable='$0.00';});assert.equal(fabricated.status,'REVIEW_REQUIRED','newly populated unpublished fields require source review');
});
