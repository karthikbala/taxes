// @ts-nocheck
import {env} from 'cloudflare:workers';
import {authorized} from '../../../../../lib/client/access.mjs';
import {debitScrapedoProbe} from '../../../../../lib/client/external-probe-budget.mjs';
import {readBounded} from '../../../../../lib/live/engine.mjs';
export async function POST(request:Request){
 if(!await authorized(request,env))return Response.json({error:{code:'unauthorized'}},{status:401});
 try{const body=JSON.parse(new TextDecoder().decode(await readBounded(request,256)));if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length)return Response.json({error:{code:'invalid_input'}},{status:400});return Response.json(await debitScrapedoProbe(env),{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:{code:e.code||'budget_unavailable'}},{status:503});}
}
export function GET(){return Response.json({method:'POST',authentication:'Bearer access key'},{status:405});}
