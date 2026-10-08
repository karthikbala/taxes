// @ts-nocheck
import {capabilities} from '../../../../lib/live/router.mjs';
export function GET(){return Response.json(capabilities,{headers:{'Cache-Control':'no-store'}})}
