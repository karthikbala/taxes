import {load} from 'cheerio';
import {LookupError} from './engine.mjs';
const compact=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9*]/g,'');
const money=v=>{let s=String(v??'').trim().replace(/[$,\s]/g,'');if(/^\(.*\)$/.test(s))s='-'+s.slice(1,-1);return /^-?\d+(\.\d+)?$/.test(s)?s:null;};
const text=($,selector)=>$(selector).first().text().replace(/\s+/g,' ').trim();
export function parsePublicConfig(data,expectedClient){
 const value=suffix=>{const key=Object.keys(data).find(k=>k.endsWith(suffix));return key?data[key]:undefined;};
 const client=value('/taxsys/taxsysClientId/value');
 if(client!==expectedClient||! /^[a-z-]+$/.test(client))throw new LookupError('collector_config_mismatch','Collector configuration does not identify the expected county.');
 const list=value('/payableSources/payableSources/value');const property=list?.find(p=>p.value?.pageRoute?.value==='property-tax'&&p.value?.sourceType?.value==='index-search')?.value;
 const search=property?.searchApi?.value;if(search?.enableAlgolia?.value!==true)throw new LookupError('collector_search_not_enabled','Public property search configuration is unavailable.');
 const app=search.prodAlgoliaAppId?.value,key=search.prodAlgoliaApiKey?.value,index=search.prodIndex?.value;
 if(!/^[A-Z0-9]{6,20}$/.test(app||'')||typeof key!=='string'||!key||key.length>8192||index!=='fl-'+expectedClient+'.property_tax')throw new LookupError('collector_config_mismatch','Public search configuration was not accepted.');
 return {client,app,key,index};
}
export function resolveTaxsys(data,expectedId,client){
 const results=data.results?.[0];if(!Array.isArray(results?.hits))throw new LookupError('collector_search_layout_changed','Collector search returned no hits array.');
 const aliases=h=>[h.external_id,...(h.custom_parameters?.alternate_keys||[]).map(a=>a.external_id),...(h.child_groups||[]).flatMap(g=>(g.children||[]).flatMap(c=>[c.external_id,...(c.external_id_tokens||[])]))];const matches=results.hits.filter(h=>aliases(h).some(v=>compact(v)===compact(expectedId)));if(!matches.length)throw new LookupError('collector_not_found','Collector search has no exact account or parcel match.',404);
 if(matches.length!==1||Number(results.nbHits)>results.hits.length)throw new LookupError('ambiguous_collector_account','Collector search did not return a complete unique exact match.');
 const hit=matches[0],prefix='/Taxsys-GovHub/v0/items/';const id=String(hit.objectID||'');
 if(!id.startsWith(prefix+client+':real_estate:parents:')||!new RegExp('^'+prefix+client+':real_estate:parents:[a-f0-9-]{36}$','i').test(id))throw new LookupError('collector_identity_mismatch','Collector parent record belongs to an unexpected county or account type.');
 return {external_id:hit.external_id,token:btoa(id.slice(prefix.length)),public_path:hit.public_path||null,search_alias:expectedId,alias_match:compact(hit.external_id)===compact(expectedId)?'external_id':'county_search_alias'};
}
export function taxsysUrls(route,client,token){
 if(!/^[a-z-]+$/.test(route)||! /^[a-z-]+$/.test(client)||! /^[A-Za-z0-9+/=]+$/.test(token))throw new LookupError('collector_config_mismatch','Collector route was rejected.');
 const publicUrl='https://county-taxes.net/'+route+'/property-tax/'+encodeURIComponent(token);
 const iframe='https://county-taxes.net/iframe-taxsys/'+client+'.county-taxes.com/govhub/property-tax/'+encodeURIComponent(token);
 return {publicUrl,iframe};
}
function rejectChallenge(html){const $=load(html);$('script,style').remove();const body=$.text();if(/just a moment|verify you are human|sorry, you have been blocked|access denied/i.test(body))throw new LookupError('source_blocked','Collector returned an access challenge.');return $;}
export function parseTaxsysIdentity(html,expected){const $=rejectChallenge(html);const heading=text($,'h1');const id=heading.match(/Account\s*#\s*([A-Za-z0-9 ._/-]+)/i)?.[1]?.trim();if(!id)throw new LookupError('collector_identity_missing','Required collector account identity is missing.');if(compact(id)!==compact(expected))throw new LookupError('collector_identity_mismatch','Collector returned a different parcel or account.');let address=null;$('.label').each((_,label)=>{if(['Situs:','Property:'].includes($(label).text().trim()))address=$(label).next('.value').text().trim()||$(label).parent().find('.value').first().text().trim()||null;});const aliases=[];$('a[href]').each((_,a)=>{try{const u=new URL($(a).attr('href'));if(u.origin==='https://search.property-appraiser.org'&&u.pathname==='/Search/MainSearch'&&/^\d{18}$/.test(u.searchParams.get('pin')||''))aliases.push(u.searchParams.get('pin'));}catch{}});return {parcel_id:id,...(aliases.length===1?{appraiser_parcel_id:aliases[0]}:{}),owner:text($,'.owner')||null,address};}
export function parseTaxsysHistory(amountHtml,historyHtml){const $=rejectChallenge(historyHtml),a=rejectChallenge(amountHtml);let due=null;
 const scope=$('#bill-history').length?$('#bill-history'):$('body');
 scope.find('tfoot tr').each((_,tr)=>{if(/Total amount due/i.test($(tr).text())){const cell=$(tr).find('td.balance');due=money(cell.find('.value').length?cell.find('.value').first().text():cell.text().replace(/^\s*Total amount due\s*:?\s*/i,''));}});if(due===null)throw new LookupError('collector_balance_missing','Source-reported total amount due is missing.');
 const history=[];scope.find('tbody tr.regular').each((_,tr)=>{const row=$(tr),description=row.find('th.description').first(),title=description.find('a').first().text().trim();const year=title.match(/\b(20\d{2})\b/)?.[1];if(!year)return;const raw=row.find('td.status .label').first().text().trim()||null;const value=money(row.find('td.status span[translate="no"]').first().text());const date=row.find('td.as-of time').first().text().trim()||null;const receipt=row.find('td.message').text().replace(/\s+/g,' ').trim().replace(/^Receipt\s*#?\s*/i,'')||null;
 history.push({year:Number(year),bill_kind:title.replace(/^20\d{2}\s*/,''),status_raw:raw,balance_due:money(row.find('td.balance').text()),status_amount:value,paid_amount:/^Paid$/i.test(raw||'')?value:null,payment_date:/^Paid$/i.test(raw||'')?date:null,receipt_number:/^Paid$/i.test(raw||'')?receipt:null,bill_url:description.find('a').first().attr('href')||null,pdf_url:row.find('a[href*="/print"]').first().attr('href')||null,source_id:'tax_collector'});});
 if(!history.length&&!/no bills|no records/i.test($.text()))throw new LookupError('collector_history_missing','Required collector bill rows are missing.');
 const refunds=[];$('tbody tr.refund').each((_,tr)=>{const row=$(tr);refunds.push({kind:'refund',check_number:row.find('th.description span[translate="no"]').first().text().trim()||null,status_raw:row.find('td.status .label').first().text().trim()||null,amount:money(row.find('td.status span[translate="no"]').first().text()),date:row.find('td.as-of').text().trim()||null,source_id:'tax_collector'});});const status=a('.bills .paid .label').first().text().trim()||null;
 return {summary:{balance_due:due,balance_label:'Collector Total amount due',status_raw:status,source_id:'tax_collector'},history,refunds};
}
export async function taxsysLookup({configSlug,client,route,expectedId,get,verify}){
 const config=parsePublicConfig(JSON.parse(await get('https://config.grantstreet.com/api/v1/payhub/data-pub/settings/'+configSlug+'/'+configSlug,'collector_config')),client);verify('collector_config');
 const search=JSON.parse(await get('https://'+config.app.toLowerCase()+'-dsn.algolia.net/1/indexes/*/queries','collector_search',{'Content-Type':'application/json','x-algolia-application-id':config.app,'x-algolia-api-key':config.key},{method:'POST',body:JSON.stringify({requests:[{indexName:config.index,params:new URLSearchParams({query:expectedId,hitsPerPage:'20'}).toString()}]})}));
 const account=resolveTaxsys(search,expectedId,client);verify('collector_search');const urls=taxsysUrls(route,client,account.token);
 let html,amount,history;try{html=await get(urls.iframe,'collector_identity');const identity=parseTaxsysIdentity(html,account.external_id);identity.search_alias=expectedId;identity.alias_match=account.alias_match;verify('collector_identity');
 amount=await get(urls.iframe+'/load-amount-due','collector_amount');history=await get(urls.iframe+'/load-bill-history','tax_collector');const taxes=parseTaxsysHistory(amount,history);verify('collector_amount');verify('tax_collector');
 return {identity,taxes,iframe_root:urls.iframe,public_url:urls.publicUrl};}catch(e){e.collector_context={...urls,expected_external_id:account.external_id,search_alias:expectedId,alias_match:account.alias_match};throw e;}
}
