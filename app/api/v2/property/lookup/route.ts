// @ts-nocheck
import {env} from 'cloudflare:workers';
import {authorized,managedPreflight} from '../../../../../lib/client/access.mjs';
import {clientLookup} from '../../../../../lib/client/engine.mjs';
import {createLookupLogger} from '../../../../../lib/client/logging.mjs';
import {makeManagedBrowser} from '../../../../../lib/live/managed-browser.mjs';
import {readBounded} from '../../../../../lib/live/engine.mjs';
export const dynamic='force-dynamic';
const reply=(body,status=200,requestId=null)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(requestId?{'X-Request-ID':requestId}:{})}});
export async function POST(request:Request){
 const requestId=crypto.randomUUID(),started=Date.now(),log=createLookupLogger(requestId);
 log('client_api_started');
 const respond=(body,status=200)=>{log('client_api_completed',{http_status:status,status:body.ExtractionMetadata?.status||body.status,duration_ms:Date.now()-started,error_code:body.error?.code});return reply(body,status,requestId);};
 if(!await authorized(request,env))return respond({status:'error',error:{code:'unauthorized',message:'Supply a valid POC Bearer access key.'}},401);
 try{
  if(!request.headers.get('content-type')?.includes('application/json'))return respond({status:'error',error:{code:'unsupported_media_type',message:'Send application/json.'}},415);
  const bytes=await readBounded(request,8192);let input;
  try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{return respond({status:'error',error:{code:'invalid_json',message:'Invalid JSON.'}},400);}
  const browser=makeManagedBrowser(env);let preflight;
  const guarded=browser?async args=>{preflight??=await managedPreflight(env);if(!preflight.ready)throw Object.assign(new Error('Managed source access entitlement or test budget was not verified.'),{code:'managed_access_not_ready'});return browser(args);}:null;
  return respond(await clientLookup(input,fetch,{managedBrowser:guarded,signal:request.signal,requestId,log}));
 }catch(e){log('client_lookup_failed',{error_code:e.code||'internal_error',duration_ms:Date.now()-started});return respond({status:'error',error:{code:e.code||'internal_error',message:e.code?e.message:'Lookup could not complete.'}},e.http||500);}
}
export function GET(){return reply({endpoint:'/api/v2/property/lookup',method:'POST',authentication:'Bearer POC access key'},405);}
