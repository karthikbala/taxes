import {resolveOsceola,osceolaEndpoint} from './osceola.mjs';
import {LookupError} from '../live/engine.mjs';

export const osceolaSearchUrl='https://search.property-appraiser.org/Search/MainSearch';
const tables=new Set(['ParcelMarket','PropertyValues','sales','Lnd_c','Bld','xfob']);
export function osceolaQueryUrl(value){
 const u=new URL(value);
 if(u.origin!==new URL(osceolaEndpoint).origin||!u.pathname.startsWith('/api/v1/')||!tables.has(u.pathname.slice('/api/v1/'.length))||u.username||u.password||u.hash||[...u.searchParams.keys()].some(k=>!['$filter','$count','$top','$skip','$skiptoken','$orderby'].includes(k)))throw new LookupError('source_url_rejected','Unexpected Osceola appraiser query.');
 return u.href;
}
const decode=response=>{
 const line=String(response?.stdout||'').split('\n').filter(l=>l.startsWith('INVISIA_OSCEOLA=')).at(-1);
 if(!response?.success||response.exitCode!==0||response.truncated||response.killed||!line)throw new LookupError('managed_source_incomplete','Osceola appraiser capture did not complete.');
 try{return JSON.parse(line.slice('INVISIA_OSCEOLA='.length));}catch{throw new LookupError('managed_source_incomplete','Osceola appraiser capture was not valid JSON.');}
};
export const osceolaStartCode=`await (async()=>{
await page.goto(${JSON.stringify(osceolaSearchUrl)},{waitUntil:'domcontentloaded',timeout:22000});
await page.waitForFunction(()=>!/just a moment|access denied|verify you are human/i.test(document.title),null,{timeout:15000});
console.log('INVISIA_OSCEOLA='+JSON.stringify({url:page.url(),ready:true}));
})();`;
export function osceolaQueryCode(value){
 const url=osceolaQueryUrl(value);
 return `await (async()=>{
const result=await page.evaluate(async url=>{
 const r=await fetch(url,{credentials:'include',headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
 const reader=r.body.getReader(),decoder=new TextDecoder();let body='',size=0;
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>160000){await reader.cancel();throw new Error('SOURCE_BODY_LIMIT');}body+=decoder.decode(part.value,{stream:true});}
 return {url:r.url,http_status:r.status,body:body+decoder.decode(),fetched_at:new Date().toISOString()};
},${JSON.stringify(url)});
console.log('INVISIA_OSCEOLA='+JSON.stringify(result));
})();`;
}
// The ordinary resolver drives queries and pagination inside one paid session.
// Source JSON is returned separately so the caller can independently replay all
// identity and coverage checks without another network request.
export async function captureOsceolaAppraiser(input,execute,{deadline=Infinity,signal}={}){
 const check=()=>{if(signal?.aborted||Date.now()>=deadline)throw new LookupError('lookup_cancelled','Osceola appraiser capture canceled.');};
 check();const start=decode(await execute({code:osceolaStartCode,language:'node'}));
 if(start.url!==osceolaSearchUrl||start.ready!==true)throw new LookupError('source_url_rejected','Osceola browser did not remain on the official search page.');
 const responses=[];
 const get=async(url,source_id)=>{
  check();if(responses.length>=30)throw new LookupError('source_too_large','Osceola appraiser query limit reached.');
  const expected=osceolaQueryUrl(url),response=decode(await execute({code:osceolaQueryCode(expected),language:'node'}));
  if(response.url!==expected||typeof response.body!=='string'||new TextEncoder().encode(response.body).length>160000)throw new LookupError('managed_source_incomplete','Osceola query URL or body differs from the requested source.');
  responses.push({...response,source_id});
  if([403,429].includes(response.http_status))throw new LookupError('source_blocked','Osceola appraiser challenged the managed browser.');
  if(response.http_status!==200)throw new LookupError('source_unavailable','Osceola appraiser returned HTTP '+response.http_status);
  return response.body;
 };
 const match=await resolveOsceola(input,get);
 if(match.parcel_id){
  const query=new URLSearchParams({'$filter':"strap eq '"+match.parcel_id+"'"});
  for(const [table,id]of [['ParcelMarket','osceola_legacy_lookup'],['PropertyValues','osceola_legacy_assessment']])await get(osceolaEndpoint+table+'?'+query,id);
 }
 check();return {url:osceolaSearchUrl,html:'',pdf:null,osceola_responses:responses};
}
export async function resolveCapturedOsceola(input,capture){
 if(capture?.url!==osceolaSearchUrl||!Array.isArray(capture.osceola_responses)||capture.osceola_responses.length>30)throw new LookupError('managed_source_incomplete','Osceola appraiser query capture is missing.');
 const rows=new Map();
 for(const r of capture.osceola_responses){const url=osceolaQueryUrl(r.url);if(rows.has(url)||typeof r.body!=='string'||new TextEncoder().encode(r.body).length>160000)throw new LookupError('managed_source_incomplete','Repeated or oversized Osceola query capture.');rows.set(url,r);}
 return resolveOsceola(input,async(url,id)=>{
  const row=rows.get(osceolaQueryUrl(url));
  if(!row||row.source_id!==id)throw new LookupError('managed_source_incomplete','The requested Osceola source query was not captured.');
  if([403,429].includes(row.http_status))throw new LookupError('source_blocked','Osceola source query remains blocked.');
  if(row.http_status!==200)throw new LookupError('source_unavailable','Osceola source query failed.');
  return row.body;
 });
}
