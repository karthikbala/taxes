import {load} from 'cheerio';
import {miamiDeedUrl,normalizeMiamiDeedFolio,summarizeDeedCapture} from './miami-deed-probe.mjs';

const otherFilters=['filterPartyName','filterCaseNumber','filterAppNumber','filterCertNumber','filterPropAddress','filterSaleDateStart','filterSaleDateStop'];
const empty=v=>v===null||v===undefined||v==='';

// Empty results establish only the scope of this public case index, never title
// clearance or the completeness of the collector's certificate history.
export function parseMiamiDeedSearch(capture,folio){
 const expected=normalizeMiamiDeedFolio(folio),summary=summarizeDeedCapture(capture),$=load(capture.html);
 const result={status:'SEARCH_INCOMPLETE',source_url:miamiDeedUrl,requested_folio:expected,query_verified:false,cases:[],case_count:null,coverage:'UNAVAILABLE',scope:'MIAMI_CLERK_PUBLIC_TAX_DEED_CASE_INDEX',historicalClearanceEstablished:false,note:'No verified complete Clerk case search is available.'};
 if(['BLOCKED','LOGIN_REQUIRED','FAILED'].includes(summary.status))return {...result,status:summary.status,note:summary.note};
 const submitted=capture.search_submission;
 const responseFilters=$('#caseFiltersForm');
 const exactResponse=responseFilters.length===1&&responseFilters.find('#filterParcelNumber').attr('data-original')===expected&&responseFilters.find('#filterParcelNumber').attr('value')===expected;
 const unrestricted=responseFilters.find('#filterCaseStatus').length===1&&empty(responseFilters.find('#filterCaseStatus').val())&&otherFilters.every(id=>responseFilters.find('#'+id).length===1&&empty(responseFilters.find('#'+id).val()));
 const exactSubmission=submitted?.http_status===200&&submitted.parcel===expected&&empty(submitted.status)&&Array.isArray(submitted.other_filters)&&submitted.other_filters.length===otherFilters.length&&submitted.other_filters.every(empty)&&empty(submitted.page);
 if(!capture.search_applied||capture.search_error||!exactResponse||!unrestricted||!exactSubmission)return result;
 result.query_verified=true;
 $('.modal,script,style,[hidden],[aria-hidden="true"],[style*="display:none"],[style*="display: none"]').remove();
 const emptyBoxes=$('.site-content .container > .content-box').filter((_,el)=>/^NO CASES FOUND Your search criteria returned no results\./.test($(el).text().replace(/\s+/g,' ').trim()));
 const pagination=$('[class*="pagination"],.dataTables_paginate,[class*="pager"]');
 // An unexpected result list or pager invalidates a negative conclusion. Rows
 // remain unverified until their source layout and bounded paging are supported.
 if(emptyBoxes.length===1&&!$('table tbody tr,a[href*="/cases/View"],a[href*="/cases/view"]').length&&!pagination.length){
  return {...result,status:'INSPECTED_EMPTY',case_count:0,coverage:'COMPLETE_PUBLIC_QUERY',note:'The Clerk public case index returned no cases for this exact folio with no status, party, certificate or sale-date restriction. This index does not establish full certificate history, missing annual years or historical clearance.'};
 }
 return {...result,note:'The exact-folio query completed, but returned records or pagination require further verified case extraction; no negative clearance conclusion is made.'};
}

export function historicalCoverage(delinquency,search,published){
 return {publishedAnnualRows:published??delinquency.coverage,unavailableYears:delinquency.unavailableYears,certificateEvidence:'VISIBLE_ACCOUNT_HISTORY_EVENTS_ONLY',independentCertificateSearch:'NOT_IMPLEMENTED',taxDeedEvidence:search?.query_verified?'CLERK_PUBLIC_CASE_INDEX_AND_ACCOUNT_HISTORY':'VISIBLE_ACCOUNT_HISTORY_EVENTS_ONLY',independentTaxDeedSearch:search?.status??'NOT_RUN',historicalClearanceEstablished:false,note:'Full historical clearance requires complete annual, certificate and deed coverage. A paid account or an empty public deed query alone is insufficient.'};
}

export async function searchMiamiDeeds({folio,get,managedBrowser,deadline,signal}){
 let capture;
 try{capture={html:await get(miamiDeedUrl,'miami_tax_deed'),url:miamiDeedUrl,http_status:200};}
 catch(e){
  if(!managedBrowser||e.code!=='source_blocked')return {status:e.code==='source_blocked'?'BLOCKED':'FAILED',source_url:miamiDeedUrl,requested_folio:normalizeMiamiDeedFolio(folio),query_verified:false,cases:[],case_count:null,coverage:'UNAVAILABLE',scope:'MIAMI_CLERK_PUBLIC_TAX_DEED_CASE_INDEX',historicalClearanceEstablished:false,note:'The independent Clerk search could not retrieve a verified result.'};
 }
 // Direct GET is discovery only; it cannot establish a submitted parcel search.
 if(managedBrowser)capture=await managedBrowser({url:miamiDeedUrl,county:'miami-dade-fl',includePdf:false,profile:'miami-deed-discovery',folio,deadline,signal});
 return {result:parseMiamiDeedSearch(capture,folio),capture};
}
