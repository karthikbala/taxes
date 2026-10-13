import {load} from 'cheerio';
import {LookupError} from './engine.mjs';
import {hiddenFields} from './county-office.mjs';
import {parsePhenix} from './phenix.mjs';
import {parseTaxBillPdf} from './pdf-text.mjs';
const host='https://suwannee.floridatax.us';
const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const text=($,e)=>$(e).text().replace(/\s+/g,' ').trim();

// Address/owner only discover bounded candidates. The original collector PDF
// must independently print BOTH the full requested parcel and collector account.
export function suwanneeCandidates(html,owner){
 const $=load(html),count=text($,'#MainContent_lblSearchCount');
 if(/No Records Found/i.test(count))throw new LookupError('collector_not_found','No collector candidates were published.',404);
 const m=count.match(/^Showing records (\d+)-(\d+) of (\d+) records found\.$/);
 const cards=$('div[id^="MainContent_ListView1_PropertyTaxResults_"]');
 if(!m||Number(m[1])!==1||Number(m[2])!==Number(m[3])||Number(m[3])!==cards.length||cards.length>10||$('#MainContent_DataPager1 a').filter((_,a)=>text($,a)==='Next'&&!$(a).hasClass('aspNetDisabled')).length)throw new LookupError('search_incomplete','Collector candidate pagination is incomplete or exceeds the bounded search limit.');
 const matches=[];
 cards.each((_,card)=>{
  const a=$(card).find('h5 a');if(a.length!==1)return;
  const label=text($,a),name=label.replace(/^\d+\s*-\s*/, '');
  if(norm(name)!==norm(owner))return;
  const u=new URL(a.attr('href'),host),account=u.searchParams.get('p'),year=Number(u.searchParams.get('y'));
  if(u.origin!==host||u.pathname!=='/PropertyDetail'||!/^\d{1,20}$/.test(account||'')||!/^20\d{2}$/.test(String(year))||[...u.searchParams.keys()].some(k=>!['p','y','b'].includes(k)))throw new LookupError('collector_identity_mismatch','Collector candidate reference was rejected.');
  if(!matches.some(c=>c.url===u.href))matches.push({url:u.href,account,year});
 });
 if(!matches.length)throw new LookupError('collector_not_found','No candidate matches the assessor legal owner.',404);
 if(matches.length>3)throw new LookupError('search_incomplete','More than three candidates require county clarification.');
 return matches;
}

export async function suwanneeLookup({expectedId,property,get,verify,includePdf}){
 if(norm(property?.parcel_id)!==norm(expectedId)||!property?.owner||!property?.address)throw new LookupError('collector_dependency_failed','Exact native assessor identity, legal owner and site address are required.');
 const house=property.address.match(/^\s*(\d{1,8})\b/)?.[1];
 if(!house)throw new LookupError('collector_dependency_failed','The published site address has no searchable house number.');
 const search=host+'/AccountSearch?s=pt',session=await get(search,'collector_session',{Accept:'text/html'}),form=hiddenFields(session);
 if(!form.has('__VIEWSTATE'))throw new LookupError('collector_session_required','Current collector form state is missing.');
 verify('collector_session','session_initialized');form.set('__EVENTTARGET','ctl00$MainContent$btnSearch');form.set('__EVENTARGUMENT','');form.set('ctl00$MainContent$txtSearchCriteria',house);
 const results=await get(search,'collector_search',{Accept:'text/html','Content-Type':'application/x-www-form-urlencoded',Referer:search,Origin:host},{method:'POST',body:form.toString()});
 const candidates=suwanneeCandidates(results,property.owner);verify('collector_search');
 const matches=[];
 for(const [i,candidate] of candidates.entries()){
  const source='collector_candidate_'+i,html=await get(candidate.url,source,{Accept:'text/html'}),parsed=parsePhenix(html,candidate.account);
  if(parsed.taxes.history[0].year!==candidate.year||norm(parsed.identity.owner)!==norm(property.owner))throw new LookupError('collector_identity_mismatch','Candidate detail differs from the source search owner/year.');
  const fields=hiddenFields(html);fields.set('__EVENTTARGET','ctl00$MainContent$btnPrintBill');fields.set('__EVENTARGUMENT','');
  const pdfSource=source+'_parcel_reference_pdf',bytes=await get(candidate.url,pdfSource,{'Content-Type':'application/x-www-form-urlencoded',Referer:candidate.url,Origin:host},{method:'POST',body:fields.toString(),binary:true});
  let full;
  try{full=await parseTaxBillPdf(bytes,expectedId,candidate.year);}catch(e){if(e.code==='document_identity_mismatch')continue;throw e;}
  await parseTaxBillPdf(bytes,candidate.account,candidate.year);
  if(norm(full.fields.parcel_id)!==norm(expectedId))throw new LookupError('collector_identity_mismatch','Original bill full-parcel reference differs from the requested parcel.');
  verify(source);verify(pdfSource);
  parsed.identity.appraiser_parcel_id=full.fields.parcel_id;
  parsed.identity.match_method='Original collector PDF independently prints full assessor parcel and collector account';
  parsed.identity.parcel_reference={source_id:pdfSource,source_url:candidate.url,...full.field_provenance.parcel_id};
  matches.push({...parsed,original_document:includePdf?{bytes,url:candidate.url,year:candidate.year,source_id:pdfSource,source_method:'POST'}:null});
 }
 if(matches.length!==1)throw new LookupError(matches.length?'ambiguous_collector_account':'collector_not_found','Original collector bills did not establish one unique full-parcel/account mapping.',matches.length?422:404);
 return matches[0];
}
