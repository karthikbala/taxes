const folio=value=>String(value??'').replace(/[^0-9]/g,'');
const fail=message=>{throw Object.assign(new Error(message),{code:'selected_property_unavailable'});};
const ownerText=owner=>typeof owner==='string'?owner:owner?.name||owner?.ownerName;
export function selectedPropertyOrder(neighbors,property,sourceOrder){
 const result=neighbors?.NeighboringProperties,id=folio(property?.folio);
 if(!/^\d{13}$/.test(id)||!result?.properties?.some(p=>folio(p.folio)===id))fail('The selected parcel is not in this neighbour result. Run a new neighbour check.');
 if(!property?.address?.trim())fail('This parcel has no usable published address; no address lookup was started.');
 if(property.spatial_relation==='SAME_BUILDING'&&!property.unit?.trim())fail('The selected condominium record has no published unit; no ambiguous lookup was started.');
 const owner=(property.matching_owner_names||[]).find(ownerText)||(property.comparison_names||[]).find(ownerText)||(property.owners||[]).find(ownerText);
 if(!ownerText(owner)?.trim())fail('The selected parcel has no usable published owner name.');
 return {scrap_order_id:sourceOrder.scrap_order_id,address:property.address.trim()+(property.unit?' UNIT '+property.unit.trim():''),ownerName:ownerText(owner).trim(),county:sourceOrder.county,transactionType:sourceOrder.transactionType,state:sourceOrder.state||'FL'};
}
export function selectedParcelCheck(response,expectedFolio){
 const expected=folio(expectedFolio),record=response?.scrapTaxOrderRequest;
 const observed=[record?.PropertyInformation?.ParcelNumber,response?.ExtractionMetadata?.match?.parcel_id].map(folio);
 if(!/^\d{13}$/.test(expected)||!observed.length||observed.some(v=>!/^\d{13}$/.test(v)))return {verified:false,message:'The selected parcel could not be independently confirmed in this response. See the JSON and source errors.'};
 if(observed.some(v=>v!==expected))return {verified:false,message:'The lookup returned a different parcel from the clicked tile. Its details are withheld; the raw response remains available in JSON.'};
 return {verified:true,message:'Selected parcel verified: '+expected};
}
