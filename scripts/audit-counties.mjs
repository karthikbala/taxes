// Explicit live evaluation, never imported by npm test or run during setup.
// Records raw source evidence only in ignored runtime storage; no headers,
// cookies, provider credentials, or public search configuration are exported.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createApp} from '../server/app.mjs';
import {capabilities,readBounded} from '../lib/live/router.mjs';
import {clientCapabilities} from '../lib/client/profiles.mjs';
import {catalogWorkflows,catalogRequest,workflowSample} from '../public/poc-workflows.mjs';

const compact=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9*]/g,'');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const safeUrl=value=>{const u=new URL(value);u.username='';u.password='';for(const key of [...u.searchParams.keys()])if(/key|token|secret|password|signature/i.test(key))u.searchParams.set(key,'REDACTED');return u.href;};
export function auditTasks({state,only}={}){
 if(state&&!['FL','PA'].includes(state))throw Error('Audit state must be FL or PA.');
 return catalogWorkflows(capabilities,clientCapabilities).filter(p=>!state||p.state===state).flatMap(profile=>profile.lookup_modes.map(mode=>({profile,mode}))).filter(t=>!only||only.includes(t.profile.id+':'+t.mode));
}
export function checkDeliveredRecord(result,profile,mode,captures=[]){
 const checks=[],check=(name,status,detail)=>checks.push({name,status,...(detail?{detail}:{})});
 if(mode==='address'){
  const match=result.ExtractionMetadata?.match;
  check('address_resolution',match?.status==='MATCHED'?'PASS':'UNCONFIRMED',match?.status||result.error?.code||'No match result');
  check('parcel_present',result.scrapTaxOrderRequest?.PropertyInformation?.ParcelNumber?'PASS':'UNAVAILABLE');
  check('source_validation',Object.values(result.ExtractionMetadata?.validation||{}).some(v=>/^(DIFFERENT|MISMATCH)$/i.test(String(v)))?'FAIL':'REVIEW', 'Native resolver and section validation retained; this alone is not independent value verification.');
 }else{
  const expected=result.input?.parcel_id||profile.sample.parcel_id;
  check('parcel_identity',result.property?.parcel_id?(compact(result.property.parcel_id)===compact(expected)?'PASS':'FAIL'):'UNAVAILABLE');
  if(result.join){const a=compact(result.join.assessment_value),c=compact(result.join.collector_value);check('collector_join',!a||!c?'UNCONFIRMED':a===c?'PASS':'FAIL',!a||!c?'Both source identifiers are required; two missing identifiers cannot verify a join.':undefined);}
  if(mode==='state_roll'){
   const capture=captures.find(c=>c.url.startsWith('https://services9.arcgis.com/')&&c.body);
   let records;try{records=JSON.parse(capture?.body).features;}catch{}
   const a=records?.length===1?records[0].attributes:null;
   if(a&&result.assessment){
    if(result.raw_fields)check('official_roll_all_attributes',JSON.stringify(result.raw_fields)===JSON.stringify(a)?'PASS':'FAIL','All returned official source attributes preserved, including source blanks.');
    check('official_roll_identity',Number(a.CO_NO)===profile.dor_code&&(compact(a.PARCEL_ID)===compact(expected)||compact(a.PARCELNO)===compact(expected))?'PASS':'FAIL');
    const values={year:'ASMNT_YR',assessed_total:'AV_NSD',just_value:'JV',assessed_school:'AV_SD',assessed_non_school:'AV_NSD',taxable_school:'TV_SD',taxable_non_school:'TV_NSD',land:'LND_VAL'};
    for(const [field,raw]of Object.entries(values))check('official_roll_'+field,a[raw]==null&&result.assessment[field]===null?'UNAVAILABLE':String(result.assessment[field])===String(a[raw])?'PASS':'FAIL');
    if(Number(a.CO_NO)===profile.dor_code&&compact(a.PARCELNO)===compact(expected)&&compact(a.PARCEL_ID)===compact(result.property?.parcel_id)){const identity=checks.find(c=>c.name==='parcel_identity');identity.status='PASS';identity.detail='Requested official roll identifier resolves to the same source PARCEL_ID.';}
   }else check('official_roll_values','UNAVAILABLE');
  }
  for(const doc of result.documents||[])for(const [field,value]of Object.entries(doc.reconciliation||{}))check('document_'+field,/^(different|mismatch)$/i.test(String(value))?'FAIL':value==='matched'?'PASS':'UNAVAILABLE');
 }
 const errors=result.ExtractionMetadata?.errors||result.errors||[];
 if(errors.some(e=>/identity_mismatch/.test(e.code||'')))check('source_identity','FAIL','Source data was rejected; no replacement accepted.');
 if(errors.some(e=>e.code==='source_values_disagree'))check('source_value_agreement','FAIL','The sources disagree; both reported values are retained for review.');
 const failures=checks.filter(c=>c.status==='FAIL');
 const hasData=mode==='address'?!!result.scrapTaxOrderRequest?.PropertyInformation?.ParcelNumber:!!(result.property||result.assessment||result.taxes);
 return {verdict:failures.length?'FAILED_CHECK':!hasData?'UNAVAILABLE':mode==='state_roll'&&checks.some(c=>c.name==='official_roll_values'&&c.status==='UNAVAILABLE')?'UNCONFIRMED':mode==='state_roll'?'ROLL_VALUES_VERIFIED':errors.length||result.status!=='succeeded'?'PARTIAL_REVIEW':'SOURCE_RECORD_REVIEW',checks};
}

export async function auditCounties({out,limit,only,state,key,fetcher=fetch}){
 const tasks=auditTasks({state,only});
 if(tasks.length>limit)throw Error(`Audit requires ${tasks.length} lookups, exceeding explicit maximum ${limit}.`);
 if(!key)throw Error('Local POC access key is required.');
 await mkdir(out,{recursive:true});const started_at=new Date().toISOString(),rows=[];let next=0;
 async function worker(){
  while(next<tasks.length){
   const {profile,mode}=tasks[next++],id=profile.id+'-'+mode,dir=resolve(out,id);await mkdir(dir,{recursive:true});
   const captures=[];
   const sourceFetch=async(url,options)=>{
    const response=await fetcher(url,options),copy=response.clone();
    // Retain only bounded public source bodies in ignored runtime storage.
    // Configuration may contain credentials and is deliberately excluded.
    const body=await readBounded(copy),u=String(url),excluded=/config\.grantstreet\.com/.test(u);
    const capture={url:safeUrl(response.url||u),method:options?.method||'GET',status:response.status,sha256:sha(body),size:body.length};
    const sequence=captures.length;captures.push(capture);
    if(!excluded){const pdf=Buffer.from(body.subarray(0,5)).toString()==='%PDF-',file=`source-${sequence}.${pdf?'pdf':'txt'}`;await writeFile(resolve(dir,file),body);capture.file=file;if(!pdf)capture.body=new TextDecoder().decode(body);}
    return response;
   };
   const app=createApp({env:{INVISIA_POC_API_KEY:key,INVISIA_BROWSER_ENABLED:'0'},fetcher:sourceFetch,logSink:()=>{}});
   const example=profile.client?.demo_input||{};
   const sample=workflowSample(profile,mode);
   const request=catalogRequest(profile,mode,{order:'LOCAL-FLEET-'+id,address:example.address,owner:example.ownerName,transaction:'REFI',parcel:sample.parcel_id,includePdf:true});
   let result,http_status;
   try{const response=await app(new Request('http://localhost'+request.endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(request.body)}));http_status=response.status;result=await response.json();}
   catch(e){result={status:'error',error:{code:'audit_request_failed',message:e.message}};}
   await app.waitForIdle();
   const checked=checkDeliveredRecord(result,profile,mode,captures);
   await writeFile(resolve(dir,'result.json'),JSON.stringify(result,null,2)+'\n');
   await writeFile(resolve(dir,'sources.json'),JSON.stringify(captures.map(({body,...meta})=>meta),null,2)+'\n');
   const row={county:profile.id,name:profile.name,mode,sample:mode==='address'?example.address:sample.parcel_id,http_status,status:result.status,request_id:result.ExtractionMetadata?.request_id||result.request_id,collected_at:result.ExtractionMetadata?.collected_at||result.collected_at,document_status:result.document_status,errors:(result.ExtractionMetadata?.errors||result.errors||[result.error].filter(Boolean)).map(e=>({code:e.code,source_id:e.source_id})),...checked,evidence:id+'/result.json'};
   rows.push(row);await writeFile(resolve(out,'audit.json'),JSON.stringify({started_at,completed:rows.length,total:tasks.length,paid_captures:0,rows},null,2)+'\n');
   console.log(JSON.stringify({event:'county_audit',completed:rows.length,total:tasks.length,county:profile.id,mode,status:row.status,verdict:row.verdict,error_codes:row.errors.map(e=>e.code)}));
  }
 }
 await Promise.all([worker(),worker()]);
 const report={started_at,completed_at:new Date().toISOString(),completed:rows.length,total:tasks.length,paid_captures:0,rows:rows.sort((a,b)=>(a.county+a.mode).localeCompare(b.county+b.mode))};
 await writeFile(resolve(out,'audit.json'),JSON.stringify(report,null,2)+'\n');return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 if(!args.includes('--live')||!args.some(a=>a.startsWith('--max-lookups=')))throw Error('Explicit live opt-in required: --live --max-lookups=91 [--state=FL] [--only=county:mode,...]');
 const available=auditTasks().length;
 const limit=Number(args.find(a=>a.startsWith('--max-lookups=')).split('=')[1]);if(!Number.isInteger(limit)||limit<1||limit>available)throw Error(`Maximum must be between 1 and ${available}.`);
 const state=args.find(a=>a.startsWith('--state='))?.slice(8);
 const only=args.find(a=>a.startsWith('--only='))?.slice(7).split(',');
 const env=await readFile(new URL('../.env.local',import.meta.url),'utf8');const key=env.match(/^INVISIA_POC_API_KEY=(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g,'');
 const out=resolve(new URL('../runtime',import.meta.url).pathname,'county-audit-'+new Date().toISOString().replace(/[:.]/g,'-'));
 const report=await auditCounties({out,limit,only,state,key});console.log(JSON.stringify({event:'county_audit_complete',out,total:report.total,paid_captures:0}));
}
