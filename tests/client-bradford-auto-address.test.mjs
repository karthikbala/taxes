import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {load} from 'cheerio';
import {resolveBradford,enrichBradford} from '../lib/client/bradford.mjs';
import {validateClientInput,serializeClientRecord} from '../lib/client/contract.mjs';
import {clientLookup} from '../lib/client/engine.mjs';

const fixture=name=>readFileSync(new URL('./fixtures/client/bradford-'+name,import.meta.url),'utf8');
const cases={
 callahan:{address:'8280 SE SWEET BAY DR',ownerName:'CALLAHAN JAMES R & CHARLOTTE',parcel:'05194-0-00000'},
 fletcher:{address:'8130 SW 50TH PATH',ownerName:'FLETCHER CARRIE',parcel:'00420-0-00200'},
 boyd:{address:'6557 SE CR 21B, Keystone Heights',ownerName:'BAKER BOYD D REVOC TRUST',parcel:'05632-0-00000'},
 deborah:{address:'334 SE 28TH ST, MELROSE, FL 32666',ownerName:'BAKER DEBORAH K',parcel:'06203-C-01400'}
};
const order=name=>({scrap_order_id:'auto-'+name,county:'bradford-fl',transactionType:'REFI',...cases[name]});
const input=name=>{const{parcel,...o}=order(name);return o;};
function source(name,overrides={}){
 const mailing=['callahan','fletcher'].includes(name),calls=[];
 const detail=fixture(name+(mailing?'-owner-detail.html':'-detail.html'));
 const get=async(url,id)=>{
  calls.push(id);
  if(overrides[id]!==undefined){if(overrides[id] instanceof Error)throw overrides[id];return overrides[id];}
  if(id==='bradford_address_search')return fixture(name+(mailing?'-negative.html':'-search.html'));
  if(id==='bradford_owner_reference_search')return fixture(name+(mailing?'-owner-search.html':'-search.html'));
  if(id==='bradford_assessment')return detail;
  if(id.endsWith('05379000000'))return fixture('callahan-owner-detail-b.html');
  if(id.startsWith('bradford_owner_reference_')||id.startsWith('bradford_site_reference_'))return detail;
  throw Error('Optional card unavailable');
 };
 return {get,calls};
}
function countRows(html,mutate){
 const $=load(html),table=$('table.resultstable');mutate($,table);
 const n=table.find('tr').filter((_,e)=>$(e).children('td').eq(1).is('[onclick]')).length;
 $('input[name="iRecordCount"]').attr('value',String(n));
 return $.html().replace(/\(\d+ Total\)/g,'('+n+' Total)');
}

for(const name of ['callahan','fletcher','boyd','deborah'])test('default detection verifies exact '+name+' owner/parcel and preserves both addresses',async()=>{
 const s=source(name),r=await resolveBradford(input(name),s.get),record=enrichBradford(r.raw,r.parcel_id);
 assert.equal(r.status,'MATCHED');assert.equal(r.parcel_id,cases[name].parcel);assert.equal(r.requested_address_type,'auto');
 assert.equal(r.input_address_type,['callahan','fletcher'].includes(name)?'mailing':'site');
 assert.equal(r.match_method,'county_verified_owner_and_detected_address');assert.equal(r.owner_reference_status,'COMPLETE');
 assert.ok(s.calls.includes('bradford_address_search')&&s.calls.includes('bradford_owner_reference_search'));
 assert.ok(s.calls.every(id=>!id.startsWith('mailing_site_')),'Automatic Bradford detection never changes counties');
 assert.deepEqual(record.PropertyInformation.Owners,[cases[name].ownerName]);
 const result=serializeClientRecord(input(name),{match:{...r,raw:undefined}});
 assert.equal(result.ExtractionMetadata.match.input_address_type,r.input_address_type);assert.equal(result.address,cases[name].address);
 if(name==='fletcher'){assert.equal(record.PropertyInformation.PropertyAddress,'SW 180TH PL, BROOKER');assert.match(record.PropertyInformation.MailingAddress,/8130 SW 50TH PATH/);}
 if(name==='deborah')assert.deepEqual(r.matched_address_types,['site','mailing'],'Same parcel matching both roles remains one identity');
});

test('both unique address roles pointing to different exact-owner parcels remain ambiguous',async()=>{
 const ownerSearch=fixture('callahan-owner-search.html').replaceAll('CHARLOTTE G','CHARLOTTE');
 const siteSearch=countRows(ownerSearch,($,t)=>{t.find('tr.hv').remove();t.find('tr').filter((_,e)=>$(e).children('td').eq(1).is('[onclick]')).each((_,e)=>$(e).children('td').eq(3).text(cases.callahan.address));});
 const $=load(fixture('callahan-owner-detail-b.html').replaceAll('CHARLOTTE G','CHARLOTTE'));
 $('#gisDetails_OwnerContent tr').eq(2).find('td').html('999 OTHER RD<br>STARKE, FL 32091');
 $('#gisDetails_OwnerContent tr').filter((_,e)=>$(e).text().trim().startsWith('Site:')).find('td').html('<span>Site:</span> '+cases.callahan.address+', STARKE');
 const s=source('callahan',{bradford_address_search:siteSearch,bradford_owner_reference_search:ownerSearch,bradford_site_reference_05379000000:$.html(),bradford_owner_reference_05379000000:$.html()});
 const r=await resolveBradford(input('callahan'),s.get);assert.equal(r.status,'AMBIGUOUS');assert.equal(r.parcel_id,undefined);
 assert.deepEqual(new Set(r.candidates.filter(c=>c.verified_address_match&&c.owner_matches_requested).map(c=>c.parcel_id)),new Set(['05194-0-00000','05379-0-00000']));
 assert.ok(!s.calls.includes('bradford_assessment'));
});

test('reordered exact owners returned by discovery still prevent false cross-role uniqueness',async()=>{
 const reorder=html=>html.replaceAll('CALLAHAN JAMES R & CHARLOTTE','JAMES R CALLAHAN & CHARLOTTE');
 const search=countRows(fixture('callahan-owner-search.html'),($,t)=>{t.find('tr.hv').remove();t.find('tr').filter((_,e)=>$(e).children('td').eq(1).is('[onclick]')).each((_,e)=>$(e).children('td').eq(3).text(cases.callahan.address));});
 const $=load(fixture('callahan-owner-detail-b.html').replaceAll('CHARLOTTE G','CHARLOTTE'));
 $('#gisDetails_OwnerContent tr').eq(2).find('td').html('999 OTHER RD<br>STARKE, FL 32091');
 $('#gisDetails_OwnerContent tr').filter((_,e)=>$(e).text().trim().startsWith('Site:')).find('td').html('<span>Site:</span> '+cases.callahan.address+', STARKE');
 const s=source('callahan',{bradford_address_search:search.replaceAll('CHARLOTTE G','CHARLOTTE'),bradford_owner_reference_search:reorder(fixture('callahan-owner-search.html')),bradford_owner_reference_05194000000:reorder(fixture('callahan-owner-detail.html')),bradford_site_reference_05379000000:$.html()});
 const r=await resolveBradford(input('callahan'),s.get);
 assert.equal(r.status,'AMBIGUOUS');assert.equal(r.parcel_id,undefined);assert.ok(!s.calls.includes('bradford_assessment'));
 assert.ok(r.candidates.some(c=>c.parcel_id==='05194-0-00000'&&c.owner_matches_requested&&c.verified_address_match));
});

test('complete owner discovery retains rows even when none matches the mailing street',async()=>{
 const s=source('fletcher'),r=await resolveBradford({...input('fletcher'),address:'8131 SW 50TH PATH'},s.get);
 assert.equal(r.status,'NOT_FOUND');assert.equal(r.owner_reference_status,'COMPLETE');assert.equal(r.owner_reference_candidates.length,1);assert.equal(r.owner_reference_candidates[0].parcel_id,cases.fletcher.parcel);
});

test('every claimed detected role is revalidated on the final detail',async()=>{
 const s=source('deborah',{bradford_assessment:fixture('deborah-detail.html').replace('334 SE 28TH ST','335 SE 28TH ST')});
 await assert.rejects(resolveBradford(input('deborah'),s.get),e=>e.code==='identity_mismatch');assert.ok(!s.calls.includes('bradford_property_card'));
});

test('multiple exact-owner mailing parcels never select the first result',async()=>{
 const s=source('callahan',{bradford_owner_reference_search:fixture('callahan-owner-search.html').replaceAll('CHARLOTTE G','CHARLOTTE'),bradford_owner_reference_05379000000:fixture('callahan-owner-detail-b.html').replaceAll('CHARLOTTE G','CHARLOTTE')});
 const r=await resolveBradford(input('callahan'),s.get);assert.equal(r.status,'AMBIGUOUS');assert.equal(r.parcel_id,undefined);assert.ok(!s.calls.includes('bradford_assessment'));
});

test('incomplete site or owner searches block automatic selection, even with a verified site',async()=>{
 for(const id of ['bradford_address_search','bradford_owner_reference_search']){
  const s=source('deborah',{[id]:fixture('deborah-search.html').replace('(1 Total)','(2 Total)')});
  const r=await resolveBradford(input('deborah'),s.get);assert.equal(r.status,'SEARCH_INCOMPLETE');assert.equal(r.parcel_id,undefined);assert.ok(!s.calls.includes('bradford_assessment'));
 }
 const s=source('deborah',{bradford_owner_reference_search:Object.assign(Error('Blocked source'),{code:'source_blocked'})});
 const r=await resolveBradford(input('deborah'),s.get);assert.equal(r.status,'SEARCH_INCOMPLETE');assert.equal(r.owner_reference_error.code,'source_blocked');assert.ok(!s.calls.includes('bradford_assessment'));
});

test('bounded owner search retains discovered rows without an unbounded detail fanout',async()=>{
 const many=countRows(fixture('fletcher-owner-search.html'),($,t)=>{const row=t.find('tr.hv').first();for(let i=1;i<6;i++){const c=row.clone();c.children('td').eq(1).text('0042'+i+'-0-00200');t.append(c);}});
 const s=source('fletcher',{bradford_owner_reference_search:many}),r=await resolveBradford(input('fletcher'),s.get);
 assert.equal(r.status,'SEARCH_INCOMPLETE');assert.equal(r.owner_reference_candidates.length,6);assert.equal(r.parcel_id,undefined);assert.equal(s.calls.length,2);
});

test('wrong owner, unit, number or direction cannot satisfy automatic mailing matching',async()=>{
 for(const fields of [{ownerName:'UNRELATED OWNER'},{unit:'2'},{address:'8131 SW 50TH PATH'},{address:'8130 SE 50TH PATH'}]){
  const s=source('fletcher'),r=await resolveBradford({...input('fletcher'),...fields},s.get);assert.notEqual(r.status,'MATCHED');assert.equal(r.parcel_id,undefined);assert.ok(!s.calls.includes('bradford_assessment'));
 }
 const s=source('fletcher'),r=await resolveBradford({...input('fletcher'),address:'8130 SW 50TH PATH UNIT 1',unit:'2'},s.get);assert.equal(r.status,'SEARCH_INCOMPLETE');assert.equal(s.calls.length,0);
});

test('the selected detail revalidates parcel, exact owner and detected address before enrichment',async()=>{
 const detail=fixture('fletcher-owner-detail.html');
 for(const bad of [detail.replaceAll('00420-0-00200','00420-0-00201'),detail.replaceAll('FLETCHER CARRIE','OTHER OWNER'),detail.replaceAll('8130 SW 50TH PATH','8131 SW 50TH PATH')]){
  const s=source('fletcher',{bradford_assessment:bad});await assert.rejects(resolveBradford(input('fletcher'),s.get),e=>e.code==='identity_mismatch');assert.ok(!s.calls.includes('bradford_property_card'));
 }
});

test('default auto contract is Bradford-only and explicit overrides remain available',()=>{
 assert.equal(validateClientInput(input('fletcher')).addressType,'auto');
 for(const addressType of ['auto','site','mailing'])assert.equal(validateClientInput({...input('fletcher'),addressType}).addressType,addressType);
 for(const addressType of ['auto','mailing'])assert.throws(()=>validateClientInput({...input('fletcher'),county:'miami-dade-fl',addressType}),e=>e.code==='unsupported_address_type');
 assert.equal(validateClientInput({...input('fletcher'),county:'miami-dade-fl'}).addressType,undefined);
});

test('ambiguous auto result survives client serialization and never dispatches collector work',async()=>{
 const search=fixture('callahan-owner-search.html').replaceAll('CHARLOTTE G','CHARLOTTE');
 const result=await clientLookup(input('callahan'),async(url,options)=>{
  assert.equal(new URL(url).hostname,'www.bradfordappraiser.com','No collector request may precede unique identity');
  const form=new URLSearchParams(options.body);
  const html=url.includes('recordSearch')?(form.get('OwnerName')?search:fixture('callahan-negative.html')):fixture(form.get('tempPIN')==='05379000000'?'callahan-owner-detail-b.html':'callahan-owner-detail.html').replaceAll('CHARLOTTE G','CHARLOTTE');
  return new Response(html);
 });
 assert.equal(result.ExtractionMetadata.match.status,'AMBIGUOUS');assert.equal(result.ExtractionMetadata.match.requested_address_type,'auto');assert.equal(result.scrapTaxOrderRequest.PropertyInformation.ParcelNumber,null);
});


test('reordered request cannot treat an empty noncanonical owner query as exhaustive',async()=>{
 const s=source('deborah',{bradford_owner_reference_search:fixture('callahan-negative.html')});
 const r=await resolveBradford({...input('deborah'),ownerName:'DEBORAH BAKER K'},s.get);
 assert.equal(r.status,'SEARCH_INCOMPLETE');assert.equal(r.parcel_id,undefined);assert.equal(r.owner_query_status,'NOT_FOUND');assert.ok(!s.calls.includes('bradford_assessment'));
});
