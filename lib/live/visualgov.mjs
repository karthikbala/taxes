import {load} from 'cheerio';
import {LookupError} from './engine.mjs';
const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const cash=v=>{const s=String(v??'').replace(/[$,\s]/g,'');return /^\d+(\.\d+)?$/.test(s)?s:null;};
export function resolveVisualGov(data,id,year){
 if(data.success!==true||typeof data.result!=='string')throw new LookupError('collector_layout_changed','Collector search envelope is missing.');
 let d;try{d=JSON.parse(data.result).FLTax;}catch{throw new LookupError('collector_layout_changed','Collector search records are invalid.');}
 const raw=d?.ResultsList,rows=raw?Array.isArray(raw)?raw:[raw]:[],total=Number(d?.ResultsInfo?.TotalRowCount);
 if(total===0&&!rows.length)throw new LookupError('collector_not_found','Collector returned no matching parcel.',404);
 if(!Number.isInteger(total)||total!==rows.length)throw new LookupError('ambiguous_collector_account','Collector results are incomplete.');
 const exact=rows.filter(r=>r.ROLLTYPE==='R'&&norm(r.PROPERTYNO)===norm(id)&&Number(r.TAXYEAR)===year);
 if(exact.length!==1)throw new LookupError(exact.length?'ambiguous_collector_account':'collector_not_found','One exact real-estate parcel and year is required.',404);
 const r=exact[0];if(!/^\d+$/.test(r.TAXBILLNO))throw new LookupError('collector_layout_changed','Bill identity missing.');return r;
}
export function parseVisualGov(html,id,row){
 const $=load(html),t=s=>$(s).text().replace(/\s+/g,' ').trim(),prefix='#ctl00_ContentPlaceHolder1_';
 const parcel=t(prefix+'lblPropertyInfo').match(/^R\s+(.+)$/)?.[1];if(!parcel||norm(parcel)!==norm(id))throw new LookupError('collector_identity_mismatch','Collector bill parcel differs.');
 if(t(prefix+'lblTaxBillNumber')!==`R ${row.TAXBILLNO} ${row.TAXYEAR}`)throw new LookupError('collector_identity_mismatch','Collector bill/year differs from the resolved search record.');
 const due=cash(t(prefix+'lblUnpaidBalance'));if(due===null)throw new LookupError('collector_balance_missing','Explicit current bill balance is missing.');
 const history=[];$('tr').each((_,header)=>{const first=$(header).children().map((_,e)=>t(e)).get();if(first.join('|')!=='Parcel|Roll Type|Year|Original Gross Tax|Original Assessments|Date Paid|Amount Paid|Total Unpaid')return;$(header).nextAll('tr').each((_,tr)=>{const c=$(tr).children('td').map((_,e)=>t(e)).get();if(c.length!==8||c[0]==='Parcel')return;if(norm(c[0])!==norm(id)||c[1]!=='R'||!/^20\d{2}$/.test(c[2]))throw new LookupError('collector_identity_mismatch','Collector history contains another parcel or invalid year.');const observation={year:Number(c[2]),gross_tax:cash(c[3]),assessments:cash(c[4]),payment_date:c[5]&&c[5]!=='N/A'?c[5]:null,paid_amount:cash(c[6]),balance_due:cash(c[7]),source_id:'tax_collector'};const existing=history.find(h=>h.year===observation.year);if(existing){if(JSON.stringify(existing)!==JSON.stringify(observation))throw new LookupError('ambiguous_collector_bill','Conflicting history rows for one tax year.');return;}history.push(observation);});});
 const current=history.find(h=>h.year===Number(row.TAXYEAR));if(!current)throw new LookupError('collector_layout_changed','Current bill history is missing.');
 Object.assign(current,{bill_number:row.TAXBILLNO,receipt_number:t(prefix+'lblReceiptNumber')||null,status_raw:/\*\*\s*PAID\s*\*\*/.test(t('#custombody'))?'PAID':null});
 return {identity:{parcel_id:parcel,owner:t(prefix+'lblName')||null,address:t(prefix+'lblPropertyAddress')||null},taxes:{summary:{balance_due:due,balance_label:'Current collector bill unpaid balance',source_id:'tax_collector'},history},document_note:'The county provides an original HTML bill and a browser print shell; no original PDF was exposed.'};
}
export async function visualgovLookup({client,expectedId,get,verify}){
 const hosts={desoto:'https://www.desotocountytaxcollector.com',bradford:'https://www.bradfordtaxcollector.com',union:'https://unioncountytc.com'};const host=hosts[client];if(!host)throw new LookupError('collector_config_mismatch','Collector host is not approved.');
 const entry=host+'/Property/SearchSelect?ClearData=True';let h=await get(entry,'collector_session');let $=load(h);const disclaimer=$('a[href*="Accept=true"]').attr('href');if(disclaimer){const u=new URL(disclaimer,host);if(u.origin!==host||u.pathname!=='/Property/SearchSelect')throw new LookupError('unexpected_collector_link','Collector session link differs.');h=await get(u.href,'collector_session_form');$=load(h);verify('collector_session_form','session_initialized');}verify('collector_session','session_initialized');
 const years=$('select[name="Years"] option').map((_,e)=>Number($(e).attr('value'))).get().filter(y=>Number.isInteger(y)&&y>=2000&&y<=2100).sort((a,b)=>b-a);if(!years.length)throw new LookupError('collector_layout_changed','Collector supported years are missing.');const year=years[0];
 const form=new URLSearchParams({ownername:'',streetnumber:'',streetname:'',propertynumber:expectedId,taxbillnumber:'',RollTypes:'R',Years:String(year),skip:'0'});
 const headers={'Content-Type':'application/x-www-form-urlencoded',Origin:host,Referer:host+'/Property/SearchSelect?ClearData=True'};
 const row=resolveVisualGov(JSON.parse(await get(host+'/Property/Search','collector_search',headers,{method:'POST',body:form.toString()})),expectedId,year);verify('collector_search');
 const billForm=new URLSearchParams({taxbillno:row.TAXBILLNO,rolltype:row.ROLLTYPE,taxyear:row.TAXYEAR,pq:row.PROTESTEDQ||'',st:row.STATUS||''});
 const html=await get(host+'/Property/TaxBill','tax_collector',headers,{method:'POST',body:billForm.toString()});const result=parseVisualGov(html,expectedId,row);verify('tax_collector');return result;
}
