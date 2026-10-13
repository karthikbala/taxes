import {load} from 'cheerio';
import {parseMoneyCents,displayMoney} from './delinquency.mjs';

const host='https://www.bradfordtaxcollector.com';
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const norm=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');

export function parseBradfordHistorySearch(data,parcel,{maximum=25}={}){
 if(data?.success!==true||typeof data.result!=='string')fail('collector_layout_changed','Historical search envelope is missing.');
 let body;try{body=JSON.parse(data.result).FLTax;}catch{fail('collector_layout_changed','Historical search records are invalid.');}
 const info=body?.ResultsInfo,rows=body?.ResultsList?Array.isArray(body.ResultsList)?body.ResultsList:[body.ResultsList]:[];
 const total=Number(info?.TotalRowCount),skip=Number(info?.Skip),page=Number(info?.Rows);
 if(!Number.isInteger(total)||total<0||skip!==0||!Number.isInteger(page)||page<1||total!==rows.length||total>maximum)fail('history_search_incomplete','The public historical search exceeds its verified complete bounded result.');
 const ids=new Set();
 for(const row of rows){
  if(row.ROLLTYPE!=='R'||norm(row.PROPERTYNO)!==norm(parcel)||!/^\d+$/.test(row.TAXBILLNO)||!/^20\d{2}$/.test(row.TAXYEAR))fail('collector_identity_mismatch','Historical search contains an unexpected parcel, roll, bill or year.');
  const key=row.TAXYEAR+':'+row.TAXBILLNO;if(ids.has(key))fail('ambiguous_collector_bill','Historical search repeats a bill identity.');ids.add(key);
 }
 return rows.sort((a,b)=>Number(b.TAXYEAR)-Number(a.TAXYEAR));
}

// An archived zero balance does not establish how or when a certificate ended.
// Historical records are not fed into current-liability sums.
export function parseBradfordHistoricalBill(html,parcel,row){
 const $=load(html),prefix='ctl00_ContentPlaceHolder1_';
 const label=name=>{const values=$(`[id="${prefix}${name}"]`).map((_,n)=>clean($(n).text())).get();if(new Set(values).size>1)fail('ambiguous_collector_bill','Conflicting historical bill fields.');return values[0]||null;};
 if(/just a moment|verify you are human|access denied/i.test(clean($('body').text())))fail('source_blocked','Historical bill is blocked.');
 const certificate=$(`[id="${prefix}lblCertificateStatus"]`).length>0;
 const identity=label(certificate?'lblTaxBillInfo':'lblTaxBillNumber')?.match(/^R\s+(\d+)\s+(\d{4})$/),id=label('lblPropertyInfo')?.match(/^R\s+(.+)$/)?.[1];
 if(!identity||identity[1]!==String(row.TAXBILLNO)||identity[2]!==String(row.TAXYEAR)||norm(id)!==norm(parcel))fail('collector_identity_mismatch','Historical original bill differs from the exact search parcel/year/bill.');
 const owner=label('lblName');if(owner&&clean(row.NAME)&&norm(owner)!==norm(row.NAME))fail('collector_identity_mismatch','Historical bill owner differs from its own year-specific search result.');
 const money=name=>{const value=label(name),amount=parseMoneyCents(value);if(value!==null&&amount===null)fail('source_values_disagree','Historical money field is malformed.');return displayMoney(amount);};
 const due=money(certificate?'lblTotalCertBalance':'lblUnpaidBalance');if(due===null)fail('collector_balance_missing','Historical original bill has no explicit balance.');
 const result={parcelId:parcel,billYear:String(row.TAXYEAR),billNumber:String(row.TAXBILLNO),sourceOwner:owner,documentType:certificate?'certificate_notice':'annual_tax_bill',amountDue:due,paidAmount:certificate?null:money('lblAmountCollected'),paidDate:certificate?null:label('lblLastPaymentDate'),receiptNumber:certificate?null:label('lblReceiptNumber'),combinedTaxesAndAssessments:certificate?null:money('lblCombinedTotal'),certificate:null,scope:'YEAR_SPECIFIC_ORIGINAL_RECORD',includedInCurrentLiabilityTotal:false};
 if(certificate){const number=label('lblCertificateNumber');if(!/^\d+$/.test(number||''))fail('collector_identity_missing','Historical certificate identifier is missing.');result.certificate={number,status:'UNKNOWN',statusRaw:label('lblCertificateStatus'),date:label('lblSaleDate'),holder:label('lblBidderID'),interestRate:label('lblBidRate'),faceAmount:money('lblCertificateOriginalAmount'),interestAmount:money('lblInterestAmount'),fees:money('lblFee')};result.note=parseMoneyCents(due)===0n?'The original historical notice prints zero unpaid balance; redemption, cancellation or expiration is not established.':'Historical certificate observation; current active liabilities are reported separately from the latest verified notice.';}
 else result.note='Original year-specific annual bill; paid fields are retained only when printed.';
 return result;
}

export async function lookupBradfordTaxHistory({parcel,request,latest,maximum=25}){
 const cookies=new Map(),sources=[];
 async function get(path,source_id,options={}){
  const url=new URL(path,host);if(url.origin!==host||!['/Property/SearchSelect','/Property/Search','/Property/TaxBill'].includes(url.pathname))fail('source_url_rejected','Historical source is outside the approved county forms.');
  const r=await request(url.href,{...options,headers:{Accept:'application/json,text/html',Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...options.headers}},{source_id});
  for(const value of r.headers.getSetCookie?.()||[]){const pair=value.split(';')[0],i=pair.indexOf('=');if(i>0)cookies.set(pair.slice(0,i),pair.slice(i+1));}
  const actual=new URL(r.url||url);if(actual.origin!==host||!['/Property/SearchSelect','/Property/Search','/Property/TaxBill','/Property/PriorBill'].includes(actual.pathname))fail('source_url_rejected','Historical source redirected outside approved county records.');
  const bytes=new Uint8Array(await r.arrayBuffer()),time=r.headers.get('x-retrieval-time')||new Date().toISOString();sources.push({id:source_id,url:actual.href,method:options.method||'GET',status:r.ok?'retrieved':'failed',http_status:r.status,fetched_at:time,artifact_retrieved_at:time,sha256:await hash(bytes)});
  if([403,429].includes(r.status))fail('source_blocked','Historical county source denied or limited access.');if(!r.ok)fail('source_unavailable','Historical county source returned HTTP '+r.status);
  return {html:new TextDecoder().decode(bytes),source:sources.at(-1)};
 }
 const errors=[],records=[];
 const coverage={scope:'EXACT_PARCEL_ALL_YEARS_PUBLIC_SEARCH',queryVerified:false,searchRecords:null,originalRecordsRetrieved:0,retentionStartYear:null,allHolderCertificateHistoryComplete:false,historicalClearanceEstablished:false,status:'UNAVAILABLE'};
 try{
  let form=await get('/Property/SearchSelect?ClearData=True','bradford_history_session'),$=load(form.html);const accept=$('a[href*="Accept=true"]').attr('href');if(accept){form=await get(new URL(accept,host).href,'bradford_history_session_form');$=load(form.html);}
  if(!$('select[name="Years"] option').toArray().some(n=>$(n).attr('value')===''&&clean($(n).text())==='All Years'))fail('collector_layout_changed','Official All Years option is missing.');
  const headers={'Content-Type':'application/x-www-form-urlencoded',Origin:host,Referer:host+'/Property/SearchSelect?ClearData=True'};
  const search=await get('/Property/Search','bradford_history_search',{method:'POST',headers,body:new URLSearchParams({ownername:'',streetnumber:'',streetname:'',propertynumber:parcel,taxbillnumber:'',RollTypes:'R',Years:'',skip:'0'}).toString()});
  const rows=parseBradfordHistorySearch(JSON.parse(search.html),parcel,{maximum});Object.assign(coverage,{queryVerified:true,searchRecords:rows.length,status:'COMPLETE_PUBLIC_QUERY'});
  let failures=0;
  for(const row of rows){
   const entry={parcelId:parcel,billYear:String(row.TAXYEAR),billNumber:String(row.TAXBILLNO),sourceOwner:clean(row.NAME)||null,documentStatus:'UNAVAILABLE'};
   if(failures>=2){records.push({...entry,note:'Further original requests stopped after two consecutive retrieval failures.'});continue;}
   try{
    const reuse=latest&&String(latest.year)===String(row.TAXYEAR)&&String(latest.billNumber)===String(row.TAXBILLNO);
    const original=reuse?{html:latest.html,source:latest.source}:await get('/Property/TaxBill','bradford_history_bill_'+row.TAXYEAR+'_'+row.TAXBILLNO,{method:'POST',headers,body:new URLSearchParams({taxbillno:row.TAXBILLNO,rolltype:'R',taxyear:row.TAXYEAR,pq:row.PROTESTEDQ||'',st:row.STATUS||''}).toString()});
    const parsed=parseBradfordHistoricalBill(original.html,parcel,row);records.push({...entry,...parsed,documentStatus:'EXTRACTED',sourceUrl:original.source.url,sourceSha256:original.source.sha256,retrievedAt:original.source.fetched_at});coverage.originalRecordsRetrieved++;failures=0;
   }catch(e){records.push({...entry,note:'The original record could not be verified; search status codes are not substituted for lifecycle or amounts.'});errors.push({source_id:'bradford_history',code:e.code||'history_record_unavailable',message:e.message});failures++;}
  }
  if(coverage.originalRecordsRetrieved!==rows.length)coverage.status='PARTIAL';
 }catch(e){coverage.status=e.code==='history_search_incomplete'?'SEARCH_INCOMPLETE':'UNAVAILABLE';errors.push({source_id:'bradford_history',code:e.code||'history_search_failed',message:e.message});}
 coverage.note='Complete public-query retrieval covers only records returned by this search. Undisclosed retention, omitted accounts, certificate lifecycle and deed coverage remain unverified.';
 return {records,coverage,sources,errors};
}
