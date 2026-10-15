import {countyAdapters} from '../lib/live/county-adapters.mjs';
import {phaseOne} from '../lib/live/phase-one.mjs';
import {sourceProfiles} from '../lib/reliability/sources.mjs';
import {requestedFields,parcelWorkflow} from '../lib/reliability/parcel.mjs';
const targets=Object.keys(countyAdapters);
export const acceptanceCategories=['paid_residential','paid_commercial','delinquent_current','delinquent_prior','zero_or_exempt','identifier_variation','multiple_payments','annual_document','redemption_or_certificate','historical_records','source_omission','unaffected_control'];
export function createCountyTracking(db,store){
 const sql=db.sqlite;
 sql.exec(`CREATE TABLE IF NOT EXISTS county_acceptance(id TEXT PRIMARY KEY,county TEXT NOT NULL,parcel TEXT NOT NULL,category TEXT NOT NULL,job_id TEXT NOT NULL,source_revision TEXT NOT NULL,verified_at INTEGER NOT NULL,evidence TEXT NOT NULL,UNIQUE(county,parcel,source_revision));`);
 return {
  status(revision){return {source_revision:revision,target_count:20,required_per_county:12,total_required:240,counties:targets.map(county=>{
   const accepted=sql.prepare('SELECT category,verified_at FROM county_acceptance WHERE county=? AND source_revision=?').all(county,revision);
   const latest=sql.prepare("SELECT id,status,stage,updated_at,code_version,result FROM retrieval_jobs WHERE json_extract(input,'$.county')=? AND json_extract(input,'$.__workflow')=? ORDER BY updated_at DESC LIMIT 1").get(county,parcelWorkflow);
   const result=latest?.result?JSON.parse(latest.result):null,fields=result?.ExtractionMetadata?.field_status||{};
   const coverage=Object.fromEntries(Object.keys(requestedFields).map(section=>{const entries=Object.entries(fields).filter(([path])=>path===section||path.startsWith(section+'.'));return [section,entries.length&&entries.every(([,f])=>f.status==='VERIFIED'||f.status==='INSPECTED_EMPTY'||f.reason==='NOT_PUBLISHED')?'verified':'pending'];}));
   const complete=accepted.length>=12&&acceptanceCategories.every(c=>accepted.some(a=>a.category===c));
   const state=latest?.status==='needs_review'?'Needs review':complete?(latest&&['failed','completed_with_gaps'].includes(latest.status)?'Temporarily degraded':'Verified'):latest&&['running','queued','retry_scheduled'].includes(latest.status)?'In repair':latest?'Acceptance pending':'Not assessed';
   return {county,phase:phaseOne[county]?1:2,family:countyAdapters[county].collector,state,accepted:accepted.length,required:12,coverage,last_verification:accepted.length?new Date(Math.max(...accepted.map(a=>a.verified_at))).toISOString():null,last_attempt:latest?{id:latest.id,status:latest.status,stage:latest.stage,updated_at:new Date(latest.updated_at).toISOString(),revision:latest.code_version}:null,blockers:result?.ExtractionMetadata?.gaps||[],source_profile:{hosts:sourceProfiles[county].hosts,account:sourceProfiles[county].account},categories:acceptanceCategories.map(category=>({category,verified:accepted.some(a=>a.category===category)}))};
  })};},
  // Operator acceptance must reference persisted source/API/UI evidence for the exact revision.
  accept({id,job_id,category,ui_artifact_id}){
   const job=store.get(job_id),evidence=ui_artifact_id&&store.readArtifact(job_id,ui_artifact_id);
   if(!id||!job||job.input.__workflow!==parcelWorkflow||job.status!=='completed'||!acceptanceCategories.includes(category)||!evidence||evidence.kind!=='acceptance_ui')throw Error('Acceptance requires a completed parcel job and captured UI evidence.');
   const fields=job.result?.ExtractionMetadata?.field_status||{};
   if(!Object.keys(fields).length||Object.values(fields).some(f=>!['VERIFIED','INSPECTED_EMPTY'].includes(f.status)&&f.reason!=='NOT_PUBLISHED'))throw Error('Required fields remain unverified.');
   const sources=store.artifacts(job_id).filter(a=>['http','browser'].includes(a.kind));if(!sources.length)throw Error('Original source artifacts are required.');
   const parcel=String(job.result.scrapTaxOrderRequest?.PropertyInformation?.ParcelNumber||'').toUpperCase().replace(/[^A-Z0-9*]/g,'');if(!parcel)throw Error('Acceptance requires verified canonical parcel identity.');
   sql.prepare('INSERT INTO county_acceptance VALUES(?,?,?,?,?,?,?,?)').run(id,job.input.county,parcel,category,job_id,job.code_version,Date.now(),JSON.stringify({ui:evidence.sha256,sources:sources.map(a=>a.sha256),result_version:job.result_version}));
  }
 };
}
