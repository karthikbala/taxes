import {captureCode} from '../lib/live/managed-browser.mjs';
import {approvedSource} from '../lib/reliability/sources.mjs';
import {readManagedPdf} from '../lib/live/managed-pdf.mjs';
import {captureOsceolaAppraiser,osceolaSearchUrl} from '../lib/client/osceola-recovery.mjs';
import {osceolaLiabilityCaptureCode,osceolaReportUrl,osceolaAccount} from '../lib/client/osceola-liabilities.mjs';
import {miamiDeedCaptureCode,miamiDeedUrl,normalizeMiamiDeedFolio} from '../lib/client/miami-deed-probe.mjs';
// Security-check dependencies are browser assets, never authoritative data sources.
export function browserRequestAllowed(county,request){
 try{approvedSource(county,request.url());return true;}catch{}
 let url;try{url=new URL(request.url());}catch{return false;}
 if(!['miami-dade-fl','osceola-fl'].includes(county)||url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||url.hostname!=='challenges.cloudflare.com'||!/^\/(?:turnstile\/v0\/|cdn-cgi\/challenge-platform\/)/.test(url.pathname))return false;
 const type=request.resourceType();
 if(type==='document')try{return !!request.frame().parentFrame();}catch{return false;}
 return ['script','xhr','fetch','image','stylesheet','font'].includes(type);
}
/** Optional Chromium; fixed reviewed code only. No source or caller-provided scripts. */
export function makeLocalBrowser(env,{loadChromium=async()=> (await import('playwright')).chromium}={}){
 if(env.TAXES_LOCAL_BROWSER_ENABLED!=='1')return null;
 return async({url,county,includePdf,annualOnly,profile,input,account,folio,signal,deadline=Date.now()+120000})=>{
  approvedSource(county,url);
  const appraiser=profile==='osceola-appraiser'&&county==='osceola-fl'&&url===osceolaSearchUrl;
  const reports=profile==='osceola-liability-reports'&&county==='osceola-fl'&&url===osceolaReportUrl;
  const deed=profile==='miami-deed-discovery'&&county==='miami-dade-fl'&&url===miamiDeedUrl;
  if(profile&&!appraiser&&!reports&&!deed)return null;
  if(reports)osceolaAccount(account);if(deed)normalizeMiamiDeedFolio(folio);
  if(signal?.aborted||Date.now()>=deadline)throw Object.assign(new Error('Local browser request was cancelled or its deadline elapsed.'),{code:signal?.aborted?'lookup_cancelled':'lookup_deadline'});
  const executablePath=env.TAXES_LOCAL_BROWSER_EXECUTABLE_PATH;
  if(executablePath&&(!executablePath.startsWith('/')||/[\r\n\0]/.test(executablePath)))throw Object.assign(new Error('Local browser executable must be an absolute operator-configured path.'),{code:'local_browser_unavailable'});
  const chromium=await loadChromium();
  const browser=await chromium.launch({headless:true,chromiumSandbox:true,...(executablePath?{executablePath}:{})});
  const abort=()=>{browser.close().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,Math.max(1,Math.min(120000,deadline-Date.now())));
  try{
   const context=await browser.newContext({acceptDownloads:false,ignoreHTTPSErrors:false});
   await context.route('**/*',route=>browserRequestAllowed(county,route.request())?route.continue():route.abort());
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
