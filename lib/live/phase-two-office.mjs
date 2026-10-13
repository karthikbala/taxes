import {LookupError} from './engine.mjs';
import {load} from 'cheerio';
const norm=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const money=v=>Number.isFinite(v)&&v>=0?String(v):null;
const cash=v=>{const s=String(v??'').replace(/[$,\s]/g,'');return /^\d+(\.\d+)?$/.test(s)?s:null;};
export function pinellasInternal(id){const p=norm(id);if(!/^\d{18}$/.test(p))throw new LookupError('invalid_parcel','Pinellas requires its displayed section-township-range parcel ID.',400);return p.slice(4,6)+p.slice(2,4)+p.slice(0,2)+p.slice(6);}
export function parsePinellas(html,id){
 const $=load(html),text=e=>$(e).text().replace(/\s+/g,' ').trim(),parcel=text('#pacel_no');
 if(!parcel)throw new LookupError('layout_changed','County parcel identity is missing.');if(norm(parcel)!==norm(id))throw new LookupError('identity_mismatch','County returned a different parcel; record rejected.');
 const yearLabel=text('#value_info_head_text'),year=Number(yearLabel.match(/20\d{2}/)?.[0]);
 const cells=$('#tblLastYearValue tbody tr').first().children('td').map((_,e)=>text(e)).get();
 if(!year||Number(cells[0])!==year||cash(cells[2])===null)throw new LookupError('layout_changed','County final assessment row/year is missing.');
 return {property:{parcel_id:parcel,owner:[text('#first_second_owner'),text('#third_owner')].filter(Boolean).join('; ')||null,address:text('#site_address')||null},assessment:{year,year_status:yearLabel.replace(/^20\d{2}\s*/,'').trim(),just_value:cash(cells[1]),assessed_total:cash(cells[2]),taxable_non_school:cash(cells[3]),taxable_school:cash(cells[4]),taxable_municipal:cash(cells[5]),land:null,building:null,source_id:'assessment_county'},source_record_date:text('#lblUpdatedAt').match(/as of\s+([^)]+)/i)?.[1]||null};
}
// The assessor publishes a full-parcel g= cross-reference; Phenix account IDs
// are separate R-prefixed identifiers and must never be guessed from the parcel.
export function pinellasCollectorReference(html,id){
 const $=load(html);
 if(norm($('#pacel_no').text())!==norm(id))throw new LookupError('identity_mismatch','Pinellas collector reference belongs to another assessor parcel.');
 const links=$('a[href]').map((_,e)=>$(e).attr('href')).get().filter(h=>h.startsWith('https://pinellas.floridatax.us/PropertyDetail?'));
 const valid=links.map(h=>new URL(h)).filter(u=>u.origin==='https://pinellas.floridatax.us'&&u.pathname==='/PropertyDetail'&&[...u.searchParams.keys()].length===1&&u.searchParams.get('g')===norm(id));
 const unique=[...new Set(valid.map(u=>u.href))];
 if(unique.length!==1)throw new LookupError('collector_identity_missing','One exact full-parcel Pinellas collector cross-reference is required.');
 return unique[0];
}
export function parseDeSoto(html,id){
 const $=load(html);$('script,style').remove();const text=e=>$(e).text().replace(/\s+/g,' ').trim();
 if(!html.trim()||/No Matching Records Found/i.test($.text()))throw new LookupError('not_found','County has no matching parcel.',404);
 const pin=text('.gisDetails_PIN'),parcel=pin.match(/^([A-Z0-9-]+)\s*\(/)?.[1];
 if(!parcel)throw new LookupError('layout_changed','County parcel identity is missing.');if(norm(parcel)!==norm(id))throw new LookupError('identity_mismatch','County returned a different parcel; record rejected.');
 const label=$('b').map((_,e)=>text(e)).get().find(s=>/^20\d{2} (Preliminary|Final|Certified|Working) Values$/.test(s));if(!label)throw new LookupError('layout_changed','County assessment year/label is missing.');
 const values={};$('[id="gisDetails_ValuesContent"] tr').each((_,r)=>{const c=$(r).children('td');if(c.length===2)values[text(c.eq(0)).replace(/\s*\(\)$/, '')]=text(c.eq(1));});
 const taxable=authority=>cash(values['Total Taxable']?.match(new RegExp(authority+':\\s*(\\$[\\d,]+)'))?.[1]);
 if(cash(values.Assessed)===null)throw new LookupError('layout_changed','County assessed value is missing.');
 return {property:{parcel_id:parcel,alternate_key:pin.match(/\((\d+)\)/)?.[1]||null,owner:text('#gisDetails_OwnerContent tr:nth-child(2)')||null,address:text('#gisDetails_OwnerContent tr').match(/Site:\s*(.*?)\s*Use:/)?.[1]||null},assessment:{year:Number(label.slice(0,4)),year_status:label.slice(5).replace(' Values',''),land:cash(values['Mkt Lnd']),building:cash(values.Bldg),extra_features:cash(values.XFOB),just_value:cash(values.Just),assessed_total:cash(values.Assessed),exemptions:cash(values.Exempt),taxable_non_school:taxable('county'),taxable_school:taxable('school'),taxable_city:taxable('city'),taxable_other:taxable('other'),source_id:'assessment_county'},source_record_date:null};
}
export function parseHernando(data,id){
 if(data.error)throw new LookupError('source_query_error','County GIS rejected the query.');
 if(!data.features?.length)throw new LookupError('not_found','County GIS has no matching parcel.',404);
 if(data.features.length!==1||data.exceededTransferLimit)throw new LookupError('ambiguous_record','County GIS returned an incomplete or ambiguous result.');
 const a=data.features[0].attributes;if(a.COUNTY!=='HERNANDO'||String(a.COUNTYNO)!=='37')throw new LookupError('county_mismatch','GIS record belongs to another county.');
 if(norm(a.PARCEL_NUMBER)!==norm(id))throw new LookupError('identity_mismatch','County returned a different parcel; record rejected.');
 if(a.CONFIDENTIAL==='Y')throw new LookupError('confidential_record','County marked the parcel confidential.');
 if(!Number.isInteger(a.CER_ROLL_YEAR)||money(a.CER_ASSESSED_CNTY)===null)throw new LookupError('layout_changed','Certified county assessment year/value is missing.');
 return {property:{parcel_id:a.PARCEL_NUMBER,alternate_key:String(a.PARCEL_KEY),owner:[a.OWNER_NAME,a.OWNER_NAME2].filter(v=>v?.trim()).join('; ')||null,address:[a.SITUS_ADDRESS,a.SITUS_CITY,'FL',a.SITUS_ZIP5].filter(v=>v?.trim()).join(' ')},assessment:{year:a.CER_ROLL_YEAR,year_status:'Certified',land:money(a.CER_LAND_VALUE),building:money(a.CER_BLDG_VALUE),extra_features:money(a.CER_FEAT_VALUE),just_value:money(a.CER_JUST_VALUE),assessed_total:money(a.CER_ASSESSED_CNTY),assessed_school:money(a.CER_ASSESSED_SCHL),taxable_non_school:money(a.CER_TAXABLE_CNTY),taxable_school:money(a.CER_TAXABLE_SCHL),exemptions:money(a.CER_EXEMPT_CNTY),school_exemptions:money(a.CER_EXEMPT_SCHL),source_id:'assessment_county'},source_record_date:Number.isFinite(a.LAST_CAMA_UPDATE)?new Date(a.LAST_CAMA_UPDATE).toISOString():null,notes:['Assessor-reported tax estimates are not mapped to collector balances or payment status.']};
}
export function parseOsceola(market,values,id){
 if(!Array.isArray(market.value)||!Array.isArray(values.value))throw new LookupError('layout_changed','County property/value arrays are missing.');
 if(!market.value.length)throw new LookupError('not_found','County has no matching parcel.',404);
 if(market.value.length!==1)throw new LookupError('ambiguous_record','County returned multiple parcels.');
 const p=market.value[0];if(norm(p.strap)!==norm(id)||norm(p.dsp_strap)!==norm(id)||values.value.some(v=>norm(v.strap)!==norm(id)))throw new LookupError('identity_mismatch','County returned a different parcel; record rejected.');
 const rows=values.value.filter(v=>v.certified_dt&&Number.isInteger(v.tax_yr)).sort((a,b)=>b.tax_yr-a.tax_yr),a=rows[0];
 if(!a||money(a.asd_val)===null||rows.filter(v=>v.tax_yr===a.tax_yr).length!==1)throw new LookupError('layout_changed','One certified assessment row is required.');
 return {property:{parcel_id:p.dsp_strap,owner:p.Owners||null,address:p.Situs||null},assessment:{year:a.tax_yr,year_status:'Certified',land:money(a.tot_lnd_val),building:money(a.tot_bld_val),extra_features:money(a.tot_xf_val),just_value:money(a.jst_val),assessed_total:money(a.asd_val),exemptions:money(a.ex_val),taxable_value:money(a.tax_val),source_id:'assessment_county'},source_record_date:a.certified_dt,working_assessment:{year:p.taxyear,assessed_total:money(p.currassessedvalue),just_value:money(p.currJustValue),taxable_value:money(p.currTaxable),source_record_date:p.ValuationDate||null,source_id:'assessment_lookup'},notes:['Certified assessment and next-year working values are reported separately.']};
}
export function parseMartin(data,id){
 if(!Array.isArray(data.records))throw new LookupError('layout_changed','County search records are missing.');
 if(!data.records.length)throw new LookupError('not_found','County has no matching parcel.',404);
 if(data.records.length!==1||Number(data.total)!==1)throw new LookupError('ambiguous_record','County search did not return one complete unique parcel.');
 const a=data.records[0];if(norm(a.PIN)!==norm(id))throw new LookupError('identity_mismatch','County returned a different parcel; record rejected.');
 if(!Number.isInteger(a.TaxYear)||a.TaxYear<2000||a.TaxYear>2100||money(a.AssessedValue)===null)throw new LookupError('layout_changed','Required county year or assessed value is missing.');
 return {property:{parcel_id:a.PIN,account_id:String(a.AIN),owner:[a.PrimaryOwner,a.SecondaryOwner].filter(Boolean).join('; ')||null,address:a.FullSitusAddress||a.SitusAddress||null},assessment:{year:a.TaxYear,land:money(a.LandMarketValue),building:money(a.ImprovementMarketValue),just_value:money(a.TotalMarketValue),assessed_total:money(a.AssessedValue),exemptions:money(a.TotalCountyExemptions),taxable_non_school:money(a.CountyTaxableValue),source_id:'assessment_county'},source_record_date:a.ExtractUpdate||null};
}
export function martinCollectorKey(html,id,account){
 const $=load(html),pairs=[];$('strong').each((_,e)=>{const label=$(e).text().trim();if(label==='Parcel ID'||label==='Account Number')pairs.push([label,$(e).parent().text().replace(label,'').trim()]);});
 if(!pairs.some(([label,value])=>label==='Parcel ID'&&norm(value)===norm(id))||!pairs.some(([label,value])=>label==='Account Number'&&value===String(account)))throw new LookupError('identity_mismatch','Assessor collector-link page did not echo the parcel/account.');
 const links=$('a.property-tax-bill').map((_,e)=>$(e).attr('href')).get();if(links.length!==1)throw new LookupError('layout_changed','One official collector cross-reference is required.');
 const u=new URL(links[0]);if(u.origin!=='https://martin.county-taxes.com'||!/^\/public\/real_estate\/parcels\/\d{2}-\d{2}-\d{2}-\d{3}-\d{3}-\d{5}-\d{5}$/.test(u.pathname))throw new LookupError('unexpected_collector_link','Official collector cross-reference was rejected.');
 return u.pathname.split('/').at(-1);
}
// The current Columbia appraiser publishes the collector account explicitly.
// A derived lookup URL is only a request key; the returned full parcel and link
// must independently match before the account can be used.
export function columbiaCollectorReference(html,id){
 const $=load(html),heading=$('h1.title-heading').text().replace(/\s+/g,' ').trim();
 if(norm(heading.replace(/^Parcel\s+/i,''))!==norm(id))throw new LookupError('identity_mismatch','Columbia collector reference belongs to a different assessor parcel.');
 const links=$('a[href]').map((_,e)=>$(e).attr('href')).get().filter(h=>h.startsWith('https://columbia.floridatax.us/PropertyDetail?'));
 const accounts=new Set(links.map(h=>{const u=new URL(h);if(u.origin!=='https://columbia.floridatax.us'||u.pathname!=='/PropertyDetail')throw new LookupError('unexpected_collector_link','Columbia collector link was rejected.');return u.searchParams.get('p');}));
 if(accounts.size!==1||!/^R\d{5}-\d{3}$/.test([...accounts][0]||''))throw new LookupError('collector_identity_missing','One explicit Columbia real-estate collector account is required.');
 return [...accounts][0];
}
export async function lookupPhaseTwoOffice(county,params,get,verify){
 const id=params.parcel_id;
 if(county.id==='martin-fl'){
  if(!/^\d{18}$/.test(norm(id)))throw new LookupError('invalid_parcel','Martin requires its eighteen-digit parcel ID.',400);
  const url='https://www.pamartinfl.gov/app/search/real-property?'+new URLSearchParams({format:'json',search:id,searchField:'parcelId',exact:'true',limit:'10',offset:'0'});
  const result=parseMartin(JSON.parse(await get(url,'assessment_county')),id);
  const detail=await get('https://www.pamartinfl.gov/app/search/view/'+result.property.account_id,'assessment_collector_link');
  result.property.collector_parcel_id=martinCollectorKey(detail,id,result.property.account_id);verify('assessment_collector_link');return result;
 }
 if(county.id==='pinellas-fl'){
  const query=new URLSearchParams({s:pinellasInternal(id)});
  const html=await get('https://www.pcpao.gov/property-details?'+query,'assessment_county',{}, {browserOnBlock:true});
  const parsed=parsePinellas(html,id);
  try{parsed.property.collector_reference_url=pinellasCollectorReference(html,id);}catch(e){parsed.collector_reference_error={code:e.code,message:e.message};}
  return parsed;
 }
 if(county.id==='osceola-fl'){
  const p=norm(id);if(!/^\d{18}$/.test(p))throw new LookupError('invalid_parcel','Osceola requires its eighteen-digit parcel ID.',400);
  const query=new URLSearchParams({'$filter':"strap eq '"+p+"'"});
  const market=JSON.parse(await get('https://search.property-appraiser.org/api/v1/ParcelMarket?'+query,'assessment_lookup'));
  const values=JSON.parse(await get('https://search.property-appraiser.org/api/v1/PropertyValues?'+query,'assessment_county'));
  const result=parseOsceola(market,values,id);verify('assessment_lookup');return result;
 }
 if(county.id==='hernando-fl'){
  const p=norm(id);if(!/^R\d{19}$/.test(p))throw new LookupError('invalid_parcel','Hernando requires its displayed real-estate parcel ID.',400);
  const parcel=p.replace(/^(R\d{2})(\d{3})(\d{2})(\d{4})(\d{4})(\d{4})$/,'$1 $2 $3 $4 $5 $6');
  const query=new URLSearchParams({f:'json',where:"PARCEL_NUMBER='"+parcel+"'",outFields:'*',returnGeometry:'false',resultRecordCount:'2'});
  return parseHernando(JSON.parse(await get('https://services2.arcgis.com/x5zvhhxfUuRDntRe/arcgis/rest/services/Basemap_PublicMapGallery/FeatureServer/10061/query?'+query,'assessment_county')),id);
 }
 if(['desoto-fl','suwannee-fl','columbia-fl','bradford-fl','union-fl'].includes(county.id)){
  const p=norm(id);const patterns={'desoto-fl':/^\d{6}[A-Z0-9]{12}$/,'suwannee-fl':/^\d{4}[NS]\d{2}[EW]\d{11}$/,'columbia-fl':/^\d{3}[NS]\d{2}\d{8}$/,'bradford-fl':/^\d{5}[A-Z0-9]\d{5}$/,'union-fl':/^\d{16}$/};const valid=patterns[county.id].test(p);if(!valid)throw new LookupError('invalid_parcel','The county requires its displayed parcel ID.',400);
  const form=new URLSearchParams({tempPIN:p,save:'',Show_Rec:'',zoomPIN:'1'});
  const parsed=parseDeSoto(await get(({'desoto-fl':'https://www.desotopa.com','suwannee-fl':'https://www.suwanneepa.com','columbia-fl':'https://columbia.floridapa.com','bradford-fl':'https://www.bradfordappraiser.com','union-fl':'https://union.floridapa.com'}[county.id])+'/gis/gisSideMenu_3_Details/showDetails/','assessment_county',{'Content-Type':'application/x-www-form-urlencoded'},{method:'POST',body:form.toString()}),id);
  if(county.id==='columbia-fl'){
   const referenceKey=p.slice(6)+p.slice(4,6)+p.slice(2,4)+p.slice(0,2);
   try{
    parsed.property.collector_parcel_id=columbiaCollectorReference(await get('https://search.ccpafl.com/parcel/'+referenceKey,'assessment_collector_reference'),id);
    verify('assessment_collector_reference');
   }catch(e){parsed.collector_reference_error={code:e.code||'source_timeout_or_network_error',message:e.message};}
  }
  return parsed;
 }
 throw new LookupError('county_adapter_not_enabled','Direct county assessment adapter is not enabled.',422);
}
