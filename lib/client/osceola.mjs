import {LookupError} from '../live/engine.mjs';
import {normalizeMiamiAddress, addressMatches, ownerMatchesMiami,normalizeMiamiOwner} from './miami.mjs';
import {selectDetectedAddress,mailingDeliveryLines,deliveryAddressMatches} from './address-detection.mjs';
export const osceolaEndpoint = 'https://search.property-appraiser.org/api/v1/';
export const osceolaHeaders = Object.freeze({Accept:'application/json','User-Agent':'Mozilla/5.0',Referer:'https://search.property-appraiser.org/Search/MainSearch'});
const parcel = value => String(value ?? '').trim().replace(/[-\s]/g,'');
const text = value => value === undefined || value === null ? null : String(value).trim();
const json = value => { if (value && typeof value === 'object') return value; try { return JSON.parse(value); } catch { throw new LookupError('layout_changed','Osceola source did not return valid JSON.'); } };
const owners = row => typeof row?.Owners === 'string' ? row.Owners.split(/[;\n|]/).map(text).filter(Boolean) : [];
const complete = data => Array.isArray(data?.value) && Number.isInteger(data['@odata.count']) && data['@odata.count'] === data.value.length && !data['@odata.nextLink'];
// Counted OData coverage, including continuations, is required before uniqueness.
// Continuations must stay on the same native table and preserve the original filter.
async function counted(url,sourceId,get) {
  const initial=new URL(url),seen=new Set(),pages=[],rows=[];let count;
  for(let page=0;page<5;page++) {
    if(seen.has(url))break;
    seen.add(url);
    const data=json(await get(url,sourceId,osceolaHeaders));pages.push(data);
    if(!Array.isArray(data?.value))return data;
    if(page===0)count=data['@odata.count'];
    if(!Number.isInteger(count)||count<0||data['@odata.count']!==undefined&&data['@odata.count']!==count)return {...data,'@odata.count':null};
    rows.push(...data.value);
    if(rows.length>count||rows.length>500)return {...data,value:rows,'@odata.count':null};
    if(!data['@odata.nextLink'])return {...data,value:rows,'@odata.count':count,pages};
    let next;try{next=new URL(data['@odata.nextLink'],url);}catch{return {...data,value:rows,'@odata.count':null};}
    if(next.origin!==initial.origin||next.pathname!==initial.pathname||next.username||next.password||next.hash||next.searchParams.get('$filter')!==initial.searchParams.get('$filter'))return {...data,value:rows,'@odata.count':null};
    url=next.href;
  }
  return {value:rows,'@odata.count':count,'@odata.nextLink':url,pages};
}
const addresses = row => [row.SitusStreet, ...(typeof row.SitusAll === 'string' ? row.SitusAll.split(';') : [])].filter(Boolean);
const exactAddress = (input,row) => {
  const wanted=normalizeMiamiAddress(input.address,input.unit);
  return !wanted.conflict && addresses(row).some(address => {const actual=normalizeMiamiAddress(address);return addressMatches(wanted,actual);});
};
export function matchOsceolaCandidates(input,data) {
  if (normalizeMiamiAddress(input.address,input.unit).conflict) return {status:'SEARCH_INCOMPLETE',candidates:[],notes:['Conflicting explicit unit and address unit.']};
  if (!complete(data)) return {status:'SEARCH_INCOMPLETE',candidates:[],notes:['Osceola address result has an unverified count or remaining page; no unique parcel selected.']};
  const rows=data.value.filter(row=>exactAddress(input,row));
  const candidates=rows.map(row=>({parcel_id:parcel(row.strap),address:row.SitusStreet,owners:owners(row),source_id:'osceola_address_search'}));
  if(candidates.some(row=>!/^\d{18}$/.test(row.parcel_id)))return {status:'SEARCH_INCOMPLETE',candidates,notes:['Exact address candidate lacks a valid eighteen-digit parcel.']};
  let ids=[...new Set(candidates.map(row=>row.parcel_id))];
  if(ids.length!==candidates.length)return {status:'SEARCH_INCOMPLETE',candidates,notes:['Native market search repeats a parcel row; unique detail identity is unverified.']};
  if(!ids.length)return {status:'NOT_FOUND',candidates,notes:['Complete address search contains no exact street/unit match.']};
  if(ids.length>1)ids=[...new Set(candidates.filter(row=>ownerMatchesMiami(input.ownerName,row.owners)).map(row=>row.parcel_id))];
  if(ids.length!==1)return {status:'AMBIGUOUS',candidates,notes:['Exact street/unit candidates did not narrow to one parcel by reported owner.']};
  const row=rows.find(row=>parcel(row.strap)===ids[0]);const names=owners(row);
  return {status:!names.length?'OWNER_UNAVAILABLE':ownerMatchesMiami(input.ownerName,names)?'MATCHED':'OWNER_MISMATCH',parcel_id:ids[0],candidates,notes:!names.length?['Native ownership unavailable for the unique exact address.']:ownerMatchesMiami(input.ownerName,names)?[]:['Unique exact address resolves, but reported ownership differs.']};
}
export async function resolveOsceola(input,get) {
  const address=normalizeMiamiAddress(input.address,input.unit);
  if(address.conflict)return {status:'SEARCH_INCOMPLETE',candidates:[],notes:['Conflicting explicit unit and address unit.']};
  // The native app's classic address fallback searches SitusAll. Count is mandatory;
  // the alternate SiteAddress/search max=100 array cannot alone prove uniqueness.
  const filter="contains(SitusAll,'"+address.street.replaceAll("'","''")+"')";
  let market,match;
  if(['auto','mailing'].includes(input.addressType)){
   const found=await discoverOsceolaAddress(input,get);match=found.match;market=found.market;
  }else{
   market=await counted(osceolaEndpoint+'ParcelMarket?'+new URLSearchParams({'$filter':filter,'$count':'true','$top':'100'}),'osceola_address_search',get);
   match=matchOsceolaCandidates(input,market);
  }
  if(!match.parcel_id)return match;
  const values=await counted(osceolaEndpoint+'PropertyValues?'+new URLSearchParams({'$filter':"strap eq '"+match.parcel_id+"'",'$orderby':'tax_yr desc','$count':'true','$top':'100'}),'osceola_assessment',get);
  if(!complete(values))return {...match,status:'SEARCH_INCOMPLETE',parcel_id:undefined,notes:[...match.notes,'Certified value-history pagination is incomplete or unverified.']};
  if(values.value.some(row=>parcel(row.strap)!==match.parcel_id))throw new LookupError('identity_mismatch','Osceola certified history contains another parcel.');
  const raw={market,values},section_errors={};
  for(const [key,endpoint]of [['sales','sales'],['land','Lnd_c'],['buildings','Bld'],['extras','xfob']]) {
    try {
      const params={'$filter':"strap eq '"+match.parcel_id+"'",'$count':'true','$top':'100'};
      if(key==='sales')params['$orderby']='dos desc';
      const data=await counted(osceolaEndpoint+endpoint+'?'+new URLSearchParams(params),'osceola_'+key,get);
      if(!complete(data)){section_errors[key]='SOURCE_PAGINATION_INCOMPLETE';continue;}
      if(data.value.some(row=>parcel(row.strap??row.Strap)!==match.parcel_id))throw new LookupError('identity_mismatch','Osceola '+key+' contains another parcel.');
      raw[key]=data;
    } catch(error) {
      if(error.code==='identity_mismatch')throw error;
      section_errors[key]=error.code||'SOURCE_REQUEST_FAILED';
    }
  }
  raw.section_errors=section_errors;
  return {...match,raw,source_id:'osceola_assessment'};
}
function osceolaRoles(input,row){
 const wanted=normalizeMiamiAddress(input.address,input.unit),roles=[];
 if(addresses(row).some(line=>deliveryAddressMatches(wanted,normalizeMiamiAddress(line),addressMatches)))roles.push('site');
 if(mailingDeliveryLines([row.MailAddr_1,row.MailAddr_2,row.MailAddr_3]).some(line=>deliveryAddressMatches(wanted,normalizeMiamiAddress(line),addressMatches)))roles.push('mailing');
 return roles;
}
async function discoverOsceolaAddress(input,get){
 const ownerQuery=name=>osceolaEndpoint+'ParcelMarket?'+new URLSearchParams({'$filter':"contains(Owners,'"+normalizeMiamiOwner(name).replaceAll("'","''")+"')",'$count':'true','$top':'100'});
 let discovery=await counted(ownerQuery(input.ownerName),'osceola_owner_search',get);
 if(complete(discovery)&&!discovery.value.length){
  const site=await resolveOsceola({...input,addressType:'site'},get);
  const canonical=site.status==='MATCHED'?owners(site.raw.market.value.find(row=>parcel(row.strap)===site.parcel_id)).find(name=>ownerMatchesMiami(input.ownerName,[name])):null;
  if(canonical&&normalizeMiamiOwner(canonical)!==normalizeMiamiOwner(input.ownerName))discovery=await counted(ownerQuery(canonical),'osceola_owner_search_canonical',get);
 }
 const invalid=()=>({match:selectDetectedAddress([],{complete:false,addressType:input.addressType})});
 if(!complete(discovery)||discovery.value.length>100)return invalid();
 const rows=discovery.value,seen=new Set(),candidates=[];
 for(const row of rows){
  const id=parcel(row.strap);
  if(!/^[A-Z0-9]{18}$/.test(id)||seen.has(id)||!row.dsp_strap||parcel(row.dsp_strap)!==id||!owners(row).length)return invalid();seen.add(id);
  if(!ownerMatchesMiami(input.ownerName,owners(row)))continue;
  if(row.MailAddr_1===undefined||row.MailAddr_2===undefined||row.SitusStreet===undefined)return invalid();
  for(const role of osceolaRoles(input,row))candidates.push({parcel_id:id,address:row.Situs,mailing_address:row.Mailing,owners:owners(row),owner_matches_requested:true,verified_address_match:true,address_match_type:role,source_id:'osceola_owner_search'});
 }
 const match={...selectDetectedAddress(candidates,{addressType:input.addressType}),owner_reference_status:'COMPLETE',owner_reference_candidates:rows.map(row=>({parcel_id:parcel(row.strap),address:row.Situs,mailing_address:row.Mailing,owners:owners(row)}))};if(!match.parcel_id)return {match};
 const market=await counted(osceolaEndpoint+'ParcelMarket?'+new URLSearchParams({'$filter':"strap eq '"+match.parcel_id+"'",'$count':'true','$top':'100'}),'osceola_address_search',get);
 if(!complete(market)||market.value.length!==1)return invalid();
 const row=market.value[0];
 if(parcel(row.strap)!==match.parcel_id||parcel(row.dsp_strap)!==match.parcel_id||!ownerMatchesMiami(input.ownerName,owners(row))||!match.matched_address_types.every(role=>osceolaRoles(input,row).includes(role)))throw new LookupError('identity_mismatch','Osceola owner or detected address changed on final verification.');
 return {match,market};
}
const money=value=>value===null||value===undefined||value===''?null:'$'+String(value).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const area=value=>value===null||value===undefined?null:String(value)+' Sq.Ft';
const decode=value=>String(value??'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ');
export function enrichOsceola(raw,parcelId) {
  const id=parcel(parcelId),marketRows=raw.market?.value;
  const matches=Array.isArray(marketRows)?marketRows.filter(row=>parcel(row.strap)===id):[];
  if(!/^\d{18}$/.test(id)||matches.length!==1)throw new LookupError('identity_mismatch','Osceola market response does not contain one exact resolved parcel.');
  const p=matches[0],valueRows=raw.values?.value;
  if(p.dsp_strap&&parcel(p.dsp_strap)!==id)throw new LookupError('identity_mismatch','Osceola displayed parcel differs from its native identity.');
  if(!Array.isArray(valueRows)||valueRows.some(row=>parcel(row.strap)!==id))throw new LookupError('identity_mismatch','Osceola certified value history belongs to another parcel or is unavailable.');
  if(valueRows.some(row=>!Number.isInteger(row.tax_yr)||row.tax_yr<1900||row.tax_yr>2100)||new Set(valueRows.map(row=>row.tax_yr)).size!==valueRows.length)throw new LookupError('layout_changed','Osceola certified history has invalid or duplicate source years.');
  const provenance={},section_status={},notes=[];
  const sourceId=path=>path.startsWith('market')?'osceola_address_search':path.startsWith('values')?'osceola_assessment':'osceola_'+path.split('.')[0];
  const bind=(field,path,value,formatter=v=>v??null)=>{provenance[field]={source_id:sourceId(path),source_path:path,source_value:value??null};return formatter(value);};
  const mi=marketRows.indexOf(p),mp='market.value.'+mi;
  const marketField=(output,key,formatter)=>bind('PropertyInformation.'+output,mp+'.'+key,p[key],formatter);
  const property={ParcelNumber:marketField('ParcelNumber','dsp_strap',text)||id,PropertyAddress:marketField('PropertyAddress','Situs',text),Owners:owners(p),MailingAddress:marketField('MailingAddress','Mailing',text),ownerOccupied:null,PrimaryZone:null,PrimaryLandUse:[p.dorCode,p.dorDesc].filter(Boolean).join(' ')||null,BedsBathsHalf:null,Floors:null,LivingUnits:marketField('LivingUnits','livunits',text),LivingArea:marketField('LivingArea','HeatedArea',area),AdjustedArea:null,LotSize:null,YearBuilt:marketField('YearBuilt','ayb',text),EffectiveYearBuilt:marketField('EffectiveYearBuilt','eyb',text),LotAreaAcres:marketField('LotAreaAcres','totalAcres',text),GrossBuildingArea:marketField('GrossBuildingArea','grossBldArea',area),BuildingCount:marketField('BuildingCount','numofbuildings',text),ValuationMethod:marketField('ValuationMethod','ValMethodDscr',text)};
  provenance['PropertyInformation.Owners']={source_id:'osceola_address_search',source_path:mp+'.Owners',source_value:p.Owners??null};
  provenance['PropertyInformation.PrimaryLandUse']={source_id:'osceola_address_search',source_paths:[mp+'.dorCode',mp+'.dorDesc'],source_value:{dorCode:p.dorCode??null,dorDesc:p.dorDesc??null}};
  notes.push('Occupancy, zoning, bedrooms/baths, floors, adjusted area and lot square feet are unavailable in the inspected source fields; acreage is retained in source provenance.');
  const mapAssessment=(row,index,basis)=>{
    const out={};for(const [key,source] of [['Year',basis==='WORKING'?'taxyear':'tax_yr'],['LandValue','tot_lnd_val'],['BuildingValue','tot_bld_val'],['ExtraFeatureValue','tot_xf_val'],['MarketValue',basis==='WORKING'?'currJustValue':'jst_val'],['AssessedValue',basis==='WORKING'?'currassessedvalue':'soh_val'],['UncappedAssessedValue','asd_val']])out[key]=bind(`AssessmentHistory.${index}.${key}`,basis==='WORKING'?mp+'.'+source:'values.value.'+valueRows.indexOf(row)+'.'+source,row[source],key==='Year'?text:money);
    out.Status=basis;out.CertifiedDate=basis==='CERTIFIED'?bind(`AssessmentHistory.${index}.CertifiedDate`,'values.value.'+valueRows.indexOf(row)+'.certified_dt',row.certified_dt,text):null;out.ValuationDate=basis==='WORKING'?bind(`AssessmentHistory.${index}.ValuationDate`,mp+'.ValuationDate',row.ValuationDate,text):null;return out;
  };
  const certified=[...valueRows].sort((a,b)=>Number(b.tax_yr)-Number(a.tax_yr));
  const history=[];
  if(p.taxyear!==undefined&&p.taxyear!==null)history.push(mapAssessment(p,0,'WORKING'));
  for(const row of certified)history.push(mapAssessment(row,history.length,'CERTIFIED'));
  const current=history.find(row=>row.Status==='CERTIFIED')||null;
  if(current)for(const key of ['Year','LandValue','BuildingValue','ExtraFeatureValue','MarketValue','AssessedValue','UncappedAssessedValue','CertifiedDate'])provenance['AssessmentInformation.'+key]={...provenance['AssessmentHistory.'+history.indexOf(current)+'.'+key]};
  notes.push('AssessmentInformation uses the latest certified source year. Working market values are separately labelled in AssessmentHistory; working and certified years are not interchangeable.');
  const taxable={};
  for(const row of valueRows) {
    const index=valueRows.indexOf(row);const year=String(row.tax_yr);
    taxable[year]=Object.fromEntries(['County','SchoolBoard','City','Regional'].map(authority=>[authority,{ExemptionValue:null,TaxableValue:null}]));
    taxable[year].Reported={ExemptionValue:bind(`TaxableValueInformation.${year}.Reported.ExemptionValue`,`values.value.${index}.ex_val`,row.ex_val,money),TaxableValue:bind(`TaxableValueInformation.${year}.Reported.TaxableValue`,`values.value.${index}.tax_val`,row.tax_val,money)};
  }
  notes.push('Osceola reports a taxable amount without a named authority in these fields. Reported values are preserved; County/SchoolBoard/City/Regional assignments remain null.');
  const legal=typeof p.Legals==='string'&&p.Legals.trim()?[decode(p.Legals).trim()]:[];
  const detailRows=key=>{
    if(!raw[key])return null;
    if(!complete(raw[key]))throw new LookupError('layout_changed','Osceola '+key+' coverage is incomplete.');
    if(raw[key].value.some(row=>parcel(row.strap??row.Strap)!==id))throw new LookupError('identity_mismatch','Osceola '+key+' belongs to another parcel.');
    return raw[key].value;
  };
  const salesRows=detailRows('sales'),landRows=detailRows('land'),buildingRows=detailRows('buildings'),extraRows=detailRows('extras');
  const mappedRows=(key,rows,section,mapping)=>rows?.map((row,index)=>Object.fromEntries(mapping.map(([output,source,formatter=text])=>[output,bind(`${section}.${index}.${output}`,`${key}.value.${index}.${source}`,row[source],formatter)])))||[];
  const sales=mappedRows('sales',salesRows,'SalesInformation',[
    ['SaleDate','dos'],['Price','price',money],['DeedType','trans_dscr'],['InstrumentBook','or_bk'],['InstrumentPage','or_pg'],['Grantors','grantors'],['Grantees','grantees'],['QualificationCode','qu_flg'],['QualificationDescription','dscr'],['VacantImprovedCode','vi'],['MultiParcelReasonCode','rea_cd'],['SourceTaxYear','CurrTaxYear']
  ]);
  const components={};
  if(landRows)components.Land=mappedRows('land',landRows,'LandBuildingExtraFeatures.Land',[['Number','num'],['Description','land_type'],['Units','uts'],['UnitType','unit_type'],['Depth','dpth'],['Value','val',money]]);
  if(buildingRows)components.Buildings=mappedRows('buildings',buildingRows,'LandBuildingExtraFeatures.Buildings',[['Number','CardNumber'],['Description','Description'],['YearBuilt','YearBuilt'],['Value','BuildingValue',money],['GrossArea','BuildingSqFeet',area],['HeatedArea','HeatedSqFeet',area],['Bedrooms','Bedrooms'],['Bathrooms','Bathrooms'],['HalfBathrooms','HalfBathrooms'],['Fixtures','Fixtures'],['LivingUnits','LivingUnits'],['NonLivingUnits','NonLivingUnits'],['RoofCover','RoofCover'],['ExteriorWall','ExteriorWall'],['Sketch','Sketch']]);
  if(extraRows)components.ExtraFeatures=mappedRows('extras',extraRows,'LandBuildingExtraFeatures.ExtraFeatures',[['Number','ln_num'],['Description','l_dscr'],['Units','units'],['YearBuilt','yr_blt'],['Value','asd_val',money]]);
  const sections={PropertyInformation:property,AssessmentInformation:current,AssessmentHistory:history,BenefitsInformation:[],BenefitsNote:null,TaxableValueInformation:taxable,FullLegalDescription:legal,SalesInformation:sales,LandBuildingExtraFeatures:components};
  const mappedPaths={PropertyInformation:[mp],AssessmentInformation:['values.value'],AssessmentHistory:['market.value','values.value'],TaxableValueInformation:['values.value'],FullLegalDescription:[mp+'.Legals']};
  if(salesRows)mappedPaths.SalesInformation=['sales.value'];
  const componentPaths=['land','buildings','extras'].filter(key=>raw[key]).map(key=>key+'.value');
  if(componentPaths.length)mappedPaths.LandBuildingExtraFeatures=componentPaths;
  for(const [section,value]of Object.entries(sections)) {
    const available=Object.hasOwn(mappedPaths,section) && (section!=='FullLegalDescription' || p.Legals!==undefined && p.Legals!==null);const empty=value===null||Array.isArray(value)&&!value.length||typeof value==='object'&&value!==null&&!Object.keys(value).length;
    section_status[section]={status:available?empty?'EMPTY':'EXTRACTED':'UNAVAILABLE',source_id:section==='PropertyInformation'||section==='FullLegalDescription'?'osceola_address_search':'osceola_assessment',source_paths:mappedPaths[section]||[],...(!available?{reason:'SOURCE_SECTION_NOT_CAPTURED'}:{})};
    provenance[section]={source_id:section==='PropertyInformation'||section==='FullLegalDescription'?'osceola_address_search':'osceola_assessment',source_paths:mappedPaths[section]||[],source_value:section==='PropertyInformation'?p:section==='FullLegalDescription'?p.Legals??null:section==='AssessmentHistory'||section==='AssessmentInformation'||section==='TaxableValueInformation'?raw.values:null};
    if(!available)notes.push(`${section}: the inspected market/value APIs do not provide the required source section; unavailable, not inspected empty.`);
  }
  section_status.SalesInformation.source_id='osceola_sales';
  if(salesRows){provenance.SalesInformation={source_id:'osceola_sales',source_paths:['sales.value'],source_value:raw.sales};}
  else if(raw.section_errors?.sales)section_status.SalesInformation.reason=raw.section_errors.sales;
  delete section_status.LandBuildingExtraFeatures.source_id;
  if(componentPaths.length){section_status.LandBuildingExtraFeatures.source_ids=componentPaths.map(sourceId);provenance.LandBuildingExtraFeatures={source_ids:componentPaths.map(sourceId),source_paths:componentPaths,source_value:Object.fromEntries(['land','buildings','extras'].filter(key=>raw[key]).map(key=>[key,raw[key]]))};}
  for(const [key,error]of Object.entries(raw.section_errors||{}))notes.push(`${key}: ${error}; detail section remains unavailable, not empty.`);
  if(componentPaths.length&&componentPaths.length<3){section_status.LandBuildingExtraFeatures.status='PARTIAL';section_status.LandBuildingExtraFeatures.reason='SOURCE_COMPONENTS_UNAVAILABLE';}
  for(const [key,output]of [['land','Land'],['buildings','Buildings'],['extras','ExtraFeatures']])section_status['LandBuildingExtraFeatures.'+output]={status:raw[key]?raw[key].value.length?'EXTRACTED':'EMPTY':'UNAVAILABLE',source_id:'osceola_'+key,source_paths:raw[key]?[key+'.value']:[],...(!raw[key]?{reason:raw.section_errors?.[key]||'SOURCE_SECTION_NOT_CAPTURED'}:{})};
  notes.push('Native land/building/feature rows retain their reported quantities and values; component values have no separately published tax year. Sales retain the source grantee spelling and qualification codes.');
  for(const field of ['ownerOccupied','PrimaryZone','BedsBathsHalf','Floors','AdjustedArea','LotSize'])provenance['PropertyInformation.'+field]={source_id:'osceola_address_search',source_value:null,missing_reason:'SOURCE_FIELD_UNAVAILABLE'};
  return {...sections,section_status,provenance,notes};
}
