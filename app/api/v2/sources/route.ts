// @ts-nocheck
import {clientCapabilities} from '../../../../lib/client/profiles.mjs';
export function GET(){return Response.json(clientCapabilities,{headers:{'Cache-Control':'no-store'}});}
