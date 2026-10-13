import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function validateAcceptance(manifest,approval,origin){
 if(!Array.isArray(manifest.cases)||manifest.cases.length!==36)throw Error('Acceptance requires exactly 36 independently verified cases.');
 for(const county of ['miami-dade-fl','osceola-fl','bradford-fl'])if(manifest.cases.filter(c=>c.input?.county===county).length!==12)throw Error('Acceptance requires twelve cases per county.');
 if(new Set(manifest.cases.map(c=>c.id)).size!==36)throw Error('Case IDs must be unique.');
 if(approval.origin!==origin||approval.max_jobs!==36||!approval.approved_by||Date.parse(approval.expires_at)<=Date.now())throw Error('A current operator approval for this exact origin and 36 jobs is required.');
 for(const c of manifest.cases){if(c.status!=='independently_verified'||!c.verified_by||!c.verified_at||!c.source_urls?.length||!c.expected?.length)throw Error('Every case needs an independent source baseline and exact field assertions.');for(const url of c.source_urls)if(new URL(url).protocol!=='https:')throw Error('Source evidence must use HTTPS.');}
}
export async function runAcceptance({manifest,approval,origin,key,out,fetcher=fetch,sleep=delay}){
 validateAcceptance(manifest,approval,origin);if(!key)throw Error('Load the API key privately into TAXES_ACCEPTANCE_KEY.');
 await mkdir(out,{recursive:true,mode:0o700});const evidence=[];
 const headers={Authorization:'Bearer '+key,'Content-Type':'application/json'};
 for(const c of manifest.cases){
  const response=await fetcher(origin+'/api/v2/property/jobs',{method:'POST',headers:{...headers,'Idempotency-Key':'acceptance-'+randomUUID(),'X-Retrieval-Access':approval.allow_paid===true?'configured':'direct_only'},body:JSON.stringify(c.input),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Acceptance submission rejected: HTTP '+response.status);let job=await response.json();const until=Date.now()+600000;
  while(['queued','running','retry_scheduled'].includes(job.status)&&Date.now()<until){await sleep(2000);const r=await fetcher(origin+job.links.self,{headers,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Acceptance status request failed: HTTP '+r.status);job=await r.json();}
  const assertions=c.expected.map(expected=>{const actual=expected.path.split('.').reduce((value,k)=>value?.[k],job.result);return {path:expected.path,actual,expected:expected.value,matched:JSON.stringify(actual)===JSON.stringify(expected.value)};});
  const row={case_id:c.id,job_id:job.id,status:job.status,assertions,passed:['completed','completed_with_gaps'].includes(job.status)&&assertions.every(a=>a.matched),source_baseline:{verified_by:c.verified_by,verified_at:c.verified_at,urls:c.source_urls},ui_verified:false,job};
  await writeFile(resolve(out,c.id+'.json'),JSON.stringify(row,null,2)+'\n',{mode:0o600});evidence.push({case_id:row.case_id,job_id:job.id,passed:row.passed,status:job.status,ui_verified:false});
 }
 const summary={at:new Date().toISOString(),origin,allow_paid:approval.allow_paid===true,cases:evidence,passed:evidence.filter(c=>c.passed).length,ui_acceptance_pending:true};await writeFile(resolve(out,'summary.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [manifestPath,approvalPath,origin,out]=process.argv.slice(2);if(!manifestPath||!approvalPath||!origin||!out)throw Error('Usage: accept-reliability.mjs manifest.json approval.json https://staging-origin private-output-directory');
 const manifest=JSON.parse(await readFile(manifestPath,'utf8')),approval=JSON.parse(await readFile(approvalPath,'utf8'));
 console.log(JSON.stringify(await runAcceptance({manifest,approval,origin,key:process.env.TAXES_ACCEPTANCE_KEY,out})));
}
