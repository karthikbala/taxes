import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {localEvaluationDB,localEvaluationId} from '../scripts/local-recovery-budget.mjs';
import {reserveBrowser,reconcileBrowser,phaseBudgetId} from '../lib/live/browser-budget.mjs';
import {createSQLiteDB} from '../server/sqlite.mjs';
test('local evaluation requires approval and does not create the original ledger',async()=>{
 await assert.rejects(localEvaluationDB(':memory:'),/approval/);
 const db=await localEvaluationDB(':memory:',{approved:true});try{
  assert.equal((await db.status()).id,localEvaluationId);
  const lease=await reserveBrowser(db,'miami-dade-fl');await reconcileBrowser(db,lease,2,'completed');
  assert.equal((await db.status()).spent_milli_usd,40);
 }finally{db.close();}
});
test('local evaluation preserves usage across restarts and stops after ten captures',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'taxes-local-budget-')),path=join(dir,'evaluation.sqlite');let db;
 try{
  db=await localEvaluationDB(path,{approved:true});for(let i=0;i<5;i++){const lease=await reserveBrowser(db,'miami-dade-fl');await reconcileBrowser(db,lease,2,'completed');}
  db.close();db=await localEvaluationDB(path,{approved:true});assert.equal((await db.status()).spent_milli_usd,200);
  for(let i=0;i<5;i++){const lease=await reserveBrowser(db,'osceola-fl');await reconcileBrowser(db,lease,null,'failed');}
  await assert.rejects(reserveBrowser(db,'hillsborough-fl'),e=>e.code==='browser_budget_exhausted');
  assert.equal((await db.status()).captures,10);assert.equal((await db.status()).spent_milli_usd,600);
  db.close();db=null;const raw=createSQLiteDB(path);assert.equal(await raw.prepare('SELECT * FROM scrape_budgets WHERE id=?').bind(phaseBudgetId).first(),null);raw.close();
 }finally{db?.close();await rm(dir,{recursive:true,force:true});}
});

test('local evaluation refuses to replace original history or raise an existing local ceiling',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'taxes-local-budget-guard-'));
 try{
  for(const [name,id,limit] of [['original',phaseBudgetId,5000],['wrong-cap',localEvaluationId,2000]]){
   const path=join(dir,name+'.sqlite'),raw=createSQLiteDB(path);await raw.prepare('INSERT INTO scrape_budgets VALUES(?,?,?,?)').bind(id,limit,400,0).run();raw.close();
   await assert.rejects(localEvaluationDB(path,{approved:true}),name==='original'?/original spending history/:/ceiling differs/);
   const verify=createSQLiteDB(path);assert.equal((await verify.prepare('SELECT * FROM scrape_budgets WHERE id=?').bind(id).first()).spent_milli_usd,400);verify.close();
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('explicit six-capture extension retains historical spend and the $1 ceiling',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'taxes-local-budget-extension-')),path=join(dir,'evaluation.sqlite');let db;
 try{
  db=await localEvaluationDB(path,{approved:true});
  for(let i=0;i<10;i++){const lease=await reserveBrowser(db,'pinellas-fl');await reconcileBrowser(db,lease,2,'completed');}
  db.close();db=await localEvaluationDB(path,{approved:true,maxCaptures:16});
  assert.equal((await db.status()).spent_milli_usd,400);
  for(let i=0;i<6;i++){const lease=await reserveBrowser(db,'charlotte-fl');await reconcileBrowser(db,lease,2,'completed');}
  await assert.rejects(reserveBrowser(db,'pinellas-fl'),e=>e.code==='browser_budget_exhausted');
  assert.equal((await db.status()).captures,16);assert.equal((await db.status()).spent_milli_usd,640);
  assert.equal((await db.status()).limit_milli_usd,1000);
 }finally{db?.close();await rm(dir,{recursive:true,force:true});}
 await assert.rejects(localEvaluationDB(':memory:',{approved:true,maxCaptures:19}),/eighteen/);
});

test('two-capture client extension preserves prior spending and stops at the narrower additional-cost ceiling',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'taxes-client-budget-')),path=join(dir,'evaluation.sqlite');let db;
 try{
  db=await localEvaluationDB(path,{approved:true,maxCaptures:18,maxSpendMilliUsd:860});
  for(let i=0;i<16;i++){const lease=await reserveBrowser(db,'miami-dade-fl');await reconcileBrowser(db,lease,2,'completed');}
  const lease=await reserveBrowser(db,'miami-dade-fl');await reconcileBrowser(db,lease,4,'completed');
  const last=await reserveBrowser(db,'miami-dade-fl');await reconcileBrowser(db,last,4,'completed');
  await assert.rejects(reserveBrowser(db,'miami-dade-fl'),e=>e.code==='browser_budget_exhausted');
  assert.equal((await db.status()).captures,18);assert.equal((await db.status()).limit_milli_usd,1000);
 }finally{db?.close();await rm(dir,{recursive:true,force:true});}
});

test('approved twelve-capture extension preserves eighteen runs and $0.82, enforces per-county and $0.96 increment limits',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'taxes-fleet-budget-')),path=join(dir,'evaluation.sqlite');let db;
 try{
  db=await localEvaluationDB(path,{approved:true,maxCaptures:18});
  for(const credits of [...Array(15).fill(2),4,3,4]){const lease=await reserveBrowser(db,'miami-dade-fl');await reconcileBrowser(db,lease,credits,'completed');}
  db.close();db=await localEvaluationDB(path,{approved:true,maxCaptures:30,maxSpendMilliUsd:1780,approvedTwelveCaptureExtension:true});
  assert.equal((await db.status()).spent_milli_usd,820);assert.equal((await db.status()).captures,18);assert.equal((await db.status()).limit_milli_usd,2000);
  db.setCaptureCeiling(19);const first=await reserveBrowser(db,'charlotte-fl');await reconcileBrowser(db,first,4,'completed');
  await assert.rejects(reserveBrowser(db,'charlotte-fl'),e=>e.code==='browser_budget_exhausted');
  assert.throws(()=>db.setCaptureCeiling(31));db.setCaptureCeiling(30);
  for(let i=0;i<11;i++){const lease=await reserveBrowser(db,'lee-fl');await reconcileBrowser(db,lease,4,'completed');}
  await assert.rejects(reserveBrowser(db,'lee-fl'),e=>e.code==='browser_budget_exhausted');
  assert.equal((await db.status()).captures,30);assert.equal((await db.status()).spent_milli_usd,1780);
  db.close();db=null;await assert.rejects(localEvaluationDB(path,{approved:true}),/ceiling differs/);
 }finally{db?.close();await rm(dir,{recursive:true,force:true});}
 await assert.rejects(localEvaluationDB(':memory:',{approved:true,approvedTwelveCaptureExtension:true,maxCaptures:30,maxSpendMilliUsd:1780}),/baseline differs/);
});

test('a reviewed higher booked baseline is retained and cannot grant more than the approved increment',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'taxes-fleet-retained-')),path=join(dir,'evaluation.sqlite');let db;
 try{
  db=await localEvaluationDB(path,{approved:true,maxCaptures:18});
  for(const credits of [...Array(15).fill(2),4,3,4]){const lease=await reserveBrowser(db,'miami-dade-fl');await reconcileBrowser(db,lease,credits,'completed');}
  db.close();db=null;const raw=createSQLiteDB(path);await raw.prepare('UPDATE scrape_budgets SET spent_milli_usd=960 WHERE id=?').bind(localEvaluationId).run();raw.close();
  await assert.rejects(localEvaluationDB(path,{approved:true,maxCaptures:30,maxSpendMilliUsd:1780,approvedTwelveCaptureExtension:true}),/baseline differs/);
  db=await localEvaluationDB(path,{approved:true,maxCaptures:30,maxSpendMilliUsd:1920,approvedTwelveCaptureExtension:true,extensionBaselineMilliUsd:960});
  assert.equal((await db.status()).spent_milli_usd,960);assert.equal((await db.status()).captures,18);
  const runs=await db.prepare('SELECT SUM(spent_milli_usd) AS total FROM browser_runs WHERE budget_id=?').bind(localEvaluationId).first();assert.equal(runs.total,820);
  await assert.rejects(localEvaluationDB(path,{approved:true,maxCaptures:30,maxSpendMilliUsd:1921,approvedTwelveCaptureExtension:true,extensionBaselineMilliUsd:960}),/ceiling/);
 }finally{db?.close();await rm(dir,{recursive:true,force:true});}
});
