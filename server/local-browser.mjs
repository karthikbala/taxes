import {captureCode} from '../lib/live/managed-browser.mjs';
import {approvedSource} from '../lib/reliability/sources.mjs';
import {readManagedPdf} from '../lib/live/managed-pdf.mjs';
import {captureOsceolaAppraiser,osceolaSearchUrl} from '../lib/client/osceola-recovery.mjs';
import {osceolaLiabilityCaptureCode,osceolaReportUrl,osceolaAccount} from '../lib/client/osceola-liabilities.mjs';
import {miamiDeedCaptureCode,miamiDeedUrl,normalizeMiamiDeedFolio} from '../lib/client/miami-deed-probe.mjs';
/** Optional Chromium; fixed reviewed code only. No source or caller-provided scripts. */
export function makeLocalBrowser(env){
 if(env.TAXES_LOCAL_BROWSER_ENABLED!=='1')return null;
 return async({url,county,includePdf,annualOnly,profile,input,account,folio,signal,deadline=Date.now()+120000})=>{
  approvedSource(county,url);
  const appraiser=profile==='osceola-appraiser'&&county==='osceola-fl'&&url===osceolaSearchUrl;
  const reports=profile==='osceola-liability-reports'&&county==='osceola-fl'&&url===osceolaReportUrl;
  const deed=profile==='miami-deed-discovery'&&county==='miami-dade-fl'&&url===miamiDeedUrl;
  if(profile&&!appraiser&&!reports&&!deed)return null;
  if(reports)osceolaAccount(account);if(deed)normalizeMiamiDeedFolio(folio);
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true,chromiumSandbox:true});
  const abort=()=>{browser.close().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,Math.max(1,Math.min(120000,deadline-Date.now())));
  try{
   const context=await browser.newContext({acceptDownloads:false,ignoreHTTPSErrors:false});
   await context.route('**/*',route=>{try{approvedSource(county,route.request().url());return route.continue();}catch{return route.abort();}});
   const page=await context.newPage();let stdout='';
   // Capture code is generated exclusively by our reviewed adapter.
   const execute=async({code})=>{let output='';const logger={log:value=>{output+=String(value)+'\n';}};await new (Object.getPrototypeOf(async function(){}).constructor)('page','console',code)(page,logger);return {stdout:output,success:true,exitCode:0};};
   if(appraiser)return await captureOsceolaAppraiser(input,execute,{deadline,signal});
   stdout=(await execute({code:reports?osceolaLiabilityCaptureCode(account):deed?miamiDeedCaptureCode(folio):captureCode(url,includePdf,annualOnly)})).stdout;
   const line=stdout.split('\n').find(l=>l.startsWith('INVISIA_RESULT='));if(!line)throw Object.assign(new Error('No complete local source capture.'),{code:'managed_source_incomplete'});
   const capture=JSON.parse(line.slice(15));
   approvedSource(county,capture.url);
   if(capture.pdf)capture.pdf.base64=await readManagedPdf({sourceUrl:capture.url,...capture.pdf,deadline,signal},execute);
   return capture;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);await browser.close();}
 };
}
