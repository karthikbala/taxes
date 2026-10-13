import {createHash, randomUUID,randomBytes} from 'node:crypto';

export const jobStages = ['resolve_property','appraiser','collector_history','documents','certificate_deed','validation','serialization'];
export const terminalJobs = new Set(['completed','completed_with_gaps','failed','cancelled','needs_review']);
const digest = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, Object.keys(value).sort());
const problem = (code,http,message) => Object.assign(new Error(message),{code,http});
const decode = row => row && ({...row,input:JSON.parse(row.input),result:row.result?JSON.parse(row.result):null,gaps:JSON.parse(row.gaps),checkpoints:JSON.parse(row.checkpoints)});

/** Additive schema; never creates, resets or modifies a spending allowance. */
export function createJobStore(db,{now=Date.now}={}) {
 if(!db?.sqlite) return null;
 const sql=db.sqlite;
 sql.exec(`CREATE TABLE IF NOT EXISTS retrieval_jobs (
  id TEXT PRIMARY KEY, input TEXT NOT NULL, input_hash TEXT NOT NULL, idempotency_hash TEXT UNIQUE,
  status TEXT NOT NULL, stage TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0, recovery_cycles INTEGER NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 0, next_retry_at INTEGER,
  lease_owner TEXT, lease_until INTEGER, result TEXT, result_version INTEGER NOT NULL DEFAULT 0,
  gaps TEXT NOT NULL DEFAULT '[]', checkpoints TEXT NOT NULL DEFAULT '{}', code_version TEXT NOT NULL,access_mode TEXT NOT NULL DEFAULT 'configured');
 CREATE INDEX IF NOT EXISTS retrieval_jobs_ready ON retrieval_jobs(status,next_retry_at);
 CREATE TABLE IF NOT EXISTS retrieval_attempts (
  id INTEGER PRIMARY KEY,job_id TEXT NOT NULL REFERENCES retrieval_jobs(id),attempt INTEGER NOT NULL,
  stage TEXT NOT NULL,status TEXT NOT NULL,error_code TEXT,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS retrieval_artifacts (
  id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES retrieval_jobs(id),generation INTEGER NOT NULL,
  cache_key TEXT NOT NULL,kind TEXT NOT NULL,metadata TEXT NOT NULL,sha256 TEXT NOT NULL,bytes BLOB NOT NULL,
  created_at INTEGER NOT NULL,UNIQUE(job_id,generation,cache_key));
 CREATE TABLE IF NOT EXISTS retrieval_sessions (
  id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES retrieval_jobs(id),cache_key TEXT NOT NULL,
  session_id TEXT,lease_id TEXT,status TEXT NOT NULL,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS retrieval_hosts (host TEXT PRIMARY KEY,failures INTEGER NOT NULL DEFAULT 0,open_until INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS retrieval_uploads (id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES retrieval_jobs(id),token_hash TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,expires_at INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS retrieval_runner (id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,lease_until INTEGER NOT NULL);`);
 // Forward-only additions also support databases created by an earlier staged build.
 const columns=new Set(sql.prepare('PRAGMA table_info(retrieval_jobs)').all().map(r=>r.name));
 if(!columns.has('recovery_cycles'))sql.exec('ALTER TABLE retrieval_jobs ADD COLUMN recovery_cycles INTEGER NOT NULL DEFAULT 0');
 if(!columns.has('access_mode'))sql.exec("ALTER TABLE retrieval_jobs ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'configured'");
 const get=id=>decode(sql.prepare('SELECT * FROM retrieval_jobs WHERE id=?').get(id));
 const event=(id,stage,status,code=null)=>sql.prepare('INSERT INTO retrieval_attempts(job_id,attempt,stage,status,error_code,created_at) VALUES(?,(SELECT attempt FROM retrieval_jobs WHERE id=?),?,?,?,?)').run(id,id,stage,status,code,now());
 const transaction=fn=>{sql.exec('BEGIN IMMEDIATE');try{const r=fn();sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}};
 return {
  get,event,now,
  create(input,key,version='unknown',accessMode='configured') {return transaction(()=>{
   if(!['configured','direct_only'].includes(accessMode))throw problem('invalid_access_mode',400,'Access mode must be configured or direct_only.');
   if(key!==null&&key!==undefined&&(typeof key!=='string'||!/^[\x21-\x7e]{1,200}$/.test(key)))throw problem('invalid_idempotency_key',400,'Use a printable Idempotency-Key of 1–200 characters.');
   const inputHash=digest(canonical({...input,__access_mode:accessMode})),keyHash=key?digest(key):null;
   if(keyHash){const existing=sql.prepare('SELECT * FROM retrieval_jobs WHERE idempotency_hash=?').get(keyHash);if(existing){if(existing.input_hash!==inputHash)throw problem('idempotency_conflict',409,'This Idempotency-Key belongs to different input.');return {job:decode(existing),reused:true};}}
   if(sql.prepare("SELECT count(*) AS n FROM retrieval_jobs WHERE status IN ('queued','running','retry_scheduled')").get().n>=1000)throw problem('queue_full',503,'The retrieval queue is full. Retry later.');
   const id=randomUUID(),time=now();sql.prepare("INSERT INTO retrieval_jobs(id,input,input_hash,idempotency_hash,status,stage,created_at,updated_at,code_version,access_mode) VALUES(?,?,?,?,'queued','resolve_property',?,?,?,?)").run(id,JSON.stringify(input),inputHash,keyHash,time,time,version,accessMode);
   event(id,'resolve_property','queued');return {job:get(id),reused:false};
  });},
  claim(owner) {return transaction(()=>{
   const row=sql.prepare("SELECT id FROM retrieval_jobs WHERE status='queued' OR (status='retry_scheduled' AND next_retry_at<=?) ORDER BY created_at LIMIT 1").get(now());if(!row)return null;
   sql.prepare("UPDATE retrieval_jobs SET status='running',attempt=attempt+1,lease_owner=?,lease_until=?,updated_at=?,next_retry_at=NULL WHERE id=?").run(owner,now()+120000,now(),row.id);event(row.id,'resolve_property','running');return get(row.id);
  });},
  renew(owner){sql.prepare("UPDATE retrieval_jobs SET lease_until=? WHERE lease_owner=? AND status='running'").run(now()+120000,owner);},
  checkpoint(id,stage,result,{completePrevious=false}={}) {
   const row=get(id);if(!row||row.status!=='running')return;
   const checkpoints={...row.checkpoints,[stage]:{...row.checkpoints[stage],at:now(),version:row.result_version+1}};
   if(completePrevious&&row.stage!==stage&&row.checkpoints[row.stage])checkpoints[row.stage]={...row.checkpoints[row.stage],completed_at:now()};
   sql.prepare('UPDATE retrieval_jobs SET stage=?,checkpoints=?,result=COALESCE(?,result),result_version=result_version+1,updated_at=? WHERE id=? AND status=\'running\'').run(stage,JSON.stringify(checkpoints),result?JSON.stringify(result):null,now(),id);event(id,stage,'checkpoint');
  },
  settle(id,status,{result,gaps=[],nextRetry=null,code=null}={}) {
   sql.prepare("UPDATE retrieval_jobs SET status=?,result=COALESCE(?,result),gaps=?,next_retry_at=?,lease_owner=NULL,lease_until=NULL,updated_at=?,result_version=result_version+1,recovery_cycles=recovery_cycles+CASE WHEN ?='retry_scheduled' THEN 1 ELSE 0 END WHERE id=? AND status='running'").run(status,result?JSON.stringify(result):null,JSON.stringify(gaps),nextRetry,now(),status,id);event(id,get(id)?.stage||'serialization',status,code);
  },
  cancel(id){const row=get(id);if(!row)throw problem('job_not_found',404,'Job not found.');if(!terminalJobs.has(row.status)){sql.prepare("UPDATE retrieval_jobs SET status='cancelled',next_retry_at=NULL,updated_at=? WHERE id=?").run(now(),id);event(id,row.stage,'cancelled');}return get(id);},
  resume(id,input) {return transaction(()=>{
   const row=get(id);if(!row)throw problem('job_not_found',404,'Job not found.');
   if(!['needs_review','failed','completed_with_gaps','cancelled'].includes(row.status))throw problem('job_not_resumable',409,'This job is already active or complete.');
   if(row.lease_owner)throw problem('cleanup_pending',409,'Wait for the previous attempt to finish cleanup.');
   if(sql.prepare("SELECT 1 FROM retrieval_sessions WHERE job_id=? AND status NOT IN ('closed','reconciled') LIMIT 1").get(id))throw problem('cleanup_pending',409,'Provider cleanup and spending reconciliation need operator review before resuming.');
   if(now()-row.created_at>=86400000)throw problem('job_expired',409,'Start a fresh lookup; the recovery window is 24 hours.');
   if(row.recovery_cycles>=3)throw problem('recovery_exhausted',409,'The three recovery cycles are exhausted. Start a fresh approved lookup.');
   if(input&&digest(canonical({...input,__access_mode:row.access_mode}))!==row.input_hash){sql.prepare('UPDATE retrieval_jobs SET input=?,input_hash=?,generation=generation+1,result=NULL,checkpoints=\'{}\' WHERE id=?').run(JSON.stringify(input),digest(canonical({...input,__access_mode:row.access_mode})),id);}
   sql.prepare("UPDATE retrieval_jobs SET status='queued',gaps='[]',next_retry_at=NULL,updated_at=? WHERE id=?").run(now(),id);event(id,row.stage,'resumed');return get(id);
  });},
  releaseCancelled(id){sql.prepare("UPDATE retrieval_jobs SET lease_owner=NULL,lease_until=NULL WHERE id=? AND status='cancelled'").run(id);},
  artifact(id,key,kind,bytes,metadata={}) {
   const row=get(id);if(!row)throw problem('job_not_found',404,'Job not found.');const hash=digest(bytes);
   const old=sql.prepare('SELECT id,metadata,sha256 FROM retrieval_artifacts WHERE job_id=? AND generation=? AND cache_key=?').get(id,row.generation,key);
   // A refreshed incomplete stage gets a new immutable artifact; never replay its old page version.
   if(old&&(old.sha256!==hash||metadata.attempt!==undefined&&JSON.parse(old.metadata).attempt!==metadata.attempt))sql.prepare('UPDATE retrieval_artifacts SET cache_key=? WHERE id=?').run(key+':superseded:'+old.id,old.id);
   sql.prepare('INSERT OR IGNORE INTO retrieval_artifacts(id,job_id,generation,cache_key,kind,metadata,sha256,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,row.generation,key,kind,JSON.stringify(metadata),hash,Buffer.from(bytes),now());
   return this.cached(id,key);
  },
  cached(id,key){const row=sql.prepare('SELECT a.* FROM retrieval_artifacts a JOIN retrieval_jobs j ON j.id=a.job_id AND j.generation=a.generation WHERE a.job_id=? AND a.cache_key=?').get(id,key);if(!row)return null;if(digest(row.bytes)!==row.sha256)throw problem('artifact_integrity_failed',502,'Stored artifact hash differs.');return {...row,metadata:JSON.parse(row.metadata)};},
  artifacts(id){return sql.prepare('SELECT id,kind,sha256,created_at,metadata FROM retrieval_artifacts WHERE job_id=? ORDER BY created_at').all(id).map(r=>({...r,metadata:JSON.parse(r.metadata)}));},
  uploadTicket(id,size,sha256){if(!Number.isInteger(size)||size<5||size>25*1024*1024||!/^[a-f0-9]{64}$/.test(sha256))throw problem('invalid_document',400,'Invalid document metadata.');const ticket=randomUUID(),token=randomBytes(32).toString('hex');sql.prepare('INSERT INTO retrieval_uploads(id,job_id,token_hash,size,sha256,expires_at) VALUES(?,?,?,?,?,?)').run(ticket,id,digest(token),size,sha256,now()+300000);return {id:ticket,token};},
  checkUpload(job,id,token){const row=sql.prepare("SELECT u.* FROM retrieval_uploads u JOIN retrieval_jobs j ON j.id=u.job_id WHERE u.id=? AND u.job_id=? AND u.token_hash=? AND u.consumed=0 AND u.expires_at>? AND j.status='running'").get(id,job,digest(token||''),now());return row||null;},
  acceptUpload(job,id,token,bytes){return transaction(()=>{const row=this.checkUpload(job,id,token);if(!row)throw problem('unauthorized',401,'Upload ticket is invalid or expired.');if(bytes.length!==row.size||digest(bytes)!==row.sha256||Buffer.from(bytes.subarray(0,5)).toString()!=='%PDF-')throw problem('artifact_integrity_failed',422,'Document size, hash or PDF signature differs.');const artifact=this.artifact(job,'upload:'+id,'original_pdf',bytes,{format:'PDF',transfer:'binary_upload'});sql.prepare('UPDATE retrieval_uploads SET consumed=1 WHERE id=?').run(id);return artifact;});},
  readArtifact(id,artifact){const row=sql.prepare('SELECT * FROM retrieval_artifacts WHERE job_id=? AND id=?').get(id,artifact);if(!row)return null;if(digest(row.bytes)!==row.sha256)throw problem('artifact_integrity_failed',502,'Stored artifact hash differs.');return {...row,metadata:JSON.parse(row.metadata)};},
  session(job,key,{id,session_id=null,lease_id=null,status}){sql.prepare('INSERT INTO retrieval_sessions(id,job_id,cache_key,session_id,lease_id,status,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET session_id=COALESCE(excluded.session_id,session_id),lease_id=COALESCE(excluded.lease_id,lease_id),status=excluded.status,updated_at=excluded.updated_at').run(id,job,key,session_id,lease_id,status,now());},
  sessions(id){return sql.prepare('SELECT * FROM retrieval_sessions WHERE job_id=?').all(id);},
  unresolvedSessions(){return sql.prepare("SELECT s.* FROM retrieval_sessions s JOIN retrieval_jobs j ON j.id=s.job_id WHERE s.status NOT IN ('closed','reconciled') AND (j.lease_until IS NULL OR j.lease_until<?)").all(now());},
  recover() {return transaction(()=>{
   const rows=sql.prepare("SELECT id FROM retrieval_jobs WHERE status='running' AND lease_until<?").all(now());
   for(const row of rows){const uncertain=sql.prepare("SELECT 1 FROM retrieval_sessions WHERE job_id=? AND status NOT IN ('closed','reconciled') LIMIT 1").get(row.id);
    sql.prepare('UPDATE retrieval_jobs SET status=?,lease_owner=NULL,lease_until=NULL,updated_at=?,gaps=? WHERE id=?').run(uncertain?'needs_review':'queued',now(),JSON.stringify(uncertain?[{reason:'BUDGET_PENDING',code:'cleanup_pending',action:'Reconcile the recorded provider session and reservation before resuming.'}]:[]),row.id);event(row.id,'resolve_property',uncertain?'needs_review':'recovered');
   }return rows.length;
  });},
  runner(owner){return transaction(()=>{const current=sql.prepare('SELECT * FROM retrieval_runner WHERE id=1').get();if(current&&current.owner!==owner&&current.lease_until>now())return false;sql.prepare('INSERT INTO retrieval_runner(id,owner,lease_until) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,lease_until=excluded.lease_until').run(owner,now()+120000);return true;});},
  releaseRunner(owner){sql.prepare('DELETE FROM retrieval_runner WHERE owner=?').run(owner);},
  host(host){return sql.prepare('SELECT * FROM retrieval_hosts WHERE host=?').get(host)||{host,failures:0,open_until:0};},
  hostResult(host,failed){const old=this.host(host),failures=failed?old.failures+1:0;sql.prepare('INSERT INTO retrieval_hosts(host,failures,open_until) VALUES(?,?,?) ON CONFLICT(host) DO UPDATE SET failures=excluded.failures,open_until=excluded.open_until').run(host,failures,failures>=5?now()+900000:0);},
  attempts(id){return sql.prepare('SELECT attempt,stage,status,error_code,created_at FROM retrieval_attempts WHERE job_id=? ORDER BY id').all(id);},
  metrics(){return {counts:sql.prepare('SELECT status,count(*) AS count FROM retrieval_jobs GROUP BY status').all(),oldest_queued_at:sql.prepare("SELECT min(created_at) AS value FROM retrieval_jobs WHERE status IN ('queued','retry_scheduled')").get().value,cleanup_pending:sql.prepare("SELECT count(*) AS count FROM retrieval_sessions WHERE status NOT IN ('closed','reconciled')").get().count};},
  purge(days=90){const expired=now()-days*86400000;return transaction(()=>{sql.prepare('DELETE FROM retrieval_uploads WHERE expires_at<?').run(now());const ids=sql.prepare("SELECT id FROM retrieval_jobs WHERE updated_at<? AND lease_owner IS NULL AND status IN ('completed','completed_with_gaps','failed','cancelled','needs_review') AND NOT EXISTS(SELECT 1 FROM retrieval_sessions s WHERE s.job_id=retrieval_jobs.id AND s.status NOT IN ('closed','reconciled'))").all(expired);for(const {id}of ids){for(const table of ['retrieval_artifacts','retrieval_attempts','retrieval_sessions','retrieval_uploads'])sql.prepare(`DELETE FROM ${table} WHERE job_id=?`).run(id);sql.prepare('DELETE FROM retrieval_jobs WHERE id=?').run(id);}return ids.length;});}
 };
}
