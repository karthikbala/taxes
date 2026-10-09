// @ts-nocheck
import {env} from 'cloudflare:workers';
import {authorized} from '../../../../../lib/client/access.mjs';
import {extractNeighborProperties} from '../../../../../lib/client/neighbors.mjs';
import {readBounded} from '../../../../../lib/live/engine.mjs';
import {createLookupLogger} from '../../../../../lib/client/logging.mjs';
export const dynamic='force-dynamic';
const reply=(body,status=200,id=null)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(id?{'X-Request-ID':id}:{})}});
export async function POST(request:Request){
 const requestId=crypto.randomUUID(),log=createLookupLogger(requestId);if(!await authorized(request,env))return reply({status:'error',error:{code:'unauthorized',message:'Supply a valid POC Bearer access key.'}},401,requestId);
 try{
  if(!request.headers.get('content-type')?.includes('application/json'))return reply({status:'error',error:{code:'unsupported_media_type'}},415,requestId);
  const bytes=await readBounded(request,8192);let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply({status:'error',error:{code:'invalid_json'}},400,requestId);}
  log('client_lookup_started',{county:'miami-dade-fl'});const result=await extractNeighborProperties(input,fetch,{signal:request.signal,requestId,log});log('client_lookup_completed',{status:result.status,duration_ms:result.ExtractionMetadata?.duration_ms});return reply(result,200,requestId);
 }catch(e){log('client_lookup_failed',{error_code:e.code||'internal_error'});return reply({status:'error',error:{code:e.code||'internal_error',message:e.code?e.message:'Neighbor lookup could not complete.'}},e.http||502,requestId);}
}
export function GET(){return reply({endpoint:'/api/v2/property/neighbors',method:'POST',authentication:'Bearer POC access key'},405);}
