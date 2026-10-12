import {publicEncrypt,constants} from 'node:crypto';
import {LookupError,readBounded} from '../live/engine.mjs';
import {reserveBrowser,reconcileBrowser} from '../live/browser-budget.mjs';
import {stagingLedgerBypass} from '../live/browser-policy.mjs';
export const osceolaClerkApi='https://officialrecords.osceolaclerk.org/browserviewtd/api/search';
// Public encryption key published in the Clerk's Scripts/app/services.js.
const publicKey='-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDXBPCKXRqaD74rYrPXU/DA4Z5HmJbNivwCYijae6QXu/QLqS3GbyGrxkrEmdODbYWOLJfWBvaQSALcolSyKQUvtkjzg61bJC2/xNk4HTHFrA4uAMMvC+49RlSgtEm5dI10+YOp0TGId1d4E0Ey0RDQxNWaev2TeleyipADuctnqwIDAQAB\n-----END PUBLIC KEY-----';
export function clerkParcel(value){const p=String(value??'').replaceAll('-','');if(!/^\d{18}$/.test(p))throw new LookupError('invalid_parcel','A verified 18-digit Osceola parcel is required.');return p;}
export function clerkCriteria(value){const parcel=clerkParcel(value),encrypt=s=>publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_PADDING},Buffer.from(s)).toString('base64');return {ParcelNumber:encrypt(parcel),MaxRows:encrypt(' 100'),RowsPerPage:' 0',StartRow:' 0'};}
export function unavailableClerk(status='UNAVAILABLE'){return {status,source_url:osceolaClerkApi,query_verified:false,coverage:'UNAVAILABLE',scope:'OSCEOLA_CLERK_PUBLIC_TAX_DEED_CASE_INDEX',record_count:null,records:[],historicalClearanceEstablished:false,note:'No complete independent Clerk parcel query was verified.'};}
export function parseOsceolaClerk(capture,expected){
 const parcel=clerkParcel(expected),q=capture?.query,rows=capture?.rows;
 const fail=()=>{throw new LookupError('clerk_search_unverified','The Clerk query, parcel identity or counted results were not verified.');};
 if(capture?.source_url!==osceolaClerkApi||capture.http_status!==200||capture.requested_parcel!==parcel||!q||JSON.stringify(Object.keys(q).sort())!==JSON.stringify(['MaxRows','ParcelNumber','RowsPerPage','StartRow'].sort())||q.ParcelNumber!==parcel||q.MaxRows!==100||q.RowsPerPage!==0||q.StartRow!==0||!Array.isArray(rows)||rows.length>100)fail();
 let total=0;const seen=new Set(),records=[];
 for(const row of rows){if(!row||clerkParcel(row.strap_num)!==parcel||!row.deed_id||!row.deed_status||!Number.isSafeInteger(row._total_rows)||row._total_rows<rows.length||row._start_row!==1||row._end_row!==rows.length||seen.has(row.deed_id))fail();if(records.length&&total!==row._total_rows)fail();total=row._total_rows;seen.add(row.deed_id);const{_headers,_start_row,_end_row,_total_rows,...fields}=row;records.push({source_row:records.length+1,fields});}
 const complete=total===records.length;
 return {...unavailableClerk(),status:complete?(total?'RECORDS_FOUND':'INSPECTED_EMPTY'):'SEARCH_INCOMPLETE',requested_parcel:parcel,query_verified:true,coverage:complete?'COMPLETE_PUBLIC_QUERY':'PARTIAL_PUBLIC_QUERY',record_count:total,captured_count:records.length,records,query:q,currentRedemptionQuote:null,note:'The exact-parcel public Clerk query used no party, certificate, status or sale-date filter. The native 100-row limit is checked against the returned total; excess records remain incomplete. Clerk case status and bid amounts are not current Collector redemption amounts. Published results do not establish full historical or title clearance.'};
}
// One native POST per lookup, no render, retries or arbitrary target URLs. Charge
// the existing ledger conservatively; Scrape.do credits are not Firecrawl credits.
export function makeScrapedoClerk(env,{fetcher=fetch}={}){
 if(!env?.DB||!env.SCRAPEDO_API_KEY||env.INVISIA_OSCEOLA_CLERK_ENABLED!=='1')return null;
 return async({parcel,deadline=Infinity,signal})=>{
  const normalized=clerkParcel(parcel);if(signal?.aborted||deadline<=Date.now())throw new LookupError('lookup_cancelled','Clerk query canceled before dispatch.');
  const bypass=stagingLedgerBypass(env),lease=bypass?null:await reserveBrowser(env.DB,'osceola-clerk-scrapedo');let dispatched=false,status='failed';
  try{
   const url=new URL('https://api.scrape.do/');for(const[k,v]of Object.entries({token:env.SCRAPEDO_API_KEY,url:osceolaClerkApi,super:'true',geoCode:'us',render:'false',customHeaders:'true',disableRetry:'true',timeout:'15000'}))url.searchParams.set(k,v);
   const timer=AbortSignal.timeout(Math.max(1,Math.min(20000,deadline-Date.now()))),query={ParcelNumber:normalized,MaxRows:100,RowsPerPage:0,StartRow:0},body=JSON.stringify(clerkCriteria(normalized));dispatched=true;
   const r=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body,signal:signal?AbortSignal.any([timer,signal]):timer});
   const bytes=await readBounded(r,1000000),raw=new TextDecoder().decode(bytes),cost=Number(r.headers.get('scrape.do-request-cost')),remaining=r.headers.get('scrape.do-remaining-credits');
   if(!r.ok||!r.headers.has('scrape.do-request-cost')||!Number.isInteger(cost)||cost<0||cost>25)throw new LookupError('clerk_source_unavailable','Clerk response or provider cost receipt was not accepted.');
   let rows;try{rows=JSON.parse(raw);}catch{throw new LookupError('clerk_source_unavailable','Clerk response was not JSON.');}
   const capture={source_url:osceolaClerkApi,http_status:r.status,requested_parcel:normalized,query,rows,raw,fetched_at:new Date().toISOString(),provider:{name:'Scrape.do',request_credits:cost,remaining_credits:remaining,render:false,retries:false}};
   parseOsceolaClerk(capture,normalized);status='completed';return capture;
  }catch(e){throw e instanceof LookupError?e:new LookupError('clerk_source_unavailable','The independent Clerk request did not complete; no retry was started.');}
  finally{if(lease)await reconcileBrowser(env.DB,lease,dispatched?null:0,'external_'+status);else console.log(JSON.stringify({event:'staging_external_probe_completed',county:'osceola-fl',provider:'Scrape.do',status,dispatched,ledger_bypassed:true}));}
 };
}
