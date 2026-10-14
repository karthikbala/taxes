// Local result checking only. This module never starts a lookup or contacts a source.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {besilPlan} from './test-besil.mjs';

const identity=value=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const owner=value=>String(value??'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(Boolean).sort().join(' ');
export function fieldAt(record,path){return path.split('.').reduce((v,k)=>k==='length'&&Array.isArray(v)?v.length:v?.[k],record);}
const present=value=>value!==null&&value!==undefined&&value!=='';
function cents(value){
 if(typeof value!=='string'||!/^\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(value))return null;
 const [whole,fraction='']=value.replace(/[$,]/g,'').split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
}
function decimal(value){
 if(typeof value!=='string'||!/^\d*\.\d{1,8}$/.test(value))return null;
 const [whole,fraction]=value.split('.');return BigInt(whole||'0')*100000000n+BigInt(fraction.padEnd(8,'0'));
}

export function checkBesilResult(caseId,saved) {
 const c=besilPlan.cases.find(c=>c.id===caseId);if(!c)throw Error('Unknown Besil case: '+caseId);
 const result=saved?.result??saved,q=result?.scrapTaxOrderRequest,m=result?.ExtractionMetadata,failures=[],review=[];
 const check=(ok,message)=>{if(!ok)failures.push(message);};
 if(!q||!m)return {case_id:caseId,status:'API_CHECKS_FAILED',failures:['Client result or extraction metadata missing.'],review:[],live_acceptance_complete:false};
 if(saved?.result)check(['completed','completed_with_gaps'].includes(saved.status),'Durable job did not finish successfully.');
 check(m.county_id===c.input.county,'Wrong county.');
 check(m.match?.status==='MATCHED'&&q.matchStatus==='MATCHED','Address/owner did not resolve uniquely.');
 for(const [name,value,expected] of [
  ['property parcel',q.PropertyInformation?.ParcelNumber,c.identity.parcel],
  ['resolver parcel',m.match?.parcel_id,c.identity.parcel],
  ['collector account',q.TaxInformation?.accountNumber,c.identity.collector_account],
  ['bill folio',q.BillDetails?.folio,c.identity.collector_account]
 ])check(identity(value)===identity(expected),'Wrong or missing '+name+'.');
 check(Array.isArray(q.PropertyInformation?.Owners)&&c.identity.owners.every(name=>q.PropertyInformation.Owners.some(actual=>owner(actual)===owner(name))),'Expected legal owner missing.');
 if(c.identity.unit)check(new RegExp('(?:^|\\D)'+c.identity.unit+'(?:\\D|$)').test(q.PropertyInformation?.PropertyAddress||''),'Exact unit missing from matched property address.');
 check(present(q.AssessmentInformation?.AssessedValue)&&/^\d{4}$/.test(q.AssessmentInformation?.Year||''),'Assessment value/year unavailable.');
 check(['PAID','DUE','DELINQUENT','PARTIAL'].includes(q.TaxInformation?.type),'Collector payment status unavailable.');
 check(cents(q.TaxInformation?.amountDue)!==null||cents(q.TaxInformation?.amountPayableOnline)!==null,'Collector amount due/payable scope unavailable.');
 check(/^\d{4}$/.test(q.BillDetails?.taxYear||''),'Bill year unavailable.');
 check(Array.isArray(m.errors)&&m.errors.length===0,'Extraction errors or missing error inventory.');
 check(m.validation?.parcel==='MATCHED'&&m.validation?.taxYear==='MATCHED'&&m.validation?.parcel_join==='matched','Parcel/account/year join not verified.');
 check(present(m.request_id)&&Number.isFinite(Date.parse(m.collected_at)),'Request ID or collection timestamp unavailable.');
 const original=m.provenance?.original_annual_bill;
 check(original?.format===c.document_format,'Original document format changed or missing.');
 const source=m.sources?.find(s=>s.id===original?.source_id&&s.sha256===original?.sha256&&s.url===original?.source_url);
 check(Boolean(source&&/^[a-f0-9]{64}$/.test(source.sha256)&&/^https:\/\//.test(source.url)&&Number.isFinite(Date.parse(source.fetched_at))&&['verified','retrieved'].includes(source.status)),'Original document source/hash/time not verified.');
 const type=q.BillDetails?.documentType||original?.document_type||'annual';
 const kind=/redemption/i.test(type)?'redemption':/certificate/i.test(type)?'certificate':'annual';
 if(kind!==c.bill_kind)review.push('Document lifecycle changed; recheck published fields before updating the baseline.');
 if(kind==='annual'){
  const a=cents(q.TaxAmounts?.adValorem),n=cents(q.TaxAmounts?.nonAdValorem),t=cents(q.TaxAmounts?.totalTax),rows=q.AdValoremMillage;
  check(a!==null&&n!==null&&t!==null,'Published annual tax totals unavailable.');
  if(a!==null&&n!==null&&t!==null)check(a+n===t,'Ad-valorem plus non-ad-valorem does not equal combined tax.');
  check(Array.isArray(rows)&&rows.length>0,'Annual authority rows missing.');
  if(Array.isArray(rows)&&rows.length){
   const amounts=rows.map(r=>cents(r.taxesLevied)),rates=rows.map(r=>decimal(r.millage)),sum=amounts.every(v=>v!==null)?amounts.reduce((a,b)=>a+b,0n):null;
   check(sum!==null&&a!==null&&(sum>a?sum-a:a-sum)<=5n,'Authority tax rows do not reconcile to ad-valorem total.');
   const units=new Set(rows.map(r=>r.millageUnit||'mills')),total=decimal(q.ParcelDetails?.totalMillageRate);
   check(total!==null&&q.ParcelDetails?.totalMillageRateUnit==='mills','Total millage or explicit mills unit missing.');
   if(rates.every(v=>v!==null)&&total!==null&&units.size===1){
    const unit=[...units][0],factor=unit==='source_displayed_rate_fraction'?1000n:unit==='mills'?1n:null;
    check(factor!==null,'Unknown authority rate unit.');
    if(factor!==null)check(rates.reduce((a,b)=>a+b,0n)*factor===total,'Summed authority rates differ from total mills.');
   }else check(false,'Missing or mixed authority millage rates/units.');
  }
  if(c.bill_kind==='annual'&&c.baseline.observations['scrapTaxOrderRequest.BillDetails.paidAmount']!==null)check(cents(q.BillDetails?.paidAmount)!==null&&present(q.BillDetails?.paidDate),'Published payment date/amount missing.');
 }
 if(c.input.county!=='bradford-fl')check(cents(q.TaxAmounts?.totalDiscountable)!==null,'Published discountable subtotal unavailable.');
 if(kind==='redemption'){
  const redemption=q.BillDetails?.redemption,charges=redemption?.charges,amount=cents(redemption?.amountDue);
  check(present(redemption?.certificateNumber)&&amount!==null,'Redemption certificate/quote unavailable.');
  const values=Array.isArray(charges)?charges.map(r=>cents(r.amount)):[];
  check(values.length>0&&values.every(v=>v!==null)&&amount!==null&&values.reduce((a,b)=>a+b,0n)===amount,'Redemption charges do not reconcile to quote.');
 }
 const d=q.DelinquencyInformation;
 check(present(d?.coverage),'Historical coverage missing.');
 if(d?.hasActiveDelinquency===true){
  const liabilities=d.delinquentYears,amounts=Array.isArray(liabilities)?liabilities.map(r=>cents(r.amountDue)):[],total=cents(d.knownTotalDue);
  check(amounts.length>0&&amounts.every(v=>v!==null)&&total!==null&&amounts.reduce((a,b)=>a+b,0n)===total,'Known delinquent subtotal does not reconcile to listed liabilities.');
  if(Array.isArray(liabilities))check(new Set(liabilities.map(r=>r.billYear+'|'+r.billType)).size===liabilities.length,'Duplicate annual liabilities.');
 }
 if(d?.coverage==='PARTIAL')check(d.totalPriorYearsDue===null&&d.coverageDetails?.historicalClearanceEstablished!==true,'Partial history incorrectly claims complete liability or clearance.');
 if(c.input.county==='bradford-fl'&&['BRA-04','BRA-05'].includes(c.id)){
  check(m.match?.requested_address_type==='auto'&&m.match?.input_address_type==='mailing','Mailing example no longer resolves automatically.');
  check(present(q.PropertyInformation?.MailingAddress)&&q.PropertyInformation?.PropertyAddress!==q.PropertyInformation?.MailingAddress,'Site and mailing addresses collapsed.');
 }
 for(const [path,expected]of Object.entries(c.baseline.observations))if(JSON.stringify(fieldAt(result,path))!==JSON.stringify(expected))review.push(path+' differs from the dated '+c.baseline.observed_on+' observation. Verify the fresh source.');
 return {case_id:caseId,status:failures.length?'API_CHECKS_FAILED':review.length?'REVIEW_REQUIRED':'API_CHECKS_PASS',failures,review,request_id:m.request_id,collected_at:m.collected_at,baseline_observed_on:c.baseline.observed_on,live_acceptance_complete:false,note:'Local saved-JSON checks only. Fresh source/original-document comparison and rendered UI checks remain required.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);if(args.length!==2)throw Error('Usage: npm run check:besil -- CASE-ID private-result.json');
 const report=checkBesilResult(args[0],JSON.parse(readFileSync(args[1],'utf8')));console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='API_CHECKS_PASS'?0:report.status==='REVIEW_REQUIRED'?2:1;
}
