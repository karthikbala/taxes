import {managedPreflight} from './access.mjs';
import {makeManagedBrowser} from '../live/managed-browser.mjs';
import {miamiDeedUrl,summarizeDeedCapture} from './miami-deed-probe.mjs';
export async function discoverMiamiDeed(env,{signal,requestId}={}){
 const ready=await managedPreflight(env);
 if(!ready.ready)throw Object.assign(new Error('Source access entitlement or approved test budget was not verified.'),{code:'managed_access_not_ready',http:503});
 const browser=makeManagedBrowser(env);
 if(!browser)throw Object.assign(new Error('Source access is not configured.'),{code:'managed_access_not_ready',http:503});
 const capture=await browser({url:miamiDeedUrl,county:'miami-dade-fl',includePdf:false,profile:'miami-deed-discovery',deadline:Date.now()+60000,signal});
 return {request_id:requestId,status:'source_discovery',collected_at:new Date().toISOString(),source:summarizeDeedCapture(capture),note:'This controlled access probe does not perform a property lookup or establish historical tax clearance.'};
}
