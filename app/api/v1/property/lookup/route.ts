// @ts-nocheck
import {env} from 'cloudflare:workers';
import {makeManagedBrowser} from '../../../../../lib/live/managed-browser.mjs';
import {lookup,validateInput,readBounded} from '../../../../../lib/live/router.mjs';
export const dynamic='force-dynamic';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(request:Request){try{if(!request.headers.get('content-type')?.includes('application/json'))return reply({status:'error',error:{code:'unsupported_media_type',message:'Send application/json.'}},415);const bytes=await readBounded(request,2048);let input;try{input=JSON.parse(new TextDecoder().decode(bytes))}catch{return reply({status:'error',error:{code:'invalid_json',message:'Body must contain valid JSON.'}},400)}validateInput(input);const result=await lookup(input,fetch,{managedBrowser:makeManagedBrowser(env)});return reply(result,result.status==='not_found'?404:result.status==='blocked'?503:result.status==='error'?502:200);}catch(e){return reply({status:'error',error:{code:e.code||'internal_error',message:e.code?e.message:'Lookup could not be completed.'}},e.code==='source_too_large'?413:e.http||500)}}
export async function GET(){return reply({message:'Submit a JSON request with POST.',endpoint:'/api/v1/property/lookup',example:{county:'allegheny-pa',parcel_id:'0002-B-00051-0000-00',include_pdf:true}},405)}
