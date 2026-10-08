// @ts-nocheck
import {env} from 'cloudflare:workers';
import {authorized} from '../../../../../lib/client/access.mjs';
import {discoverMiamiDeed} from '../../../../../lib/client/deed-discovery.mjs';
import {readBounded} from '../../../../../lib/live/engine.mjs';
export const dynamic='force-dynamic';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(request:Request){
 if(!await authorized(request,env))return reply({status:'error',error:{code:'unauthorized'}},401);
 try{
  if(!request.headers.get('content-type')?.includes('application/json'))return reply({status:'error',error:{code:'unsupported_media_type'}},415);
  const body=JSON.parse(new TextDecoder().decode(await readBounded(request,8192)));
  if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>k!=='folio'))return reply({status:'error',error:{code:'invalid_input',message:'Fixed source probe accepts an only an optional Miami folio.'}},400);
  return reply(await discoverMiamiDeed(env,{signal:request.signal,requestId:crypto.randomUUID(),folio:body.folio}));
 }catch(e){return reply({status:'error',error:{code:e.code||'source_probe_failed',message:e.code?e.message:'Source probe could not complete.'}},e.http||502);}
}
export function GET(){return reply({method:'POST',authentication:'Bearer POC access key'},405);}
