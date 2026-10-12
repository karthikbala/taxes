import {load} from 'cheerio';
import {LookupError} from '../live/engine.mjs';
import {parseMoneyCents} from './delinquency.mjs';
export const osceolaReportUrl='https://county-taxes.net/osceola/reports/real-estate';
export const osceolaClerkUrl='https://officialrecords.osceolaclerk.org/browserviewtd/';
export const osceolaReports={certificates:{id:'1520',name:'Public-Certificate List All Certificates',ready:'tax_year'},deeds:{id:'1825',name:'Public-Tax Deed Search',ready:'application_date'}};
export function osceolaAccount(value){if(typeof value!=='string'||!/^R\d{6}-[A-Z0-9]{12}$/.test(value))throw new LookupError('invalid_collector_account','A verified Osceola real-estate collector account is required.');return value;}
export function osceolaLiabilityCaptureCode(value){const account=osceolaAccount(value);return `await (async()=>{
await page.goto(${JSON.stringify(osceolaReportUrl)},{waitUntil:'domcontentloaded',timeout:22000});
let frame;for(let i=0;i<75;i++){frame=page.frames().find(f=>f.url().startsWith('https://county-taxes.net/iframe-taxsys/osceola.county-taxes.com/govhub/reports/real-estate'));if(frame)break;await page.waitForTimeout(200);}if(!frame)throw new Error('REPORT_FRAME_MISSING');
await frame.locator('#selected-report-filter').waitFor({state:'visible',timeout:15000});
const reports={};
for(const [kind,report]of Object.entries(${JSON.stringify(osceolaReports)})){
 await frame.locator('#selected-report-filter').fill(report.name);
 await frame.locator('[id="'+report.id+'"]').click({timeout:5000});
 await frame.locator('#'+report.ready).waitFor({state:'visible',timeout:15000});
 for(const input of await frame.locator('#report_results__criteria input').all())await input.fill('');
 for(const select of await frame.locator('#report_results__criteria select').all())await select.selectOption('/|/');
 await frame.locator('#account_number').fill(${JSON.stringify(account+'|')});
 if(kind==='certificates')await frame.locator('#certificate_number').fill('*');
 const pages=[];let submission=null;
 const observe=r=>{try{const req=r.request(),u=new URL(r.url());if(u.origin!=='https://county-taxes.net'||!u.pathname.startsWith('/iframe-taxsys/osceola.county-taxes.com/')||req.method()!=='POST')return;const data=new URLSearchParams(req.postData()||'');if(!data.has('report_search'))return;submission={url:u.href,http_status:r.status(),keys:[...data.keys()],report_id:data.get('selected_report'),query:data.get('report_search'),current_inputs:data.get('report_search_current_user_inputs')};}catch{}};
 page.on('response',observe);
 try{
  await frame.locator('#run-search').click();
  await frame.locator('.data-records [data-count]').waitFor({state:'visible',timeout:15000});
  for(let number=1;number<=5;number++){
   const captured=await frame.evaluate(()=>{
    const container=document.querySelector('#report_results'),copy=container.cloneNode(true);
    for(const el of copy.querySelectorAll('script,style,svg,input[type="hidden"],.tooltip-toggle'))el.remove();
    for(const el of copy.querySelectorAll('*'))for(const attr of Array.from(el.attributes))if(!['id','class','value','name','selected','data-count','href','disabled','aria-disabled','colspan'].includes(attr.name))el.removeAttribute(attr.name);
    const filters=Object.fromEntries(Array.from(document.querySelectorAll('#report_results__criteria input,#report_results__criteria select')).map(e=>[e.id,e.value]));
    const count=Number(document.querySelector('.data-records [data-count]').dataset.count);
    const rows=document.querySelectorAll('#report_results__results tr');
    return {html:copy.outerHTML,filters,count,row_count:count===0?0:rows.length,report_id:document.querySelector('#selected_report').value,report_name:document.querySelector('#selected-report-filter').value,page:Number(document.querySelector('.pages .current')?.textContent||document.querySelector('.pages')?.textContent.match(/\\d+/)?.[0]||1),fetched_at:new Date().toISOString()};
   });
   if(captured.html.length>500000)throw new Error('SOURCE_BODY_LIMIT');
   pages.push({...captured,submission});
   if(pages.reduce((n,p)=>n+p.row_count,0)>=captured.count)break;
   const target=number+1;submission=null;
   await frame.locator('#go_to_report_page').fill(String(target));
   await frame.locator('#go_to_report_page').press('Tab');
   await frame.waitForFunction(n=>Number(document.querySelector('.pages .current')?.textContent||document.querySelector('.pages')?.textContent.match(/\\d+/)?.[0]||1)===n,target,{timeout:15000});
  }
 }finally{page.off('response',observe);}
 reports[kind]={url:frame.url(),pages};
}
 console.log('INVISIA_RESULT='+JSON.stringify({url:${JSON.stringify(osceolaReportUrl)},html:'',pdf:null,account:${JSON.stringify(account)},reports}));
})();`;}

const columns={
 certificates:['Tax Yr','Account Number','Cert #','Cert Buyer','Bidder #','Account Status','Assessed Value','School Assessed Value','Account Balance Amount','Cert Status','County Held','Deed Status','Delinquent Costs','Issued Date','Face Amount','Interest Rate','Date Redeemed','Receipt #','Redemption Amt','Use Code','Owner Name','Owner Address','Property Address'],
 deeds:['Current Address Name','Current Address','Account Number','Property Address','Deed Status','Application Date','Deed Sale Date']
};
const keys={
 certificates:['tax_year','account_number','certificate_number','certificate_buyer','bidder_number','status','assessed_value','school_assessed_value','act_balance_amount','cert_status','struck_to_county','deed_status','delinquent_costs','issued_date','face_amount','certificate_rate','redeemed_date','redemption_receipt','redemption_amount','use_code','owner_name','owner_address','situs_address'],
 deeds:['most_recent_name','most_recent_address','account_number','situs_address','deed_status','application_date','deed_sale_date']
};
const anyFilters={certificates:['status','cert_status','struck_to_county','deed_status'],deeds:['deed_status']};
const normalize=s=>String(s??'').replace(/\s+/g,' ').trim();
const failure=message=>{throw new LookupError('liability_search_unverified',message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const reportFrame='https://county-taxes.net/iframe-taxsys/osceola.county-taxes.com/govhub/reports/real-estate';
const reportResponse='https://county-taxes.net/iframe-taxsys/osceola.county-taxes.com/tcb/app/public/reports/real_estate/report_results';

export function unavailableOsceolaLiability(kind,status='UNAVAILABLE'){
 return {status,source_url:osceolaReportUrl,report_id:osceolaReports[kind].id,query_verified:false,coverage:'UNAVAILABLE',scope:kind==='certificates'?'OSCEOLA_COLLECTOR_PUBLIC_CERTIFICATE_REPORT':'OSCEOLA_COLLECTOR_PUBLIC_TAX_DEED_REPORT',record_count:null,records:[],activeEvidence:[],currentRedemptionQuote:null,historicalClearanceEstablished:false,note:'A complete exact-account public report query was not verified.'};
}

// Verify both the submitted native POST and the response controls before making
// any negative conclusion. Missing pages, restrictive defaults and wrong-account
// rows fail closed. Source rows remain distinct across holder/lifecycle changes.
export function parseOsceolaLiabilityReport(capture,kind,account){
 osceolaAccount(account);const report=osceolaReports[kind],source=capture?.reports?.[kind];
 if(!report||capture?.url!==osceolaReportUrl||capture.account!==account||!source||![reportFrame,reportFrame+'?'].includes(source.url)||!Array.isArray(source.pages)||!source.pages.length||source.pages.length>5)failure('The collector report source or account was not verified.');
 const expected=Object.fromEntries(keys[kind].map(k=>[k,k==='account_number'?account+'|':anyFilters[kind].includes(k)?'/|/':kind==='certificates'&&k==='certificate_number'?'*':'']));
 const records=[],pages=[],seen=new Set();let total;
 for(const [index,page]of source.pages.entries()){
  if(typeof page.html!=='string'||page.html.length>500000||page.report_id!==report.id||page.report_name!==report.name||page.page!==index+1||!Number.isSafeInteger(page.count)||page.count<0||!Number.isFinite(Date.parse(page.fetched_at)))failure('The report identity, page or count was not verified.');
  if(total===undefined)total=page.count;else if(total!==page.count)failure('The report count changed during pagination.');
  if(!same(Object.keys(page.filters||{}).sort(),keys[kind].slice().sort())||keys[kind].some(k=>page.filters[k]!==expected[k]))failure('Restrictive or unverified report filters were returned.');
  const submission=page.submission,parts=String(submission?.query??'').split('\t');
  if(parts.pop()!==''||parts.length%2)failure('The native report query was malformed.');
  const submitted={};for(let i=0;i<parts.length;i+=2){if(Object.hasOwn(submitted,parts[i]))failure('Duplicate report query filters were returned.');submitted[parts[i]]=parts[i+1];}
  const nonblank=Object.fromEntries(Object.entries(expected).filter(([,v])=>v!==''));
  if(submission?.url!==reportResponse||submission.http_status!==200||submission.report_id!==report.id||submission.current_inputs!==''||!same(Object.keys(submitted).sort(),Object.keys(nonblank).sort())||Object.entries(nonblank).some(([k,v])=>submitted[k]!==v))failure('The unrestricted exact-account POST was not verified.');
  const $=load(page.html);$('script,style,[hidden]').remove();
  const headers=$('#report_results table thead th').map((_,el)=>normalize($(el).text())).get();
  if(!same(headers,columns[kind]))failure('The public report schema changed.');
  const controls=$('#report_results__criteria input,#report_results__criteria select');
  if(controls.length!==keys[kind].length||controls.toArray().some(el=>!Object.hasOwn(expected,$(el).attr('id'))||$(el).val()!==expected[$(el).attr('id')]))failure('The response filter controls did not confirm the submitted query.');
  const count=$('.data-records [data-count]');
  if(count.length!==1||count.attr('data-count')!==String(total))failure('The source total was missing or inconsistent.');
  const rows=$('#report_results__results > tr');
  if(total===0){if(source.pages.length!==1||rows.length!==1||normalize(rows.text())!=='No results.'||page.row_count!==0)failure('The empty-source response was not verified.');}
  else {
   const displayed=Number(normalize($('.pages strong').text()));
   if(displayed!==index+1||!rows.length||page.row_count!==rows.length)failure('The displayed report page was not verified.');
   for(const row of rows.toArray()){
    const values=$(row).children('td').toArray().map(el=>normalize($(el).text())||null);
    if(values.length!==columns[kind].length)failure('A report row was incomplete.');
    const fields=Object.fromEntries(columns[kind].map((k,i)=>[k,values[i]]));
    if(fields['Account Number']!==account)failure('The report contained an unrelated account.');
    if(kind==='certificates'&&(!/^\d{4}$/.test(fields['Tax Yr']||'')||Number(fields['Tax Yr'])<1900||Number(fields['Tax Yr'])>new Date(page.fetched_at).getUTCFullYear()||!fields['Cert #']||!fields['Cert Status']))failure('Certificate year or identity was missing.');
    const identity=JSON.stringify(fields);if(seen.has(identity))failure('Repeated report rows prevented a complete unique capture.');seen.add(identity);
    records.push({source_page:index+1,source_row:records.length+1,fields});
   }
  }
  pages.push({page:index+1,fetched_at:page.fetched_at,reported_count:total,captured_rows:page.row_count,query:submission.query});
 }
 if(records.length>total)failure('The report returned more rows than its declared total.');
 const complete=records.length===total;
 const activeEvidence=records.filter(({fields:f})=>kind==='certificates'?f['Cert Status']==='Issued'&&parseMoneyCents(f['Account Balance Amount'])>0n:/^(Applied|Certified|Pending|Pending Sale)$/i.test(f['Deed Status']||'')).map(r=>({source_page:r.source_page,source_row:r.source_row,accountNumber:account,taxYear:r.fields['Tax Yr']??null,certificateNumber:r.fields['Cert #']??null,status:r.fields[kind==='certificates'?'Cert Status':'Deed Status'],accountBalance:r.fields['Account Balance Amount']??null,currentRedemptionQuote:null}));
 return {...unavailableOsceolaLiability(kind),status:complete?(total===0?'INSPECTED_EMPTY':'RECORDS_FOUND'):'SEARCH_INCOMPLETE',requested_account:account,query_verified:true,coverage:complete?'COMPLETE_PUBLIC_QUERY':'PARTIAL_PUBLIC_QUERY',record_count:total,captured_count:records.length,records,activeEvidence,pages,year_scope:'No year, status, owner, address or date restriction; only records published by this public report. Earliest retained year is not established.',note:'Certificate face amounts, historical redemption receipts and repeated account balances are source fields, not a current redemption quote or additive liabilities. Collector tax-deed status is separate from the independent Clerk case index. Full historical clearance is not established.'};
}
