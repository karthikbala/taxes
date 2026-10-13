const actions={NOT_PUBLISHED:'The inspected source does not publish this field; obtain authoritative county clarification if required.',ACCESS_RESTRICTED:'Restore authorized source access or obtain the record from the county.',SOURCE_OUTAGE:'Retry when the county or provider is available.',IDENTITY_REVIEW:'Confirm the exact property, account, unit and year before continuing.',LAYOUT_UNSUPPORTED:'Review the original source and add a validated layout or OCR rule.',VALIDATION_CONFLICT:'Review conflicting original values; do not select or infer a replacement.',BUDGET_PENDING:'Verify entitlement, reconcile spending and approve the required allowance.'};
export function gapReason(code=''){
 if(/budget|credit|entitlement|staging_capture_limit|managed_access_not_ready|cleanup_pending/.test(code))return 'BUDGET_PENDING';
 if(/identity|owner|ambiguous|address_review|not_found|invalid_input|ocr_review/.test(code))return 'IDENTITY_REVIEW';
 if(/pdf_license_pending/.test(code))return 'BUDGET_PENDING';
 if(/disagree|reconcil|integrity|corrupt/.test(code))return 'VALIDATION_CONFLICT';
 if(/blocked|restricted|credential|not_configured|browser_unavailable/.test(code))return 'ACCESS_RESTRICTED';
 if(/timeout|network|deadline|cancel|unavailable|rate_limit|circuit_open/.test(code))return 'SOURCE_OUTAGE';
 return 'LAYOUT_UNSUPPORTED';
}
export const recoveryAction=reason=>actions[reason]||actions.LAYOUT_UNSUPPORTED;
export function explainResult(result){
 const meta=result?.ExtractionMetadata||{},record=result?.scrapTaxOrderRequest||{},errors=meta.errors||[];
 const collectorBlock=errors.find(e=>e.source_id==='tax_collector'&&['ACCESS_RESTRICTED','SOURCE_OUTAGE','BUDGET_PENDING'].includes(gapReason(e.code)));
 const reasonFor=e=>collectorBlock&&['document_dependency_failed','annual_bill_unavailable','collector_identity_unresolved'].includes(e.code)?gapReason(collectorBlock.code):gapReason(e.code);
 const gaps=errors.map(e=>({source_id:e.source_id,code:e.code,reason:reasonFor(e),action:recoveryAction(reasonFor(e))}));
 const fields={};
 function walk(value,path){
  if(value===null){
   const section=path.split('.')[0],proof=meta.provenance?.[path]||meta.field_provenance?.[path],status=meta.section_status?.[section];
   const note=typeof status==='object'?status.note||'':'';
   const inspected=proof&&(/inspected/.test(proof.method||'')||/No explicit|not publish|No printed|No readable/i.test(proof.reason||'')||proof.missing_reason==='SOURCE_UNAVAILABLE_SENTINEL');
   const matching=errors.find(e=>/bill|pdf|collector|annual/.test(e.source_id||'')&&/Tax|Bill|Payment|Valorem|Exemptions|Delinquency|AccountHistory/.test(section))||errors.find(e=>/assessment|resolution/.test(e.source_id||'')&&/Property|Assessment|Land|Sales|Benefits/.test(section));
   const reason=inspected?'NOT_PUBLISHED':matching?reasonFor(matching):/not explicitly published|does not publish|not published|not printed|source.*blank/i.test(note)?'NOT_PUBLISHED':'LAYOUT_UNSUPPORTED';
   fields[path]={status:'UNAVAILABLE',reason,action:recoveryAction(reason),...(proof?{evidence:proof}:{})};return;
  }
  if(Array.isArray(value)){value.forEach((v,i)=>walk(v,`${path}[${i}]`));if(!value.length){const status=meta.section_status?.[path]??meta.section_status?.[path.split('.')[0]],s=typeof status==='string'?status:status?.status,note=typeof status==='object'?status.note||'':'',reason=/not explicitly published|does not publish|not published|not printed|source.*blank/i.test(note)?'NOT_PUBLISHED':collectorBlock&&/^(?:DelinquencyInformation|AccountHistory|AdValorem|NonAdValorem|Exemptions|PublishedTaxHistory)/.test(path)?gapReason(collectorBlock.code):'LAYOUT_UNSUPPORTED';fields[path]={status:s==='EMPTY'||s==='INSPECTED_EMPTY'?'INSPECTED_EMPTY':'UNAVAILABLE',...(s==='EMPTY'||s==='INSPECTED_EMPTY'?{}:{reason,action:recoveryAction(reason)})};}return;}
  if(value&&typeof value==='object'){for(const [key,v]of Object.entries(value))walk(v,path?path+'.'+key:key);return;}
  const evidence=meta.provenance?.[path]||meta.field_provenance?.[path]||meta.provenance?.[path.split('.')[0]]||meta.field_provenance?.[path.split('.')[0]]||null;
  fields[path]={status:evidence?'VERIFIED':'PRESENT_UNVERIFIED',evidence,...(evidence?{}:{reason:'LAYOUT_UNSUPPORTED',action:'The value has no field or section evidence pointer; review source provenance before relying on it.'})};
 }
 for(const [key,value]of Object.entries(record))if(!['orderId','county','countyName','state','status','transactionType','matchStatus','warnings'].includes(key))walk(value,key);
 const match=meta.match?.status||record.matchStatus;
 if(match&&match!=='MATCHED'&&!(match==='SEARCH_INCOMPLETE'&&errors.some(e=>isTransient(e.code)||['ACCESS_RESTRICTED','BUDGET_PENDING'].includes(gapReason(e.code))))){const reason='IDENTITY_REVIEW';gaps.push({code:match.toLowerCase(),reason,action:recoveryAction(reason)});}
 return {gaps,fields};
}
export const isTransient=code=>/source_timeout_or_network_error|source_unavailable|source_timeout|lookup_deadline|managed_browser_rate_limited|source_rate_limited|circuit_open|managed_document_incomplete/.test(code||'');
