import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{resolveMiami,normalizeMiamiAddress,addressMatches}from'../lib/client/miami.mjs';
import{resolveOsceola,enrichOsceola}from'../lib/client/osceola.mjs';
import{selectDetectedAddress,mailingDeliveryLines,deliveryAddressMatches}from'../lib/client/address-detection.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/client/cross-county-address-20261015.json',import.meta.url)));
const copy=x=>structuredClone(x);
function miamiGet(data,{mutate=(x)=>x}={}){const calls=[];return {calls,get:async url=>{const u=new URL(url),op=u.searchParams.get('Operation');calls.push(url);if(op==='GetOwners')return copy(data.index);assert.equal(op,'GetPropertySearchByFolio');const id=u.searchParams.get('folioNumber');assert.ok(data.details[id],id);return mutate(copy(data.details[id]),id,calls.filter(v=>new URL(v).searchParams.get('folioNumber')===id).length);}};}
function osceolaGet(data,{owner=data.owner_index,mutate=x=>x}={}){const map={ParcelMarket:data.raw.market,PropertyValues:data.raw.values,sales:data.raw.sales,Lnd_c:data.raw.land,Bld:data.raw.buildings,xfob:data.raw.extras},calls=[];return{calls,get:async url=>{calls.push(url);const u=new URL(url),table=u.pathname.split('/').at(-1);return mutate(copy(table==='ParcelMarket'&&u.searchParams.get('$filter').startsWith('contains(Owners,')?owner:map[table]),u);}};}

test('fresh Miami owner index Count:0 sentinel resolves a mailing address to the original condo folio',async()=>{
 const f=fixture.miami.jude,s=miamiGet(f),r=await resolveMiami(f.input,s.get);
 assert.equal(f.index.Count,0);assert.equal(f.index.Total,2);assert.equal(r.status,'MATCHED');assert.equal(r.parcel_id,'0132310520010');assert.equal(r.input_address_type,'mailing');assert.equal(r.owner_reference_candidates.length,2);
 assert.equal(r.raw.SiteAddress[0].Unit,'401');assert.equal(r.raw.MailingAddress.Address1,'202 MALLARD WAY');assert.equal(s.calls.length,3);
 const explicit=await resolveMiami({...f.input,addressType:'mailing'},miamiGet(f).get);assert.equal(explicit.parcel_id,r.parcel_id);
});
test('Miami site/unit flow remains exact while the same complete records test both roles',async()=>{
 const f=fixture.miami.jude;
 assert.equal((await resolveMiami({...f.input,address:'555 NE 15 ST UNIT 401'},miamiGet(f).get)).input_address_type,'site');
 for(const address of ['555 NE 15 ST UNIT 402','202 MALLARD WAY UNIT 2','555 NW 15 ST UNIT 401'])assert.equal((await resolveMiami({...f.input,address},miamiGet(f).get)).parcel_id,undefined);
});
test('fresh LEGACY mailing address identifies ten parcels and never fetches a selected annual bill',async()=>{
 const f=fixture.miami.legacy,s=miamiGet(f),r=await resolveMiami(f.input,s.get);
 assert.equal(r.status,'AMBIGUOUS');assert.equal(r.parcel_id,undefined);assert.equal(new Set(r.candidates.map(c=>c.parcel_id)).size,10);assert.equal(s.calls.length,11);
 const site=await resolveMiami({...f.input,address:'20 NE 10 ST'},miamiGet(f).get);assert.equal(site.parcel_id,'0101020301070');assert.equal(site.input_address_type,'site');
});
test('incomplete or contradictory Miami owner coverage and changed final identity cannot select a parcel',async()=>{
 const f=fixture.miami.jude;
 for(const mutate of [x=>{x.index.Total=3;},x=>{x.index.Count=1;},x=>{x.index.HasMore=true;},x=>{x.index.MinimumPropertyInfos[0].Strap=x.index.MinimumPropertyInfos[1].Strap;}]){const d=copy(f);mutate(d);assert.equal((await resolveMiami(d.input,miamiGet(d).get)).status,'SEARCH_INCOMPLETE');}
 for(const mutate of [x=>{x.PropertyInfo.FolioNumber='01-3231-052-0020';return x;},x=>{x.OwnerInfos=[{Name:'OTHER OWNER'}];return x;},(x,_id,n)=>{if(n===2)x.MailingAddress.Address1='203 MALLARD WAY';return x;}])await assert.rejects(resolveMiami(f.input,miamiGet(f,{mutate}).get),e=>e.code==='identity_mismatch');
});
test('fresh Osceola unique mailing/unit resolves the actual condo parcel and retains all certified native sections',async()=>{
 const f=fixture.osceola.unique,s=osceolaGet(f),r=await resolveOsceola(f.input,s.get);
 assert.equal(r.status,'MATCHED');assert.equal(r.parcel_id,'072528521600012090');assert.equal(r.input_address_type,'mailing');assert.equal(s.calls.length,7);
 const q=enrichOsceola(r.raw,r.parcel_id);assert.match(q.PropertyInformation.PropertyAddress,/1001 CELEBRATION AVE 209/);assert.match(q.PropertyInformation.MailingAddress,/UNIT 306/);assert.equal(q.PropertyInformation.Owners[0],'KORB FAMILY TRUST');assert.ok(q.AssessmentHistory.length>0);
 const wrong=await resolveOsceola({...f.input,address:'1941 HIGHWAY A1A UNIT 307'},osceolaGet(f).get);assert.equal(wrong.parcel_id,undefined);
});
test('Walmart owner discovery retains fifteen records with thirteen exact shared-PO-box matches',async()=>{
 const f=fixture.osceola.unique,s=osceolaGet(f,{owner:fixture.osceola.walmart}),r=await resolveOsceola({address:'PO BOX 8050 MS 0555',ownerName:'WAL-MART STORES EAST LP',addressType:'auto'},s.get);
 assert.equal(r.status,'AMBIGUOUS');assert.equal(r.parcel_id,undefined);assert.equal(r.candidates.length,13);assert.equal(r.owner_reference_candidates.length,15);assert.equal(s.calls.length,1);assert.ok(r.candidates.some(c=>/[A-Z]/.test(c.parcel_id)));
});
test('incomplete Osceola owner pagination, missing delivery fields and final owner/parcel drift fail closed',async()=>{
 const f=fixture.osceola.unique;
 for(const mutate of [x=>{x['@odata.count']=2;},x=>{delete x.value[0].MailAddr_1;},x=>{x['@odata.nextLink']='https://example.com/page';}]){const owner=copy(f.owner_index);mutate(owner);assert.equal((await resolveOsceola(f.input,osceolaGet(f,{owner}).get)).status,'SEARCH_INCOMPLETE');}
 for(const mutate of [(d,u)=>{if(u.searchParams.get('$filter').startsWith('strap eq'))d.value[0].strap='072528521600012091';return d;},(d,u)=>{if(u.searchParams.get('$filter').startsWith('strap eq'))d.value[0].Owners='OTHER OWNER';return d;}])await assert.rejects(resolveOsceola(f.input,osceolaGet(f,{mutate}).get),e=>e.code==='identity_mismatch');
});
test('cross-role selection deduplicates one parcel and refuses site-vs-mailing priority across different parcels',()=>{
 const candidate={parcel_id:'one',owner_matches_requested:true,verified_address_match:true,address_match_type:'site'};
 const same=selectDetectedAddress([candidate,{...candidate,address_match_type:'mailing'}]);assert.equal(same.status,'MATCHED');assert.deepEqual(same.matched_address_types,['site','mailing']);
 assert.equal(selectDetectedAddress([candidate,{...candidate,parcel_id:'two',address_match_type:'mailing'}]).status,'AMBIGUOUS');assert.equal(selectDetectedAddress([candidate],{complete:false}).status,'SEARCH_INCOMPLETE');
});
test('postal delivery normalization preserves units and mail stops, including unlabeled native trailing units',()=>{
 assert.deepEqual(mailingDeliveryLines(['ATTN TAX DEPT','PO BOX 8050 MS 0555','']),['PO BOX 8050 MS 0555']);assert.deepEqual(mailingDeliveryLines(['123 MAIN ST','APT 2']),['123 MAIN ST APT 2']);
 assert.equal(deliveryAddressMatches(normalizeMiamiAddress('1900 N BAYSHORE DR UNIT 512'),normalizeMiamiAddress('1900 N BAYSHORE DR 512'),addressMatches),true);
 assert.equal(deliveryAddressMatches(normalizeMiamiAddress('1900 N BAYSHORE DR UNIT 513'),normalizeMiamiAddress('1900 N BAYSHORE DR 512'),addressMatches),false);
});
test('automatic discovery preserves reordered owner names through a verified county-published canonical name',async()=>{
 const f=fixture.miami.jude,source=miamiGet(f),requested='JACOB PATRICK JUDE';
 const r=await resolveMiami({address:'555 NE 15 ST UNIT 401',ownerName:requested,addressType:'auto'},async url=>{
  const u=new URL(url);
  if(u.searchParams.get('Operation')==='GetOwners'&&u.searchParams.get('ownerName')===requested)return {Completed:true,Total:0,MinimumPropertyInfos:[]};
  if(u.searchParams.get('Operation')==='GetAddress')return JSON.parse(readFileSync(new URL('./fixtures/client/miami-address-search-source.json',import.meta.url)));
  return source.get(url);
 });assert.equal(r.status,'MATCHED');assert.equal(r.parcel_id,'0132310520010');
 const read=name=>JSON.parse(readFileSync(new URL('./fixtures/client/'+name,import.meta.url))),market=read('osceola-market-2026-10-08.json');
 const tables={PropertyValues:read('osceola-certified-values-2026-10-08.json'),sales:read('osceola-sales-2026-10-08.json'),Lnd_c:read('osceola-lnd_c-2026-10-08.json'),Bld:read('osceola-bld-2026-10-08.json'),xfob:read('osceola-xfob-2026-10-08.json')};
 const other=await resolveOsceola({address:'3250 VINELAND',ownerName:'LP EAST STORES WAL-MART',addressType:'auto'},async url=>{
  const u=new URL(url),table=u.pathname.split('/').at(-1),filter=u.searchParams.get('$filter');
  if(table==='ParcelMarket'&&filter.startsWith('contains(Owners,'))return filter.includes('LP EAST STORES')?{'@odata.count':0,value:[]}:copy(fixture.osceola.walmart);
  return copy(table==='ParcelMarket'?market:tables[table]);
 });assert.equal(other.status,'MATCHED');assert.equal(other.parcel_id,'022528285000010010');
});
