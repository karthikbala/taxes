// Manual paid evaluation: requires explicit approval, county cohort and lookup ceiling.
// Never invoked by setup, build, npm test, CI or the standard local server.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createApp} from '../server/app.mjs';
import {localEvaluationDB} from '../scripts/local-recovery-budget.mjs';
import {capabilities,readBounded} from '../lib/live/router.mjs';
import {createHash} from 'node:crypto';
if(!process.argv.includes('--approved-local-override'))throw Error('Explicit approved local override required.');
const counties=process.argv.find(a=>a.startsWith('--counties='))?.slice(11).split(',');
const maximum=Number(process.argv.find(a=>a.startsWith('--max-lookups='))?.split('=')[1]);
if(!counties?.length||!Number.isInteger(maximum)||maximum<1||maximum>10||counties.length>maximum||new Set(counties).size!==counties.length)throw Error('Specify a unique --counties= cohort and --max-lookups=1..10.');
process.umask(0o077);
const maxCaptures=process.argv.includes('--approved-six-additional-captures')?16:10;
const db=await localEvaluationDB(new URL('../runtime/local-native-recovery-20261012.sqlite',import.meta.url).pathname,{approved:true,maxCaptures});
const key=(await readFile(new URL('../runtime/.managed-recovery-key',import.meta.url),'utf8')).trim().replace(/^['"]|['"]$/g,'');
const envText=await readFile(new URL('../.env.local',import.meta.url),'utf8'),poc=envText.match(/^INVISIA_POC_API_KEY=(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g,'');
const out=new URL('../runtime/native-recovery-'+new Date().toISOString().replace(/[:.]/g,'-')+'/',import.meta.url);await mkdir(out,{recursive:true});
const env={DB:db,INVISIA_BROWSER_ENABLED:'1',INVISIA_BROWSER_API_KEY:key,INVISIA_POC_API_KEY:poc};
const rows=[];let consecutiveFailures=0;
try{for(const county of counties){
 const profile=capabilities.counties.find(c=>c.id===county);if(!profile?.modes.includes('county'))throw Error('Unsupported county');
 const dir=new URL(county+'/',out);await mkdir(dir,{recursive:true});const captures=[];
 const sourceFetch=async(url,options)=>{const r=await fetch(url,options),body=await readBounded(r.clone());const row={url:String(r.url||url),status:r.status,sha256:createHash('sha256').update(body).digest('hex'),size:body.length};const n=captures.length;captures.push(row);if(!String(url).includes('config.grantstreet.com')){const file='source-'+n+(Buffer.from(body.subarray(0,5)).toString()==='%PDF-'?'.pdf':'.txt');await writeFile(new URL(file,dir),body);row.file=file;}return r;};
 const app=createApp({env,fetcher:sourceFetch,deadlineMs:130000,logSink:()=>{}});
 const body={county,parcel_id:profile.sample.parcel_id,source_mode:'county',include_pdf:true};
 let result;try{const response=await app(new Request('http://localhost/api/v1/property/lookup',{method:'POST',headers:{Authorization:'Bearer '+poc,'Content-Type':'application/json'},body:JSON.stringify(body)}));result=await response.json();}finally{await app.waitForIdle();}
 await writeFile(new URL('result.json',dir),JSON.stringify(result,null,2)+'\n');await writeFile(new URL('sources.json',dir),JSON.stringify(captures,null,2)+'\n');
 const row={county,status:result.status,request_id:result.request_id,document_status:result.document_status,errors:result.errors?.map(e=>({code:e.code,source_id:e.source_id})),budget:await db.status()};rows.push(row);await writeFile(new URL('summary.json',out),JSON.stringify({out:out.pathname,rows},null,2)+'\n');console.log(JSON.stringify({event:'local_recovery_result',...row}));
 consecutiveFailures=result.taxes?0:consecutiveFailures+1;if(consecutiveFailures>=2){console.log('STOP: two non-advancing collector evaluations.');break;}
 if((await db.status()).captures>=maxCaptures)break;
}
console.log(JSON.stringify({event:'local_recovery_complete',out:out.pathname,budget:await db.status()}));}finally{db.close();}
