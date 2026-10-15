import {load} from 'cheerio';
import {mailingSiteReferences} from './mailing-reference.mjs';
import {extractPdf} from '../reliability/pdf-extract.mjs';
import {parseInWorker,isMainThread} from '../reliability/pdf-pool.mjs';
import {LookupError} from '../live/engine.mjs';
import {normalizeMiamiAddress, addressMatches, ownerMatchesMiami, normalizeMiamiOwner} from './miami.mjs';

export const bradfordEndpoint = 'https://www.bradfordappraiser.com';
const sourceId = 'bradford_assessment';
const clean = value => String(value ?? '').replace(/\s+/g,' ').trim();
const parcel = value => clean(value).toUpperCase().replace(/[^A-Z0-9]/g,'');
const nullable = value => clean(value) || null;
const address = (value,unit) => normalizeMiamiAddress(clean(value).replace(/\bHIGHWAY\b/gi,'HWY').replace(/(?:,?\s+)(?:KEYSTONE HEIGHTS|MELROSE|STARKE|LAWTEY|BROOKER|HAMPTON)(?:\s+FL(?:ORIDA)?)?(?:\s+\d{5}(?:-\d{4})?)?$/i,''),unit);
const sameAddress = (input,value) => {const a=address(input.address,input.unit),b=address(value);return addressMatches(a,b);};
const textHtml = raw => typeof raw==='string'?raw:raw?.detail;

// Full native record search publishes both a record count and page count. The
// quick-search iframe publishes neither, and is deliberately never sufficient.
export function readBradfordSearch(html) {
  const $=load(String(html??''));
  const countValues=$('input[name="iRecordCount"]').map((_,e)=>$(e).attr('value')).get();
  const pageValues=$('input[name="iTotalPage"]').map((_,e)=>$(e).attr('value')).get();
  const consistent=values=>values.length>0&&values.every(v=>/^-?\d+$/.test(v)&&v===values[0]);
  const base={status:'SEARCH_INCOMPLETE',rows:[],notes:[]};
  if(!consistent(countValues)||!consistent(pageValues))return {...base,notes:['Native result counts/pages are absent or inconsistent; uniqueness is unverified.']};
  const count=Number(countValues[0]),pages=Number(pageValues[0]);
  const sourceRows=$('table.resultstable tr').filter((_,e)=>$(e).children('td').eq(1).is('[onclick]'));
  if(count===-1&&pages===0&&sourceRows.length===0&&/No Matching Records Found/i.test($.text()))return {status:'NOT_FOUND',rows:[],notes:['Native county search explicitly reports no matching records.']};
  if(count<0||pages!==1||sourceRows.length!==count||!new RegExp('\\('+count+' Total\\)').test($.text())||!$('select[name="DisplayPage"] option:selected').toArray().some(e=>clean($(e).text())==='Page: 1 of 1'))return {...base,notes:['Native search is paginated, truncated or has an unverified total; no parcel selected.']};
  const rows=sourceRows.map((_,e)=>{const c=$(e).children('td');return {parcel_id:clean(c.eq(1).text()),address:clean(c.eq(3).text()),owners:c.eq(2).find('b').map((_,b)=>clean($(b).text())).get().filter(Boolean)};}).get();
  if(rows.some(row=>!/^\d{5}-[A-Z0-9]-\d{5}$/.test(row.parcel_id)))return {...base,notes:['A native search row has an invalid displayed parcel ID.']};
  return {status:'COMPLETE',rows,notes:[]};
}
export function matchBradfordCandidates(input,html) {
  const wanted=address(input.address,input.unit),base={status:'SEARCH_INCOMPLETE',candidates:[],notes:[]};
  if(wanted.conflict)return {...base,notes:['Address unit conflicts with the supplied unit.']};
  const result=readBradfordSearch(html);if(result.status!=='COMPLETE')return {...base,status:result.status,notes:result.notes};
  const rows=result.rows.map(row=>({...row,source_id:'bradford_address_search'}));
  const candidates=rows.filter(row=>sameAddress(input,row.address));
  if(candidates.some(row=>!/^\d{5}-[A-Z0-9]-\d{5}$/.test(row.parcel_id)))return {...base,candidates,notes:['An exact address candidate has an invalid displayed parcel ID.']};
  let ids=[...new Set(candidates.map(row=>row.parcel_id))];
  if(!ids.length)return {status:'NOT_FOUND',candidates,notes:['Complete native search contains no exact street/unit match.']};
  if(ids.length>1)ids=[...new Set(candidates.filter(row=>ownerMatchesMiami(input.ownerName,row.owners)).map(row=>row.parcel_id))];
  if(ids.length!==1)return {status:'AMBIGUOUS',candidates,notes:['Multiple exact street/unit parcels remain after reported-owner comparison.']};
  return {status:'MATCHED',parcel_id:ids[0],candidates,notes:[]};
}
function identity(html,id) {
  const $=load(String(html??'')),pin=clean($('.gisDetails_PIN').text()),shown=pin.match(/^(\d{5}-[A-Z0-9]-\d{5})\s*\(/)?.[1];
  if(!/^\d{5}[A-Z0-9]\d{5}$/.test(parcel(id))||!shown||parcel(shown)!==parcel(id))throw new LookupError('identity_mismatch','Bradford detail parcel does not match the resolved parcel.');
  return {$,shown,pin};
}
function ownerInfo($) {
  const rows=$('#gisDetails_OwnerContent tr');
  const site=rows.toArray().find(e=>/^Site:/.test(clean($(e).text())));
  const ownerRow=rows.eq(1);
  return {owners:ownerRow.find('b').map((_,e)=>clean($(e).text())).get().filter(Boolean),site:site?clean($(site).text()).replace(/^Site:\s*/,''):null,mailing_street:clean(load(rows.eq(2).find('td').html()?.split(/<br\s*\/?\s*>/i)[0]||'').text()),mailing:rows.eq(2).find('td').html()?nullable(rows.eq(2).find('td').html().replace(/<br\s*\/?\s*>/gi,'; ').replace(/<[^>]*>/g,'')):null};
}
export async function captureCard(bytes,expected) {
  if(isMainThread)return parseInWorker('bradford_card',bytes,expected,null);
  const data=await extractPdf(bytes),items=data.items.map(row=>({text:clean(row.str),page:row.page,x:row.x,y:row.y}));
  if(!items.some(item=>parcel(item.text)===parcel(expected)&&/^\d{5}-[A-Z0-9]-\d{5}$/.test(item.text)))throw new LookupError('identity_mismatch','Bradford property record card does not echo the selected parcel.');
  return {page_count:data.totalPages,items,text:items.map(item=>item.text).join('\n')};
}
// Search-prefix hits are discovery only. Detail records must independently echo
// the parcel, owner and mailing street before a candidate can be selected.
async function mailingAddressReview(input,get,original) {
 const prefix=normalizeMiamiOwner(input.ownerName).split(/\s+/).slice(0,2).join(' ');
 if(!prefix||prefix.length>45)return original;
 try{
  const form=new URLSearchParams({button_RecordSearch:'1',StreetName:'',OwnerName:prefix,PIN:'',clientWidth:'1280',clientHeight:'800',backCheck:'1'});
  const html=await get(bradfordEndpoint+'/gis/recordSearch_2_Results/','bradford_owner_reference_search',{'Content-Type':'application/x-www-form-urlencoded'},{method:'POST',body:form.toString()});
  const found=readBradfordSearch(html);
  if(found.status!=='COMPLETE'||found.rows.length>5||found.rows.some(row=>!row.owners.length))return {...original,owner_reference_candidates:found.rows,owner_reference_status:found.status==='COMPLETE'?'SEARCH_INCOMPLETE':found.status};
  const candidates=[];
  for(const row of found.rows){
   if(!row.owners.some(o=>ownerMatchesMiami(input.ownerName,[o])||normalizeMiamiOwner(o)===prefix||normalizeMiamiOwner(o).startsWith(prefix+' ')))continue;
   const source_id='bradford_owner_reference_'+parcel(row.parcel_id);
   const detail=await get(bradfordEndpoint+'/gis/gisSideMenu_3_Details/showDetails/',source_id,{'Content-Type':'application/x-www-form-urlencoded'},{method:'POST',body:new URLSearchParams({tempPIN:parcel(row.parcel_id),save:'',Show_Rec:'',zoomPIN:'1'}).toString()});
   const {$}=identity(detail,row.parcel_id),info=ownerInfo($);
   if(!row.owners.some(o=>ownerMatchesMiami(o,info.owners)))throw new LookupError('identity_mismatch','Owner-reference detail differs from the source search owner.');
   if(addressMatches(address(input.address,input.unit),address(info.mailing_street)))candidates.push({parcel_id:row.parcel_id,address:info.site,mailing_address:info.mailing,owners:info.owners,owner_matches_requested:ownerMatchesMiami(input.ownerName,info.owners),address_match_type:'mailing_only',verified_address_match:true,source_id});
  }
  if(!candidates.length)return {...original,owner_reference_candidates:found.rows,owner_reference_status:'COMPLETE'};
  return {status:'ADDRESS_REVIEW_REQUIRED',input_address_type:'mailing',candidates,owner_reference_candidates:found.rows,owner_reference_status:'COMPLETE',...(['mailing','auto'].includes(input.addressType)?{}:await mailingSiteReferences(input,candidates,get)),source_id:'bradford_owner_reference_search',notes:['The supplied address is published as an owner mailing address, not the Bradford property site. Confirm a parcel before retrieving its assessment or tax records. No parcel has been selected automatically.']};
 }catch(e){return {...original,owner_reference_status:'UNAVAILABLE',owner_reference_error:{code:e.code||'source_error',message:e.message}};}
}
async function detectBradfordAddress(input,get) {
 const form=new URLSearchParams({button_RecordSearch:'1',StreetName:address(input.address,input.unit).street,OwnerName:'',PIN:'',clientWidth:'1280',clientHeight:'800',backCheck:'1'});
 const search=await get(bradfordEndpoint+'/gis/recordSearch_2_Results/','bradford_address_search',{'Content-Type':'application/x-www-form-urlencoded'},{method:'POST',body:form.toString()});
 const site=matchBradfordCandidates(input,search),base={...site,requested_address_type:'auto'};
 if(site.status==='SEARCH_INCOMPLETE')return base;
 const siteCandidates=site.candidates.map(row=>({...row,address_match_type:'site',owner_matches_requested:ownerMatchesMiami(input.ownerName,row.owners)}));
 if(siteCandidates.length>5||siteCandidates.some(row=>!row.owners.length))return {...base,status:'SEARCH_INCOMPLETE',parcel_id:undefined,candidates:siteCandidates,notes:['The complete site search cannot be independently checked within the bounded candidate limit.']};
 const verified=[];
 for(const row of siteCandidates.filter(row=>row.owner_matches_requested)){
  const source_id='bradford_site_reference_'+parcel(row.parcel_id);
  const detail=await get(bradfordEndpoint+'/gis/gisSideMenu_3_Details/showDetails/',source_id,{'Content-Type':'application/x-www-form-urlencoded'},{method:'POST',body:new URLSearchParams({tempPIN:parcel(row.parcel_id),save:'',Show_Rec:'',zoomPIN:'1'}).toString()});
  const {$}=identity(detail,row.parcel_id),info=ownerInfo($);
  if(!sameAddress(input,info.site)||!ownerMatchesMiami(input.ownerName,info.owners))throw new LookupError('identity_mismatch','Bradford site detail differs from its exact owner/address search candidate.');
  verified.push({...row,address:info.site,mailing_address:info.mailing,owners:info.owners,verified_address_match:true,source_id});
 }
 // Both roles must be complete: a site and a mailing address can identify
 // different parcels belonging to the same owner. Never choose by priority.
 const review=await mailingAddressReview({...input,addressType:'auto'},get,{status:'NOT_FOUND',candidates:[],notes:[]});
 const candidates=[...siteCandidates.map(row=>verified.find(v=>v.parcel_id===row.parcel_id)||row),...review.candidates];
 const evidence={requested_address_type:'auto',candidates,owner_reference_status:review.owner_reference_status,owner_reference_candidates:review.owner_reference_candidates||[],...(review.owner_reference_error?{owner_reference_error:review.owner_reference_error}:{})};
 if(!['COMPLETE','NOT_FOUND'].includes(review.owner_reference_status))return {...evidence,status:'SEARCH_INCOMPLETE',notes:['Both site and mailing searches must be complete before automatic selection.',...(review.owner_reference_error?[review.owner_reference_error.code+': '+review.owner_reference_error.message]:[])]};
 const compatible=[...verified,...review.candidates.filter(row=>row.owner_matches_requested)],ids=[...new Set(compatible.map(row=>row.parcel_id))];
 if(ids.length!==1)return {...evidence,status:ids.length>1?'AMBIGUOUS':candidates.length?'OWNER_MISMATCH':'NOT_FOUND',notes:[ids.length>1?'The supplied owner and address identify multiple Bradford parcels across the site/mailing searches. Confirm the intended parcel.':'No unique parcel has both the requested owner and a verified site or mailing address.']};
 // Native owner discovery uses a textual prefix. An order-insensitive owner
 // match cannot make a differently ordered prefix exhaustive; fail closed.
 const queriedPrefix=normalizeMiamiOwner(input.ownerName).split(/\s+/).slice(0,2).join(' ');
 if(compatible.some(row=>row.owners.some(owner=>ownerMatchesMiami(input.ownerName,[owner])&&normalizeMiamiOwner(owner).split(/\s+/).slice(0,2).join(' ')!==queriedPrefix)))return {...evidence,status:'SEARCH_INCOMPLETE',owner_query_status:review.owner_reference_status,owner_reference_status:'SEARCH_INCOMPLETE',notes:['The county publishes an equivalent owner in a different name order. Owner-prefix search coverage is unverified; use the county-published owner name or confirm a parcel.']};
 const matches=compatible.filter(row=>row.parcel_id===ids[0]),types=[...new Set(matches.map(row=>row.address_match_type==='site'?'site':'mailing'))];
 return {...evidence,status:'MATCHED',parcel_id:ids[0],input_address_type:types.includes('site')?'site':'mailing',matched_address_types:types,match_method:'county_verified_owner_and_detected_address',search,notes:['Address meaning was detected from complete Bradford site and mailing searches with one independently verified owner/parcel. The actual property site and mailing address remain separate.']};
}
export async function resolveBradford(input,get) {
  const wanted=address(input.address,input.unit);
  if(wanted.conflict)return {status:'SEARCH_INCOMPLETE',candidates:[],notes:['Address unit conflicts with the supplied unit.']};
  let search=null,match;
  if((input.addressType||'auto')==='auto'){
   match=await detectBradfordAddress(input,get);if(!match.parcel_id)return match;search=match.search;delete match.search;
  }else if(input.addressType==='mailing'){
   const review=await mailingAddressReview(input,get,{status:'NOT_FOUND',candidates:[],notes:[]});
   if(review.owner_reference_status==='SEARCH_INCOMPLETE')return {...review,status:'SEARCH_INCOMPLETE'};
   if(review.owner_reference_status==='UNAVAILABLE')throw new LookupError(review.owner_reference_error?.code||'source_unavailable',review.owner_reference_error?.message||'Owner mailing search is unavailable.');
   const exact=(review.candidates||[]).filter(c=>c.owner_matches_requested);
   if(exact.length!==1)return {...review,status:exact.length>1?'AMBIGUOUS':review.status,notes:[...(review.notes||[]),'Mailing mode requires one exact county owner and mailing-address parcel; no property was selected.']};
   match={status:'MATCHED',parcel_id:exact[0].parcel_id,candidates:review.candidates,input_address_type:'mailing',match_method:'county_exact_owner_and_mailing_address',notes:['Resolved using the explicitly requested owner mailing-address mode. The returned property site is the separate county-published site; the mailing address has not been relabelled as a site.']};
  }else{
   const form=new URLSearchParams({button_RecordSearch:'1',StreetName:wanted.street,OwnerName:'',PIN:'',clientWidth:'1280',clientHeight:'800',backCheck:'1'});
   search=await get(bradfordEndpoint+'/gis/recordSearch_2_Results/','bradford_address_search',{'Content-Type':'application/x-www-form-urlencoded'},{method:'POST',body:form.toString()});
   match=matchBradfordCandidates(input,search);if(!match.parcel_id)return match.status==='NOT_FOUND'?mailingAddressReview(input,get,match):match;
  }
  const detail=await get(bradfordEndpoint+'/gis/gisSideMenu_3_Details/showDetails/',sourceId,{'Content-Type':'application/x-www-form-urlencoded'},{method:'POST',body:new URLSearchParams({tempPIN:parcel(match.parcel_id),save:'',Show_Rec:'',zoomPIN:'1'}).toString()});
  const {$}=identity(detail,match.parcel_id),info=ownerInfo($);
  const matchedType=match.input_address_type||'site';
  if(matchedType==='mailing'?!addressMatches(address(input.address,input.unit),address(info.mailing_street))||!ownerMatchesMiami(input.ownerName,info.owners):!sameAddress(input,info.site))throw new LookupError('identity_mismatch','Bradford detail differs from the requested address meaning or exact owner.');
  if(match.requested_address_type==='auto'&&(!ownerMatchesMiami(input.ownerName,info.owners)||match.matched_address_types.some(type=>type==='site'?!sameAddress(input,info.site):!sameAddress(input,info.mailing_street))))throw new LookupError('identity_mismatch','Bradford owner or detected address changed after automatic candidate verification.');
  const status=!info.owners.length?'OWNER_UNAVAILABLE':ownerMatchesMiami(input.ownerName,info.owners)?'MATCHED':'OWNER_MISMATCH';
  const notes=[...match.notes];if(status!=='MATCHED')notes.push(status==='OWNER_MISMATCH'?'Resolved parcel ownership differs from the requested owner.':'County detail ownership is unavailable.');
  const raw={detail,search,card:null,card_error:null};
  const cardUrl=String(detail).match(/window.open\("(https:\/\/www\.bradfordappraiser\.com\/gis\/linkPropCard\/\?[^"\s]+)"/)?.[1];
  if(cardUrl){try{raw.card=await captureCard(await get(cardUrl,'bradford_property_card',{}, {binary:true}),match.parcel_id);}catch(error){if(error.code==='identity_mismatch')throw error;raw.card_error={code:error.code||'card_parse_error',message:error.message};notes.push('Property record card unavailable: '+raw.card_error.message);}}
  return {...match,status,raw,source_id:sourceId,notes};
}

export function enrichBradford(raw,parcelId) {
  const html=textHtml(raw),{$,shown,pin}=identity(html,parcelId),info=ownerInfo($),provenance={},section_status={},notes=[];
  $('script,style').remove();
  const bind=(field,path,value)=>{provenance[field]={source_id:sourceId,source_path:path,source_value:value??null};return nullable(value);};
  const mark=(section,path,value,exists,status)=>{section_status[section]={status:status||(exists?(Array.isArray(value)?!value.length:value===null)?'EMPTY':'EXTRACTED':'UNAVAILABLE'),source_id:sourceId,source_paths:[path]};provenance[section]={source_id:sourceId,source_path:path,source_value:exists?$(path).html()??value:null};return value;};
  const ownerRows=$('#gisDetails_OwnerContent tr'),useRow=ownerRows.toArray().find(e=>/^Use:/.test(clean($(e).text()))),legalRow=ownerRows.toArray().find(e=>/^Desc:/.test(clean($(e).text())));
  const use=useRow?clean($(useRow).text()).replace(/^Use:\s*/,''):null;
  const legal=legalRow?clean($(legalRow).text()).replace(/^Desc:\s*/,''):null;
  const label=$('b').map((_,e)=>clean($(e).text())).get().find(value=>/^20\d{2} (?:Preliminary|Final|Certified|Working) Values$/.test(value));
  const year=label?.slice(0,4)??null,status=label?.slice(5).replace(/ Values$/,'')??null,values={};
  $('[id="gisDetails_ValuesContent"] tr').each((_,e)=>{const cells=$(e).children('td');if(cells.length===2)values[clean(cells.eq(0).text())]=clean(cells.eq(1).text());});
  if(!year||!/^\$[\d,]+(?:\.\d+)?$/.test(values.Assessed??''))throw new LookupError('layout_changed','Bradford source-labelled assessment year/value is missing.');
  const assessment={Year:year,Status:status,SourceLabel:label};
  for(const [name,key]of [['LandValue','Mkt Lnd'],['AgriculturalLandValue','Ag Lnd'],['BuildingValue','Bldg'],['ExtraFeatureValue','XFOB'],['MarketValue','Just'],['ClassifiedValue','Class'],['AppraisedValue','Appraised'],['AssessedValue','Assessed'],['ExemptionValue','Exempt']])assessment[name]=bind('AssessmentInformation.'+name,'#gisDetails_ValuesContent '+key,values[key]);
  const taxable={};taxable[year]={};for(const [authority,key]of [['County','county'],['SchoolBoard','school'],['City','city'],['Regional','other']])taxable[year][authority]={ExemptionValue:null,TaxableValue:bind(`TaxableValueInformation.${year}.${authority}.TaxableValue`,'#gisDetails_ValuesContent Total Taxable '+key,values['Total Taxable']?.match(new RegExp(key+':\\s*(\\$[\\d,]+(?:\\.\\d+)?)'))?.[1]),SourceLabel:key};
  const sales=[];$('#gisDetails_SalesContent tr').each((i,e)=>{const cells=$(e).children('td');if(cells.length!==5)return;const keys=['Date','Price','ORBookPage','Instrument','QualificationDescription'],row={};keys.forEach((key,j)=>row[key]=bind(`SalesInformation.${i}.${key}`,`#gisDetails_SalesContent tr[${i}] td[${j}]`,clean(cells.eq(j).text())));sales.push(row);});
  const components=[],componentStatus={};
  for(const [selector,kind,keys]of [['#gisBuilding_Characteristics','Building',['Sketch','Description','YearBuilt','HeatedArea','ActualArea','Value']],['#gisExtra_Features','ExtraFeature',['Code','Description','YearBuilt','Value','Units','Dimensions']],['#gisLand_Breakdown','Land',['Code','Description','Units','Adjustments','EffectiveRate','Value']]]) {
    const table=$(selector).find('[id="gisDetails_XFOB"]'),rows=table.find('tr').slice(1);componentStatus[kind]=!table.length?'UNAVAILABLE':!rows.length?'EMPTY':'EXTRACTED';
    rows.each((i,e)=>{const cells=$(e).children('td');if(cells.length!==keys.length){componentStatus[kind]='PARTIAL';notes.push(kind+' row has unexpected columns; original section HTML retained.');return;}const row={ComponentType:kind,SourceYear:year};keys.forEach((key,j)=>row[key]=bind(`LandBuildingExtraFeatures.${year}.${components.length}.${key}`,`${selector} tr[${i+1}] td[${j}]`,clean(cells.eq(j).text())));if(kind==='Building')row.SketchLink=cells.eq(0).find('a').attr('href')??null;components.push(row);});
    provenance['LandBuildingExtraFeatures.'+kind]={source_id:sourceId,source_path:selector,source_value:$(selector).html()??null,status:componentStatus[kind]};
  }
  const buildings=components.filter(row=>row.ComponentType==='Building'),lands=components.filter(row=>row.ComponentType==='Land');
  const single=key=>buildings.length===1?buildings[0][key]??null:null;
  const property={ParcelNumber:shown,AlternateKey:pin.match(/\((\d+)\)/)?.[1]??null,PropertyAddress:info.site,Owners:info.owners,MailingAddress:info.mailing,ownerOccupied:null,PrimaryZone:null,PrimaryLandUse:use?.split('|')[0].trim()??null,BedsBathsHalf:null,Floors:null,LivingUnits:null,LivingArea:single('HeatedArea')===null?null:single('HeatedArea')+' Sq.Ft',AdjustedArea:null,ActualArea:single('ActualArea')===null?null:single('ActualArea')+' Sq.Ft',LotSize:lands.length===1?nullable(lands[0].Units):null,YearBuilt:single('YearBuilt'),ReportedAcreage:use?.match(/\|\s*(.*?)\s*AC$/)?.[1]??null};
  for(const [key,value]of Object.entries(property))provenance['PropertyInformation.'+key]={source_id:sourceId,source_path:key==='LotSize'?'#gisLand_Breakdown':key==='LivingArea'||key==='ActualArea'||key==='YearBuilt'?'#gisBuilding_Characteristics':'#gisDetails_OwnerContent',source_value:value,...(value===null?{missing_reason:'SOURCE_FIELD_UNAVAILABLE'}:{})};
  notes.push('The county labels these '+label+'; preliminary values are not relabelled certified. Occupancy and authority-specific exemptions are unavailable. Reported acreage and land square feet are retained independently without reconciling conflicting native values.');
  notes.push('Only the displayed assessment year is captured; no complete assessment-history claim. The GIS description is abbreviated, and the printed record card also abbreviates it; full legal completeness is unverified.');
  const sections={PropertyInformation:mark('PropertyInformation','#gisDetails_OwnerContent',property,true),AssessmentInformation:mark('AssessmentInformation','[id="gisDetails_ValuesContent"]',assessment,true),AssessmentHistory:mark('AssessmentHistory','[id="gisDetails_ValuesContent"]',[assessment],true,'PARTIAL'),BenefitsInformation:mark('BenefitsInformation','#unavailable-benefit-schedule',[],false),BenefitsNote:mark('BenefitsNote','#unavailable-benefit-schedule',null,false),TaxableValueInformation:mark('TaxableValueInformation','[id="gisDetails_ValuesContent"]',taxable,true),FullLegalDescription:mark('FullLegalDescription','#gisDetails_OwnerContent',legal?[legal]:[],!!legalRow,legal?'PARTIAL':undefined),SalesInformation:mark('SalesInformation','#gisDetails_SalesContent',sales,$('#gisDetails_SalesContent').length>0),LandBuildingExtraFeatures:mark('LandBuildingExtraFeatures','#gisBuilding_Characteristics, #gisExtra_Features, #gisLand_Breakdown',{[year]:components},Object.values(componentStatus).some(v=>v!=='UNAVAILABLE'),Object.values(componentStatus).every(v=>v==='EMPTY')?'EMPTY':Object.values(componentStatus).some(v=>['PARTIAL','UNAVAILABLE'].includes(v))?'PARTIAL':'EXTRACTED')};
  section_status.LandBuildingExtraFeatures.components=componentStatus;
  provenance['bradford_property_card']={source_id:'bradford_property_card',status:raw?.card?'EXTRACTED':'UNAVAILABLE',method:'positioned_pdf_text',source_value:raw?.card??null,error:raw?.card_error??null};
  if(raw?.card){if(!raw.card.items?.some(item=>item.text===shown))throw new LookupError('identity_mismatch','Bradford captured card parcel differs from detail.');notes.push('All property-record-card positioned text is retained in provenance, including construction, printed subareas, permits, prior-year valuation, notes and dimensions. Card printed-date and valuation year are separate source observations.');}
  return {...sections,section_status,provenance,notes};
}
