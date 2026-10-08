// @ts-nocheck
import {env} from 'cloudflare:workers';
import {authorized,managedPreflight} from '../../../../lib/client/access.mjs';
export async function GET(request:Request){if(!await authorized(request,env))return Response.json({error:{code:'unauthorized'}},{status:401});return Response.json({api:'ready',managed_source_access:await managedPreflight(env)},{headers:{'Cache-Control':'no-store'}});}
