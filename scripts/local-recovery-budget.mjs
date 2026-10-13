// Explicit, separately authorized local evaluation only. This does not migrate,
// replace, reset, or claim the missing original production spending history.
import {createSQLiteDB} from '../server/sqlite.mjs';
import {phaseBudgetId} from '../lib/live/browser-budget.mjs';
export const localEvaluationId='local-native-recovery-2026-10-12-1usd';
export async function localEvaluationDB(path,{approved=false,maxCaptures=10,maxSpendMilliUsd=1000,approvedTwelveCaptureExtension=false,extensionBaselineMilliUsd=820}={}){
 if(approved!==true)throw Error('Explicit approval for the separate $1 local evaluation is required.');
 const ceiling=approvedTwelveCaptureExtension===true?2000:1000,maximum=approvedTwelveCaptureExtension===true?30:18;
 if(!Number.isInteger(maxCaptures)||maxCaptures<1||maxCaptures>maximum)throw Error('The approved local evaluation allows at most '+(maximum===18?'eighteen':maximum)+' total captures.');
 if(!Number.isInteger(extensionBaselineMilliUsd)||extensionBaselineMilliUsd<820||extensionBaselineMilliUsd>1040)throw Error('Extension baseline requires a reviewed, bounded retained-spend snapshot.');
 if(!Number.isInteger(maxSpendMilliUsd)||maxSpendMilliUsd<0||maxSpendMilliUsd>(approvedTwelveCaptureExtension===true?Math.min(2000,extensionBaselineMilliUsd+960):ceiling))throw Error('Local evaluation spending exceeds its explicitly approved ceiling.');
 const db=createSQLiteDB(path);
 if(await db.prepare('SELECT id FROM scrape_budgets WHERE id=?').bind(phaseBudgetId).first()){db.close();throw Error('Use a separate local evaluation database; original spending history must remain unchanged.');}
 await db.prepare('INSERT INTO scrape_budgets(id,limit_milli_usd,spent_milli_usd,reserved_milli_usd) VALUES(?,1000,0,0) ON CONFLICT(id) DO NOTHING').bind(localEvaluationId).run();
 let row=await db.prepare('SELECT * FROM scrape_budgets WHERE id=?').bind(localEvaluationId).first();
 if(approvedTwelveCaptureExtension===true&&row.limit_milli_usd===1000){
  const count=(await db.prepare('SELECT COUNT(*) AS n FROM browser_runs WHERE budget_id=?').bind(localEvaluationId).first()).n;
  if(count!==18||row.spent_milli_usd!==extensionBaselineMilliUsd||row.reserved_milli_usd!==0){db.close();throw Error('Approved extension baseline differs; reconcile before raising the ceiling.');}
  await db.prepare('UPDATE scrape_budgets SET limit_milli_usd=2000 WHERE id=? AND limit_milli_usd=1000 AND spent_milli_usd=? AND reserved_milli_usd=0').bind(localEvaluationId,extensionBaselineMilliUsd).run();
  row=await db.prepare('SELECT * FROM scrape_budgets WHERE id=?').bind(localEvaluationId).first();
 }
 if(row.limit_milli_usd!==ceiling){db.close();throw Error('The approved local evaluation ceiling differs; operator review required.');}
 let captureCeiling=maxCaptures;
 return {
  setCaptureCeiling(n){if(!Number.isInteger(n)||n<1||n>maxCaptures)throw Error('Per-request capture ceiling exceeds the approved maximum.');captureCeiling=n;},
  prepare(sql){
   // The existing reservation/reconciliation code stays unchanged. Its logical
   // budget ID is scoped to this explicitly separate local evaluation ledger.
   const bounded=sql.startsWith('INSERT INTO browser_runs')?sql+" AND (SELECT COUNT(*) FROM browser_runs WHERE budget_id='"+localEvaluationId+"')<"+captureCeiling+" AND spent_milli_usd+reserved_milli_usd+80<="+maxSpendMilliUsd:sql;
   return {bind(...args){return db.prepare(bounded).bind(...args.map(a=>a===phaseBudgetId?localEvaluationId:a));},first(...args){return db.prepare(bounded).first(...args);},all(){return db.prepare(bounded).all();}};
  },
  batch:statements=>db.batch(statements),
  status:async()=>({...(await db.prepare('SELECT * FROM scrape_budgets WHERE id=?').bind(localEvaluationId).first()),captures:(await db.prepare('SELECT COUNT(*) AS n FROM browser_runs WHERE budget_id=?').bind(localEvaluationId).first()).n}),
  close:()=>db.close()
 };
}
