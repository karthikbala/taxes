import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

class SQLiteStatement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new SQLiteStatement(this.db, this.sql, args); }
  execute() {
    const before = this.db.sqlite.prepare('SELECT total_changes() AS changes').get().changes;
    const results = this.db.sqlite.prepare(this.sql).all(...this.args).map(row => ({ ...row }));
    const meta = this.db.sqlite.prepare('SELECT total_changes() AS changes, last_insert_rowid() AS last_row_id').get();
    return { success: true, results, meta: { changes: Number(meta.changes - before), last_row_id: Number(meta.last_row_id) } };
  }
  async first(column) {
    const row = this.db.sqlite.prepare(this.sql).get(...this.args);
    if (!row) return null;
    if (column === undefined) return { ...row };
    if (!Object.hasOwn(row, column)) throw new Error(`Column not found: ${column}`);
    return row[column];
  }
  async run() { return this.execute(); }
  async all() { return this.execute(); }
}

/** A persistent, single-process D1-compatible adapter; no ledger is seeded. */
export function createSQLiteDB(path) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('A SQLite database path is required.');
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode:0o700 });
  const sqlite = new DatabaseSync(path);
  try {
    sqlite.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const schema = readFileSync(new URL('../drizzle/0000_condemned_thundra.sql', import.meta.url), 'utf8')
      .replace(/CREATE TABLE\s+(?!IF NOT EXISTS)/gi, 'CREATE TABLE IF NOT EXISTS ');
    sqlite.exec(schema);
    if(path!==':memory:')for(const file of [path,path+'-wal',path+'-shm'])if(existsSync(file))chmodSync(file,0o600);
  } catch (error) { sqlite.close(); throw error; }
  const db = {
    sqlite,
    prepare(sql) { return new SQLiteStatement(db, sql); },
    async batch(statements) {
      if (!Array.isArray(statements) || statements.some(statement => !(statement instanceof SQLiteStatement) || statement.db !== db)) {
        throw new TypeError('Batch statements must belong to this SQLite database.');
      }
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    close() { sqlite.close(); },
  };
  return db;
}
