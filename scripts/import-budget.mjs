import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSQLiteDB } from '../server/sqlite.mjs';
const phaseBudgetId = 'florida-phase1-2026-10-07';

// Only an owner-supplied settled ledger can be imported. Never reset an existing ledger.
export async function importBudget(db, snapshot, { approvedImport = false } = {}) {
  if (!approvedImport) throw new Error('Explicit approved-import acknowledgement is required.');
  if (!snapshot || snapshot.id !== phaseBudgetId) throw new Error('Snapshot must identify the existing approved budget.');
  for (const key of ['limit_milli_usd', 'spent_milli_usd', 'reserved_milli_usd']) {
    if (!Number.isSafeInteger(snapshot[key]) || snapshot[key] < 0) throw new Error(`Invalid ${key}.`);
  }
  if (snapshot.limit_milli_usd <= 0 || snapshot.limit_milli_usd > 5000 || snapshot.spent_milli_usd > snapshot.limit_milli_usd) throw new Error('Invalid cap or spent amount.');
  if (snapshot.reserved_milli_usd !== 0) throw new Error('Settle outstanding reservations before importing.');
  if (!Array.isArray(snapshot.browser_runs)) throw new Error('An explicit browser_runs array is required, including [] when the owner verified no historical runs.');
  const string = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;
  const amount = value => Number.isSafeInteger(value) && value >= 0;
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  for (const row of snapshot.browser_runs) {
    if (!row || !['completed', 'failed', 'cleanup_unconfirmed', 'cancelled'].includes(row.status)) throw new Error('Active or unclear browser runs cannot be imported.');
    if (!string(row.id, 256) || row.budget_id !== snapshot.id || !string(row.county, 100)) throw new Error('Invalid historical run identity.');
    if (!amount(row.reserved_milli_usd) || !amount(row.spent_milli_usd) || !(row.credits === null || amount(row.credits))) throw new Error('Invalid historical run amounts.');
    if (row.credits === null ? row.spent_milli_usd < row.reserved_milli_usd : row.spent_milli_usd !== row.credits * 20) throw new Error('Historical billing must preserve known credits or conservatively charged unknown usage.');
    if (!date(row.created_at) || !date(row.completed_at) || row.completed_at < row.created_at) throw new Error('Invalid historical run timestamps.');
  }
  const historicalSpent = snapshot.browser_runs.reduce((sum, row) => sum + row.spent_milli_usd, 0);
  if (!Number.isSafeInteger(historicalSpent) || historicalSpent > snapshot.spent_milli_usd) throw new Error('Historical charges exceed the supplied ledger spend.');
  const result = await db.batch([db.prepare("INSERT INTO scrape_budgets(id,limit_milli_usd,spent_milli_usd,reserved_milli_usd) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM browser_runs WHERE budget_id=? AND status NOT IN ('completed','failed','cleanup_unconfirmed','cancelled'))")
    .bind(snapshot.id, snapshot.limit_milli_usd, snapshot.spent_milli_usd, snapshot.reserved_milli_usd, snapshot.id),
    ...snapshot.browser_runs.map(row => db.prepare('INSERT INTO browser_runs(id,budget_id,county,status,reserved_milli_usd,credits,spent_milli_usd,created_at,completed_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM scrape_budgets WHERE id=?)')
      .bind(row.id, row.budget_id, row.county, row.status, row.reserved_milli_usd, row.credits, row.spent_milli_usd, row.created_at, row.completed_at, snapshot.id)),
  ]);
  if (result[0].meta.changes !== 1) throw new Error('Settle active local browser runs before importing.');
  return { budgetRows: 1, browserRunRows: snapshot.browser_runs.length, totalRows: result.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const value = flag => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
  const database = value('--database'), budget = value('--budget');
  if (!database || !budget || !args.includes('--approved-import')) {
    console.error('Usage: node scripts/import-budget.mjs --database PATH --budget OWNER_SNAPSHOT.json --approved-import');
    process.exitCode = 1;
  } else {
    let db;
    try {
      const snapshot = JSON.parse(readFileSync(budget, 'utf8'));
      db = createSQLiteDB(database);
      const result = await importBudget(db, snapshot, { approvedImport: true });
      console.log(`Imported ${result.totalRows} rows: ${result.budgetRows} settled budget and ${result.browserRunRows} historical browser runs. Existing ledgers are never replaced.`);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
    finally { db?.close(); }
  }
}
