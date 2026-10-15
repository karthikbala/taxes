import {classifyDelinquency} from '../client/delinquency.mjs';
import {countyAdapters} from '../live/county-adapters.mjs';
import {lookup as lookupLegacy,validateInput} from '../live/router.mjs';
import {gapReason,recoveryAction} from './gaps.mjs';
const problem=(code,message,http=400)=>Object.assign(new Error(message),{code,http});
const clone=value=>structuredClone(value);
export const parcelWorkflow='parcel_v3';
export function validateParcelJob(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['county','parcel_id','collector_account_id'].includes(k)))throw problem('invalid_input','Use county, parcel_id and an optional supported collector_account_id.');
 if(!countyAdapters[input.county])throw problem('unsupported_job_county','Parcel jobs support the twenty Phase 1 and Phase 2 counties.',422);
 if(input.collector_account_id!==undefined&&input.county!=='palm-beach-fl')throw problem('invalid_account','Explicit collector accounts are supported only for Palm Beach. Other adapters resolve the official cross-reference.');
 const normalized=validateInput({...input,source_mode:'county',include_pdf:true});
 return {county:normalized.county,parcel_id:normalized.parcel_id,...(normalized.collector_account_id?{collector_account_id:normalized.collector_account_id}:{}),__workflow:parcelWorkflow};
}
export const requestedFields={
 PropertyInformation:{ParcelNumber:null,PropertyAddress:null,OwnerName:null,MailingAddress:null,LegalDescription:null},
 AssessmentInformation:{Year:null,yearStatus:null,LandValue:null,ImprovementValue:null,MarketValue:null,AssessedValue:null,TaxableValue:null,Exemptions:null},
 BuildingInformation:{details:null}, BillDetails:{taxYear:null,folio:null,documentType:null,paidDate:null,paidAmount:null,receiptNumber:null},
 TaxAmounts:{adValorem:null,nonAdValorem:null,totalTax:null,totalDiscountable:null},
 PaymentDetails:{currentBalance:null,paidDate:null,paidAmount:null,interest:null,penalty:null},
 AdValoremMillage:[],NonAdValorem:[],Exemptions:[],AccountHistory:[],
 DelinquencyInformation:{hasActiveDelinquency:null,knownTotalDue:null,delinquentYears:[],annualCoverage:'UNAVAILABLE',certificateCoverage:'UNAVAILABLE',deedCoverage:'UNAVAILABLE',historicalClearance:false},
 TotalMillage:{value:null,units:'mills'},Documents:[]
};
export function parcelRecord(raw,input,requestId){
 const record=clone(requestedFields),provenance={},field_status={},errors=clone(raw.errors||[]),sources=raw.sources||[];
 const evidence=(id,path)=>{const source=sources.find(s=>s.id===id&&s.status==='verified');return source?{source_id:id,url:source.url,retrieved_at:source.fetched_at,sha256:source.sha256,path,method:'deterministic_county_adapter'}:null;};
 function set(section,key,value,id,path){if(value===undefined||value===null)return;record[section][key]=clone(value);const proof=evidence(id,path);if(proof)provenance[section+'.'+key]=proof;}
 const prop=raw.property||{},a=raw.assessment||{};
 for(const [key,source]of Object.entries({ParcelNumber:'parcel_id',PropertyAddress:'address',OwnerName:'owner',MailingAddress:'mailing_address',LegalDescription:'legal_description'}))set('PropertyInformation',key,prop[source],'assessment_county','property.'+source);
 for(const [key,source]of Object.entries({Year:'year',yearStatus:'year_status',LandValue:'land',ImprovementValue:'building',MarketValue:'just_value',AssessedValue:'assessed_total',TaxableValue:'taxable_value',Exemptions:'exemptions'}))set('AssessmentInformation',key,a[source],a.source_id||'assessment_county','assessment.'+source);
 if(a.taxable_value==null&&a.taxable_non_school!=null){set('AssessmentInformation','TaxableValue',a.taxable_non_school,a.source_id||'assessment_county','assessment.taxable_non_school');record.AssessmentInformation.TaxableValueBasis='County / non-school';}
 const taxes=raw.taxes,history=taxes?.history||[];
 if(taxes){record.AccountHistory=clone(history);const id=taxes.summary?.source_id||'tax_collector';if(evidence(id,'taxes.history'))provenance.AccountHistory=evidence(id,'taxes.history');set('PaymentDetails','currentBalance',taxes.summary?.balance_due,id,'taxes.summary.balance_due');}
 for(const doc of raw.documents||[]){
  record.Documents.push({format:doc.format,type:doc.doc_type||'annual_tax_bill',source_url:doc.source_url,sha256:doc.sha256,fields:doc.fields});
  const rich=doc.client_record||doc.tax_details;if(rich){
   for(const section of ['BillDetails','TaxAmounts','PaymentDetails','AdValoremMillage','NonAdValorem','Exemptions'])if(rich[section])record[section]=Array.isArray(rich[section])?clone(rich[section]):{...record[section],...clone(rich[section])};
   if(rich.ParcelDetails?.totalMillageRate!=null){record.TotalMillage.value=rich.ParcelDetails.totalMillageRate;provenance['TotalMillage.value']={...(rich.provenance?.['ParcelDetails.totalMillageRate']||doc.tax_details_provenance?.['ParcelDetails.totalMillageRate']),source_id:doc.source_id,url:doc.source_url,sha256:doc.sha256,method:'derived_decimal_millage_sum'};}
   const proofs=doc.client_record?.provenance||doc.tax_details_provenance||{};
   for(const [path,proof]of Object.entries(proofs))provenance[path]={...proof,url:doc.source_url,sha256:doc.sha256,retrieved_at:sources.find(s=>s.id===doc.source_id)?.fetched_at};
  }
  if(doc.doc_type==='assessment_notice')continue;
  for(const [section,key,name]of [['BillDetails','taxYear','tax_year'],['BillDetails','folio','parcel_id'],['BillDetails','paidAmount','amount_paid'],['BillDetails','paidDate','payment_date'],['BillDetails','receiptNumber','receipt_number'],['TaxAmounts','totalTax','combined_taxes_and_assessments'],['TaxAmounts','adValorem','ad_valorem'],['TaxAmounts','nonAdValorem','non_ad_valorem']]){
   if(record[section][key]!==null&&record[section][key]!==undefined||doc.fields?.[name]==null)continue;
   record[section][key]=doc.fields[name];if(doc.field_provenance?.[name])provenance[section+'.'+key]={...doc.field_provenance[name],source_id:doc.source_id,url:doc.source_url,sha256:doc.sha256};
  }
 }
 if(raw.client_history){record.DelinquencyInformation={...record.DelinquencyInformation,...classifyDelinquency({...raw.client_history,asOf:raw.collected_at,county:input.county}),annualCoverage:raw.client_history.publishedHistoryCoverage,certificateCoverage:'UNAVAILABLE',deedCoverage:'UNAVAILABLE',historicalClearance:false};record.AccountHistory=raw.client_history.history;const id=sources.some(s=>s.id==='tax_collector_browser'&&s.status==='verified')?'tax_collector_browser':'tax_collector';provenance.AccountHistory=evidence(id,'client_history.history');for(const key of ['hasActiveDelinquency','knownTotalDue','delinquentYears','annualCoverage'])if(record.DelinquencyInformation[key]!=null)provenance['DelinquencyInformation.'+key]={...evidence(id,'client_history'),method:'deterministic_liability_classification',coverage:raw.client_history.coverage};}
 for(const key of ['paidAmount','paidDate'])if(record.PaymentDetails[key]==null&&record.BillDetails[key]!=null&&provenance['BillDetails.'+key]){record.PaymentDetails[key]=record.BillDetails[key];provenance['PaymentDetails.'+key]={...provenance['BillDetails.'+key],method:'same_document_payment_field',source_path:'BillDetails.'+key};}
 // Conflicting printed payment facts remain evidence, never an accepted normalized value.
 if(errors.some(e=>e.code==='source_values_disagree'))for(const path of ['BillDetails.paidDate','PaymentDetails.paidDate']){const [section,key]=path.split('.');record[section][key]=null;delete provenance[path];field_status[path]={status:'UNAVAILABLE',reason:'VALIDATION_CONFLICT',action:recoveryAction('VALIDATION_CONFLICT')};}

 const gaps=errors.map(e=>({code:e.code,source_id:e.source_id,reason:gapReason(e.code),action:recoveryAction(gapReason(e.code))}));
 function walk(value,path){
  if(Array.isArray(value)){
   if(!value.length){field_status[path]||={status:'UNAVAILABLE',reason:'LAYOUT_UNSUPPORTED',action:'This source section has not been independently extracted and verified.'};return;}
   value.forEach((v,i)=>walk(v,path+'['+i+']'));
   const children=Object.entries(field_status).filter(([key])=>key.startsWith(path+'['));const verified=children.length&&children.every(([,f])=>f.status==='VERIFIED'||f.reason==='NOT_PUBLISHED');
   field_status[path]=verified?{status:'VERIFIED',evidence:provenance[path]||null}:{status:'PRESENT_UNVERIFIED',reason:'LAYOUT_UNSUPPORTED',action:'Verify every row-level source value.'};return;
  }
  if(value&&typeof value==='object'){for(const [k,v]of Object.entries(value))walk(v,path?path+'.'+k:k);return;}
  const proof=provenance[path]||Object.entries(provenance).filter(([key])=>path.startsWith(key+'[')||path.startsWith(key+'.')).sort(([a],[b])=>b.length-a.length)[0]?.[1];field_status[path]||=proof&&value!=null?{status:'VERIFIED',evidence:proof}:value==null?{status:'UNAVAILABLE',reason:errors.length?gapReason(errors[0].code):'LAYOUT_UNSUPPORTED',action:'Inspect the official source and implement or verify this field; absence from this parser does not prove non-publication.'}:{status:'PRESENT_UNVERIFIED',reason:'LAYOUT_UNSUPPORTED',action:'Verify the source evidence for this value.'};
 }
 walk(record,'');
 for(const [path,proof]of Object.entries(provenance))if(proof?.missing_reason||/not publish|not printed|No explicit|No printed|No readable explicitly labelled/i.test(proof?.reason||''))field_status[path]={status:'UNAVAILABLE',reason:'NOT_PUBLISHED',evidence:proof,action:recoveryAction('NOT_PUBLISHED')};
 if(raw.join?.status!=='matched')gaps.push({code:'collector_identity_unresolved',reason:'IDENTITY_REVIEW',action:recoveryAction('IDENTITY_REVIEW')});
 const missing=Object.entries(field_status).filter(([,f])=>['UNAVAILABLE','PRESENT_UNVERIFIED'].includes(f.status)&&f.reason!=='NOT_PUBLISHED');
 return {schema_version:'3.0',status:errors.length||missing.length?'partial':'succeeded',scrapTaxOrderRequest:record,ExtractionMetadata:{request_id:requestId,collected_at:raw.collected_at,status:errors.length||missing.length?'partial':'complete',sources,errors,provenance,field_status,gaps,match:{status:raw.join?.status==='matched'?'MATCHED':'UNCONFIRMED'}},legacy:raw};
}
export async function parcelLookup(input,fetcher,runtime={},lookup=lookupLegacy){
 const {__workflow,...params}=input;
 runtime.checkpoint?.('resolve_property',{schema_version:'3.0',status:'partial',ExtractionMetadata:{status:'partial',sources:[],errors:[]}});
 const raw=await lookup({...params,source_mode:'county',include_pdf:true},fetcher,{...runtime,richParcelRecord:true,clientAnnualOnly:true});
 const result=parcelRecord(raw,input,runtime.requestId);runtime.checkpoint?.('documents',result);return result;
}
export function explainParcel(result){return {fields:result?.ExtractionMetadata?.field_status||{},gaps:result?.ExtractionMetadata?.gaps||[]};}
