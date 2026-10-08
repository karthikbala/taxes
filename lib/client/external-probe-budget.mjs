import {reserveBrowser,reconcileBrowser} from '../live/browser-budget.mjs';
export async function debitScrapedoProbe(env){
 const lease=await reserveBrowser(env.DB,'miami-deed-scrapedo-external');
 await reconcileBrowser(env.DB,lease,null,'conservative_external_charge');
 return {lease_id:lease.id,source_url:'https://miamidade.realtdm.com/public/cases/List',maximum_allowance_usd:lease.reserve/1000,accounting:'Conservative external test allowance charged before dispatch; actual vendor receipt not established. No refund/reset is automatic.'};
}
