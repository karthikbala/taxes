import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSQLiteDB } from '../server/sqlite.mjs';
import { importBudget } from '../scripts/import-budget.mjs';
import { phaseBudgetId, reserveBrowser, reconcileBrowser } from '../lib/live/browser-budget.mjs';

const snapshot = (cap = 200, spent = 40) => ({ id: phaseBudgetId, limit_milli_usd: cap, spent_milli_usd: spent, reserved_milli_usd: 0 });
const approvedSnapshot = (cap = 200, spent = 40) => ({ ...snapshot(cap, spent), browser_runs: [] });
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'invisia-sqlite-'));
  const path = join(dir, 'data', 'budget.sqlite');
  const handles = [];
  t.after(() => { for (const db of handles) { try { db.close(); } catch {} } rmSync(dir, { recursive: true, force: true }); });
  const open = () => { const db = createSQLiteDB(path); handles.push(db); return db; };
  return { open, path };
}
const budget = db => db.prepare('SELECT * FROM scrape_budgets WHERE id=?').bind(phaseBudgetId).first();

test('SQLite initializes schema only and exposes D1 first/all/run results', async t => {
  const db = fixture(t).open();
  assert.equal(await budget(db), null);
  assert.equal((await db.prepare('SELECT * FROM scrape_budgets').all()).results.length, 0);
  assert.equal((await db.prepare('PRAGMA journal_mode').first('journal_mode')), 'wal');
  assert.equal((await db.prepare('PRAGMA busy_timeout').first('timeout')), 5000);
  await assert.rejects(reserveBrowser(db, 'miami-dade-fl'), error => error.code === 'browser_budget_exhausted' || error.code === 'browser_budget_unavailable');
  assert.equal(await budget(db), null);
  const statement = db.prepare('SELECT ? AS value');
  assert.equal(await statement.bind(17).first('value'), 17);
  assert.equal(await statement.bind(23).first('value'), 23);
  await assert.rejects(statement.bind(1).first('missing'), /Column not found/);
});

test('concurrent requests through two SQLite handles stop exactly at the approved cap', async t => {
  const { open } = fixture(t), db = open(), other = open();
  await importBudget(db, approvedSnapshot(), { approvedImport: true });
  const results = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => reserveBrowser(index % 2 ? other : db, 'miami-dade-fl')));
  const accepted = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  assert.equal(accepted.length, 2);
  assert.equal(results.filter(result => result.status === 'rejected').length, 10);
  assert.deepEqual(await budget(db), { ...snapshot(), reserved_milli_usd: 160 });
  assert.equal((await db.prepare('SELECT id FROM browser_runs').all()).results.length, 2);
  await Promise.all(accepted.map(lease => reconcileBrowser(db, lease, 4, 'completed')));
  assert.deepEqual(await budget(other), { ...snapshot(), spent_milli_usd: 200 });
  await assert.rejects(reserveBrowser(other, 'miami-dade-fl'));
});

test('failed batch rolls back all preceding writes and remains usable', async t => {
  const db = fixture(t).open();
  await importBudget(db, approvedSnapshot(), { approvedImport: true });
  await assert.rejects(db.batch([
    db.prepare('UPDATE scrape_budgets SET spent_milli_usd=199 WHERE id=?').bind(phaseBudgetId),
    db.prepare('INSERT INTO scrape_budgets(id,limit_milli_usd) VALUES(?,?)').bind(phaseBudgetId, 999),
  ]), /UNIQUE constraint/);
  assert.deepEqual(await budget(db), snapshot());
  const result = await db.batch([db.prepare('UPDATE scrape_budgets SET spent_milli_usd=41 WHERE id=?').bind(phaseBudgetId), db.prepare('SELECT spent_milli_usd FROM scrape_budgets WHERE id=?').bind(phaseBudgetId)]);
  assert.equal(result[0].meta.changes, 1);
  assert.deepEqual(result[1].results, [{ spent_milli_usd: 41 }]);
});

test('restart preserves spent amounts and outstanding reservations; duplicate reconciliation is idempotent', async t => {
  const { open } = fixture(t), original = open();
  await importBudget(original, approvedSnapshot(), { approvedImport: true });
  const lease = await reserveBrowser(original, 'miami-dade-fl');
  original.close();
  const restarted = open();
  assert.deepEqual(await budget(restarted), { ...snapshot(), reserved_milli_usd: 80 });
  await reconcileBrowser(restarted, lease, null, 'cleanup_unconfirmed');
  await reconcileBrowser(restarted, lease, 0, 'completed');
  assert.deepEqual(await budget(restarted), { ...snapshot(), spent_milli_usd: 120 });
  assert.equal(await restarted.prepare('SELECT status FROM browser_runs WHERE id=?').bind(lease.id).first('status'), 'cleanup_unconfirmed');
  restarted.close();
  assert.deepEqual(await budget(open()), { ...snapshot(), spent_milli_usd: 120 });
});

test('explicit owner snapshot import never replaces funds or accepts active reservations', async t => {
  const db = fixture(t).open();
  await assert.rejects(importBudget(db, approvedSnapshot()), /acknowledgement/);
  for (const invalid of [
    { ...approvedSnapshot(), id: 'new-budget' },
    { ...approvedSnapshot(), spent_milli_usd: -1 },
    { ...approvedSnapshot(), spent_milli_usd: 201 },
    { ...approvedSnapshot(), limit_milli_usd: 20.5 },
    { ...approvedSnapshot(), limit_milli_usd: 5001 },
    { ...approvedSnapshot(), reserved_milli_usd: 80 },
    { ...approvedSnapshot(), browser_runs: [{ status: 'reserved' }] },
    { ...approvedSnapshot(), browser_runs: [{ status: 'active' }] },
  ]) await assert.rejects(importBudget(db, invalid, { approvedImport: true }));
  assert.equal(await budget(db), null);
  await db.prepare("INSERT INTO browser_runs(id,budget_id,county,status,reserved_milli_usd,created_at) VALUES(?,?,?,'reserved',80,?)").bind('orphan-active', phaseBudgetId, 'miami-dade-fl', new Date().toISOString()).run();
  await assert.rejects(importBudget(db, approvedSnapshot(), { approvedImport: true }), /active local/);
  await db.prepare('DELETE FROM browser_runs WHERE id=?').bind('orphan-active').run();
  await importBudget(db, approvedSnapshot(), { approvedImport: true });
  await assert.rejects(importBudget(db, approvedSnapshot(5000, 0), { approvedImport: true }), /UNIQUE constraint/);
  assert.deepEqual(await budget(db), snapshot());
});

test('batch rejects statements from another connection before any mutation', async t => {
  const { open } = fixture(t), db = open(), other = open();
  await assert.rejects(db.batch([other.prepare('DELETE FROM scrape_budgets')]), /must belong/);
  assert.equal(await budget(db), null);
});

const historicalRun = (id, overrides = {}) => ({
  id, budget_id: phaseBudgetId, county: 'miami-dade-fl', status: 'completed',
  reserved_milli_usd: 80, credits: 2, spent_milli_usd: 40,
  created_at: '2026-10-07T12:00:00.000Z', completed_at: '2026-10-07T12:01:00.000Z', ...overrides,
});

test('import preserves complete settled browser history and ledger spend across restart', async t => {
  const { open } = fixture(t), db = open();
  const runs = [historicalRun('historic-completed'), historicalRun('historic-unknown', { credits: null, spent_milli_usd: 80, status: 'cleanup_unconfirmed' })];
  const supplied = { ...approvedSnapshot(500, 160), browser_runs: runs };
  assert.deepEqual(await importBudget(db, supplied, { approvedImport: true }), { budgetRows: 1, browserRunRows: 2, totalRows: 3 });
  db.close();
  const restarted = open();
  assert.deepEqual(await budget(restarted), snapshot(500, 160));
  assert.deepEqual((await restarted.prepare('SELECT * FROM browser_runs ORDER BY id').all()).results, runs);
  assert.equal(await restarted.prepare('SELECT SUM(spent_milli_usd) AS spent FROM browser_runs').first('spent'), 120);
  await reconcileBrowser(restarted, { id: 'historic-unknown', reserve: 80 }, 0, 'completed');
  assert.deepEqual(await budget(restarted), snapshot(500, 160));
});

test('a historical ID conflict rolls back imported budget and preceding history rows', async t => {
  const db = fixture(t).open(), existing = historicalRun('already-present');
  await db.prepare('INSERT INTO browser_runs(id,budget_id,county,status,reserved_milli_usd,credits,spent_milli_usd,created_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(existing.id, existing.budget_id, existing.county, existing.status, existing.reserved_milli_usd, existing.credits, existing.spent_milli_usd, existing.created_at, existing.completed_at).run();
  const supplied = { ...approvedSnapshot(500, 160), browser_runs: [historicalRun('new-first'), existing] };
  await assert.rejects(importBudget(db, supplied, { approvedImport: true }), /UNIQUE constraint/);
  assert.equal(await budget(db), null);
  assert.deepEqual((await db.prepare('SELECT * FROM browser_runs').all()).results, [existing]);
  await assert.rejects(importBudget(db, { ...approvedSnapshot(500, 160), browser_runs: [historicalRun('dup'), historicalRun('dup')] }, { approvedImport: true }), /UNIQUE constraint/);
  assert.equal(await budget(db), null);
  assert.deepEqual((await db.prepare('SELECT * FROM browser_runs').all()).results, [existing]);
});

test('history import refuses missing histories, malformed identity, billing and timestamps', async t => {
  const db = fixture(t).open();
  await assert.rejects(importBudget(db, snapshot(), { approvedImport: true }), /explicit browser_runs array/);
  for (const overrides of [
    { id: '' }, { id: 'x'.repeat(257) }, { budget_id: 'another-budget' }, { county: '' },
    { reserved_milli_usd: -1 }, { credits: 1.5 }, { spent_milli_usd: -20 },
    { credits: 3 }, { credits: null, spent_milli_usd: 40 }, { status: 'unknown' },
    { created_at: 'yesterday' }, { completed_at: null }, { completed_at: '2026-10-06T12:01:00.000Z' },
  ]) await assert.rejects(importBudget(db, { ...approvedSnapshot(500, 160), browser_runs: [historicalRun('invalid', overrides)] }, { approvedImport: true }));
  await assert.rejects(importBudget(db, { ...approvedSnapshot(500, 20), browser_runs: [historicalRun('too-much')] }, { approvedImport: true }), /exceed/);
  assert.equal(await budget(db), null);
  assert.equal((await db.prepare('SELECT * FROM browser_runs').all()).results.length, 0);
});
