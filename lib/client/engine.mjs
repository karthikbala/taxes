import {osceolaReportUrl,osceolaClerkUrl,parseOsceolaLiabilityReport,unavailableOsceolaLiability} from './osceola-liabilities.mjs';
import {resolveCapturedOsceola,osceolaSearchUrl} from './osceola-recovery.mjs';
import {validateClientInput,serializeClientRecord} from './contract.mjs';
import {resolveMiami,enrichMiami} from './miami.mjs';
import {resolveOsceola,enrichOsceola} from './osceola.mjs';
import {resolveBradford,enrichBradford} from './bradford.mjs';
import {parseTaxsysBillAmounts} from './collector-amounts.mjs';
import {parseClientVisualGovBill} from './visualgov.mjs';
import {parseClientBillPdf,parseClientTaxHistory,selectLatestAnnualBill} from './bill.mjs';
import {classifyDelinquency,parseMoneyCents} from './delinquency.mjs';
import {floridaLookup} from '../live/florida.mjs';
import {LookupError,readBounded} from '../live/engine.mjs';
import {historicalCoverage,searchMiamiDeeds} from './historical-clearance.mjs';
import {createLookupLogger,lookupLogSummary} from './logging.mjs';
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
const canonical=u=>{const x=new URL(u);x.searchParams.sort();return x.href;};
export function createClientTransport(fetcher=fetch,{deadline=Date.now()+120000,signal,log=()=>{}}={}){
 const sources=[],bodies=new Map(),memo=new Map();
 async function request(url,options={},context={}){
  const u=new URL(url);if(u.hostname==='search.property-appraiser.org')options={...options,headers:{Accept:'application/json','User-Agent':'Mozilla/5.0',Referer:'https://search.property-appraiser.org/Search/MainSearch',...Object.fromEntries(new Headers(options.headers||{}).entries())}};if(u.protocol!=='https:')throw new LookupError('source_url_rejected','Only approved HTTPS county sources are accepted.');
  const key=(options.method||'GET')+' '+canonical(url)+' '+String(options.body||'');const reusable=u.hostname==='apps.miamidadepa.gov'&&u.searchParams.get('Operation')==='GetPropertySearchByFolio';
  if(reusable&&memo.has(key))return memo.get(key).clone();
  let last;
  for(let attempt=0;attempt<3;attempt++){
   const remaining=deadline-Date.now();if(remaining<=0||signal?.aborted)throw new LookupError('lookup_deadline','Lookup deadline reached; no alternate data was substituted.');
   const attemptStart=Date.now();let httpStatus,attemptStatus='failed',errorCode;const sourceRole=u.hostname==='apps.miamidadepa.gov'?'appraiser':/\/print|\.pdf/i.test(u.pathname)?'document':'collector';
   const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),Math.min(18000,remaining));const abort=()=>ctl.abort();signal?.addEventListener('abort',abort,{once:true});
   try{const r=await fetcher(url,{...options,cache:'no-store',signal:ctl.signal});httpStatus=r.status;const bytes=await readBounded(r);const copy=new Response(bytes,{status:r.status,statusText:r.statusText,headers:r.headers});Object.defineProperty(copy,'url',{value:r.url||url});bodies.set(canonical(url),{bytes,url:r.url||url,status:r.status});
    if([408,500,502,503,504].includes(r.status)&&attempt<2){attemptStatus='retry';errorCode='source_unavailable';last=new LookupError('source_unavailable','Transient source response HTTP '+r.status);continue;}
    attemptStatus=r.ok?'received':'http_failure';if(reusable&&r.ok)memo.set(key,copy.clone());return copy;
   }catch(e){errorCode=e.code||e.name;last=e;if(e instanceof LookupError&&e.code!=='source_timeout_or_network_error')throw e;if(attempt===2||signal?.aborted)throw new LookupError('source_timeout_or_network_error','Source request failed after bounded transient attempts.');}
   finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);log('source_attempt',{source_id:context.source_id,source_role:sourceRole,attempt:attempt+1,http_status:httpStatus,status:attemptStatus,error_code:errorCode,duration_ms:Date.now()-attemptStart});}
  }throw last;
 }
 async function get(url,id,headers={},options={}){const {binary,...opts}=options,start=Date.now(),row={id,url,method:opts.method||'GET',status:'pending',fetched_at:new Date().toISOString()};sources.push(row);try{const r=await request(url,{...opts,headers:{Accept:'application/json,text/html,application/pdf',...headers}},{source_id:id});row.http_status=r.status;row.url=r.url||url;if([403,429].includes(r.status))throw new LookupError('source_blocked','County source blocked or limited this request.');if(!r.ok)throw new LookupError(r.status===404?'not_found':'source_unavailable','County source returned HTTP '+r.status);const bytes=new Uint8Array(await r.arrayBuffer());row.sha256=await hash(bytes);row.status='retrieved';return binary?bytes:new TextDecoder().decode(bytes);}catch(e){row.status='failed';row.error_code=e.code||'source_error';throw e;}finally{row.duration_ms=Date.now()-start;log('source_completed',{source_id:id,status:row.status,http_status:row.http_status,error_code:row.error_code,duration_ms:row.duration_ms});}}
 return {request,get,sources,bodies};
}
const normalizeState=s=>({PRESENT:'EXTRACTED',INSPECTED_EMPTY:'EMPTY'}[s]||s);
function sectionsFrom(data){const {section_status,provenance,validation,notes,...sections}=data;return {sections,section_status:Object.fromEntries(Object.entries(section_status||{}).map(([k,v])=>[k,typeof v==='string'?normalizeState(v):v])),provenance:provenance||{},validation:validation||{},notes:notes||[]};}
export function billExemptions(bill,assessment){
 const year=bill.sections.BillDetails?.taxYear,groups=assessment.sections.TaxableValueInformation?.[year],mapping={'Miami-Dade School Board':'SchoolBoard','State and Other':'Regional','Miami-Dade County':'County','Municipal Governing Board':'City'};
 for(const [i,line]of (bill.sections.AdValoremMillage||[]).entries()){
  const group=mapping[line.group],observed=groups?.[group];
  const a=parseMoneyCents(line.taxableValue),b=parseMoneyCents(observed?.TaxableValue);
  const outcome=!observed||a===null||b===null?'unavailable':a===b?'matched':'different';
  bill.validation[`taxable_value_${i}`]=outcome;
  if(outcome==='matched'&&line.exemptionValue===null&&observed.ExemptionValue!==null){
   line.exemptionValue=observed.ExemptionValue;
   bill.provenance[`AdValoremMillage[${i}].exemptionValue`]={source_id:'miami_assessment',method:'same_year_authority_mapping',source_path:`TaxableValueInformation.${year}.${group}.ExemptionValue`,source_year:year,derived:true,validation:'same_year_authority_taxable_value_matched'};
  }
  if(outcome!=='matched')bill.provenance[`AdValoremMillage[${i}].appraiser_comparison`]={source_id:'miami_assessment',method:'same_year_authority_comparison',source_year:year,authority:group??null,status:outcome,note:'No appraiser-derived bill exemption was supplied without matching same-year authority taxable values.'};
 }
}

export async function clientLookup(input,fetcher=fetch,runtime={}){
 const order=validateClientInput(input),start=Date.now(),request_id=runtime.requestId||crypto.randomUUID(),collected_at=new Date().toISOString();const log=runtime.log||createLookupLogger(request_id);log('client_lookup_started',{county:order.county});const transport=createClientTransport(fetcher,{deadline:start+120000,signal:runtime.signal,log});const state={request_id,collected_at,match:{status:'SEARCH_INCOMPLETE',candidates:[]},sections:{},section_status:{},sources:transport.sources,errors:[],validation:{},provenance:{}};
 const finish=()=>{
  const billYear=state.sections.BillDetails?.taxYear;
  if(billYear){
   const years=(state.sections.AssessmentHistory||[]).map(r=>String(r.Year));
   state.validation.appraiser_bill_year={bill_year:String(billYear),latest_assessment_year:state.sections.AssessmentInformation?.Year??null,status:years.includes(String(billYear))?'captured_year_available':'bill_year_not_in_captured_appraiser_history'};
  }
  const failedValidations=Object.entries(state.validation).filter(([key,value])=>/Reconciliation$|^taxable_value_/.test(key)&&typeof value==='string'&&value.toLowerCase()==='different').map(([key])=>key);
  if(failedValidations.length){
   state.errors.push({source_id:'bill_validation',code:'source_values_disagree',message:'Source reconciliation differs: '+failedValidations.join(', ')+'. Original source values are preserved.'});
   state.validation.failed_checks=failedValidations;
  }
  if(state.delinquency){
   state.delinquency.coverageDetails=historicalCoverage(state.delinquency,state.delinquency.taxDeedSearch,state.validation.published_history_rows?.status);
   state.section_status.DelinquencyInformation={status:'PARTIAL',note:state.delinquency.note+' '+state.delinquency.coverageDetails.note};
  }
  if(order.county==='miami-dade-fl'){
   const section=state.section_status.PropertyInformation;
   if(section)state.section_status.PropertyInformation={...(typeof section==='string'?{status:section}:section),note:'Owner occupancy is not explicitly published by the retrieved source; ownerOccupied remains null. Mailing-address differences do not establish occupancy.'};
  }
  const result=serializeClientRecord(order,{...state,duration_ms:Date.now()-start});
  for(const source of state.sources)log('client_source_result',{source_id:source.id,status:source.status,http_status:source.http_status,error_code:source.error_code,duration_ms:source.duration_ms});
  for(const error of state.errors)log('client_source_error',{source_id:error.source_id,error_code:error.code});
  log('client_lookup_completed',lookupLogSummary(result));return result;
 };
 const adapters={'miami-dade-fl':{resolve:resolveMiami,enrich:enrichMiami,source:'miami_assessment'},'osceola-fl':{resolve:resolveOsceola,enrich:enrichOsceola,source:'osceola_assessment'},'bradford-fl':{resolve:resolveBradford,enrich:enrichBradford,source:'bradford_assessment'}};const adapter=adapters[order.county];
 if(!adapter){state.errors.push({source_id:'property_resolution',code:'county_address_contract_pending',message:'This county remains a rollout target. Its client address/owner contract is not yet validated; no parcel was inferred.'});return finish();}
 let assessment,appraiserCapture;
 try{log('client_stage_started',{stage:'property_resolution'});try{state.match=await adapter.resolve(order,transport.get);}
  catch(e){
   if(order.county!=='osceola-fl'||e.code!=='source_blocked'||!runtime.managedBrowser)throw e;
   log('client_stage_started',{stage:'osceola_appraiser_recovery'});
   const capture=await runtime.managedBrowser({url:osceolaSearchUrl,county:order.county,includePdf:false,profile:'osceola-appraiser',input:{address:order.address,ownerName:order.ownerName,...(order.unit?{unit:order.unit}:{})},deadline:start+120000,signal:runtime.signal});
   state.match=await resolveCapturedOsceola(order,capture);appraiserCapture=capture;
   for(const s of state.sources)if(s.id.startsWith('osceola_'))s.id+='_direct';
   for(const r of capture.osceola_responses)state.sources.push({id:r.source_id,url:r.url,method:'BROWSER',status:r.http_status===200?'retrieved':'failed',http_status:r.http_status,fetched_at:r.fetched_at,sha256:await hash(new TextEncoder().encode(r.body)),...(r.http_status!==200?{error_code:'source_unavailable'}:{})});
   state.match.notes.push('Direct appraiser access was challenged; fresh native queries were recovered in one managed browser session and independently verified.');
  }
  if(!state.match.parcel_id)return finish();assessment=sectionsFrom(adapter.enrich(state.match.raw,state.match.parcel_id));delete state.match.raw;Object.assign(state.sections,assessment.sections);Object.assign(state.section_status,assessment.section_status);Object.assign(state.provenance,assessment.provenance);for(const s of transport.sources)if(s.status==='retrieved')s.status='verified';}
 catch(e){state.errors.push({source_id:adapter.source,code:e.code||'parse_error',message:e.message});return finish();}
 let capture=null;const browser=runtime.managedBrowser?async args=>{const result=await runtime.managedBrowser({...args,annualOnly:true,deadline:start+120000});capture=result;return result;}:null;
 const recovered=new Map((appraiserCapture?.osceola_responses||[]).map(r=>[canonical(r.url),r]));
 const collectorRequest=async(url,options)=>{const row=recovered.get(canonical(url));if(row&&(!options?.method||options.method==='GET')){const response=new Response(row.body,{status:row.http_status,headers:{'Content-Type':'application/json'}});Object.defineProperty(response,'url',{value:row.url});return response;}return transport.request(url,options);};
 log('client_stage_started',{stage:'collector_lookup'});const legacy=await floridaLookup({county:order.county,parcel_id:state.match.parcel_id,source_mode:'county',include_pdf:true},collectorRequest,{managedBrowser:browser,clientAnnualOnly:true});for(const s of legacy.sources){const r=recovered.get(canonical(s.url));if(r){s.method='BROWSER';s.fetched_at=r.fetched_at;}}state.sources.push(...legacy.sources.filter(s=>!state.sources.some(x=>x.url===s.url&&x.method===s.method)));state.errors.push(...legacy.errors.filter(e=>e.source_id!=='assessment_county'));
 const html=capture?.html||[...transport.bodies.values()].filter(r=>r.status===200&&/\/load-bill-history/.test(r.url)).map(r=>new TextDecoder().decode(r.bytes))[0];
 let history;
 if(html){try{log('client_stage_started',{stage:'history_parsing'});history=parseClientTaxHistory(html);state.sections.AccountHistory=history.history;state.sections.TaxInformation={...history.summary,type:legacy.taxes?.summary?.status_raw&&/paid/i.test(legacy.taxes.summary.status_raw)?'PAID':legacy.taxes?.summary?.balance_due==='0.00'?'UNKNOWN':null,amountPaidYear:history.latestAnnual?.billYear??null,note:'Account payment status and historical delinquency are separate observations.'};state.section_status.AccountHistory={status:history.coverage==='COMPLETE'?'EXTRACTED':history.coverage,note:'The published annual bill rows were inspected. Full prior-year, certificate and tax-deed coverage is not established by this account view.'};state.section_status.TaxInformation='EXTRACTED';state.delinquency=classifyDelinquency({...history,asOf:new Date(),county:order.county});state.section_status.DelinquencyInformation=state.delinquency.coverage==='COMPLETE'?'EXTRACTED':'PARTIAL';const balance=parseMoneyCents(history.summary.amountDue);state.sections.TaxInformation.type=state.delinquency.hasActiveDelinquency===true?'DELINQUENT':balance!==null&&balance>0n?history.history.some(h=>/partial/i.test(h.status||''))?'PARTIAL':'DUE':balance===0n&&/paid in full|fully paid/i.test(history.summary.statusMessage||'')?'PAID':'UNKNOWN';state.provenance.AccountHistory={source_id:capture?'tax_collector_browser':'tax_collector',method:'county_history_html',source_scope:history.sourceScope,published_history_coverage:history.publishedHistoryCoverage};state.validation.published_history_rows=history.publishedHistoryCoverage;}catch(e){state.errors.push({source_id:'tax_collector',code:e.code||'history_parse_error',message:e.message});}}
 if(!history&&legacy.taxes){state.sections.TaxInformation={accountNumber:legacy.collector_identity?.parcel_id??null,amountDue:legacy.taxes.summary.balance_due==null?null:'$'+Number(legacy.taxes.summary.balance_due).toFixed(2),type:'UNKNOWN',statusMessage:legacy.taxes.summary.status_raw??null};state.section_status.TaxInformation='PARTIAL';}
 if(order.county==='bradford-fl'){
  const captured=[...transport.bodies.values()].filter(r=>r.status===200&&new URL(r.url).hostname==='www.bradfordtaxcollector.com'&&/\/Property\/TaxBill/i.test(new URL(r.url).pathname)).at(-1);
  if(captured&&legacy.join?.status==='matched'){try{const year=Math.max(...(legacy.taxes?.history||[]).map(r=>Number(r.year)).filter(Number.isFinite));const rich=parseClientVisualGovBill(new TextDecoder().decode(captured.bytes),state.match.parcel_id,year);const parsed=sectionsFrom(rich);delete parsed.sections.history;Object.assign(state.sections,parsed.sections);Object.assign(state.section_status,parsed.section_status);Object.assign(state.provenance,parsed.provenance);Object.assign(state.validation,parsed.validation);state.delinquency=classifyDelinquency({...rich.history,asOf:new Date(),county:order.county});state.section_status.DelinquencyInformation=state.delinquency.coverage==='COMPLETE'?'EXTRACTED':'PARTIAL';state.section_status.ParcelDetails={status:typeof state.section_status.ParcelDetails==='string'?state.section_status.ParcelDetails:state.section_status.ParcelDetails?.status||'UNAVAILABLE',note:'Millage rates are preserved as printed fractional tax rates. Their source units are shown below.'};if(state.section_status.Exemptions==='EMPTY')state.section_status.Exemptions={status:'EMPTY',note:'The original bill exemption area was inspected and left blank. This does not establish that the property has no exemptions.'};state.provenance.original_annual_bill={source_id:'tax_collector',source_url:captured.url,sha256:await hash(captured.bytes),format:'HTML',method:'POST'};}catch(e){state.errors.push({source_id:'tax_collector',code:e.code||'html_bill_parse_error',message:e.message});}}else state.errors.push({source_id:'annual_bill',code:'annual_bill_unavailable',message:'The original HTML annual bill was not retrieved and joined; no reference values were substituted.'});
  state.validation.parcel_join=legacy.join?.status||'unverified';return finish();
 }
 const latest=history?selectLatestAnnualBill(history.history):null;
 let bytes,url;if(capture?.pdf&&latest?.pdf_url===capture.pdf.url){bytes=Uint8Array.from(atob(capture.pdf.base64),c=>c.charCodeAt(0));url=capture.pdf.url;}else if(latest?.pdf_url){const stored=transport.bodies.get(canonical(latest.pdf_url));if(stored?.status===200){bytes=stored.bytes;url=stored.url;}}
 if(bytes&&latest){try{log('client_stage_started',{stage:'annual_pdf_parsing'});const bill=sectionsFrom(await parseClientBillPdf(bytes,legacy.collector_identity?.parcel_id||state.match.parcel_id,latest.billYear));const redemption=bill.sections.BillDetails?.redemption;if(redemption){if(parseMoneyCents(redemption.amountDue)!==parseMoneyCents(latest.amountDue)||latest.certificate?.number&&String(latest.certificate.number)!==redemption.certificateNumber)throw new LookupError('source_values_disagree','The redemption PDF differs from the verified annual history amount or certificate.');bill.validation.redemptionHistoryReconciliation='MATCHED';}if(order.county==='miami-dade-fl')billExemptions(bill,assessment);Object.assign(state.sections,bill.sections);Object.assign(state.section_status,bill.section_status);Object.assign(state.provenance,bill.provenance);Object.assign(state.validation,bill.validation);state.provenance.original_annual_bill={source_id:'receipt_pdf',source_url:url,sha256:await hash(bytes),format:'PDF',document_type:bill.sections.BillDetails?.documentType||'Annual tax bill'};if(state.sections.TaxInformation){state.sections.TaxInformation.amountPaidYear=latest.billYear;}}
 catch(e){state.errors.push({source_id:'receipt_pdf',code:e.code||'bill_parse_error',message:e.message});}}
 else state.errors.push({source_id:'annual_bill',code:'annual_bill_unavailable',message:'The latest annual bill was not retrieved and verified; no reference PDF values were substituted.'});
 // The collector's web bill publishes fields omitted from its print PDF.
 // Fetch only the exact already resolved annual document's sibling HTML URL.
 if(latest?.pdf_url&&legacy.join?.status==='matched'){
  try{
   const billUrl=new URL(latest.pdf_url),root=new URL(legacy.sources.find(s=>s.id==='collector_identity'||s.id==='tax_collector_browser')?.url||latest.pdf_url);
   if(billUrl.origin!=='https://county-taxes.net'||billUrl.username||billUrl.password||!billUrl.pathname.startsWith('/iframe-taxsys/')||!billUrl.pathname.endsWith('/print')||!decodeURIComponent(billUrl.pathname).startsWith(decodeURIComponent(root.pathname).split('/bills/')[0].replace(/\/load-bill-history$/,'')+'/bills/'))throw new LookupError('unexpected_document_url','Unexpected collector annual HTML URL was rejected.');
   billUrl.pathname=billUrl.pathname.slice(0,-6);billUrl.hash='';
   let billHtml;
   if(capture?.bill_html&&capture.bill_url===billUrl.href){
    billHtml=capture.bill_html;
    state.sources.push({id:'collector_bill_html',url:billUrl.href,method:'BROWSER',status:'retrieved',fetched_at:collected_at,sha256:await hash(new TextEncoder().encode(billHtml))});
   }else billHtml=await transport.get(billUrl.href,'collector_bill_html');
   const amount=parseTaxsysBillAmounts(billHtml,legacy.collector_identity?.parcel_id||state.match.parcel_id,latest.billYear);
   const existing=state.sections.TaxAmounts?.totalDiscountable;
   if(amount.value!==null){
    if(existing!=null&&existing!==amount.value)throw new LookupError('source_values_disagree','Printed PDF and collector web bill disagree on the discountable subtotal.');
    state.sections.TaxAmounts={...state.sections.TaxAmounts,totalDiscountable:amount.value};
    state.provenance['TaxAmounts.totalDiscountable']={...amount.proof,source_url:billUrl.href,sha256:await hash(new TextEncoder().encode(billHtml)),fetched_at:state.sources.find(s=>s.id==='collector_bill_html')?.fetched_at};
    state.section_status.TaxAmounts={status:['adValorem','nonAdValorem','totalTax'].every(k=>state.sections.TaxAmounts[k]!=null)?'EXTRACTED':'PARTIAL',note:'Discountable subtotal retained from the verified same-account, same-year collector web bill; other totals retain their own source coverage.'};
   }
  }catch(e){state.errors.push({source_id:'collector_bill_html',code:e.code||'collector_amount_parse_error',message:e.message});}
 }
 if(order.county==='osceola-fl'&&state.delinquency&&legacy.join?.status==='matched'){
  const account=state.sections.TaxInformation?.accountNumber;
  log('client_stage_started',{stage:'certificate_deed_reports'});
  let reports;
  try{
   if(!runtime.managedBrowser)throw new LookupError('managed_browser_unavailable','Managed source access is unavailable.');
   reports=await runtime.managedBrowser({url:osceolaReportUrl,county:order.county,includePdf:false,profile:'osceola-liability-reports',account,deadline:start+120000,signal:runtime.signal});
  }catch(e){state.errors.push({source_id:'osceola_liability_reports',code:e.code||'liability_search_failed',message:'Collector certificate and deed reports were not retrieved; verified bill evidence is retained.'});}
  for(const [kind,field]of [['certificates','certificateSearch'],['deeds','taxDeedSearch']]){
   try{
    if(!reports){state.delinquency[field]=unavailableOsceolaLiability(kind);continue;}
    const parsed=parseOsceolaLiabilityReport(reports,kind,account);state.delinquency[field]=parsed;
    const pageProof=[];
    for(const page of reports.reports[kind].pages){const sha256=await hash(new TextEncoder().encode(page.html)),query_sha256=await hash(new TextEncoder().encode(page.submission.query)),id='osceola_'+kind+'_report_page_'+page.page;state.sources.push({id,url:reports.reports[kind].url,method:'BROWSER',status:'verified',http_status:page.submission.http_status,fetched_at:page.fetched_at,sha256,query_sha256,report_id:page.report_id,source_page:page.page});pageProof.push({source_id:id,sha256,query_sha256,fetched_at:page.fetched_at});}
    state.provenance['DelinquencyInformation.'+field]={method:'exact_account_unrestricted_public_report',scope:parsed.scope,pages:pageProof};
    if(parsed.activeEvidence.length){state.delinquency.hasActiveDelinquency=true;state.delinquency.totalPriorYearsDue=null;state.delinquency.note='Active liability evidence was found in the exact-account public Collector report. Source balances and face amounts are not summed as a redemption quote.';state.sections.TaxInformation.type='DELINQUENT';}
   }catch(e){state.delinquency[field]=unavailableOsceolaLiability(kind,'SEARCH_INCOMPLETE');state.errors.push({source_id:'osceola_'+kind+'_report',code:e.code||'liability_parse_error',message:e.message});}
  }
  state.delinquency.clerkTaxDeedSearch={status:'UNAVAILABLE',source_url:osceolaClerkUrl,query_verified:false,coverage:'UNAVAILABLE',scope:'OSCEOLA_CLERK_PUBLIC_TAX_DEED_CASE_INDEX',historicalClearanceEstablished:false,note:'The independent Clerk case index was not queried successfully. The Collector public deed report is a separate source.'};
 }
 if(order.county==='miami-dade-fl'&&history&&legacy.join?.status==='matched'){
  log('client_stage_started',{stage:'historical_deed_search'});
  try{
   const search=await searchMiamiDeeds({folio:state.match.parcel_id,get:transport.get,managedBrowser:runtime.managedBrowser,deadline:start+120000,signal:runtime.signal});
   state.delinquency.taxDeedSearch=search.result||search;
   if(search.capture){const sha256=await hash(new TextEncoder().encode(search.capture.html));state.sources.push({id:'miami_tax_deed_browser',url:state.delinquency.taxDeedSearch.source_url,method:'BROWSER',status:state.delinquency.taxDeedSearch.query_verified?'verified':'retrieved',fetched_at:new Date().toISOString(),sha256});state.provenance['DelinquencyInformation.taxDeedSearch']={source_id:'miami_tax_deed_browser',method:'exact_folio_public_case_search',sha256,scope:state.delinquency.taxDeedSearch.scope};}
  }catch(e){state.delinquency.taxDeedSearch={status:'FAILED',query_verified:false,coverage:'UNAVAILABLE',historicalClearanceEstablished:false,note:'The independent Clerk search failed; verified collector and PDF evidence is retained.'};state.errors.push({source_id:'miami_tax_deed',code:e.code||'deed_search_failed',message:state.delinquency.taxDeedSearch.note});}
 }
 state.validation.parcel_join=legacy.join?.status||'unverified';if(!legacy.join)state.errors.push({source_id:'collector_identity',code:'collector_identity_unresolved',message:'Collector identity was not independently verified against the resolved parcel.'});
 return finish();
}
