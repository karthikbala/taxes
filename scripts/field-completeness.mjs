// Observational field inventory: availability is not proof of correctness.
// Never writes to, fills, or changes the extracted record.
export function inspectFields(result,mode){
 const rows=[];
 const visit=(value,path)=>{
  if(value===null||value===undefined){rows.push({path,status:'UNAVAILABLE'});return;}
  if(Array.isArray(value)){if(!value.length)rows.push({path,status:'EMPTY_ARRAY'});else value.forEach((v,i)=>visit(v,`${path}[${i}]`));return;}
  if(typeof value==='object'){const entries=Object.entries(value);if(!entries.length)rows.push({path,status:'EMPTY_OBJECT'});else for(const [key,v]of entries)visit(v,`${path}.${key}`);return;}
  rows.push({path,status:typeof value==='string'&&!value.trim()?'EMPTY_STRING':'PRESENT',...(value===0||typeof value==='string'&&/^-?0(?:\.0+)?$/.test(value)?{explicit_zero:true}:{})});
 };
 if(mode==='address')visit(result.scrapTaxOrderRequest,'scrapTaxOrderRequest');
 else for(const name of ['property','assessment','taxes','documents',...(mode==='state_roll'?['raw_fields']:[])]){
  const notRequested=(mode==='state_roll'&&(name==='taxes'||name==='documents'))||(mode==='collector'&&name==='assessment');
  if(notRequested)rows.push({path:name,status:'NOT_REQUESTED'});else visit(result[name],name);
 }
 const counts={};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;
 return {counts,explicit_zero_count:rows.filter(r=>r.explicit_zero).length,fields:rows,notes:['PRESENT means returned, not independently verified.','UNAVAILABLE requires source/parser review; it does not establish that the source is blank.','EMPTY_ARRAY does not prove absence or complete historical coverage.','NOT_REQUESTED is scope-specific and is not a retrieval failure.']};
}
